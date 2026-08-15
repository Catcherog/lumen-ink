/**
 * PERSIST-001 P0-01: real Job executor with polling + sweeper recovery.
 *
 * This executor actually invokes `GenerationService.executeJob` (unlike the
 * local no-op executor). It is the production executor wired by
 * `selectPersistenceByEnv` in deployed mode and is also used by integration
 * tests that need to verify the full Job lifecycle.
 *
 * Design:
 *
 *  1. **In-memory queue**: `enqueue(jobId)` adds the Job ID to a Set. The
 *     polling loop drains the Set and calls `executeJob` for each ID.
 *     Duplicate enqueues are deduped by the Set.
 *
 *  2. **Sweeper**: runs at `sweeperIntervalMs` intervals and calls
 *     `deps.jobs.listLeaseExpired(now)`. Jobs returned by the sweeper
 *     (never-claimed queued Jobs or Jobs whose lease expired) are added
 *     to the in-memory queue for (re-)execution. This enables:
 *      - Recovery after a worker crash (lease expired, new worker takes over)
 *      - Recovery after a process/adapter rebuild (queued Jobs discovered)
 *
 *  3. **Best-effort cancel**: `cancel(jobId)` returns `'best_effort'`. It
 *     does NOT abort an in-flight `executeJob` call — atomic termination is
 *     the responsibility of `GenerationService.cancelJob`, which uses
 *     `updateIfActive` to atomically cancel AND revoke the lease. A stale
 *     worker that returns after cancellation will have its
 *     `updateIfClaimed` calls rejected (terminal state defense).
 *
 *  4. **Concurrency**: only one `executeJob` runs at a time per worker. This
 *     is sufficient for PERSIST-001 PoC and local dev. Production hardening
 *     (parallel execution, bounded concurrency) is deferred to a dedicated
 *     HARDEN task.
 *
 *  5. **Error isolation**: errors from `executeJob` (e.g.,
 *     `JOB_NOT_CLAIMED_BY_CALLER` when two workers race for the same Job)
 *     are caught and logged. They do not crash the worker or mark the Job
 *     as failed — `executeJob` itself handles failure recording via
 *     `failWith`.
 */

import type {
  PersistenceDependencies,
  JobExecutor,
} from '../../domain/persistence.js';
import { GenerationService, type ExecuteJobOptions } from '../../services/GenerationService.js';

export interface WorkerExecutorOptions {
  /** Persistence dependencies (same bundle used by GenerationService). */
  deps: PersistenceDependencies;
  /**
   * Provider factory passed through to `GenerationService.executeJob`.
   * Receives the Job plus the frozen input bytes loaded from
   * `Job.inputVersionId`'s Asset.
   */
  providerFactory: ExecuteJobOptions['providerFactory'];
  /** Polling interval for the in-memory queue drain. Default 100ms. */
  pollIntervalMs?: number;
  /** Lease duration in seconds. Default 60. */
  leaseSeconds?: number;
  /** Sweeper interval for recovery scanning. Default = pollIntervalMs * 5. */
  sweeperIntervalMs?: number;
  /** Worker ID prefix for lease claims. Default 'worker'. */
  workerIdPrefix?: string;
}

export interface WorkerExecutor {
  /** The JobExecutor surface consumed by GenerationService / routes. */
  executor: JobExecutor;
  /** Start the polling loop and sweeper. Idempotent. */
  start(): void;
  /** Stop the polling loop and sweeper. Idempotent. */
  stop(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_SWEEPER_MULTIPLIER = 5;

function nowIso(): string {
  return new Date().toISOString();
}

function generateWorkerId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a worker-backed JobExecutor that actually executes Jobs through
 * `GenerationService.executeJob`.
 */
export function createWorkerJobExecutor(
  options: WorkerExecutorOptions
): WorkerExecutor {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const sweeperIntervalMs =
    options.sweeperIntervalMs ?? pollIntervalMs * DEFAULT_SWEEPER_MULTIPLIER;
  const workerId = generateWorkerId(options.workerIdPrefix ?? 'worker');

  // In-memory queue of Job IDs awaiting execution. Using a Set for dedup.
  const queue = new Set<string>();
  // Jobs currently being executed (prevents re-enqueue from sweeper racing).
  const inFlight = new Set<string>();

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sweeperTimer: ReturnType<typeof setInterval> | null = null;
  let processing = false;
  let stopped = true;

  // The worker uses its own GenerationService instance to call executeJob.
  // The executor passed to GenerationService is a thin shim that adds to
  // the in-memory queue (so retries / recursive enqueues work).
  const executorShim: JobExecutor = {
    async enqueue(jobId: string): Promise<void> {
      queue.add(jobId);
    },
    async cancel(_jobId: string): Promise<'cancelled' | 'best_effort'> {
      return 'best_effort';
    },
  };

  const generationService = new GenerationService(options.deps, executorShim);

  async function processQueue(): Promise<void> {
    if (processing || stopped) return;
    processing = true;
    try {
      // Drain the queue. Take a snapshot to avoid mutation during iteration.
      const ids = Array.from(queue);
      queue.clear();
      for (const jobId of ids) {
        if (stopped) break;
        if (inFlight.has(jobId)) continue;
        inFlight.add(jobId);
        try {
          await generationService.executeJob(jobId, {
            providerFactory: options.providerFactory,
            leaseSeconds,
            workerId,
          });
        } catch (err) {
          // Errors from executeJob are expected:
          //  - JOB_NOT_CLAIMED_BY_CALLER: another worker (or the sweeper)
          //    claimed the Job first. Safe to ignore.
          //  - JOB_LEASE_EXPIRED: the lease was revoked (e.g., by cancelJob)
          //    during execution. Safe to ignore.
          //  - ILLEGAL_JOB_TRANSITION: the Job reached a terminal state
          //    (e.g., cancelled) before executeJob could claim it.
          //  - Provider errors: executeJob records these via failWith and
          //    marks the Job as failed. The thrown error is informational.
          const msg = err instanceof Error ? err.message : String(err);
          // Only log non-racing errors to avoid noise during normal operation.
          if (
            !msg.includes('JOB_NOT_CLAIMED_BY_CALLER') &&
            !msg.includes('JOB_LEASE_EXPIRED') &&
            !msg.includes('ILLEGAL_JOB_TRANSITION')
          ) {
            console.warn(
              `[WorkerExecutor] executeJob failed for ${jobId}:`,
              msg
            );
          }
        } finally {
          inFlight.delete(jobId);
        }
      }
    } finally {
      processing = false;
    }
  }

  async function runSweeper(): Promise<void> {
    if (stopped) return;
    try {
      const expired = await options.deps.jobs.listLeaseExpired(nowIso());
      for (const job of expired) {
        // Don't re-enqueue Jobs that are currently being executed.
        if (inFlight.has(job.id)) continue;
        queue.add(job.id);
      }
      // Trigger a processing cycle if we added anything.
      if (queue.size > 0) {
        void processQueue();
      }
    } catch (err) {
      console.warn('[WorkerExecutor] sweeper error:', err);
    }
  }

  function start(): void {
    if (!stopped) return;
    stopped = false;
    pollTimer = setInterval(() => {
      void processQueue();
    }, pollIntervalMs);
    sweeperTimer = setInterval(() => {
      void runSweeper();
    }, sweeperIntervalMs);
    // Run an initial sweeper pass to pick up any queued Jobs that exist
    // before the worker was started (e.g., after a process restart).
    void runSweeper();
  }

  function stop(): void {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (sweeperTimer) {
      clearInterval(sweeperTimer);
      sweeperTimer = null;
    }
  }

  const executor: JobExecutor = {
    async enqueue(jobId: string): Promise<void> {
      queue.add(jobId);
      // PERSIST-001 P0-01C (BUSOS-P5-X01): On Vercel serverless the
      // in-process setInterval poll loop started by `start()` is frozen after
      // the HTTP response is sent, so a fire-and-forget `processQueue()` never
      // completes and a queued Job is never executed within the caller's
      // request window. The only surviving executor then becomes the
      // once-daily CRON_SECRET-gated `/api/worker/recover` cron, whose period
      // far exceeds the caller's poll budget and surfaced on the BUSOS live
      // E2E as `GENERATION_FAILED` (a null-errorCode fallback for a Job that
      // simply never ran). Execute synchronously inside the requesting
      // Function invocation so the Job reaches a terminal state before the
      // function freezes. The daily cron remains as a backstop recovery path.
      try {
        await generationService.executeJob(jobId, {
          providerFactory: options.providerFactory,
          leaseSeconds,
          workerId,
        });
      } catch {
        // executeJob records terminal failure (with a real errorCode) via
        // failWith; the caller polls GET /jobs/:id for the terminal state.
        // Swallow the throw so enqueue always resolves.
      }
    },
    async cancel(_jobId: string): Promise<'cancelled' | 'best_effort'> {
      // Best-effort: we do not abort in-flight executeJob calls. Atomic
      // termination is handled by GenerationService.cancelJob via
      // updateIfActive. A stale worker returning after cancellation will
      // have its updateIfClaimed calls rejected by the terminal-state
      // defense in the JobRepository.
      return 'best_effort';
    },
  };

  return { executor, start, stop };
}
