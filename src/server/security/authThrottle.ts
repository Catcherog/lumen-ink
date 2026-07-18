/**
 * D-034 Internal Security Floor — Durable login throttle.
 *
 * Implements a fixed-window login attempt throttle backed by the frozen
 * `AuthThrottleRepository` contract from STORAGE-001. The raw client IP is
 * NEVER persisted; it is hashed with HMAC-SHA256 using `jwtSecret` to
 * produce an opaque bucket key.
 *
 * Behavior:
 *  - After `maxFailures` failed attempts within `windowMs`, subsequent
 *    attempts are blocked (HTTP 429 with Retry-After).
 *  - A successful login deletes the bucket, resetting the counter.
 *  - Each IP is tracked independently.
 *  - When the window expires, the bucket is reset on the next call.
 */

import crypto from 'crypto';
import type { AuthThrottleRepository } from '../domain/persistence.js';

export interface AuthThrottleDeps {
  repo: AuthThrottleRepository;
  jwtSecret: string;
  windowMs: number;
  maxFailures: number;
}

export interface ThrottleResult {
  blocked: boolean;
  /** Milliseconds until the window resets; 0 when not blocked. */
  retryAfterMs: number;
}

export interface AuthThrottle {
  /** Record a failed login attempt for the given IP. Returns the new state. */
  recordFailure(ip: string): Promise<ThrottleResult>;
  /** Record a successful login; clears the failure counter for the IP. */
  recordSuccess(ip: string): Promise<void>;
  /** Check if the IP is currently blocked without recording a failure. */
  isBlocked(ip: string): Promise<ThrottleResult>;
}

function deriveKey(ip: string, jwtSecret: string): string {
  return crypto.createHmac('sha256', jwtSecret).update(ip).digest('hex');
}

export function createAuthThrottle(deps: AuthThrottleDeps): AuthThrottle {
  const { repo, jwtSecret, windowMs, maxFailures } = deps;

  function getEffectiveBucket(
    bucket: { failures: number; windowStartedAt: string } | null,
    now: number
  ): { failures: number; windowStartedAt: string } | null {
    if (!bucket) return null;
    const windowStart = Date.parse(bucket.windowStartedAt);
    if (Number.isNaN(windowStart)) return null;
    if (now - windowStart >= windowMs) {
      // Window expired; reset
      return null;
    }
    return bucket;
  }

  return {
    async recordFailure(ip: string): Promise<ThrottleResult> {
      const key = deriveKey(ip, jwtSecret);
      const now = Date.now();
      const existing = getEffectiveBucket(await repo.get(key), now);

      const failures = existing ? existing.failures + 1 : 1;
      const windowStartedAt = existing
        ? existing.windowStartedAt
        : new Date(now).toISOString();

      await repo.put(key, { failures, windowStartedAt });

      // Block when failures EXCEED maxFailures. This means the first
      // `maxFailures` attempts are allowed (returning blocked=false), and
      // the (maxFailures+1)-th attempt is blocked. isBlocked() returns
      // true once failures >= maxFailures so the next attempt is rejected
      // before the password is even checked.
      if (failures > maxFailures) {
        const windowStartMs = Date.parse(windowStartedAt);
        const retryAfterMs = Math.max(0, windowStartMs + windowMs - now);
        return { blocked: true, retryAfterMs };
      }
      return { blocked: false, retryAfterMs: 0 };
    },

    async recordSuccess(ip: string): Promise<void> {
      const key = deriveKey(ip, jwtSecret);
      await repo.delete(key);
    },

    async isBlocked(ip: string): Promise<ThrottleResult> {
      const key = deriveKey(ip, jwtSecret);
      const now = Date.now();
      const bucket = getEffectiveBucket(await repo.get(key), now);
      if (!bucket || bucket.failures < maxFailures) {
        return { blocked: false, retryAfterMs: 0 };
      }
      const windowStartMs = Date.parse(bucket.windowStartedAt);
      const retryAfterMs = Math.max(0, windowStartMs + windowMs - now);
      return { blocked: true, retryAfterMs };
    },
  };
}
