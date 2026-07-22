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

// ---------------------------------------------------------------------------
// LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R5 (P1-04 fix): Preview production
// isolation gate.
//
// In Preview deployments (VERCEL_ENV=preview, or CLOUDBASE_PREVIEW_MODE=1),
// the selector must verify that the Preview data namespace and storage prefix
// are isolated from Production BEFORE the CloudBase SDK is initialised. This
// prevents a misconfigured Preview deployment from accidentally reading or
// writing Production data.
//
// The gate is a PURE function — no SDK imports, no network, no side effects.
// It runs BEFORE createCloudBaseNoSqlPersistence() so the SDK is never
// initialised against Production data when Preview == Production.
//
// FIX-R5: Preview is now identified by Vercel's authoritative VERCEL_ENV
// system variable (preview / production / development), NOT by NODE_ENV.
// This fixes P1-04: a Vercel Preview deployment with NODE_ENV=production
// was previously misidentified as Production and bypassed the gate.
//
// Production runtime (VERCEL_ENV=production) is NEVER blocked by this gate.
// ---------------------------------------------------------------------------

export interface PreviewIsolationOptions {
  /** Preview data namespace (CLOUDBASE_DATA_NAMESPACE). */
  dataNamespace: string;
  /** Preview storage prefix (CLOUDBASE_STORAGE_PREFIX). */
  storagePrefix: string;
  /** Production data namespace (CLOUDBASE_PRODUCTION_DATA_NAMESPACE). */
  productionNamespace: string;
  /** Production storage prefix (CLOUDBASE_PRODUCTION_STORAGE_PREFIX). */
  productionStoragePrefix: string;
}

/**
 * PURE: Validate that Preview namespace/prefix are isolated from Production.
 * Throws stable error codes on violation. No side effects, no SDK imports,
 * no network — safe to call from tests and the Smoke Harness.
 *
 * Error codes (AC-23 … AC-26):
 *  - PRODUCTION_NAMESPACE_REQUIRED        — productionNamespace is empty/missing
 *  - PREVIEW_PRODUCTION_NAMESPACE_EQUAL   — namespaces match (case-insensitive, trimmed)
 *  - PREVIEW_STORAGE_PREFIX_EQUAL         — prefixes match (case-insensitive, trimmed)
 *  - PREVIEW_NAMESPACE_CONTAINS_PROD      — Preview namespace contains "prod"
 *  - PREVIEW_STORAGE_PREFIX_CONTAINS_PROD — Preview prefix contains "prod"
 */
export function validatePreviewIsolation(opts: PreviewIsolationOptions): void {
  const {
    dataNamespace,
    storagePrefix,
    productionNamespace,
    productionStoragePrefix,
  } = opts;

  // Production namespace must be present so the gate can compare (AC-26).
  if (!productionNamespace || productionNamespace.trim() === '') {
    throw new Error(
      'PRODUCTION_NAMESPACE_REQUIRED: CLOUDBASE_PRODUCTION_DATA_NAMESPACE must be set in Preview environments so the isolation gate can verify Preview != Production'
    );
  }

  const previewNs = dataNamespace.trim().toLowerCase();
  const prodNs = productionNamespace.trim().toLowerCase();
  const previewPrefix = storagePrefix.trim().toLowerCase();
  const prodPrefix = productionStoragePrefix.trim().toLowerCase();

  if (previewNs === prodNs) {
    throw new Error(
      `PREVIEW_PRODUCTION_NAMESPACE_EQUAL: Preview data namespace "${dataNamespace}" must not equal Production namespace "${productionNamespace}" (case-insensitive, trimmed)`
    );
  }

  if (previewPrefix === prodPrefix) {
    throw new Error(
      `PREVIEW_STORAGE_PREFIX_EQUAL: Preview storage prefix "${storagePrefix}" must not equal Production prefix "${productionStoragePrefix}" (case-insensitive, trimmed)`
    );
  }

  if (previewNs.includes('prod')) {
    throw new Error(
      `PREVIEW_NAMESPACE_CONTAINS_PROD: Preview data namespace "${dataNamespace}" must not contain "prod" (case-insensitive) to avoid accidental Production namespace use`
    );
  }

  if (previewPrefix.includes('prod')) {
    throw new Error(
      `PREVIEW_STORAGE_PREFIX_CONTAINS_PROD: Preview storage prefix "${storagePrefix}" must not contain "prod" (case-insensitive) to avoid accidental Production prefix use`
    );
  }
}

/**
 * PURE: Returns true when the environment is a Preview deployment (not
 * Production). Preview is distinguished by Vercel's authoritative
 * VERCEL_ENV system variable:
 *   - VERCEL_ENV=preview                    (Vercel Preview deployment)
 *   - OR CLOUDBASE_PREVIEW_MODE=1           (explicit opt-in for local tests)
 *
 * FIX-R5 (P1-04 fix): Previously used VERCEL=1 && NODE_ENV!='production',
 * which incorrectly classified a Preview deployment with NODE_ENV=production
 * as Production. Vercel sets VERCEL_ENV=preview for Preview deployments
 * regardless of NODE_ENV — this is the authoritative signal.
 *
 * When VERCEL=1 but VERCEL_ENV is missing or has an unknown value, this
 * function throws VERCEL_ENV_REQUIRED_OR_INVALID to fail closed — we never
 * silently treat an ambiguous Vercel deployment as Production.
 *
 * Production (VERCEL_ENV=production) always returns false — the gate must
 * never block Production runtime (AC-28).
 */
export function isPreviewEnvironment(env: EnvSource): boolean {
  if (env.CLOUDBASE_PREVIEW_MODE === '1') return true;
  if (env.VERCEL === '1') {
    if (env.VERCEL_ENV === 'preview') return true;
    if (env.VERCEL_ENV === 'production') return false;
    // VERCEL=1 but VERCEL_ENV is missing or unknown — fail closed.
    throw new Error(
      `VERCEL_ENV_REQUIRED_OR_INVALID: VERCEL=1 requires VERCEL_ENV=preview|production, ` +
      `got: ${env.VERCEL_ENV ?? 'undefined'}. Refusing to guess deployment environment.`
    );
  }
  return false;
}

/**
 * Run the Preview isolation gate if the environment is a Preview deployment.
 * Called BEFORE validateCloudBaseNoSqlConfig() and
 * createCloudBaseNoSqlPersistence() so the SDK is never initialised against
 * Production data when Preview == Production (AC-22, AC-27).
 *
 * Production runtime (VERCEL_ENV=production) is never blocked.
 */
function runPreviewIsolationGateIfPreview(
  env: EnvSource,
  noSqlOptions: { dataNamespace?: string; storagePrefix?: string }
): void {
  if (!isPreviewEnvironment(env)) return;
  validatePreviewIsolation({
    dataNamespace: noSqlOptions.dataNamespace ?? '',
    storagePrefix: noSqlOptions.storagePrefix ?? '',
    productionNamespace: env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE ?? '',
    productionStoragePrefix: env.CLOUDBASE_PRODUCTION_STORAGE_PREFIX ?? '',
  });
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
 *
 * FIX-R5 Preview isolation gate (AC-22 … AC-29): in Preview environments
 * (VERCEL_ENV=preview, or CLOUDBASE_PREVIEW_MODE=1),
 * BEFORE the CloudBase NoSQL SDK is initialised, the selector verifies that
 * the Preview data namespace and storage prefix are isolated from
 * Production. Throws `PRODUCTION_NAMESPACE_REQUIRED`,
 * `PREVIEW_PRODUCTION_NAMESPACE_EQUAL`, `PREVIEW_STORAGE_PREFIX_EQUAL`,
 * `PREVIEW_NAMESPACE_CONTAINS_PROD`, or `PREVIEW_STORAGE_PREFIX_CONTAINS_PROD`.
 * When VERCEL=1 but VERCEL_ENV is missing/unknown, throws
 * `VERCEL_ENV_REQUIRED_OR_INVALID` (fail closed).
 * Production runtime (VERCEL_ENV=production) is never blocked by this gate.
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
      // FIX-R4: Preview isolation gate runs BEFORE SDK init and BEFORE
      // config validation so isolation is verified first (AC-22, AC-27).
      runPreviewIsolationGateIfPreview(env, noSqlOptions);
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
    // FIX-R4: Preview gate also applies in local mode when
    // CLOUDBASE_PREVIEW_MODE=1 is explicitly set (AC-22, AC-27).
    runPreviewIsolationGateIfPreview(env, noSqlOptions);
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
