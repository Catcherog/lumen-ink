/**
 * PERSIST-001 P0-01 / LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: deployment-mode
 * persistence adapter selector.
 *
 * NOSQL-R2-07 (2026-07-21): The backend is now selected EXPLICITLY via the
 * `PERSISTENCE_BACKEND` env var. The previous implicit `CLOUDBASE_API_KEY`
 * detection is removed because it made backend selection dependent on
 * credential presence and silently preferred NoSQL over PostgreSQL when
 * both were configured.
 *
 * Allowed values:
 *  - `local`            -> file-backed local adapter (dev / test)
 *  - `cloudbase-postgres` -> CloudBase PostgreSQL + PG Storage adapter
 *  - `cloudbase-nosql`  -> CloudBase NoSQL document database adapter
 *
 * In deployed mode (`VERCEL=1` or `NODE_ENV=production`):
 *  - `PERSISTENCE_BACKEND` MUST be set to `cloudbase-postgres` or
 *    `cloudbase-nosql`. Any other value (or unset) -> fail closed with
 *    `PERSISTENCE_BACKEND_REQUIRED`.
 *  - Required CloudBase env vars must be present; otherwise fail closed
 *    with `CLOUDBASE_CONFIG_REQUIRED` so the boot sequence never silently
 *    falls back to the local adapter.
 *
 * In local / dev / test mode (no `VERCEL` / non-production `NODE_ENV`):
 *  - `PERSISTENCE_BACKEND` defaults to `local` if unset.
 *  - Explicit `cloudbase-postgres` / `cloudbase-nosql` is honored for
 *    integration tests, but `local` is the default.
 *
 * The selector returns a `PersistenceDependencies` instance. In deployed
 * mode the returned bundle carries a `__brand` marker so tests can
 * distinguish production from local without `instanceof`. Callers that
 * need to invoke `ensureReady()` / `close()` should narrow via the
 * appropriate `*PersistenceDeps` interface.
 *
 * CloudBase live credentials are configured by the operator in the deploy
 * environment and never enter the repository or test fixtures.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { EnvSource } from '../../config/runtime.js';
import type { PersistenceDependencies } from '../../domain/persistence.js';
import {
  createCloudBasePersistence,
  validateCloudBaseConfig,
  type CloudBasePersistenceOptions,
} from './cloudbase.js';
import {
  createCloudBaseNoSqlPersistence,
  validateCloudBaseNoSqlConfig,
  type CloudBaseNoSqlOptions,
} from './cloudbase.nosql.js';
import { createLocalPersistence } from './local.js';

export type PersistenceBackend = 'local' | 'cloudbase-postgres' | 'cloudbase-nosql';

const DEPLOYED_BACKENDS: ReadonlySet<PersistenceBackend> = new Set([
  'cloudbase-postgres',
  'cloudbase-nosql',
]);

/**
 * Parse and validate `PERSISTENCE_BACKEND`. Throws if the value is not one
 * of the allowed literals.
 */
function parseBackend(value: string | undefined): PersistenceBackend {
  if (value === undefined || value === '') return 'local';
  if (value === 'local' || value === 'cloudbase-postgres' || value === 'cloudbase-nosql') {
    return value;
  }
  throw new Error(
    `PERSISTENCE_BACKEND_INVALID: ${value}. Allowed: local | cloudbase-postgres | cloudbase-nosql`
  );
}

export interface SelectPersistenceOptions {
  /**
   * Optional override for the local adapter root directory. Defaults to
   * `process.env.PERSISTENCE_ROOT` or a path beneath the server data dir.
   * Ignored in deployed mode.
   */
  localRootDir?: string;
}

/**
 * Select and construct the appropriate persistence adapter for the given
 * environment source (defaults to `process.env`).
 *
 * Throws `PERSISTENCE_BACKEND_REQUIRED` when deployed mode is requested but
 * `PERSISTENCE_BACKEND` is unset or not a deployed backend.
 * Throws `PERSISTENCE_BACKEND_INVALID` when the value is not one of the
 * allowed literals.
 * Throws `CLOUDBASE_CONFIG_REQUIRED` when CloudBase env vars are missing.
 */
export function selectPersistenceByEnv(
  env: EnvSource = process.env,
  options: SelectPersistenceOptions = {}
): PersistenceDependencies {
  const isDeployed = env.VERCEL === '1' || env.NODE_ENV === 'production';
  const backend = parseBackend(env.PERSISTENCE_BACKEND);

  if (isDeployed) {
    if (!DEPLOYED_BACKENDS.has(backend)) {
      throw new Error(
        `PERSISTENCE_BACKEND_REQUIRED: deployed mode requires PERSISTENCE_BACKEND=cloudbase-postgres | cloudbase-nosql (got: ${backend || 'unset'})`
      );
    }

    if (backend === 'cloudbase-nosql') {
      const noSqlOptions: Partial<CloudBaseNoSqlOptions> = {
        envId: env.CLOUDBASE_ENV_ID,
        apiKey: env.CLOUDBASE_API_KEY,
        dataNamespace: env.CLOUDBASE_DATA_NAMESPACE,
        storagePrefix: env.CLOUDBASE_STORAGE_PREFIX,
        signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
          ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
          : undefined,
      };
      validateCloudBaseNoSqlConfig(noSqlOptions);
      return createCloudBaseNoSqlPersistence(
        noSqlOptions as CloudBaseNoSqlOptions
      );
    }

    // backend === 'cloudbase-postgres'
    const cloudBaseOptions: Partial<CloudBasePersistenceOptions> = {
      postgresUrl: env.CLOUDBASE_POSTGRES_URL,
      envId: env.CLOUDBASE_ENV_ID,
      bucketId: env.CLOUDBASE_STORAGE_BUCKET,
      storageToken: env.CLOUDBASE_STORAGE_TOKEN,
      signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
        ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
        : undefined,
    };
    validateCloudBaseConfig(cloudBaseOptions);
    return createCloudBasePersistence(
      cloudBaseOptions as CloudBasePersistenceOptions
    );
  }

  // Local / dev / test mode.
  if (backend === 'cloudbase-nosql') {
    // Allow explicit NoSQL in local mode for integration tests.
    const noSqlOptions: Partial<CloudBaseNoSqlOptions> = {
      envId: env.CLOUDBASE_ENV_ID,
      apiKey: env.CLOUDBASE_API_KEY,
      dataNamespace: env.CLOUDBASE_DATA_NAMESPACE,
      storagePrefix: env.CLOUDBASE_STORAGE_PREFIX,
      signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
        ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
        : undefined,
    };
    validateCloudBaseNoSqlConfig(noSqlOptions);
    return createCloudBaseNoSqlPersistence(noSqlOptions as CloudBaseNoSqlOptions);
  }
  if (backend === 'cloudbase-postgres') {
    const cloudBaseOptions: Partial<CloudBasePersistenceOptions> = {
      postgresUrl: env.CLOUDBASE_POSTGRES_URL,
      envId: env.CLOUDBASE_ENV_ID,
      bucketId: env.CLOUDBASE_STORAGE_BUCKET,
      storageToken: env.CLOUDBASE_STORAGE_TOKEN,
      signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
        ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
        : undefined,
    };
    validateCloudBaseConfig(cloudBaseOptions);
    return createCloudBasePersistence(cloudBaseOptions as CloudBasePersistenceOptions);
  }

  // backend === 'local' (default for dev / test)
  const rootDir =
    options.localRootDir ?? env.PERSISTENCE_ROOT ?? defaultLocalRoot();
  return createLocalPersistence({ rootDir });
}

/**
 * Compute a safe default local root dir beneath the server data directory.
 * Used only when `PERSISTENCE_ROOT` is not set and no override is supplied.
 */
function defaultLocalRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serverRoot = path.dirname(path.dirname(path.dirname(here)));
  const dataDir = path.join(serverRoot, 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      return path.join(serverRoot, '.data');
    }
  }
  return dataDir;
}
