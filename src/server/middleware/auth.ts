/**
 * D-034 Internal Security Floor — Auth middleware with injected config.
 *
 * Production code MUST use `createAuthMiddleware(config)` / `createLogin(config)`
 * with a `RuntimeConfig` loaded via `loadRuntimeConfig()`. There are no
 * module-level default constants — secrets are always injected.
 *
 * Existing tests that need a fixed JWT secret use an inline middleware
 * (see `edit.compat.test.ts`) so they are unaffected by this refactor.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { RuntimeConfig } from '../config/runtime.js';

export interface AuthDeps {
  authPassword: string;
  jwtSecret: string;
}

/** Extract the minimal auth deps from a full RuntimeConfig. */
export function authDepsFromConfig(config: RuntimeConfig): AuthDeps {
  return { authPassword: config.authPassword, jwtSecret: config.jwtSecret };
}

/**
 * Create a JWT auth middleware that verifies Bearer tokens signed with the
 * injected `jwtSecret`. No module-level env access.
 */
export function createAuthMiddleware(deps: AuthDeps) {
  const { jwtSecret } = deps;
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const token = authHeader.slice(7);
    try {
      jwt.verify(token, jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: '登录已过期，请重新登录' });
    }
  };
}

/**
 * Create a login function that signs a JWT when the password matches the
 * injected `authPassword`. Returns null on mismatch.
 */
export function createLogin(deps: AuthDeps) {
  const { authPassword, jwtSecret } = deps;
  return function login(password: string): string | null {
    if (password === authPassword) {
      return jwt.sign({ authenticated: true }, jwtSecret, { expiresIn: '7d' });
    }
    return null;
  };
}
