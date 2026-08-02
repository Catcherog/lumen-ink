/**
 * PERSIST-001 persistence adapter registry.
 *
 * Re-exports the local adapter (PoC / dev / tests), the CloudBase production
 * adapter, and the deployment-mode selector. The selector chooses the correct
 * adapter based on `VERCEL` / `NODE_ENV` and the presence of CloudBase env
 * vars, failing fast with `CLOUDBASE_CONFIG_REQUIRED` in deployed mode if
 * any required var is missing.
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
  selectPersistenceByEnv,
  isCloudBaseDeps,
  type SelectPersistenceOptions,
} from './select.js';
