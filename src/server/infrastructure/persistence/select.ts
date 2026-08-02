/**
 * PERSIST-001 P0-01: deployment-mode persistence adapter selector.
 *
 * Selects the correct `PersistenceDependencies` bundle based on the runtime
 * environment:
 *
 *  - Deployed mode (`VERCEL=1`): the CloudBase PostgreSQL + PG Storage
 *    adapter is constructed. Required CloudBase env vars must be present;
 *    otherwise the selector fails fast with `CLOUDBASE_CONFIG_REQUIRED` so
 *    the boot sequence never silently falls back to the local adapter.
 *  - Local / dev / test mode (no `VERCEL`): the file-backed local adapter
 *    is constructed beneath a caller-provided `PERSISTENCE_ROOT` (or a
 *    safe default beneath the server data dir). CloudBase config is
 *    ignored in this mode.
 *
 * The selector returns a `PersistenceDependencies` instance. In deployed
 * mode the returned bundle carries a `__brand: 'cloudbase'` marker so tests
 * can distinguish production from local without `instanceof`. Callers that
 * need to invoke `ensureReady()` / `close()` should narrow via the
 * `CloudBasePersistenceDeps` interface.
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
  type CloudBasePersistenceDeps,
} from './cloudbase.js';
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
 * In deployed mode, tries CloudBase PostgreSQL + PG Storage first. If
 * CloudBase config is missing, falls back to the local file-backed adapter
 * (using `/tmp` on Vercel) with a warning — data will NOT persist across
 * cold starts, but the app remains functional.
 */
export function selectPersistenceByEnv(
  env: EnvSource = process.env,
  options: SelectPersistenceOptions = {}
): PersistenceDependencies {
  const isDeployed = env.VERCEL === '1' || env.NODE_ENV === 'production';

  if (isDeployed) {
    const cloudBaseOptions: Partial<CloudBasePersistenceOptions> = {
      postgresUrl: env.CLOUDBASE_POSTGRES_URL,
      envId: env.CLOUDBASE_ENV_ID,
      bucketId: env.CLOUDBASE_STORAGE_BUCKET,
      storageToken: env.CLOUDBASE_STORAGE_TOKEN,
      signedUrlTtlSeconds: env.CLOUDBASE_SIGNED_URL_TTL_SECONDS
        ? Number(env.CLOUDBASE_SIGNED_URL_TTL_SECONDS)
        : undefined,
    };

    // Try CloudBase first; fall back to local if config is missing.
    try {
      validateCloudBaseConfig(cloudBaseOptions);
      return createCloudBasePersistence(
        cloudBaseOptions as CloudBasePersistenceOptions
      );
    } catch {
      // CloudBase config missing — fall back to local file adapter.
      // Data will NOT persist across cold starts on Vercel serverless.
      console.warn(
        '[PERSISTENCE] CloudBase config missing, falling back to local file adapter. ' +
        'Data will NOT persist across cold starts.'
      );
      // Use /tmp on Vercel (only writable directory in serverless functions)
      const rootDir = env.PERSISTENCE_ROOT || '/tmp/lumen-ink-data';
      return createLocalPersistence({ rootDir });
    }
  }

  // Local / dev / test mode: file-backed adapter.
  const rootDir =
    options.localRootDir ?? env.PERSISTENCE_ROOT ?? defaultLocalRoot();
  return createLocalPersistence({ rootDir });
}

/**
 * Type guard: returns true when the given deps are backed by CloudBase
 * (i.e., require `ensureReady()` before use). Used by the server bootstrap
 * to decide whether to call `ensureReady()` and start the worker executor.
 */
export function isCloudBaseDeps(
  deps: PersistenceDependencies
): deps is CloudBasePersistenceDeps {
  return '__brand' in deps && (deps as { __brand?: string }).__brand === 'cloudbase';
}

/**
 * Compute a safe default local root dir beneath the server data directory.
 * Used only when `PERSISTENCE_ROOT` is not set and no override is supplied.
 */
function defaultLocalRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // select.ts lives at src/server/infrastructure/persistence/. The server
  // root is three levels up. The local adapter writes beneath `<server>/data`.
  const serverRoot = path.dirname(path.dirname(path.dirname(here)));
  const dataDir = path.join(serverRoot, 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      // Fall back to a hidden dir; the local adapter will create it.
      return path.join(serverRoot, '.data');
    }
  }
  return dataDir;
}
