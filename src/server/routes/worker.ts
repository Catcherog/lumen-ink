/**
 * PERSIST-001 P0-01C + FINAL-CLOSURE AC-07/AC-08: explicit Vercel-cron
 * worker recovery route.
 *
 * Mounted under `/api/worker/recover`. Authentication uses a separate
 * `CRON_SECRET` bearer token (Vercel Cron sends this header on every
 * invocation) — NOT the user JWT auth middleware, because cron ticks have
 * no user session.
 *
 * Endpoints (both reuse the same handler — PERSIST-001 FINAL-CLOSURE):
 *   GET  /api/worker/recover    ← invoked by Vercel Cron (cron sends GET)
 *   POST /api/worker/recover    ← safe for manual / admin invocation
 *     Authorization: Bearer <CRON_SECRET>
 *     → 200 { startedAt, finishedAt, workerId, discovered, recovered, skipped, failed }
 *     → 401 if CRON_SECRET missing or mismatched
 *     → 503 if CRON_SECRET is not configured (recovery disabled)
 *     → 500 on internal error
 *
 * The route delegates to `recoverPendingJobs` which is a pure function
 * (no module state) that:
 *  1. Lists queued + lease-expired Jobs from the DB.
 *  2. Atomically claims each via `GenerationService.executeJob`'s
 *     `acquireJobLease` step (only one worker instance wins).
 *  3. Executes the won Jobs to a terminal state within the request lifetime.
 *
 * Vercel Cron invokes the configured `path` via GET, so the GET route is
 * the production entrypoint. POST is retained for manual / admin triggers
 * (e.g., an internal dashboard) — both verbs share the same handler so
 * there is exactly one recovery code path to maintain.
 *
 * In local/dev mode, CRON_SECRET is typically unset. The route returns
 * 503 (recovery disabled) so a missing secret does not break the server.
 */

import { Router, Request, Response } from 'express';
import {
  recoverPendingJobs,
  type WorkerRecoveryOptions,
} from '../infrastructure/executor/index.js';
import type { ExecuteJobOptions } from '../services/GenerationService.js';
import type { GenerationJob } from '../domain/persistence.js';

export interface WorkerRouterDeps {
  /** Persistence deps bundle (must already be ensureReady'd). */
  deps: WorkerRecoveryOptions['deps'];
  /** Provider factory for executing Jobs. */
  providerFactory: ExecuteJobOptions['providerFactory'];
  /** Default lease duration in seconds for recovery claims. */
  leaseSeconds?: number;
  /** Optional CRON_SECRET override (defaults to process.env.CRON_SECRET). */
  cronSecret?: string;
}

export function createWorkerRouter(deps: WorkerRouterDeps): Router {
  const router = Router();

  function checkCronAuth(req: Request): boolean {
    const expected = deps.cronSecret ?? process.env.CRON_SECRET;
    if (!expected) return false;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice('Bearer '.length).trim();
    // Constant-time comparison to avoid timing leaks.
    if (token.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /**
   * Shared recovery handler for GET and POST. Vercel Cron sends GET to the
   * configured cron path; POST is retained for manual / admin invocation.
   * Both verbs MUST run identical recovery logic — there is exactly one
   * recovery code path.
   */
  async function recoverHandler(req: Request, res: Response): Promise<void> {
    const expected = deps.cronSecret ?? process.env.CRON_SECRET;
    if (!expected) {
      res.status(503).json({
        errorCode: 'WORKER_RECOVERY_DISABLED',
        message: 'CRON_SECRET not configured; recovery endpoint disabled',
      });
      return;
    }
    if (!checkCronAuth(req)) {
      res.status(401).json({
        errorCode: 'UNAUTHORIZED',
        message: 'CRON_SECRET mismatch or missing Authorization header',
      });
      return;
    }

    // Worker ID for this invocation. Include a counter so concurrent
    // invocations (e.g., manual + cron) do not collide.
    const workerId = `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await recoverPendingJobs({
        deps: deps.deps,
        providerFactory: deps.providerFactory as (
          job: GenerationJob,
          input: { bytes: Uint8Array; mimeType: string }
        ) => Promise<{ bytes: Uint8Array; mimeType: string }>,
        leaseSeconds: deps.leaseSeconds ?? 60,
        workerId,
        maxRecover: 10,
      });
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[worker/recover] recovery failed:', message);
      res.status(500).json({
        errorCode: 'WORKER_RECOVERY_FAILED',
        message,
      });
    }
  }

  // PERSIST-001 FINAL-CLOSURE AC-07: Vercel Cron invokes the configured
  // path via GET, so GET must hit the real handler (not 404 / 405).
  router.get('/recover', recoverHandler);
  // POST is retained for manual / admin invocation — same handler.
  router.post('/recover', recoverHandler);

  return router;
}
