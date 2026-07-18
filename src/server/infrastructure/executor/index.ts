/**
 * STORAGE-001 JobExecutor adapter registry.
 *
 * Re-exports the local executor. PERSIST-001 adds production executors
 * (Vercel Workflow, Supabase pgmq) here without changing the frozen
 * `JobExecutor` contract.
 */

export { createLocalJobExecutor } from './local.js';
