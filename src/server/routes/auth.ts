/**
 * D-034 Internal Security Floor - Login route with durable throttle.
 *
 * Flow:
 *  1. Check `throttle.isBlocked(ip)` before checking the password. If blocked,
 *     return 429 with `Retry-After` (seconds).
 *  2. On password mismatch, call `throttle.recordFailure(ip)`. If the failure
 *     crosses the block threshold, return 429 with `Retry-After`.
 *  3. On success, call `throttle.recordSuccess(ip)` to clear the bucket.
 *
 * The raw client IP is never persisted by this layer - `createAuthThrottle`
 * hashes it with HMAC-SHA256 before storing.
 *
 * FIX-R11 AC-10/AC-11: Throttle calls are wrapped with a bounded timeout.
 * If the throttle storage (CloudBase NoSQL) is unreachable, the auth attempt
 * FAILS CLOSED - the request is rejected with 503 instead of skipping the
 * security check or hanging until the Vercel Function timeout.
 *
 * FIX-R11-R1 AC-R1-02/AC-R1-03: The CloudBase SDK is initialized with a
 * native timeout (default 10000ms). The outer application-level timeout
 * below (12000ms) MUST be strictly larger than the SDK timeout so the SDK
 * returns a specific error (e.g. ETIMEDOUT) before Promise.race cuts it off.
 *
 * FIX-R11-R1 AC-R1-03: Promise.race does NOT cancel the underlying SDK
 * request. If the SDK timeout fires after the Promise.race timeout, the
 * SDK's native timeout is the primary defense against lingering requests.
 * The outer timeout is a secondary safety net for the case where the SDK
 * timeout itself hangs (e.g., DNS resolution stall before the HTTP layer).
 * There is no built-in abort mechanism in @cloudbase/node-sdk; the Vercel
 * Function's cold-start boundary serves as the ultimate resource isolation.
 */

import { Router, Request, Response } from 'express';
import { createLogin, authDepsFromConfig } from '../middleware/auth.js';
import type { AuthThrottle } from '../security/authThrottle.js';
import type { RuntimeConfig } from '../config/runtime.js';

export interface AuthRouterDeps {
  config: RuntimeConfig;
  throttle: AuthThrottle;
}

/**
 * FIX-R11-R1 AC-R1-02: Outer timeout for throttle storage calls.
 * MUST be strictly larger than the CloudBase SDK native timeout (default 10000ms)
 * so the SDK returns a specific error before Promise.race cuts it off.
 */
const THROTTLE_TIMEOUT_MS = 12000;

/**
 * Wrap a promise with a bounded timeout. Rejects with a deterministic error
 * code if the promise does not settle within `ms` milliseconds.
 *
 * FIX-R11-R1 AC-R1-03: Promise.race does NOT cancel the underlying promise.
 * The SDK's native timeout (configurable via CloudBaseNoSqlOptions.sdkTimeout,
 * default 10000ms) is the primary defense against lingering requests. This
 * outer timeout is a secondary safety net for edge cases where the SDK
 * timeout itself stalls (e.g., DNS resolution before the HTTP layer).
 * There is no built-in abort mechanism in @cloudbase/node-sdk; the Vercel
 * Function's cold-start boundary serves as the ultimate resource isolation.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${errorCode}: operation timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

function getClientIp(req: Request): string {
  // Trust Express's req.ip (honors `trust proxy` when configured). Fall back
  // to the raw socket address for local dev where req.ip may be undefined.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const login = createLogin(authDepsFromConfig(deps.config));
  const { throttle } = deps;

  router.post('/', async (req: Request, res: Response) => {
    const ip = getClientIp(req);

    // Pre-check: is this IP already blocked?
    // AC-11: If throttle storage is unreachable, fail CLOSED (503) - never
    // skip the security check and proceed to password verification.
    let blockedState;
    try {
      blockedState = await withTimeout(
        throttle.isBlocked(ip),
        THROTTLE_TIMEOUT_MS,
        'AUTH_THROTTLE_TIMEOUT'
      );
    } catch (err) {
      console.error('[auth] throttle.isBlocked failed:', (err as Error).message);
      res.status(503).json({ error: '认证服务暂时不可用，请稍后再试' });
      return;
    }
    if (blockedState.blocked) {
      const retryAfterSec = Math.max(1, Math.ceil(blockedState.retryAfterMs / 1000));
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: '登录尝试次数过多，请稍后再试' });
      return;
    }

    const { password } = req.body as { password: string };
    if (!password) {
      res.status(400).json({ error: '请输入密码' });
      return;
    }

    const token = login(password);
    if (token) {
      // recordSuccess clears the throttle bucket. If the storage is
      // unreachable, the login still succeeds (password is verified and
      // isBlocked already passed). The bucket will expire naturally.
      //
      // FIX-R11-R1 AC-R1-05: Security invariant — this is NOT fail-closed.
      // recordSuccess is a best-effort cleanup. The bucket's TTL-based
      // expiry (windowMs) is the durable safety net. A failed recordSuccess
      // does NOT:
      //   - Invalidate the issued JWT token
      //   - Re-block the IP (the bucket was already cleared conceptually)
      //   - Allow the next request to bypass isBlocked (bucket still exists
      //     with stale failures, but isBlocked only counts failures, not
      //     successes — so the worst case is a premature 429, not a bypass)
      // The alternative (failing the login) would create a denial-of-service
      // vector: an attacker could trigger CloudBase connectivity issues and
      // lock out legitimate users even with correct passwords.
      try {
        await withTimeout(
          throttle.recordSuccess(ip),
          THROTTLE_TIMEOUT_MS,
          'AUTH_THROTTLE_TIMEOUT'
        );
      } catch (err) {
        console.error('[auth] throttle.recordSuccess failed:', (err as Error).message);
      }
      res.json({ success: true, token });
      return;
    }

    // Failed login - record and possibly block.
    // AC-11: If throttle storage is unreachable, fail CLOSED (503) - do not
    // reveal whether the password was correct.
    let failureState;
    try {
      failureState = await withTimeout(
        throttle.recordFailure(ip),
        THROTTLE_TIMEOUT_MS,
        'AUTH_THROTTLE_TIMEOUT'
      );
    } catch (err) {
      console.error('[auth] throttle.recordFailure failed:', (err as Error).message);
      res.status(503).json({ error: '认证服务暂时不可用，请稍后再试' });
      return;
    }
    if (failureState.blocked) {
      const retryAfterSec = Math.max(1, Math.ceil(failureState.retryAfterMs / 1000));
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: '登录尝试次数过多，请稍后再试' });
      return;
    }
    res.status(401).json({ error: '密码错误' });
  });

  return router;
}
