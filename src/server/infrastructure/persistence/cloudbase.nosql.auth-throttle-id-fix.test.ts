/**
 * LUMEN-AUTH-THROTTLE-ID-FIX-01: Regression tests for authThrottle.put() _id removal.
 *
 * Root cause: authThrottle.put() passed `_id: key` inside doc(key).set() data.
 * CloudBase rejects _id updates on existing documents ("不能更新_id的值"),
 * causing recordFailure() to throw -> auth.ts fail-closed -> 503.
 * This bug was masked by hkg1 TCP unreachability until the sin1 region switch.
 *
 * AC coverage:
 *  - AC-F03: new bucket write targets doc(key) - data round-trips through get()
 *  - AC-F04: update existing bucket - set() payload does NOT contain _id
 *  - AC-F05: two consecutive recordFailure() calls update same bucket without throwing
 *  - AC-F06: existing throttle threshold/window/ban/cleanup semantics preserved
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockCloudBaseState, MockCloudBaseApp } from './cloudbase.nosql.mock.js';
import { createMockCloudBaseState, createMockCloudBaseApp } from './cloudbase.nosql.mock.js';
import { createAuthThrottle } from '../../security/authThrottle.js';

// vi.mock is hoisted: use vi.hoisted for mutable container
const mockContainer = vi.hoisted(() => ({
  state: null as MockCloudBaseState | null,
  app: null as MockCloudBaseApp | null,
}));

vi.mock('@cloudbase/node-sdk', () => ({
  init: () => mockContainer.app,
  default: { init: () => mockContainer.app },
}));

import {
  createCloudBaseNoSqlPersistence,
  type CloudBaseNoSqlOptions,
} from './cloudbase.nosql.js';

// --- Test fixtures --------------------------------------------------------

const OPTIONS: CloudBaseNoSqlOptions = {
  envId: 'test-env',
  apiKey: 'test-key',
  dataNamespace: 'prod',
  storagePrefix: 'prod',
};

const JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!!!';

/**
 * Wrap a mock app to capture all doc().set() calls.
 * Returns the wrapped app and an array of captured calls.
 * Each call records { collectionName, docId, data } where `data` is the
 * exact payload passed to set() BEFORE the mock adds _id.
 */
function wrapAppWithSetSpy(app: MockCloudBaseApp): {
  app: MockCloudBaseApp;
  setCalls: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }>;
} {
  const setCalls: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];
  const originalDb = app.database();

  const wrappedApp: MockCloudBaseApp = {
    ...app,
    database: () => ({
      collection: (name: string) => {
        const originalColl = originalDb.collection(name);
        return {
          ...originalColl,
          doc: (id: string) => {
            const originalDoc = originalColl.doc(id);
            return {
              ...originalDoc,
              set: async (data: Record<string, unknown>) => {
                setCalls.push({ collectionName: name, docId: id, data: { ...data } });
                return originalDoc.set(data);
              },
            };
          },
        };
      },
      runTransaction: originalDb.runTransaction.bind(originalDb),
      command: originalDb.command,
    }),
  };

  return { app: wrappedApp, setCalls };
}

/** Setup helper: create mock state, wrap app with set spy, create adapter, ensureReady */
async function makeReadyDeps(options: CloudBaseNoSqlOptions = OPTIONS) {
  const state = createMockCloudBaseState(options.envId);
  const { app, setCalls } = wrapAppWithSetSpy(createMockCloudBaseApp(state));
  mockContainer.state = state;
  mockContainer.app = app;
  const deps = createCloudBaseNoSqlPersistence(options);
  await deps.ensureReady();
  return { deps, state, setCalls };
}

// --- Tests ----------------------------------------------------------------

describe('LUMEN-AUTH-THROTTLE-ID-FIX-01: authThrottle.put() omits _id from set() payload', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;

  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  describe('AC-F03: new throttle bucket write targets doc(key)', () => {
    it('put() stores bucket at doc(key) and get() retrieves it', async () => {
      const { deps } = setup;
      const bucket = { failures: 1, windowStartedAt: '2026-07-28T00:00:00.000Z' };

      await deps.authThrottle.put('throttle-key-1', bucket);

      const retrieved = await deps.authThrottle.get('throttle-key-1');
      expect(retrieved).toMatchObject(bucket);
      // _id is present in storage (added by doc(key)) but is not part of
      // the set() payload - verified separately in AC-F04
      expect(retrieved!.failures).toBe(1);
      expect(retrieved!.windowStartedAt).toBe(bucket.windowStartedAt);
    });

    it('put() stores at the correct key - different keys do not collide', async () => {
      const { deps } = setup;
      const bucketA = { failures: 1, windowStartedAt: '2026-07-28T00:00:00.000Z' };
      const bucketB = { failures: 3, windowStartedAt: '2026-07-28T01:00:00.000Z' };

      await deps.authThrottle.put('key-a', bucketA);
      await deps.authThrottle.put('key-b', bucketB);

      expect(await deps.authThrottle.get('key-a')).toMatchObject(bucketA);
      expect(await deps.authThrottle.get('key-b')).toMatchObject(bucketB);
    });
  });

  describe('AC-F04: update existing bucket - payload does not contain _id', () => {
    it('first put() (create) payload has no _id', async () => {
      const { deps, setCalls } = setup;
      const bucket = { failures: 1, windowStartedAt: '2026-07-28T00:00:00.000Z' };

      await deps.authThrottle.put('throttle-key-1', bucket);

      // Verify the set() payload does not contain _id
      const throttleSetCalls = setCalls.filter(c => c.collectionName === 'prod_auth_throttle');
      expect(throttleSetCalls).toHaveLength(1);
      expect(throttleSetCalls[0].data).not.toHaveProperty('_id');
      expect(throttleSetCalls[0].docId).toBe('throttle-key-1');
    });

    it('second put() (update) payload has no _id - no exception thrown', async () => {
      const { deps, setCalls } = setup;
      const bucket1 = { failures: 1, windowStartedAt: '2026-07-28T00:00:00.000Z' };
      const bucket2 = { failures: 2, windowStartedAt: '2026-07-28T00:00:00.000Z' };

      // First put (create)
      await deps.authThrottle.put('throttle-key-1', bucket1);

      // Second put (update) - should not throw
      await deps.authThrottle.put('throttle-key-1', bucket2);

      // Verify both set() payloads do not contain _id
      const throttleSetCalls = setCalls.filter(c => c.collectionName === 'prod_auth_throttle');
      expect(throttleSetCalls).toHaveLength(2);
      expect(throttleSetCalls[0].data).not.toHaveProperty('_id');
      expect(throttleSetCalls[1].data).not.toHaveProperty('_id');

      // Verify the update took effect
      const retrieved = await deps.authThrottle.get('throttle-key-1');
      expect(retrieved).toMatchObject(bucket2);
    });

    it('three consecutive put() calls all succeed and last value wins', async () => {
      const { deps } = setup;

      await deps.authThrottle.put('k', { failures: 1, windowStartedAt: '2026-07-28T00:00:00.000Z' });
      await deps.authThrottle.put('k', { failures: 2, windowStartedAt: '2026-07-28T00:00:00.000Z' });
      await deps.authThrottle.put('k', { failures: 3, windowStartedAt: '2026-07-28T00:00:00.000Z' });

      const retrieved = await deps.authThrottle.get('k');
      expect(retrieved).toMatchObject({ failures: 3, windowStartedAt: '2026-07-28T00:00:00.000Z' });
    });
  });

  describe('AC-F05: two consecutive recordFailure() calls update same bucket', () => {
    it('recordFailure() twice does not throw and updates same bucket', async () => {
      const { deps } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 5,
      });

      // First failure creates the bucket
      const r1 = await throttle.recordFailure('1.2.3.4');
      expect(r1.blocked).toBe(false);

      // Second failure updates the same bucket - must not throw
      const r2 = await throttle.recordFailure('1.2.3.4');
      expect(r2.blocked).toBe(false);

      // Verify the bucket was updated (failures = 2)
      const blocked = await throttle.isBlocked('1.2.3.4');
      expect(blocked.blocked).toBe(false); // 2 < 5 threshold
    });

    it('recordFailure() five times then sixth is blocked', async () => {
      const { deps } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 5,
      });

      // Five failures should not block
      for (let i = 0; i < 5; i++) {
        const r = await throttle.recordFailure('1.2.3.4');
        expect(r.blocked).toBe(false);
      }

      // Sixth failure should be blocked
      const r6 = await throttle.recordFailure('1.2.3.4');
      expect(r6.blocked).toBe(true);
      expect(r6.retryAfterMs).toBeGreaterThan(0);
    });

    it('recordSuccess() clears the bucket after recordFailure()', async () => {
      const { deps } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 5,
      });

      await throttle.recordFailure('1.2.3.4');
      await throttle.recordFailure('1.2.3.4');

      await throttle.recordSuccess('1.2.3.4');

      const blocked = await throttle.isBlocked('1.2.3.4');
      expect(blocked.blocked).toBe(false);
    });
  });

  describe('AC-F06: existing throttle threshold/window/ban/cleanup preserved', () => {
    it('different IPs are isolated - no cross-contamination', async () => {
      const { deps } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 3,
      });

      // Exhaust failures for IP 1
      for (let i = 0; i < 3; i++) {
        await throttle.recordFailure('1.1.1.1');
      }

      // IP 2 should not be blocked
      const r = await throttle.recordFailure('2.2.2.2');
      expect(r.blocked).toBe(false);
    });

    it('HMAC-derived key is used - raw IP is not stored', async () => {
      const { deps, state } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 5,
      });

      await throttle.recordFailure('1.2.3.4');

      // The stored key should NOT be the raw IP
      const coll = state.database.collections.get('prod_auth_throttle');
      expect(coll).toBeDefined();
      const keys = Array.from(coll!.docs.keys());
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toBe('1.2.3.4');
      expect(keys[0]).not.toContain('1.2.3.4');
      expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('window expiry resets the failure count', async () => {
      const { deps } = setup;
      const throttle = createAuthThrottle({
        repo: deps.authThrottle,
        jwtSecret: JWT_SECRET,
        windowMs: 50,
        maxFailures: 3,
      });

      for (let i = 0; i < 3; i++) {
        await throttle.recordFailure('1.2.3.4');
      }

      expect((await throttle.isBlocked('1.2.3.4')).blocked).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect((await throttle.isBlocked('1.2.3.4')).blocked).toBe(false);
    });

    it('delete() removes the throttle bucket', async () => {
      const { deps } = setup;
      const bucket = { failures: 5, windowStartedAt: '2026-07-28T00:00:00.000Z' };

      await deps.authThrottle.put('to-delete', bucket);
      expect(await deps.authThrottle.get('to-delete')).toMatchObject(bucket);

      await deps.authThrottle.delete('to-delete');
      expect(await deps.authThrottle.get('to-delete')).toBeNull();
    });
  });
});
