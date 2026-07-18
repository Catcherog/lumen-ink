/**
 * PERSIST-001 JobExecutor adapter registry.
 *
 * Re-exports the local executor (PoC / dev / tests) and the worker executor
 * (real Job execution via GenerationService.executeJob + sweeper recovery).
 * Production wiring selects the appropriate executor based on deployment mode.
 */

export { createLocalJobExecutor } from './local.js';
export {
  createWorkerJobExecutor,
  type WorkerExecutorOptions,
  type WorkerExecutor,
} from './worker.js';
