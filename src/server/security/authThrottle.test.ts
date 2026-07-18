import { describe, it, expect, vi } from 'vitest';
import { createAuthThrottle } from './authThrottle.js';
import type { AuthThrottleRepository } from '../domain/persistence.js';

function makeFakeRepo(): AuthThrottleRepository & {
  store: Map<string, { failures: number; windowStartedAt: string }>;
} {
  const store = new Map<string, { failures: number; windowStartedAt: string }>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

const JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!!!';

describe('createAuthThrottle (D-034 internal security floor)', () => {
  it('blocks the sixth attempt after five failures in the window', async () => {
    const repo = makeFakeRepo();
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    });

    // Five failures should not block
    for (let i = 0; i < 5; i++) {
      const result = await throttle.recordFailure('1.2.3.4');
      expect(result.blocked).toBe(false);
    }

    // Sixth failure should be blocked
    const result = await throttle.recordFailure('1.2.3.4');
    expect(result.blocked).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('successful login clears failures for the key', async () => {
    const repo = makeFakeRepo();
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    });

    for (let i = 0; i < 3; i++) {
      await throttle.recordFailure('1.2.3.4');
    }
    expect(repo.store.size).toBe(1);

    await throttle.recordSuccess('1.2.3.4');
    expect(repo.store.size).toBe(0);
    expect(repo.delete).toHaveBeenCalledWith(expect.any(String));
  });

  it('another key is unaffected by a different IP', async () => {
    const repo = makeFakeRepo();
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    });

    for (let i = 0; i < 5; i++) {
      await throttle.recordFailure('1.2.3.4');
    }

    // Different IP should not be blocked
    const result = await throttle.recordFailure('5.6.7.8');
    expect(result.blocked).toBe(false);
  });

  it('never persists the raw IP — uses HMAC-derived key', async () => {
    const repo = makeFakeRepo();
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    });

    await throttle.recordFailure('1.2.3.4');

    // The stored key should NOT be the raw IP
    const keys = Array.from(repo.store.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe('1.2.3.4');
    expect(keys[0]).not.toContain('1.2.3.4');
    // Should be a hex-encoded HMAC
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('isBlocked returns true when threshold is reached', async () => {
    const repo = makeFakeRepo();
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    });

    expect((await throttle.isBlocked('1.2.3.4')).blocked).toBe(false);

    for (let i = 0; i < 5; i++) {
      await throttle.recordFailure('1.2.3.4');
    }

    const blocked = await throttle.isBlocked('1.2.3.4');
    expect(blocked.blocked).toBe(true);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('window expiry resets the failure count', async () => {
    const repo = makeFakeRepo();
    // Use a very short window so we can simulate expiry
    const throttle = createAuthThrottle({
      repo,
      jwtSecret: JWT_SECRET,
      windowMs: 50,
      maxFailures: 3,
    });

    for (let i = 0; i < 3; i++) {
      await throttle.recordFailure('1.2.3.4');
    }
    expect((await throttle.isBlocked('1.2.3.4')).blocked).toBe(true);

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // After window expiry, should not be blocked
    expect((await throttle.isBlocked('1.2.3.4')).blocked).toBe(false);
  });
});
