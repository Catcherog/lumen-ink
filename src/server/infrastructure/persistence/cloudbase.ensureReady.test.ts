/**
 * PERSIST-001 P0-01A contract test: deployment-mode ensureReady startup.
 *
 * Verifies the FIX_PACKET requirement:
 *  > 部署模式实际加载 pg 并执行 ensureReady，不出现 PG_MODULE_REQUIRED
 *
 * Strategy:
 *  - The `pg` package was added to `src/server/package.json` dependencies
 *    (PERSIST001-P0-01A). The real dynamic `import('pg')` in
 *    `cloudbase.ts::ensureReady()` should now succeed at runtime without
 *    throwing `PG_MODULE_REQUIRED`.
 *  - This test verifies two layers:
 *      1. `await import('pg')` resolves and exposes a `Pool` constructor.
 *         (Proves the package is installed and loadable in the deploy
 *         environment.)
 *      2. `createCloudBasePersistence(...).ensureReady()` does NOT throw
 *         `PG_MODULE_REQUIRED` when called with valid config. It may throw
 *         other errors (e.g., ECONNREFUSED against a fake URL or a schema
 *         error), but `PG_MODULE_REQUIRED` specifically must not appear.
 *
 * The second layer uses a stubbed `pg.Pool` that simulates a successful
 * connection so `ensureSchema()` can run without a real database.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('PERSIST-001 P0-01A: pg loads at runtime', () => {
  it('dynamic import("pg") resolves with a Pool constructor', async () => {
    // This proves pg is in package.json + lockfile and loads at runtime.
    const mod = (await import('pg')) as unknown as {
      Pool: new (config: unknown) => unknown;
      default?: { Pool: new (config: unknown) => unknown };
    };
    const Pool = mod.Pool ?? mod.default?.Pool;
    expect(typeof Pool).toBe('function');
  });
});

describe('PERSIST-001 P0-01A: ensureReady does not throw PG_MODULE_REQUIRED', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('ensureReady reaches schema creation without PG_MODULE_REQUIRED', async () => {
    // Stub the pg module so ensureReady uses a fake Pool that does not
    // require a real database. The fake Pool's connect() returns a client
    // that swallows schema SQL with empty results.
    const fakeClient = {
      query: async () => ({ rows: [], rowCount: 0, command: '' }),
      release: () => {},
    };
    const fakePool = {
      connect: async () => fakeClient,
      end: async () => {},
      query: async () => ({ rows: [], rowCount: 0, command: '' }),
    };
    vi.doMock('pg', () => ({
      Pool: function () {
        return fakePool;
      },
      default: {
        Pool: function () {
          return fakePool;
        },
      },
    }));

    // Import the adapter AFTER doMock so the dynamic import('pg') inside
    // ensureReady picks up the stub.
    const { createCloudBasePersistence } = await import('./cloudbase.js');

    const deps = createCloudBasePersistence({
      postgresUrl: 'postgresql://user:pass@fake-host:5432/fake-db',
      envId: 'env-fake',
      bucketId: 'bucket-fake',
      storageToken: 'token-fake',
      signedUrlTtlSeconds: 900,
    });

    // ensureReady must NOT throw PG_MODULE_REQUIRED. With the stubbed
    // Pool it should resolve cleanly.
    await expect(deps.ensureReady()).resolves.toBeUndefined();
    expect(deps.__brand).toBe('cloudbase');

    await deps.close();
  });

  it('ensureReady throws PG_MODULE_REQUIRED only when pg cannot be loaded', async () => {
    // Force the dynamic import('pg') to fail by mocking it to throw.
    vi.doMock('pg', () => {
      throw new Error('Cannot find module pg');
    });
    const { createCloudBasePersistence } = await import('./cloudbase.js');

    const deps = createCloudBasePersistence({
      postgresUrl: 'postgresql://user:pass@fake-host:5432/fake-db',
      envId: 'env-fake',
      bucketId: 'bucket-fake',
      storageToken: 'token-fake',
      signedUrlTtlSeconds: 900,
    });

    await expect(deps.ensureReady()).rejects.toThrow(/PG_MODULE_REQUIRED/);
  });
});
