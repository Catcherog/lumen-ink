import { describe, it, expect } from 'vitest';
import { selectPersistenceByEnv, isCloudBaseDeps } from './select.js';

/**
 * PERSIST-001 P0-01B regression: deployment-mode adapter selection.
 *
 * Behaviour after fallback change:
 *  - VERCEL=1 + missing CloudBase config → falls back to local file adapter
 *    (NOT fail-fast). Data won't persist across cold starts, but the app
 *    stays functional. `isCloudBaseDeps(deps)` returns false.
 *  - VERCEL=1 + full CloudBase config → CloudBase adapter with __brand.
 *  - No VERCEL → local adapter (PoC/dev/tests).
 */

describe('PERSIST-001 P0-01: selectPersistenceByEnv', () => {
  it('VERCEL=1 without CloudBase config falls back to local adapter', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      AUTH_PASSWORD: 'test-password-12',
      JWT_SECRET: 'a'.repeat(32),
      PROVIDER_ENCRYPTION_KEY: 'b'.repeat(32),
      CORS_ALLOWLIST: 'https://example.com',
      SEEDREAM_API_KEY: 'sk-test',
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
    expect(isCloudBaseDeps(deps)).toBe(false);
    expect(deps.projects).toBeDefined();
  });

  it('VERCEL=1 with partial CloudBase config falls back to local adapter', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      // Missing CLOUDBASE_ENV_ID, CLOUDBASE_STORAGE_BUCKET, CLOUDBASE_STORAGE_TOKEN
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
    expect(isCloudBaseDeps(deps)).toBe(false);
  });

  it('VERCEL=1 missing only envId falls back to local adapter', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
      // CLOUDBASE_ENV_ID missing
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
    expect(isCloudBaseDeps(deps)).toBe(false);
  });

  it('VERCEL=1 with full CloudBase config returns CloudBase-backed deps (not local)', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_ENV_ID: 'lumen-prod-env',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
    });

    // The returned deps must implement the frozen surface. We assert it's
    // NOT the local adapter by checking that it doesn't expose the local
    // adapter's file-backed getSignedUrl shape (file://...). Instead we
    // check the adapter is tagged via a __brand marker so tests can
    // distinguish production from local without instanceof.
    expect((deps as { __brand?: string }).__brand).toBe('cloudbase');
    expect(isCloudBaseDeps(deps)).toBe(true);
    expect(deps.projects).toBeDefined();
    expect(deps.assets).toBeDefined();
    expect(deps.versions).toBeDefined();
    expect(deps.jobs).toBeDefined();
    expect(deps.objects).toBeDefined();
    expect(deps.unitOfWork).toBeDefined();
    expect(deps.authThrottle).toBeDefined();
  });

  it('No VERCEL env → returns local adapter', () => {
    const deps = selectPersistenceByEnv({});
    // Local adapter does not carry the cloudbase brand marker.
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
    expect(isCloudBaseDeps(deps)).toBe(false);
    // Sanity: local adapter can still create a project (smoke test).
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
    expect(isCloudBaseDeps(deps)).toBe(false);
  });
});
