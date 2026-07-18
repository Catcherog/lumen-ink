import { describe, it, expect } from 'vitest';
import { selectPersistenceByEnv } from './select.js';
import { createLocalPersistence } from './local.js';

/**
 * PERSIST-001 P0-01 regression: deployment-mode adapter selection.
 *
 * Verifies the FIX_PACKET requirements:
 *  - VERCEL=1 + missing CloudBase config → fail-fast
 *  - VERCEL=1 + CloudBase config present → CloudBase adapter (not local)
 *  - No VERCEL → local adapter (PoC/dev/tests)
 */

describe('PERSIST-001 P0-01: selectPersistenceByEnv', () => {
  it('VERCEL=1 without CloudBase config throws CLOUDBASE_CONFIG_REQUIRED', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        AUTH_PASSWORD: 'test-password-12',
        JWT_SECRET: 'a'.repeat(32),
        PROVIDER_ENCRYPTION_KEY: 'b'.repeat(32),
        CORS_ALLOWLIST: 'https://example.com',
        SEEDREAM_API_KEY: 'sk-test',
      })
    ).toThrowError(/CLOUDBASE_CONFIG_REQUIRED/);
  });

  it('VERCEL=1 with partial CloudBase config (missing storage) throws', () => {
    expect(() =>
      selectPersistenceByEnv({
        VERCEL: '1',
        CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
        // Missing CLOUDBASE_STORAGE_BUCKET and CLOUDBASE_STORAGE_TOKEN
      })
    ).toThrowError(/CLOUDBASE_CONFIG_REQUIRED/);
  });

  it('VERCEL=1 with full CloudBase config returns CloudBase-backed deps (not local)', () => {
    const deps = selectPersistenceByEnv({
      VERCEL: '1',
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
    });

    // The returned deps must implement the frozen surface. We assert it's
    // NOT the local adapter by checking that it doesn't expose the local
    // adapter's file-backed getSignedUrl shape (file://...). Instead we
    // check the adapter is tagged via a __brand marker so tests can
    // distinguish production from local without instanceof.
    expect((deps as { __brand?: string }).__brand).toBe('cloudbase');
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
    // Sanity: local adapter can still create a project (smoke test).
    expect(deps.projects).toBeDefined();
    expect(deps.objects).toBeDefined();
  });

  it('No VERCEL env ignores CloudBase config and uses local adapter', () => {
    const deps = selectPersistenceByEnv({
      CLOUDBASE_POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
      CLOUDBASE_STORAGE_BUCKET: 'lumen-private',
      CLOUDBASE_STORAGE_TOKEN: 'storage-token-test',
    });
    expect((deps as { __brand?: string }).__brand).toBeUndefined();
  });
});
