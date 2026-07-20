/**
 * PERSIST-001 P0-01C: explicit Vercel-cron worker recovery route.
 *
 * Mounted under `/api/worker/recover`. Authentication uses a separate
 * `CRON_SECRET` bearer token (Vercel Cron sends this header on every
 * invocation) — NOT the user JWT auth middleware, because cron ticks have
 * no user session.
 *
 * Endpoint:
 *   POST /api/worker/recover
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
 * This endpoint is invoked by Vercel Cron (see `vercel.json::crons`) on a
 * fixed schedule. It is also safe to invoke manually (e.g., from an admin
 * dashboard) by sending the CRON_SECRET bearer token.
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

  router.post('/recover', async (req: Request, res: Response) => {
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
  });

  return router;
}
