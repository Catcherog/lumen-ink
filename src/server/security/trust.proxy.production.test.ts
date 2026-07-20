/**
 * HARDEN-001C — Production trust proxy assertion (DEBT-HARDEN-001A-03).
 *
 * Closes DEBT-HARDEN-001A-03: production `src/server/index.ts` did NOT call
 * `app.set('trust proxy', 1)`. On Vercel, `req.ip` therefore fell back to
 * the reverse-proxy IP instead of the real client IP from
 * `X-Forwarded-For`, which means all login-failure throttle buckets
 * collapsed to a single key and the throttle was effectively disabled.
 *
 * HARDEN-001A's `auth.boundary.test.ts` AC-A09 already proved the throttle
 * logic is correct WHEN trust proxy is set. This file asserts the
 * production wiring actually sets it.
 *
 * AC-C08: index.ts production app sets `trust proxy` so req.ip honors
 *         X-Forwarded-For in deployed mode.
 * AC-C09: setting is enabled regardless of isDeployed (so local tests
 *         behind a proxy still get correct behavior — and production
 *         never accidentally regresses).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';

const JWT_SECRET = 'harden-001c-tp-jwt-secret-32!!'; // 32 chars
const AUTH_PASSWORD = 'harden-001c-tp-pw-12'; // 16 chars
const PROVIDER_ENC_KEY = 'harden-001c-tp-enc-key-32chars!!!'; // 32 chars

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
  'PORT',
] as const;

async function importProductionApp(): Promise<Express> {
  for (const key of ENV_KEYS_TO_CONTROL) {
    delete process.env[key];
  }
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_PASSWORD = AUTH_PASSWORD;
  process.env.PROVIDER_ENCRYPTION_KEY = PROVIDER_ENC_KEY;
  process.env.CORS_ALLOWLIST = 'http://localhost:5173';
  // Use port 0 so the OS assigns a free ephemeral port (avoids EADDRINUSE
  // when multiple test files import index.ts concurrently).
  process.env.PORT = '0';
  const mod = await import('../index.js');
  return mod.default;
}

describe('HARDEN-001C production trust proxy (DEBT-HARDEN-001A-03)', () => {
  let app: Express;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    app = await importProductionApp();
  });

  afterAll(() => {
    for (const key of ENV_KEYS_TO_CONTROL) {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe('AC-C08: production app sets trust proxy', () => {
    it('app.get("trust proxy") returns a truthy value (not false)', () => {
      const setting = (app as any).get('trust proxy');
      expect(setting).not.toBe(false);
      expect(setting).toBeTruthy();
    });

    it('app.settings.trust proxy is not the Express default (false)', () => {
      // Express stores the setting under app.settings.
      const settings = (app as any).settings;
      expect(settings).toBeDefined();
      expect(settings['trust proxy']).not.toBe(false);
      expect(settings['trust proxy']).toBeTruthy();
    });
  });

  describe('AC-C09: trust proxy setting is stable', () => {
    it('the setting is a number (hop count) or boolean true, not undefined', () => {
      // `app.set('trust proxy', 1)` stores the number 1.
      // `app.set('trust proxy', true)` stores true.
      // Either is acceptable. undefined / false means "not set".
      const setting = (app as any).get('trust proxy');
      const isValid =
        typeof setting === 'number' ||
        typeof setting === 'boolean' ||
        typeof setting === 'function';
      expect(isValid).toBe(true);
      if (typeof setting === 'boolean') {
        expect(setting).toBe(true);
      }
      if (typeof setting === 'number') {
        expect(setting).toBeGreaterThan(0);
      }
    });
  });
});
