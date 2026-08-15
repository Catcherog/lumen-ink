import { describe, it, expect } from 'vitest';
import { selectPersistenceByEnv } from './select.js';

/**
 * PERSIST-001 P0-01B / LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2 regression:
 * deployment-mode adapter selection.
 *
 * NOSQL-R2-07 (2026-07-21): Backend is now selected EXPLICITLY via
 * `PERSISTENCE_BACKEND`. Previous implicit `CLOUDBASE_API_KEY` detection
 * is removed. Tests updated to set PERSISTENCE_BACKEND explicitly.
 *
 * Verifies:
 *  - VERCEL=1 + PERSISTENCE_BACKEND=cloudbase-postgres + full CloudBase
 *    config → CloudBase PostgreSQL adapter (not local)
 *  - VERCEL=1 + missing PERSISTENCE_BACKEND → fail-fast
 *    (PERSISTENCE_BACKEND_REQUIRED)
 *  - VERCEL=1 + PERSISTENCE_BACKEND=local → fail-fast (not allowed in
 *    deployed mode)
 *  - VERCEL=1 + invalid PERSISTENCE_BACKEND → fail-fast
 *    (PERSISTENCE_BACKEND_INVALID)
 *  - VERCEL=1 + partial CloudBase config → CLOUDBASE_CONFIG_REQUIRED
 *  - No VERCEL → local adapter (default)
 */

describe('PERSIST-001 P0-01 / NOSQL-R2-07: selectPersistenceByEnv', () => {
  it('VERCEL=1 without PERSISTENCE_BACKEND throws PERSISTENCE_BACKEND_REQUIRED', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
        CLOUDBASE_ENV_ID: 'lumen-prod-env',
        CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
        CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
      })
    ).toThrowError(/PERSISTENCE_BACKEND_REQUIRED/);
  });

  it('VERCEL=1 with PERSISTENCE_BACKEND=local throws PERSISTENCE_BACKEND_REQUIRED', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        PERSISTENCE_BACKEND: 'local',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      })
    ).toThrowError(/PERSISTENCE_BACKEND_REQUIRED/);
  });

  it('VERCEL=1 with invalid PERSISTENCE_BACKEND throws PERSISTENCE_BACKEND_INVALID', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        PERSISTENCE_BACKEND: 'mysql',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      })
    ).toThrowError(/PERSISTENCE_BACKEND_INVALID/);
  });

  it('VERCEL=1 with partial CloudBase config (missing envId + storage) throws CLOUDBASE_CONFIG_REQUIRED', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        PERSISTENCE_BACKEND: 'cloudbase-postgres',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
        // Missing CLOUDBASE_ENV_ID, CLOUDBASE_STORAGE_BUCKET, CLOUDBASE_STORAGE_TOKEN
      })
    ).toThrowError(/CLOUDBASE_CONFIG_REQUIRED/);
  });

  it('VERCEL=1 missing only envId throws CLOUDBASE_CONFIG_REQUIRED mentioning CLOUDBASE_ENV_ID', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        PERSISTENCE_BACKEND: 'cloudbase-postgres',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
        CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
        CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
        // CLOUDBASE_ENV_ID missing
      })
    ).toThrowError(/CLOUDBASE_ENV_ID/);
  });

  it('VERCEL=1 with full CloudBase Postgres config returns CloudBase-backed deps (not local)', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      PERSISTENCE_BACKEND: 'cloudbase-postgres',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_ENV_ID: 'lumen-prod-env',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
    });

    expect((deps as { __brand?: string }).__brand).toBe('cloudbase');
    expect(deps.projects).toBeDefined();
    expect(deps.assets).toBeDefined();
    expect(deps.versions).toBeDefined();
    expect(deps.jobs).toBeDefined();
    expect(deps.objects).toBeDefined();
    expect(deps.unitOfWork).toBeDefined();
    expect(deps.authThrottle).toBeDefined();
  });

  it('No VERCEL env → returns local adapter by default', () => {
    const deps = selectPersistenceByEnv({});
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
    expect(deps.projects).toBeDefined();
    expect(deps.objects).toBeDefined();
  });

  it('No VERCEL env ignores CloudBase config and uses local adapter', () => {
    const deps = selectPersistenceByEnv({
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_ENV_ID: 'lumen-prod-env',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
  });

  it('No VERCEL env with PERSISTENCE_BACKEND=local returns local adapter', () => {
    const deps = selectPersistenceByEnv({
      PERSISTENCE_BACKEND: 'local',
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
  });
});
