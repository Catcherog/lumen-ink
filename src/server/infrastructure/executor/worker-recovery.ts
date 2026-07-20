/**
 * PERSIST-001 P0-01C: explicit worker recovery entry point for Vercel.
 *
 * The existing `createWorkerJobExecutor` uses an in-memory Set + setInterval
 * for in-process queue draining. This is fine when the same Vercel Function
 * instance that received the enqueue also processes the Job within the
 * request lifetime, but it CANNOT recover queued or lease-expired Jobs that
 * were created by a previous Function instance that has since been recycled.
 *
 * `recoverPendingJobs` is a pure function (no module state) that:
 *  1. Lists all lease-expired Jobs via `deps.jobs.listLeaseExpired(now)`.
 *     This includes:
 *      - Jobs in `queued` status with `lease_expires_at IS NULL`
 *        (never claimed — e.g., created by a Function instance that exited
 *        before processing).
 *      - Jobs in an active status with `lease_expires_at <= now`
 *        (lease expired — e.g., the worker that held the lease died).
 *  2. For each Job: calls `GenerationService.executeJob`, which internally
 *     performs an atomic `acquireJobLease`. Only one worker instance wins
 *     the claim; the rest get `JOB_NOT_CLAIMED_BY_CALLER` and the recovery
 *     function records them as `skipped`.
 *  3. Returns a structured result so the cron HTTP endpoint can respond with
 *     a JSON summary.
 *
 * Verification (per FIX_PACKET):
 *  - queued Job in new worker instance → recovered via listLeaseExpired +
 *    executeJob claim path.
 *  - lease-expired Job in new worker instance → reclaimed via atomic claim.
 *    The old worker's `updateIfClaimed` calls are rejected by the
 *    `lease_token` mismatch + terminal-state defense in `JobRepository`,
 *    so the old worker cannot publish a result.
 *
 * This function does NOT hold any module-level state and is safe to call
 * concurrently from multiple Vercel Function instances. Atomic claim is
 * the responsibility of `JobRepository.claim` /
 * `GenerationService.executeJob`.
 */

import type {
  PersistenceDependencies,
  JobExecutor,
} from '../../domain/persistence.js';
import {
  GenerationService,
  type ExecuteJobOptions,
} from '../../services/GenerationService.js';

export interface WorkerRecoveryOptions {
  /** Persistence dependencies (same bundle used by GenerationService). */
  deps: PersistenceDependencies;
  /** Provider factory passed through to `executeJob`. */
  providerFactory: ExecuteJobOptions['providerFactory'];
  /** Lease duration in seconds. Default 60. */
  leaseSeconds?: number;
  /** Worker ID prefix for lease claims. Default 'recovery-worker'. */
  workerId: string;
  /**
   * Max Jobs to process in a single recovery invocation. Default 10.
   * Caps runtime so a single cron tick stays well under the Vercel
   * Hobby maxDuration of 90s (frozen in vercel.json — PERSIST-001
   * FINAL-CLOSURE AC-09 forbids silently upgrading to Pro).
   */
  maxRecover?: number;
}

export interface WorkerRecoveryResult {
  /** ISO timestamp when recovery started. */
  startedAt: string;
  /** ISO timestamp when recovery completed. */
  finishedAt: string;
  /** Worker ID used for this recovery invocation. */
  workerId: string;
  /** Total Jobs discovered by `listLeaseExpired`. */
  discovered: number;
  /**
   * Job IDs that were executed to a terminal state (succeeded or failed)
   * by THIS invocation. They are no longer recoverable.
   */
  recovered: string[];
  /**
   * Job IDs that were skipped because another worker won the atomic
   * claim (JOB_NOT_CLAIMED_BY_CALLER), the lease was concurrently
   * revoked (JOB_LEASE_EXPIRED), or the Job reached a terminal state
   * before executeJob could claim it (ILLEGAL_JOB_TRANSITION).
   */
  skipped: string[];
  /** Job IDs that failed during recovery execution. */
  failed: Array<{ jobId: string; error: string }>;
}

const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_MAX_RECOVER = 10;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Recover pending Jobs (queued + lease-expired) for the current Vercel
 * Function invocation. Safe to call concurrently from multiple instances.
 */
export async function recoverPendingJobs(
  options: WorkerRecoveryOptions
): Promise<WorkerRecoveryResult> {
  const { deps, providerFactory, workerId } = options;
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const maxRecover = options.maxRecover ?? DEFAULT_MAX_RECOVER;

  // The recovery path does not enqueue — it executes synchronously within
  // the cron tick. The executor shim is a no-op so GenerationService does
  // not attempt to schedule a follow-up.
  const noopExecutor: JobExecutor = {
    async enqueue(): Promise<void> {
      /* no-op: sync execution within the recovery invocation */
    },
    async cancel(): Promise<'cancelled' | 'best_effort'> {
      return 'best_effort';
    },
  };

  const generationService = new GenerationService(deps, noopExecutor);

  const startedAt = nowIso();
  const expired = await deps.jobs.listLeaseExpired(startedAt);
  const discovered = expired.length;

  const recovered: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ jobId: string; error: string }> = [];

  for (const job of expired.slice(0, maxRecover)) {
    try {
      await generationService.executeJob(job.id, {
        providerFactory,
        leaseSeconds,
        workerId,
      });
      recovered.push(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Expected races — another worker won the atomic claim, the lease
      // was revoked mid-execution, or the Job reached a terminal state
      // (e.g., cancelled) before executeJob could claim it. These are
      // NOT failures — they are the recovery mechanism working correctly.
      if (
        msg.includes('JOB_NOT_CLAIMED_BY_CALLER') ||
        msg.includes('JOB_LEASE_EXPIRED') ||
        msg.includes('ILLEGAL_JOB_TRANSITION')
      ) {
        skipped.push(job.id);
      } else {
        failed.push({ jobId: job.id, error: msg });
      }
    }
  }

  return {
    startedAt,
    finishedAt: nowIso(),
    workerId,
    discovered,
    recovered,
    skipped,
    failed,
  };
}
