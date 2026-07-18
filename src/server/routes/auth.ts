/**
 * D-034 Internal Security Floor — Login route with durable throttle.
 *
 * Flow:
 *  1. Check `throttle.isBlocked(ip)` before checking the password. If blocked,
 *     return 429 with `Retry-After` (seconds).
 *  2. On password mismatch, call `throttle.recordFailure(ip)`. If the failure
 *     crosses the block threshold, return 429 with `Retry-After`.
 *  3. On success, call `throttle.recordSuccess(ip)` to clear the bucket.
 *
 * The raw client IP is never persisted by this layer — `createAuthThrottle`
 * hashes it with HMAC-SHA256 before storing.
 */

import { Router, Request, Response } from 'express';
import { createLogin, authDepsFromConfig } from '../middleware/auth.js';
import type { AuthThrottle } from '../security/authThrottle.js';
import type { RuntimeConfig } from '../config/runtime.js';

export interface AuthRouterDeps {
  config: RuntimeConfig;
  throttle: AuthThrottle;
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
    const blockedState = await throttle.isBlocked(ip);
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
      await throttle.recordSuccess(ip);
      res.json({ success: true, token });
      return;
    }

    // Failed login — record and possibly block
    const failureState = await throttle.recordFailure(ip);
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
