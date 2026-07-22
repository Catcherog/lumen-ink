/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4 (P1-03): Preview production
 * isolation gate tests.
 *
 * Tests the pure functions `validatePreviewIsolation` and
 * `isPreviewEnvironment` directly, then verifies `selectPersistenceByEnv`
 * integrates the gate correctly — the gate runs BEFORE SDK initialisation
 * and blocks misconfigured Preview deployments from touching Production data.
 *
 * The cloudbase.nosql module is mocked so no real network calls occur.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks: prevent real SDK init / network / FS access ---------------------
// vi.mock is hoisted; factory returns mock implementations.
vi.mock('./cloudbase.nosql.js', () => ({
  createCloudBaseNoSqlPersistence: vi.fn(),
  validateCloudBaseNoSqlConfig: vi.fn(),
}));

vi.mock('./cloudbase.js', () => ({
  createCloudBasePersistence: vi.fn(),
  validateCloudBaseConfig: vi.fn(),
}));

vi.mock('./local.js', () => ({
  createLocalPersistence: vi.fn(),
}));

import {
  selectPersistenceByEnv,
  validatePreviewIsolation,
  isPreviewEnvironment,
} from './select.js';
import {
  createCloudBaseNoSqlPersistence,
  validateCloudBaseNoSqlConfig,
} from './cloudbase.nosql.js';

const mockCreateNoSql = vi.mocked(createCloudBaseNoSqlPersistence);
const mockValidateNoSql = vi.mocked(validateCloudBaseNoSqlConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FAKE_DEPS: any = Object.freeze({
  __brand: 'cloudbase_nosql',
  projects: {},
  assets: {},
  versions: {},
  jobs: {},
  objects: {},
  unitOfWork: {},
  authThrottle: {},
  ensureReady: vi.fn(),
  close: vi.fn(),
});

// Valid Preview env vars (used by the "passes" tests)
function validPreviewEnv(): Record<string, string | undefined> {
  return {
    VERCEL: '1',
    PERSISTENCE_BACKEND: 'cloudbase-nosql',
    CLOUDBASE_ENV_ID: 'preview-env-id',
    CLOUDBASE_API_KEY: 'preview-api-key',
    CLOUDBASE_DATA_NAMESPACE: 'preview',
    CLOUDBASE_STORAGE_PREFIX: 'preview',
    CLOUDBASE_PRODUCTION_DATA_NAMESPACE: 'production',
    CLOUDBASE_PRODUCTION_STORAGE_PREFIX: 'production',
  };
}

// Valid Production env vars (gate is skipped in production)
function validProductionEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    PERSISTENCE_BACKEND: 'cloudbase-nosql',
    CLOUDBASE_ENV_ID: 'prod-env-id',
    CLOUDBASE_API_KEY: 'prod-api-key',
    CLOUDBASE_DATA_NAMESPACE: 'prod',
    CLOUDBASE_STORAGE_PREFIX: 'prod',
    // CLOUDBASE_PRODUCTION_* intentionally NOT set — gate skipped in production
  };
}

// ===========================================================================
// validatePreviewIsolation — pure function tests
// ===========================================================================
describe('FIX-R4 validatePreviewIsolation (pure function)', () => {
  it('throws PRODUCTION_NAMESPACE_REQUIRED when productionNamespace is empty', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'preview',
        productionNamespace: '',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PRODUCTION_NAMESPACE_REQUIRED/);
  });

  it('throws PRODUCTION_NAMESPACE_REQUIRED when productionNamespace is whitespace-only', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'preview',
        productionNamespace: '   ',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PRODUCTION_NAMESPACE_REQUIRED/);
  });

  it('throws PREVIEW_PRODUCTION_NAMESPACE_EQUAL when namespaces match exactly', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'lumen',
        storagePrefix: 'preview',
        productionNamespace: 'lumen',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_PRODUCTION_NAMESPACE_EQUAL/);
  });

  it('throws PREVIEW_PRODUCTION_NAMESPACE_EQUAL when namespaces differ only by case', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'LUMEN',
        storagePrefix: 'preview',
        productionNamespace: 'lumen',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_PRODUCTION_NAMESPACE_EQUAL/);
  });

  it('throws PREVIEW_PRODUCTION_NAMESPACE_EQUAL when namespaces differ only by whitespace', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: '  lumen  ',
        storagePrefix: 'preview',
        productionNamespace: 'lumen',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_PRODUCTION_NAMESPACE_EQUAL/);
  });

  it('throws PREVIEW_STORAGE_PREFIX_EQUAL when prefixes match (case-insensitive)', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'LUMEN-PREFIX',
        productionNamespace: 'production',
        productionStoragePrefix: 'lumen-prefix',
      })
    ).toThrowError(/PREVIEW_STORAGE_PREFIX_EQUAL/);
  });

  it('throws PREVIEW_NAMESPACE_CONTAINS_PROD when preview namespace contains "prod"', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'my-prod-data',
        storagePrefix: 'preview',
        productionNamespace: 'production',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_NAMESPACE_CONTAINS_PROD/);
  });

  it('throws PREVIEW_NAMESPACE_CONTAINS_PROD when preview namespace is "Prod" (case-insensitive)', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'Prod',
        storagePrefix: 'preview',
        productionNamespace: 'production',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_NAMESPACE_CONTAINS_PROD/);
  });

  it('throws PREVIEW_STORAGE_PREFIX_CONTAINS_PROD when preview prefix contains "prod"', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'prod-storage',
        productionNamespace: 'production',
        productionStoragePrefix: 'production',
      })
    ).toThrowError(/PREVIEW_STORAGE_PREFIX_CONTAINS_PROD/);
  });

  it('does NOT throw when Preview config is fully isolated from Production', () => {
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'preview',
        productionNamespace: 'production',
        productionStoragePrefix: 'production',
      })
    ).not.toThrow();
  });

  it('does NOT throw when namespaces differ only in "prod" substring presence', () => {
    // "preview" does not contain "prod", "production" does — but we only
    // check the PREVIEW namespace for "prod", not the production one.
    expect(() =>
      validatePreviewIsolation({
        dataNamespace: 'preview',
        storagePrefix: 'preview-prefix',
        productionNamespace: 'production',
        productionStoragePrefix: 'production-prefix',
      })
    ).not.toThrow();
  });
});

// ===========================================================================
// isPreviewEnvironment — pure function tests
// ===========================================================================
describe('FIX-R4 isPreviewEnvironment (pure function)', () => {
  it('returns true for VERCEL=1 without NODE_ENV=production', () => {
    expect(isPreviewEnvironment({ VERCEL: '1' })).toBe(true);
    expect(isPreviewEnvironment({ VERCEL: '1', NODE_ENV: 'development' })).toBe(true);
  });

  it('returns false for VERCEL=1 WITH NODE_ENV=production (Production runtime)', () => {
    expect(isPreviewEnvironment({ VERCEL: '1', NODE_ENV: 'production' })).toBe(false);
  });

  it('returns true for CLOUDBASE_PREVIEW_MODE=1 regardless of VERCEL', () => {
    expect(isPreviewEnvironment({ CLOUDBASE_PREVIEW_MODE: '1' })).toBe(true);
    expect(
      isPreviewEnvironment({ CLOUDBASE_PREVIEW_MODE: '1', NODE_ENV: 'production' })
    ).toBe(true);
  });

  it('returns false when neither VERCEL nor CLOUDBASE_PREVIEW_MODE is set', () => {
    expect(isPreviewEnvironment({})).toBe(false);
    expect(isPreviewEnvironment({ NODE_ENV: 'development' })).toBe(false);
  });

  it('returns false for CLOUDBASE_PREVIEW_MODE != "1"', () => {
    expect(isPreviewEnvironment({ CLOUDBASE_PREVIEW_MODE: '0' })).toBe(false);
    expect(isPreviewEnvironment({ CLOUDBASE_PREVIEW_MODE: undefined })).toBe(false);
  });
});

// ===========================================================================
// selectPersistenceByEnv — Preview isolation gate integration tests
// ===========================================================================
describe('FIX-R4 selectPersistenceByEnv — Preview isolation gate (AC-22 … AC-29)', () => {
  beforeEach(() => {
    mockCreateNoSql.mockReset();
    mockValidateNoSql.mockReset();
    mockValidateNoSql.mockImplementation(() => undefined); // pass by default
    mockCreateNoSql.mockReturnValue(FAKE_DEPS);
  });

  // --- Test 1: Preview production namespace missing -------------------------
  it('Preview with missing CLOUDBASE_PRODUCTION_DATA_NAMESPACE → PRODUCTION_NAMESPACE_REQUIRED', () => {
    const env = validPreviewEnv();
    delete env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE;
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PRODUCTION_NAMESPACE_REQUIRED/
    );
    // Gate must block BEFORE SDK init
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 2: Preview namespace == Production namespace (exact) -----------
  it('Preview namespace == Production namespace (exact) → PREVIEW_PRODUCTION_NAMESPACE_EQUAL', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_DATA_NAMESPACE = 'lumen';
    env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE = 'lumen';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_PRODUCTION_NAMESPACE_EQUAL/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 3: Preview namespace == Production namespace (case differs) -----
  it('Preview namespace == Production namespace (case differs) → PREVIEW_PRODUCTION_NAMESPACE_EQUAL', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_DATA_NAMESPACE = 'LUMEN';
    env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE = 'lumen';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_PRODUCTION_NAMESPACE_EQUAL/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 4: Preview namespace == Production namespace (whitespace) ------
  it('Preview namespace == Production namespace (whitespace differs) → PREVIEW_PRODUCTION_NAMESPACE_EQUAL', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_DATA_NAMESPACE = '  lumen  ';
    env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE = 'lumen';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_PRODUCTION_NAMESPACE_EQUAL/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 5: Preview namespace contains 'prod' ---------------------------
  it('Preview namespace contains "prod" → PREVIEW_NAMESPACE_CONTAINS_PROD', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_DATA_NAMESPACE = 'my-prod-namespace';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_NAMESPACE_CONTAINS_PROD/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 6: Preview storage prefix contains 'prod' -----------------------
  it('Preview storage prefix contains "prod" → PREVIEW_STORAGE_PREFIX_CONTAINS_PROD', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_STORAGE_PREFIX = 'prod-storage';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_STORAGE_PREFIX_CONTAINS_PROD/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 7: Preview storage prefix == Production prefix -----------------
  it('Preview storage prefix == Production prefix → PREVIEW_STORAGE_PREFIX_EQUAL', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_STORAGE_PREFIX = 'shared-prefix';
    env.CLOUDBASE_PRODUCTION_STORAGE_PREFIX = 'shared-prefix';
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_STORAGE_PREFIX_EQUAL/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Test 8: Valid Preview config passes gate ----------------------------
  it('Valid Preview config passes gate and invokes SDK with correct options', () => {
    const env = validPreviewEnv();
    const deps = selectPersistenceByEnv(env);
    // SDK init was called
    expect(mockCreateNoSql).toHaveBeenCalledTimes(1);
    // Config validation was called
    expect(mockValidateNoSql).toHaveBeenCalledTimes(1);
    // Returned the fake adapter
    expect(deps).toBe(FAKE_DEPS);
    // Options passed to the adapter include the Preview namespace
    const passedOptions = mockCreateNoSql.mock.calls[0][0];
    expect(passedOptions.dataNamespace).toBe('preview');
    expect(passedOptions.storagePrefix).toBe('preview');
    expect(passedOptions.envId).toBe('preview-env-id');
  });

  // --- Test 9: Valid Production config passes (no gate applied) -----------
  it('Valid Production config (NODE_ENV=production) passes — gate skipped even with "prod" namespace', () => {
    const env = validProductionEnv();
    // In production, namespace contains "prod" but the gate is skipped.
    const deps = selectPersistenceByEnv(env);
    expect(mockCreateNoSql).toHaveBeenCalledTimes(1);
    expect(mockValidateNoSql).toHaveBeenCalledTimes(1);
    expect(deps).toBe(FAKE_DEPS);
  });

  // --- Test 10: Gate failure → no SDK dynamic import -----------------------
  it('Gate failure throws BEFORE createCloudBaseNoSqlPersistence is called', () => {
    const env = validPreviewEnv();
    env.CLOUDBASE_DATA_NAMESPACE = 'prod'; // triggers PREVIEW_NAMESPACE_CONTAINS_PROD
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PREVIEW_NAMESPACE_CONTAINS_PROD/
    );
    // Critical: the SDK must NOT have been initialised.
    expect(mockCreateNoSql).not.toHaveBeenCalled();
    // Config validation also must NOT have been called (gate runs first).
    expect(mockValidateNoSql).not.toHaveBeenCalled();
  });

  // --- Additional: CLOUDBASE_PREVIEW_MODE=1 triggers gate in local mode ----
  it('CLOUDBASE_PREVIEW_MODE=1 triggers gate even without VERCEL (local integration test)', () => {
    const env: Record<string, string | undefined> = {
      PERSISTENCE_BACKEND: 'cloudbase-nosql',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
      CLOUDBASE_DATA_NAMESPACE: 'prod', // contains 'prod' — should fail
      CLOUDBASE_STORAGE_PREFIX: 'test',
      CLOUDBASE_PREVIEW_MODE: '1',
      // CLOUDBASE_PRODUCTION_* not set — should trigger PRODUCTION_NAMESPACE_REQUIRED
    };
    expect(() => selectPersistenceByEnv(env)).toThrowError(
      /PRODUCTION_NAMESPACE_REQUIRED/
    );
    expect(mockCreateNoSql).not.toHaveBeenCalled();
  });

  // --- Additional: CLOUDBASE_PREVIEW_MODE=1 with valid isolation passes ------
  it('CLOUDBASE_PREVIEW_MODE=1 with valid isolation passes gate', () => {
    const env: Record<string, string | undefined> = {
      PERSISTENCE_BACKEND: 'cloudbase-nosql',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
      CLOUDBASE_DATA_NAMESPACE: 'preview',
      CLOUDBASE_STORAGE_PREFIX: 'preview',
      CLOUDBASE_PRODUCTION_DATA_NAMESPACE: 'production',
      CLOUDBASE_PRODUCTION_STORAGE_PREFIX: 'production',
      CLOUDBASE_PREVIEW_MODE: '1',
    };
    const deps = selectPersistenceByEnv(env);
    expect(mockCreateNoSql).toHaveBeenCalledTimes(1);
    expect(deps).toBe(FAKE_DEPS);
  });

  // --- Additional: Preview gate does NOT affect cloudbase-postgres ---------
  it('Preview gate does NOT affect cloudbase-postgres backend', () => {
    // Even with a "prod" namespace and Preview environment, the postgres
    // path should not be gated (gate only applies to cloudbase-nosql).
    const env: Record<string, string | undefined> = {
      VERCEL: '1',
      PERSISTENCE_BACKEND: 'cloudbase-postgres',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_STORAGE_BUCKET: 'bucket',
      CLOUDBASE_STORAGE_TOKEN: 'token',
      // No CLOUDBASE_PRODUCTION_* — but gate only applies to nosql
    };
    // Should NOT throw PREVIEW_PRODUCTION_NAMESPACE_EQUAL etc.
    expect(() => selectPersistenceByEnv(env)).not.toThrow();
  });
});
