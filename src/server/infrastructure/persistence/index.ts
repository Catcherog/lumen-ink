/**
 * PERSIST-001 persistence adapter registry.
 *
 * Re-exports the local adapter (PoC / dev / tests), the CloudBase production
 * adapters (PostgreSQL and NoSQL), and the deployment-mode selector. The
 * selector chooses the correct adapter based on `VERCEL` / `NODE_ENV` and
 * the presence of CloudBase env vars, failing fast with
 * `CLOUDBASE_CONFIG_REQUIRED` in deployed mode if any required var is missing.
 *
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01: NoSQL adapter is the preferred
 * production path; PostgreSQL adapter is retained as fallback.
 */

export {
  createLocalPersistence,
  type LocalPersistenceOptions,
} from './local.js';
export {
  createCloudBasePersistence,
  validateCloudBaseConfig,
  type CloudBasePersistenceOptions,
  type CloudBasePersistenceDeps,
} from './cloudbase.js';
export {
  createCloudBaseNoSqlPersistence,
  validateCloudBaseNoSqlConfig,
  type CloudBaseNoSqlOptions,
  type CloudBaseNoSqlDeps,
} from './cloudbase.nosql.js';
export {
  selectPersistenceByEnv,
  type SelectPersistenceOptions,
} from './select.js';
