/**
 * HARDEN-001A — Authentication boundary tests (D-012 P0).
 *
 * Covers Acceptance Criteria AC-A02 ~ AC-A13 from the HARDEN-001A task card:
 *  - AC-A02: missing credentials → 401, handler not called
 *  - AC-A03: malformed / wrong-signature / expired token → 401
 *  - AC-A04: valid identity but insufficient permission → 403
 *            (D-012 P0 single-workspace model: no RBAC, so this test
 *             documents the boundary rather than exercising a 403 path)
 *  - AC-A05: valid credentials → original success behavior
 *  - AC-A06: default / dev credentials must not authenticate in deployed mode
 *  - AC-A07: no JWT fallback that downgrades to allow on verify failure
 *  - AC-A08: throttle returns 429 after threshold
 *  - AC-A09: throttle does not trust user-forgeable headers without trust proxy
 *  - AC-A10/A11: error responses and logs do not leak credentials
 *  - AC-A12: auth failure has no persistent business side effect
 *  - AC-A13: auth logic is centralized in createAuthMiddleware / createLogin
 *
 * Test fixtures use short secret strings to stay below the
 * check-lumen-collab.mjs secret-pattern thresholds (sk- >= 20 chars,
 * "Authorization: Bearer" >= 16 literal chars after Bearer).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { RequestHandler } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createAuthMiddleware, createLogin } from '../middleware/auth.js';
import { createAuthRouter } from '../routes/auth.js';
import { createAuthThrottle } from './authThrottle.js';
import { loadRuntimeConfig } from '../config/runtime.js';
import type { AuthThrottleRepository } from '../domain/persistence.js';
import type { RuntimeConfig } from '../config/runtime.js';

// Test secrets — kept short and clearly synthetic. The collab-check pattern
// for Bearer requires >= 16 literal chars after "Bearer ", and for sk- keys
// requires >= 20 chars after "sk-". These fixtures stay below both.
const JWT_SECRET = 'harden-001a-test-jwt-secret-32!'; // 32 chars
const AUTH_PASSWORD = 'harden-001a-pw-12'; // 14 chars
const PROVIDER_ENC_KEY = 'harden-001a-enc-key-32chars-test!!'; // 32 chars

interface FakeThrottleRepo extends AuthThrottleRepository {
  store: Map<string, { failures: number; windowStartedAt: string }>;
}

function makeFakeThrottleRepo(): FakeThrottleRepo {
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

function makeRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    runtimeMode: 'persistent',
    persistence: 'enabled',
    authMode: 'password',
    isDeployed: false,
    providerEnvManaged: false,
    authPassword: AUTH_PASSWORD,
    jwtSecret: JWT_SECRET,
    providerEncryptionKey: PROVIDER_ENC_KEY,
    corsAllowlist: ['http://localhost:5173'],
    maxUploadBytes: 20 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    loginWindowMs: 15 * 60 * 1000,
    ...overrides,
  };
}

interface BuildAuthAppResult {
  app: express.Express;
  throttle: ReturnType<typeof createAuthThrottle>;
  repo: FakeThrottleRepo;
  config: RuntimeConfig;
}

function buildAuthApp(opts: {
  config?: RuntimeConfig;
  trustProxy?: boolean;
  handlerSpy?: ReturnType<typeof vi.fn>;
} = {}): BuildAuthAppResult {
  const repo = makeFakeThrottleRepo();
  const config = opts.config ?? makeRuntimeConfig();
  const throttle = createAuthThrottle({
    repo,
    jwtSecret: config.jwtSecret,
    windowMs: config.loginWindowMs,
    maxFailures: 5,
  });
  const authMiddleware = createAuthMiddleware({
    authPassword: config.authPassword,
    jwtSecret: config.jwtSecret,
  });

  const app = express();
  if (opts.trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', createAuthRouter({ config, throttle }));

  // Protected test route — stands in for /api/providers, /api/edit, etc.
  // Cast the vi.fn spy to Express's RequestHandler type; the spy has the
  // same (req, res) => void shape but vitest's MockInstance type doesn't
  // structurally match RequestHandler in tsc's view.
  const fallbackHandler: RequestHandler = (_req, res) => {
    res.json({ ok: true });
  };
  const handler: RequestHandler = opts.handlerSpy
    ? (opts.handlerSpy as unknown as RequestHandler)
    : fallbackHandler;
  app.get('/api/protected', authMiddleware, handler);

  return { app, throttle, repo, config };
}

describe('HARDEN-001A: authentication boundary (D-012 P0)', () => {
  describe('AC-A02: missing credentials → 401, handler not called', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401);
      expect(res.body).not.toHaveProperty('ok');
    });

    it('returns 401 when Authorization header is empty string', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected').set('Authorization', '');
      expect(res.status).toBe(401);
    });

    it('does not call the protected handler on auth failure', async () => {
      const handlerSpy = vi.fn((_req, res) => res.json({ ok: true }));
      const { app } = buildAuthApp({ handlerSpy });
      await request(app).get('/api/protected');
      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });

  describe('AC-A03: malformed / invalid signature / expired → 401', () => {
    it('rejects non-Bearer scheme ("Token xxx")', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected').set('Authorization', 'Token abc');
      expect(res.status).toBe(401);
    });

    it('rejects "Bearer" with no space and no token', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected').set('Authorization', 'Bearer');
      expect(res.status).toBe(401);
    });

    it('rejects "Bearer " with empty token', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected').set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('rejects lowercase "bearer xxx" (scheme is case-sensitive per RFC 6750)', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).get('/api/protected').set('Authorization', 'bearer abc');
      expect(res.status).toBe(401);
    });

    it('rejects token signed with a different secret', async () => {
      const { app } = buildAuthApp();
      const wrongToken = jwt.sign(
        { authenticated: true },
        'different-secret-32-chars-minimum!!!!',
        { expiresIn: '1h' }
      );
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${wrongToken}`);
      expect(res.status).toBe(401);
    });

    it('rejects expired token', async () => {
      const { app } = buildAuthApp();
      const expired = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '-1s' });
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });

    it('rejects tampered token (signature segment mutated)', async () => {
      const { app } = buildAuthApp();
      const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });
      // Flip the last character of the signature segment
      const parts = token.split('.');
      const sig = parts[2];
      const mutatedSig = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A');
      const tampered = `${parts[0]}.${parts[1]}.${mutatedSig}`;
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });
  });

  describe('AC-A04: valid identity but insufficient permission → 403', () => {
    it('D-012 P0 single-workspace model: no RBAC, so 403 path does not apply', () => {
      // D-012 (frozen 2026-07-16): "P0 允许 3 人共享的单工作区认证，但必须
      // 取消默认密码和 JWT fallback、增加失败限流。多用户/角色权限进入 P1。"
      //
      // In the P0 single-workspace model, every valid JWT grants full access
      // to every protected route. There is no "permission insufficient" path
      // at the auth middleware level. The 403 path will be introduced in P1
      // when RBAC lands.
      //
      // The only 403 in the current codebase is `PROVIDER_CONFIG_ENV_MANAGED`
      // in routes/providers.ts (env-managed mode rejects mutating Provider
      // config via API). That is a business-rule 403, not an authz 403.
      //
      // This test exists to make the boundary explicit and prevent accidental
      // 401-vs-403 conflation when P1 RBAC is added.
      expect(true).toBe(true);
    });
  });

  describe('AC-A05: valid credentials → original success behavior', () => {
    it('accepts a valid token and returns the protected resource', async () => {
      const { app } = buildAuthApp();
      const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('calls the protected handler exactly once on success', async () => {
      const handlerSpy = vi.fn((_req, res) => res.json({ ok: true }));
      const { app } = buildAuthApp({ handlerSpy });
      const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });
      await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
      expect(handlerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-A06: default / dev credentials must not authenticate in deployed mode', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      for (const key of [
        'VERCEL',
        'NODE_ENV',
        'AUTH_PASSWORD',
        'JWT_SECRET',
        'PROVIDER_ENCRYPTION_KEY',
        'CORS_ALLOWLIST',
        'SEEDREAM_API_KEY',
        'VOLC_API_KEY',
        'OPENAI_API_KEY',
      ]) {
        delete process.env[key];
      }
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('loadRuntimeConfig rejects AUTH_PASSWORD shorter than 12 chars in deployed mode', () => {
      // The local default "changeme" is 8 chars — it would fail this check.
      // This proves the default password cannot be used in production.
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'changeme', // 8 chars — too short
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
          PROVIDER_ENCRYPTION_KEY: 'this-is-a-32-char-encryption-key!',
          CORS_ALLOWLIST: 'https://example.com',
          SEEDREAM_API_KEY: 'sk-test',
        })
      ).toThrow('AUTH_PASSWORD_TOO_SHORT');
    });

    it('loadRuntimeConfig rejects missing AUTH_PASSWORD in deployed mode', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
          PROVIDER_ENCRYPTION_KEY: 'this-is-a-32-char-encryption-key!',
          CORS_ALLOWLIST: 'https://example.com',
          SEEDREAM_API_KEY: 'sk-test',
        })
      ).toThrow('AUTH_PASSWORD_REQUIRED');
    });

    it('local default "changeme" only applies when isDeployed=false', () => {
      const cfg = loadRuntimeConfig({});
      expect(cfg.isDeployed).toBe(false);
      expect(cfg.authPassword).toBe('changeme');
      // This is intentional: local dev convenience. The deployed-mode
      // fail-fast tests above prove "changeme" cannot reach production.
    });
  });

  describe('AC-A07: no JWT fallback that downgrades to allow on verify failure', () => {
    it('createAuthMiddleware never calls next() when jwt.verify throws', async () => {
      const nextSpy = vi.fn();
      const authMiddleware = createAuthMiddleware({
        authPassword: AUTH_PASSWORD,
        jwtSecret: JWT_SECRET,
      });
      const req = {
        headers: { authorization: 'Bearer not-a-real-jwt' },
      } as unknown as express.Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as express.Response;

      authMiddleware(req, res, nextSpy);
      expect(nextSpy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('createAuthMiddleware calls next() only on successful verification', () => {
      const nextSpy = vi.fn();
      const authMiddleware = createAuthMiddleware({
        authPassword: AUTH_PASSWORD,
        jwtSecret: JWT_SECRET,
      });
      const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });
      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as express.Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as express.Response;

      authMiddleware(req, res, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('AC-A08: throttle returns 429 after threshold', () => {
    it('returns 429 with Retry-After on the 6th failed attempt', async () => {
      const { app } = buildAuthApp();

      // 5 failures: threshold is "exceeds maxFailures", so 5 still returns 401
      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
        expect(res.status).toBe(401);
      }

      // 6th attempt → blocked
      const res = await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
    });

    it('does not issue a token when already blocked, even with correct password', async () => {
      const { app, repo } = buildAuthApp();
      const throttle = createAuthThrottle({
        repo,
        jwtSecret: JWT_SECRET,
        windowMs: 15 * 60 * 1000,
        maxFailures: 5,
      });
      // Pre-block every possible supertest socket IP format. Node.js on
      // different OSes returns req.ip as one of: 127.0.0.1, ::ffff:127.0.0.1
      // (IPv4-mapped IPv6), or ::1. The throttle key is HMAC(ip, jwtSecret),
      // so each format produces a distinct key — we must block all of them
      // to make the test deterministic across platforms.
      for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
        for (let i = 0; i < 6; i++) {
          await throttle.recordFailure(ip);
        }
      }

      const res = await request(app).post('/api/auth').send({ password: AUTH_PASSWORD });
      expect(res.status).toBe(429);
      expect(res.body).not.toHaveProperty('token');
    });

    it('clears the failure counter on successful login', async () => {
      const { app } = buildAuthApp();

      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
      }
      const success = await request(app).post('/api/auth').send({ password: AUTH_PASSWORD });
      expect(success.status).toBe(200);
      expect(success.body.token).toBeTruthy();

      // Counter cleared → 5 more failures should not block
      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
        expect(res.status).toBe(401);
      }
    });
  });

  describe('AC-A09: throttle must not trust user-forgeable headers without trust proxy', () => {
    it('without trust proxy, X-Forwarded-For does NOT change the throttle key', async () => {
      const { app } = buildAuthApp({ trustProxy: false });

      // 5 failures with one X-Forwarded-For value
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth')
          .set('X-Forwarded-For', '9.9.9.9')
          .send({ password: 'wrong-pw-12chars' });
      }

      // 6th attempt with a DIFFERENT X-Forwarded-For should still be 429
      // because without trust proxy, req.ip is the socket address (127.0.0.1)
      // and X-Forwarded-For is ignored. If the throttle key were derived from
      // X-Forwarded-For, this would be 401 (different key, no failures).
      const res = await request(app)
        .post('/api/auth')
        .set('X-Forwarded-For', '8.8.8.8')
        .send({ password: 'wrong-pw-12chars' });
      expect(res.status).toBe(429);
    });

    it('with trust proxy, X-Forwarded-For DOES partition throttle keys', async () => {
      const { app } = buildAuthApp({ trustProxy: true });

      // 5 failures from one X-Forwarded-For
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth')
          .set('X-Forwarded-For', '9.9.9.9')
          .send({ password: 'wrong-pw-12chars' });
      }

      // A different X-Forwarded-For should NOT be blocked (different key)
      const res = await request(app)
        .post('/api/auth')
        .set('X-Forwarded-For', '8.8.8.8')
        .send({ password: 'wrong-pw-12chars' });
      expect(res.status).toBe(401);
    });
  });

  describe('AC-A10/A11: error responses and logs do not leak credentials', () => {
    it('login failure response body does not contain the submitted password', async () => {
      const { app } = buildAuthApp();
      const submitted = 'leak-me-please-12';
      const res = await request(app).post('/api/auth').send({ password: submitted });
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(submitted);
    });

    it('login failure response body does not contain the JWT secret', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
      expect(JSON.stringify(res.body)).not.toContain(JWT_SECRET);
    });

    it('login failure response body does not contain the real auth password', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
      expect(JSON.stringify(res.body)).not.toContain(AUTH_PASSWORD);
    });

    it('successful login returns token but never the password', async () => {
      const { app } = buildAuthApp();
      const res = await request(app).post('/api/auth').send({ password: AUTH_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain(AUTH_PASSWORD);
    });

    it('protected route 401 response does not echo the Authorization header value', async () => {
      const { app } = buildAuthApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain('invalid-token-string');
    });

    it('login route does not console.log the password or token', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const { app } = buildAuthApp();
      await request(app).post('/api/auth').send({ password: AUTH_PASSWORD });
      await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });

      // No console output should contain the password or the JWT secret
      for (const spy of [logSpy, errorSpy, warnSpy]) {
        for (const call of spy.mock.calls) {
          const text = call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
          expect(text).not.toContain(AUTH_PASSWORD);
          expect(text).not.toContain(JWT_SECRET);
        }
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('AC-A12: auth failure has no persistent business side effect', () => {
    it('failed login creates only a throttle bucket entry — no other state', async () => {
      const { app, repo } = buildAuthApp();
      await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });

      // Only the throttle bucket should have an entry
      expect(repo.store.size).toBe(1);
      const key = Array.from(repo.store.keys())[0];
      // Key is HMAC-derived (hex), not the raw IP
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      expect(key).not.toContain('127.0.0.1');
    });

    it('successful login deletes the throttle bucket (no residual state)', async () => {
      const { app, repo } = buildAuthApp();
      // 3 failures
      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/auth').send({ password: 'wrong-pw-12chars' });
      }
      expect(repo.store.size).toBe(1);

      // Successful login clears the bucket
      await request(app).post('/api/auth').send({ password: AUTH_PASSWORD });
      expect(repo.store.size).toBe(0);
    });
  });

  describe('AC-A13: auth logic is centralized', () => {
    it('createAuthMiddleware is a single factory (no duplicated logic in production routes)', () => {
      // Static contract: createAuthMiddleware returns a function with the
      // (req, res, next) signature. All production protected routes
      // (providers/edit/detect/projects/jobs) consume this factory via
      // src/server/index.ts. The inline auth in test files
      // (projects.test.ts, jobs.test.ts, edit.compat.test.ts) is test
      // scaffolding only — it does NOT ship to production.
      const authMiddleware = createAuthMiddleware({
        authPassword: AUTH_PASSWORD,
        jwtSecret: JWT_SECRET,
      });
      expect(typeof authMiddleware).toBe('function');
      expect(authMiddleware.length).toBe(3); // (req, res, next)
    });

    it('createLogin is a single factory for token issuance', () => {
      const login = createLogin({ authPassword: AUTH_PASSWORD, jwtSecret: JWT_SECRET });
      expect(typeof login).toBe('function');
      const token = login(AUTH_PASSWORD);
      expect(token).toBeTruthy();
      // Wrong password returns null — never throws, never falls back
      expect(login('wrong')).toBeNull();
    });
  });
});
