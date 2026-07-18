/**
 * STORAGE-001 local JobExecutor adapter.
 *
 * PoC executor used by the contract test and local development. Production
 * adapters (Vercel Workflow, Supabase pgmq) implement the same `JobExecutor`
 * surface. PERSIST-001 consumes the interface unchanged.
 *
 * Behavior:
 *  - `enqueue(jobId)`: resolves immediately. Production adapters schedule a
 *    durable step; the local adapter is a no-op because PERSIST-001's test
 *    harness drives execution directly.
 *  - `cancel(jobId)`: returns `'best_effort'`. Production adapters attempt to
 *    abort the durable step; the local adapter has no running task to abort.
 *
 * The local executor does NOT execute Provider calls; it only proves the
 * contract is implementable. PERSIST-001 wires real execution behind this
 * interface.
 */

import type { JobExecutor } from '../../domain/persistence.js';

export function createLocalJobExecutor(): JobExecutor {
  return {
    async enqueue(_jobId: string): Promise<void> {
      // No-op: PERSIST-001 will replace this with a real executor that
      // dispatches to the configured Provider.
    },

    async cancel(_jobId: string): Promise<'cancelled' | 'best_effort'> {
      return 'best_effort';
    },
  };
}
