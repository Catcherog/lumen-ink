/**
 * PERSIST-001 P0-01 / LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01: deployment-mode
 * persistence adapter selector.
 *
 * Selects the correct `PersistenceDependencies` bundle based on the runtime
 * environment:
 *
 *  - Deployed mode (`VERCEL=1`): prefers the CloudBase NoSQL adapter when
 *    `CLOUDBASE_API_KEY` is present (LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01).
 *    Falls back to the CloudBase PostgreSQL adapter when
 *    `CLOUDBASE_POSTGRES_URL` is present. Required CloudBase env vars must
 *    be present; otherwise the selector fails fast with
 *    `CLOUDBASE_CONFIG_REQUIRED` so the boot sequence never silently falls
 *    back to the local adapter.
 *  - Local / dev / test mode (no `VERCEL`): the file-backed local adapter
 *    is constructed beneath a caller-provided `PERSISTENCE_ROOT` (or a
 *    safe default beneath the server data dir). CloudBase config is
 *    ignored in this mode.
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
 * Throws `CLOUDBASE_CONFIG_REQUIRED` when deployed mode is requested but
 * required CloudBase env vars are missing.
 */
export function selectPersistenceByEnv(
  env: EnvSource = process.env,
  options: SelectPersistenceOptions = {}
): PersistenceDependencies {
  const isDeployed = env.VERCEL === '1' || env.NODE_ENV === 'production';

  if (isDeployed) {
    if (env.CLOUDBASE_API_KEY) {
      const noSqlOptions: Partial<CloudBaseNoSqlOptions> = {
        envId: env.CLOUDBASE_ENV_ID,
        apiKey: env.CLOUDBASE_API_KEY,
        signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
          ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
          : undefined,
      };
      validateCloudBaseNoSqlConfig(noSqlOptions);
      return createCloudBaseNoSqlPersistence(
        noSqlOptions as CloudBaseNoSqlOptions
      );
    }

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
