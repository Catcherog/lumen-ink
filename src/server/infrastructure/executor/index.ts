/**
 * PERSIST-001 JobExecutor adapter registry.
 *
 * Re-exports the local executor (PoC / dev / tests), the worker executor
 * (in-process queue draining + lease sweeper), and the worker-recovery
 * function (PERSIST001-P0-01C explicit Vercel-cron entry point for
 * recovering queued + lease-expired Jobs across Function instances).
 */

export { createLocalJobExecutor } from './local.js';
export {
  createWorkerJobExecutor,
  type WorkerExecutorOptions,
  type WorkerExecutor,
} from './worker.js';
export {
  recoverPendingJobs,
  type WorkerRecoveryOptions,
  type WorkerRecoveryResult,
} from './worker-recovery.js';
