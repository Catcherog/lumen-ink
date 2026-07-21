/**
 * HARDEN-001C — Production route wiring regression tests (DEBT-HARDEN-001A-02).
 *
 * Closes DEBT-HARDEN-001A-02: there was no integration test asserting that
 * the real `src/server/index.ts` production app wires routes with the
 * expected auth barriers. Existing `security.integration.test.ts` used a
 * `buildApp()` fixture (a parallel Express instance), which could drift
 * from production wiring. This file imports the real production `app`
 * default export and asserts the route table matches the security contract.
 *
 * Coverage (AC-C01 ~ AC-C07):
 *  - AC-C01: `/api/health` is publicly reachable (no authMiddleware) and
 *            returns only `{ status: 'ok' }`.
 *  - AC-C02: `/api/auth/*` is reachable without a JWT (it issues tokens).
 *  - AC-C03: All `/api/providers|edit|detect|projects|jobs` routes reject
 *            requests without a JWT with 401 (authMiddleware enforced).
 *  - AC-C04: `/api/worker/*` rejects requests without CRON_SECRET with 401/403
 *            (worker uses CRON_SECRET, not user JWT).
 *  - AC-C05: Unknown `/api/*` paths return 404 (not 200, not 500).
 *  - AC-C06: The health response body never includes env/provider/key fields.
 *  - AC-C07: trust proxy is enabled on the production app (closes
 *            DEBT-HARDEN-001A-03 in conjunction with
 *            `trust.proxy.production.test.ts`).
 *
 * The test file does NOT modify production behavior. It only observes the
 * production app's wiring and HTTP responses. All fixtures use synthetic
 * secrets kept below the `check-lumen-collab.mjs` thresholds.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

// Import the real production app. Side effects on import: the module reads
// process.env and may start a worker executor. We control this via env vars
// set in beforeAll and revert them in afterAll.
// Note: importing dynamically so we can set env first.

const JWT_SECRET = 'harden-001c-wiring-jwt-secret-32!'; // 32 chars
const AUTH_PASSWORD = 'harden-001c-pw-12'; // 16 chars
const CRON_SECRET = 'harden-001c-cron-secret-32-chars!!'; // 32 chars
const PROVIDER_ENC_KEY = 'harden-001c-enc-key-32chars-test!!'; // 32 chars

// Env keys that index.ts / runtime.ts read. We snapshot and restore.
const ENV_KEYS_TO_CONTROL = [
  'VERCEL',
  'NODE_ENV',
  'JWT_SECRET',
  'AUTH_PASSWORD',
  'CRON_SECRET',
  'PROVIDER_ENCRYPTION_KEY',
  'SEEDREAM_API_KEY',
  'OPENAI_API_KEY',
  'VOLC_API_KEY',
  'GLM_API_KEY',
  'GEMINI_API_KEY',
  'DEFAULT_PROVIDER_ID',
  'CORS_ALLOWLIST',
  'MAX_UPLOAD_BYTES',
  'MAX_IMAGE_PIXELS',
  'LOGIN_WINDOW_MS',
  'PORT',
  'WORKER_LEASE_SECONDS',
] as const;

describe('HARDEN-001C production route wiring (DEBT-HARDEN-001A-02)', () => {
  let app: Express;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    // Force local mode so ProviderStore uses file-backed storage and we
    // don't require CloudBase PG connectivity. VERCEL unset also lets
    // index.ts skip the listen() call (it checks `if (!process.env.VERCEL)`).
    for (const key of ENV_KEYS_TO_CONTROL) {
      delete process.env[key];
    }
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.AUTH_PASSWORD = AUTH_PASSWORD;
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.PROVIDER_ENCRYPTION_KEY = PROVIDER_ENC_KEY;
    process.env.CORS_ALLOWLIST = 'http://localhost:5173';
    // Use a high port unlikely to collide with other test runs or dev
    // servers. index.ts calls `app.listen(PORT)` when `!process.env.VERCEL`;
    // we pick a non-VERCEL path so ProviderStore stays in local file-backed
    // mode (avoiding CloudBase PG connectivity requirements).
    process.env.PORT = '0'; // 0 = let the OS pick an ephemeral free port

    // Dynamic import so env vars are set before module evaluation.
    const mod = await import('../index.js');
    app = mod.default;
  });

  afterAll(() => {
    // Restore env.
    for (const key of ENV_KEYS_TO_CONTROL) {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe('AC-C01: /api/health is public and minimal', () => {
    it('returns 200 without any auth header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('does not include env/provider/key fields in the body', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.env).toBeUndefined();
      expect(res.body.providers).toBeUndefined();
      expect(res.body.hasJwtSecret).toBeUndefined();
      expect(res.body.hasSeedreamKey).toBeUndefined();
      expect(res.body.jwtSecret).toBeUndefined();
      expect(res.body.corsAllowlist).toBeUndefined();
    });
  });

  describe('AC-C02: /api/auth is reachable without JWT', () => {
    it('POST /api/auth/ returns 4xx (not 401 authMiddleware rejection)', async () => {
      // No JWT. authMiddleware is NOT mounted on /api/auth (the router
      // issues tokens, it doesn't verify them). A wrong-password login
      // returns 401 from the login handler itself, NOT from authMiddleware.
      // We assert the response is not a generic 401 from middleware by
      // checking the body shape: middleware 401 returns
      // `{ error: 'Unauthorized' }`, while the login handler returns
      // `{ error: 'Invalid credentials' }`.
      // Note: auth router mounts `router.post('/', ...)` so the path is
      // `/api/auth/` (with trailing slash) — `/api/auth/login` would 404.
      const res = await request(app)
        .post('/api/auth/')
        .send({ password: 'wrong-password' });
      expect([400, 401]).toContain(res.status);
      // Login-handler 401 has a specific body, not the middleware generic.
      expect(res.body.error).not.toBe('Unauthorized');
    });
  });

  describe('AC-C03: protected routes reject without JWT with 401', () => {
    const protectedRoutes: Array<{ method: 'get' | 'post' | 'delete'; path: string }> = [
      { method: 'get', path: '/api/providers' },
      { method: 'post', path: '/api/edit' },
      { method: 'post', path: '/api/detect/people' },
      { method: 'get', path: '/api/projects' },
      { method: 'get', path: '/api/jobs' },
    ];

    for (const route of protectedRoutes) {
      it(`${route.method.toUpperCase()} ${route.path} returns 401 without JWT`, async () => {
        const res = await (request(app) as any)[route.method](route.path);
        expect(res.status).toBe(401);
      });
    }
  });

  describe('AC-C04: /api/worker rejects without CRON_SECRET', () => {
    it('POST /api/worker/recover returns 401/403 without CRON_SECRET', async () => {
      const res = await request(app).post('/api/worker/recover');
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/worker/recover returns 401/403 without CRON_SECRET', async () => {
      const res = await request(app).get('/api/worker/recover');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('AC-C05: unknown /api paths return 404', () => {
    it('GET /api/nonexistent returns 404', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
    });

    it('POST /api/also-nonexistent returns 404', async () => {
      const res = await request(app).post('/api/also-nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('AC-C07: production app enables trust proxy', () => {
    // Closes DEBT-HARDEN-001A-03 (Vercel trust proxy / req.ip assumptions).
    it('app.settings has trust proxy enabled', () => {
      // Express stores the setting; `app.get('trust proxy')` returns
      // the configured value (a number, boolean, or function).
      const trustProxySetting = (app as any).get('trust proxy');
      // A value of `false` means "not set"; any other value (true, 1,
      // number, function) means trust proxy is enabled.
      expect(trustProxySetting).not.toBe(false);
      expect(trustProxySetting).toBeTruthy();
    });
  });
});
