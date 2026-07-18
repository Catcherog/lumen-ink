/**
 * STORAGE-001 persistence adapter registry.
 *
 * Re-exports the local adapter and provides a future home for production
 * adapter factories (Vercel Postgres + R2, Supabase) without changing the
 * frozen `PersistenceDependencies` contract.
 */

export {
  createLocalPersistence,
  type LocalPersistenceOptions,
} from './local.js';
