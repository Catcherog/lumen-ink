/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: NoSQL adapter contract tests.
 *
 * NOSQL-R2-08 (2026-07-21): This file tests the adapter's pure functions
 * and configuration handling directly against the PRODUCTION implementation
 * — no copied logic. Behavior tests that require a CloudBase connection
 * live in `cloudbase.nosql.r2.behavior.test.ts`.
 *
 * Tests cover:
 *  - JobPatch three-state semantics via the real `buildUpdateFromPatch`
 *    (NOSQL-R2-02: uses db.command, not raw $set/$unset)
 *  - `idempotencyDocId` produces the projectId-scoped deterministic _id
 *    (NOSQL-R2-03: scope is (projectId, key), not { key })
 *  - Config validation requires dataNamespace + storagePrefix
 *    (NOSQL-R2-06: Preview/Production isolation fail-closed)
 *  - Adapter factory returns correct __brand and surface
 *  - Selector honors explicit PERSISTENCE_BACKEND (NOSQL-R2-07)
 */

import { describe, it, expect } from 'vitest';
import {
  createCloudBaseNoSqlPersistence,
  validateCloudBaseNoSqlConfig,
  buildUpdateFromPatch,
  idempotencyDocId,
  type CloudBaseNoSqlOptions,
  type CloudBaseCommand,
} from './cloudbase.nosql.js';
import { selectPersistenceByEnv } from './select.js';
import { createMockCommand } from './cloudbase.nosql.mock.js';

// Use the mock command (same shape as CloudBase db.command) so we can
// assert the structure of the update object the production builder emits.
const cmd: CloudBaseCommand = createMockCommand() as unknown as CloudBaseCommand;

describe('NOSQL-R2-02: buildUpdateFromPatch uses db.command operators', () => {
  it('absent field: not included in update', () => {
    const patch = { status: 'generating' as const };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.status).toBeDefined();
    expect(update.workerId).toBeUndefined();
  });

  it('null field: emits command.remove()', () => {
    const patch = { workerId: null, leaseToken: null, leaseExpiresAt: null };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.workerId).toEqual({ __op: 'remove' });
    expect(update.leaseToken).toEqual({ __op: 'remove' });
    expect(update.leaseExpiresAt).toEqual({ __op: 'remove' });
  });

  it('value field: emits command.set(value)', () => {
    const patch = { status: 'succeeded' as const, resultVersionId: 'ver-123' };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.status).toEqual({ __op: 'set', value: 'succeeded' });
    expect(update.resultVersionId).toEqual({ __op: 'set', value: 'ver-123' });
  });

  it('mixed absent/null/value: emits set and remove per field', () => {
    const patch = {
      status: 'failed' as const,
      error: 'timeout',
      workerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.status).toEqual({ __op: 'set', value: 'failed' });
    expect(update.error).toEqual({ __op: 'set', value: 'timeout' });
    expect(update.workerId).toEqual({ __op: 'remove' });
    expect(update.leaseToken).toEqual({ __op: 'remove' });
    expect(update.leaseExpiresAt).toEqual({ __op: 'remove' });
  });

  it('empty patch: produces empty update', () => {
    const patch = {};
    const update = buildUpdateFromPatch(patch, cmd);
    expect(Object.keys(update).length).toBe(0);
  });

  it('cancelJob pattern: status=cancelled + remove lease fields', () => {
    const patch = {
      status: 'cancelled' as const,
      workerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.status).toEqual({ __op: 'set', value: 'cancelled' });
    expect(update.workerId).toEqual({ __op: 'remove' });
    expect(update.leaseToken).toEqual({ __op: 'remove' });
    expect(update.leaseExpiresAt).toEqual({ __op: 'remove' });
  });

  it('succeeded pattern: status + resultVersionId + remove error fields', () => {
    const patch = {
      status: 'succeeded' as const,
      resultVersionId: 'ver-abc',
      error: null,
      errorCode: null,
    };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.status).toEqual({ __op: 'set', value: 'succeeded' });
    expect(update.resultVersionId).toEqual({ __op: 'set', value: 'ver-abc' });
    expect(update.error).toEqual({ __op: 'remove' });
    expect(update.errorCode).toEqual({ __op: 'remove' });
  });

  it('does NOT emit raw $set or $unset keys (NOSQL-R2-02 regression)', () => {
    const patch = {
      status: 'failed' as const,
      workerId: null,
    };
    const update = buildUpdateFromPatch(patch, cmd);
    expect(update.$set).toBeUndefined();
    expect(update.$unset).toBeUndefined();
  });
});

describe('NOSQL-R2-03: idempotencyDocId is projectId-scoped', () => {
  it('produces projectId__key format', () => {
    expect(idempotencyDocId('proj-1', 'retry-001')).toBe('proj-1__retry-001');
  });

  it('different projectId with same key produces different _id', () => {
    const a = idempotencyDocId('proj-1', 'retry-001');
    const b = idempotencyDocId('proj-2', 'retry-001');
    expect(a).not.toBe(b);
  });

  it('same projectId with different key produces different _id', () => {
    const a = idempotencyDocId('proj-1', 'retry-001');
    const b = idempotencyDocId('proj-1', 'retry-002');
    expect(a).not.toBe(b);
  });

  it('FIX-R1 regression: scope is NOT just { key }', () => {
    // FIX-R1 used { key } only, which let proj-1/retry-001 collide with
    // proj-2/retry-001. R2 namespaces by projectId.
    const crossProject = idempotencyDocId('proj-1', 'shared-key') !== idempotencyDocId('proj-2', 'shared-key');
    expect(crossProject).toBe(true);
  });
});

describe('NOSQL-R2-06: config validation requires namespace + storagePrefix', () => {
  const validBase: CloudBaseNoSqlOptions = {
    envId: 'test-env-id',
    apiKey: 'test-api-key',
    dataNamespace: 'prod',
    storagePrefix: 'prod',
  };

  it('valid config passes validation', () => {
    expect(() => validateCloudBaseNoSqlConfig(validBase)).not.toThrow();
  });

  it('missing envId throws CLOUDBASE_CONFIG_REQUIRED', () => {
    const options = { ...validBase, envId: undefined } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_ENV_ID/
    );
  });

  it('missing apiKey throws CLOUDBASE_CONFIG_REQUIRED', () => {
    const options = { ...validBase, apiKey: undefined } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_API_KEY/
    );
  });

  it('missing dataNamespace throws CLOUDBASE_CONFIG_REQUIRED', () => {
    const options = { ...validBase, dataNamespace: undefined } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_DATA_NAMESPACE/
    );
  });

  it('missing storagePrefix throws CLOUDBASE_CONFIG_REQUIRED', () => {
    const options = { ...validBase, storagePrefix: undefined } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_STORAGE_PREFIX/
    );
  });

  it('empty string dataNamespace throws', () => {
    const options = { ...validBase, dataNamespace: '' } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_DATA_NAMESPACE/
    );
  });

  it('empty string storagePrefix throws', () => {
    const options = { ...validBase, storagePrefix: '' } as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_STORAGE_PREFIX/
    );
  });

  it('missing all required fields throws with all names', () => {
    const options = {} as Partial<CloudBaseNoSqlOptions>;
    expect(() => validateCloudBaseNoSqlConfig(options)).toThrow(
      /CLOUDBASE_CONFIG_REQUIRED.*CLOUDBASE_ENV_ID.*CLOUDBASE_API_KEY.*CLOUDBASE_DATA_NAMESPACE.*CLOUDBASE_STORAGE_PREFIX/
    );
  });
});

describe('CloudBase NoSQL adapter - Factory', () => {
  const validOptions: CloudBaseNoSqlOptions = {
    envId: 'test-env',
    apiKey: 'test-key',
    dataNamespace: 'prod',
    storagePrefix: 'prod',
  };

  it('creates adapter with cloudbase_nosql brand', () => {
    const deps = createCloudBaseNoSqlPersistence(validOptions);
    expect((deps as { __brand: string }).__brand).toBe('cloudbase_nosql');
  });

  it('adapter has all required PersistenceDependencies fields', () => {
    const deps = createCloudBaseNoSqlPersistence(validOptions);
    expect(deps.projects).toBeDefined();
    expect(deps.assets).toBeDefined();
    expect(deps.versions).toBeDefined();
    expect(deps.jobs).toBeDefined();
    expect(deps.objects).toBeDefined();
    expect(deps.unitOfWork).toBeDefined();
    expect(deps.authThrottle).toBeDefined();
  });

  it('adapter methods throw CLOUDBASE_NOT_READY before ensureReady', async () => {
    const deps = createCloudBaseNoSqlPersistence(validOptions);
    await expect(deps.projects.get('any-id')).rejects.toThrow(/CLOUDBASE_NOT_READY/);
  });

  it('ensureReady is a function', () => {
    const deps = createCloudBaseNoSqlPersistence(validOptions);
    expect(typeof (deps as { ensureReady: unknown }).ensureReady).toBe('function');
  });

  it('close is a function', () => {
    const deps = createCloudBaseNoSqlPersistence(validOptions);
    expect(typeof (deps as { close: unknown }).close).toBe('function');
  });
});

describe('NOSQL-R2-07: selector honors explicit PERSISTENCE_BACKEND', () => {
  it('VERCEL=1 + PERSISTENCE_BACKEND=cloudbase-nosql + full config → NoSQL adapter', () => {
    // FIX-R5: VERCEL_ENV=production → Production runtime, Preview gate skipped.
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      PERSISTENCE_BACKEND: 'cloudbase-nosql',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
      CLOUDBASE_DATA_NAMESPACE: 'preview',
      CLOUDBASE_STORAGE_PREFIX: 'preview',
      CLOUDBASE_PRODUCTION_DATA_NAMESPACE: 'prod',
      CLOUDBASE_PRODUCTION_STORAGE_PREFIX: 'prod',
    };
    const deps = selectPersistenceByEnv(env);
    expect((deps as unknown as { __brand: string }).__brand).toBe('cloudbase_nosql');
  });

  it('VERCEL=1 + PERSISTENCE_BACKEND=cloudbase-nosql + missing namespace → fail closed', () => {
    // FIX-R5: VERCEL_ENV=production → Production runtime, Preview gate skipped.
    // Config validation catches missing CLOUDBASE_DATA_NAMESPACE.
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      PERSISTENCE_BACKEND: 'cloudbase-nosql',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
      // CLOUDBASE_DATA_NAMESPACE + CLOUDBASE_STORAGE_PREFIX missing
    };
    expect(() => selectPersistenceByEnv(env)).toThrow(/PRODUCTION_NAMESPACE_REQUIRED|CLOUDBASE_DATA_NAMESPACE/);
  });

  it('VERCEL=1 + PERSISTENCE_BACKEND=cloudbase-postgres → Postgres adapter', () => {
    const env = {
      VERCEL: '1',
      PERSISTENCE_BACKEND: 'cloudbase-postgres',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_STORAGE_BUCKET: 'bucket',
      CLOUDBASE_STORAGE_TOKEN: 'token',
    };
    const deps = selectPersistenceByEnv(env);
    expect((deps as unknown as { __brand: string }).__brand).toBe('cloudbase');
  });

  it('VERCEL=1 + unset PERSISTENCE_BACKEND → fail closed', () => {
    const env = {
      VERCEL: '1',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
    };
    expect(() => selectPersistenceByEnv(env)).toThrow(/PERSISTENCE_BACKEND_REQUIRED/);
  });

  it('No VERCEL + unset PERSISTENCE_BACKEND → local adapter (default)', () => {
    const deps = selectPersistenceByEnv({}, { localRootDir: '/tmp/test-local' });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
  });

  it('FIX-R1 regression: no implicit NoSQL via CLOUDBASE_API_KEY presence', () => {
    // FIX-R1 implicitly chose NoSQL when CLOUDBASE_API_KEY was set, even
    // without PERSISTENCE_BACKEND. R2 requires explicit PERSISTENCE_BACKEND.
    const env = {
      VERCEL: '1',
      CLOUDBASE_ENV_ID: 'test-env',
      CLOUDBASE_API_KEY: 'test-key',
      CLOUDBASE_DATA_NAMESPACE: 'prod',
      CLOUDBASE_STORAGE_PREFIX: 'prod',
      // PERSISTENCE_BACKEND intentionally unset
    };
    expect(() => selectPersistenceByEnv(env)).toThrow(/PERSISTENCE_BACKEND_REQUIRED/);
  });
});
