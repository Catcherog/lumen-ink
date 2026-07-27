/**
 * FIX-R11 AC-04/AC-05: CloudBase SDK module interop regression tests.
 *
 * Verifies the ESM/CJS interop fix in cloudbase.nosql.ts::ensureReady():
 *   - Supports both named export (module.init) and default export (module.default.init)
 *   - Returns deterministic CLOUDBASE_SDK_INIT_UNAVAILABLE when init is missing
 *   - Propagates init errors without setting ready=true
 *   - Repeated ensureReady() calls do not re-initialize
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

const validOptions = {
  envId: 'test-env-id',
  apiKey: 'test-api-key',
  dataNamespace: 'test',
  storagePrefix: 'test',
  signedUrlTtlSeconds: 900,
};

/**
 * Create a fake CloudBase app instance that satisfies ensureReady's
 * database() and command access without making real network calls.
 */
function createFakeApp() {
  const fakeCommand = {
    eq: vi.fn(),
    neq: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    nin: vi.fn(),
    and: vi.fn(),
    or: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    inc: vi.fn(),
    push: vi.fn(),
    exists: vi.fn(),
  };
  const fakeDb = {
    command: fakeCommand,
    collection: vi.fn(),
    runTransaction: vi.fn(),
  };
  return {
    init: vi.fn(() => ({
      database: () => fakeDb,
      uploadFile: vi.fn(),
      downloadFile: vi.fn(),
      deleteFile: vi.fn(),
      getTempFileURL: vi.fn(),
    })),
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@cloudbase/node-sdk');
});

describe('FIX-R11 AC-04/AC-05: CloudBase SDK module interop', () => {
  it('1. module.init - named export path: ensureReady succeeds when module exposes init() directly', async () => {
    const fakeApp = createFakeApp();
    // Named export: module = { init: ... } (default is nullish so ?? falls through)
    vi.doMock('@cloudbase/node-sdk', () => ({ init: fakeApp.init, default: null }));

    const { createCloudBaseNoSqlPersistence } = await import('./cloudbase.nosql.js');
    const deps = createCloudBaseNoSqlPersistence(validOptions);

    await expect(deps.ensureReady()).resolves.toBeUndefined();
    expect(fakeApp.init).toHaveBeenCalledWith({
      env: 'test-env-id',
      accessKey: 'test-api-key',
      timeout: 10000, // FIX-R11-R1 AC-R1-02: SDK native timeout
    });
    expect(deps.__brand).toBe('cloudbase_nosql');
  });

  it('2. module.default.init - default export path: ensureReady succeeds when module exposes default.init()', async () => {
    const fakeApp = createFakeApp();
    // Default export: module = { default: { init: ... } }
    vi.doMock('@cloudbase/node-sdk', () => ({ default: fakeApp }));

    const { createCloudBaseNoSqlPersistence } = await import('./cloudbase.nosql.js');
    const deps = createCloudBaseNoSqlPersistence(validOptions);

    await expect(deps.ensureReady()).resolves.toBeUndefined();
    expect(fakeApp.init).toHaveBeenCalledWith({
      env: 'test-env-id',
      accessKey: 'test-api-key',
      timeout: 10000, // FIX-R11-R1 AC-R1-02: SDK native timeout
    });
  });

  it('3. init missing - ensureReady throws CLOUDBASE_SDK_INIT_UNAVAILABLE when init is not a function', async () => {
    // Module with init=null (default is also nullish so ?? falls through to module)
    vi.doMock('@cloudbase/node-sdk', () => ({ init: null, default: null }));

    const { createCloudBaseNoSqlPersistence } = await import('./cloudbase.nosql.js');
    const deps = createCloudBaseNoSqlPersistence(validOptions);

    await expect(deps.ensureReady()).rejects.toThrow('CLOUDBASE_SDK_INIT_UNAVAILABLE');
  });

  it('4. init throws - ensureReady propagates init error and ready stays false for retry', async () => {
    const initError = new Error('init failed: invalid credentials');
    vi.doMock('@cloudbase/node-sdk', () => ({
      init: vi.fn(() => {
        throw initError;
      }),
      default: null,
    }));

    const { createCloudBaseNoSqlPersistence } = await import('./cloudbase.nosql.js');
    const deps = createCloudBaseNoSqlPersistence(validOptions);

    // First call should reject with the init error
    await expect(deps.ensureReady()).rejects.toThrow('init failed: invalid credentials');

    // Second call should also reject (ready stays false), allowing retry
    await expect(deps.ensureReady()).rejects.toThrow('init failed: invalid credentials');
  });

  it('5. ensureReady repeated call - second call is a no-op (init called only once)', async () => {
    const fakeApp = createFakeApp();
    vi.doMock('@cloudbase/node-sdk', () => ({ init: fakeApp.init, default: null }));

    const { createCloudBaseNoSqlPersistence } = await import('./cloudbase.nosql.js');
    const deps = createCloudBaseNoSqlPersistence(validOptions);

    // First call initializes
    await deps.ensureReady();
    expect(fakeApp.init).toHaveBeenCalledTimes(1);

    // Second call should be a no-op (ready=true, skip)
    await deps.ensureReady();
    expect(fakeApp.init).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});
