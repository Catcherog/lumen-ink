import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRuntimeConfig } from './runtime.js';

const VALID_DEPLOYED_ENV = {
  VERCEL: '1',
  AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
  JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
  PROVIDER_ENCRYPTION_KEY: 'this-is-a-32-char-encryption-key!',
  CORS_ALLOWLIST: 'https://lumen-ink.vercel.app,https://example.com',
  SEEDREAM_API_KEY: 'sk-test-seedream-key',
};

describe('loadRuntimeConfig (D-034 internal security floor)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all relevant env vars so each test starts clean
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

  describe('deployed mode (VERCEL=1 or NODE_ENV=production)', () => {
    it('loads explicit ephemeral-demo mode without persistent secrets or CloudBase config', () => {
      const cfg = loadRuntimeConfig({
        VERCEL: '1',
        VERCEL_ENV: 'production',
        LUMEN_RUNTIME_MODE: 'ephemeral-demo',
        PERSISTENCE_BACKEND: 'disabled',
        AUTH_MODE: 'disabled',
        CORS_ALLOWLIST: 'https://lumen-ink.vercel.app',
      });

      expect(cfg).toMatchObject({
        runtimeMode: 'ephemeral-demo',
        persistence: 'disabled',
        authMode: 'disabled',
        isDeployed: true,
      });
    });

    it('rejects a persistent backend in explicit ephemeral-demo mode', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          LUMEN_RUNTIME_MODE: 'ephemeral-demo',
          PERSISTENCE_BACKEND: 'cloudbase-nosql',
          AUTH_MODE: 'disabled',
          CORS_ALLOWLIST: 'https://lumen-ink.vercel.app',
        })
      ).toThrow('EPHEMERAL_PERSISTENCE_MUST_BE_DISABLED');
    });

    it('rejects password auth in explicit ephemeral-demo mode', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          LUMEN_RUNTIME_MODE: 'ephemeral-demo',
          PERSISTENCE_BACKEND: 'disabled',
          AUTH_MODE: 'password',
          CORS_ALLOWLIST: 'https://lumen-ink.vercel.app',
        })
      ).toThrow('EPHEMERAL_AUTH_MUST_BE_DISABLED');
    });

    it('rejects absent AUTH_PASSWORD', () => {
      expect(() => loadRuntimeConfig({ VERCEL: '1' })).toThrow('AUTH_PASSWORD_REQUIRED');
    });

    it('rejects AUTH_PASSWORD shorter than 12 characters', () => {
      expect(() =>
        loadRuntimeConfig({ VERCEL: '1', AUTH_PASSWORD: 'short' })
      ).toThrow('AUTH_PASSWORD_TOO_SHORT');
    });

    it('rejects absent JWT_SECRET', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
        })
      ).toThrow('JWT_SECRET_REQUIRED');
    });

    it('rejects JWT_SECRET shorter than 32 characters', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
          JWT_SECRET: 'too-short',
        })
      ).toThrow('JWT_SECRET_TOO_SHORT');
    });

    it('rejects absent PROVIDER_ENCRYPTION_KEY', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
        })
      ).toThrow('PROVIDER_ENCRYPTION_KEY_REQUIRED');
    });

    it('rejects PROVIDER_ENCRYPTION_KEY shorter than 32 characters', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
          PROVIDER_ENCRYPTION_KEY: 'too-short',
        })
      ).toThrow('PROVIDER_ENCRYPTION_KEY_TOO_SHORT');
    });

    it('rejects empty CORS_ALLOWLIST', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
          PROVIDER_ENCRYPTION_KEY: 'this-is-a-32-char-encryption-key!',
        })
      ).toThrow('CORS_ALLOWLIST_REQUIRED');
    });

    it('rejects when no Provider has a non-empty API key', () => {
      expect(() =>
        loadRuntimeConfig({
          VERCEL: '1',
          AUTH_PASSWORD: 'this-is-a-strong-password-12chars',
          JWT_SECRET: 'this-is-a-32-char-jwt-secret-key!!',
          PROVIDER_ENCRYPTION_KEY: 'this-is-a-32-char-encryption-key!',
          CORS_ALLOWLIST: 'https://example.com',
        })
      ).toThrow('DEFAULT_PROVIDER_CREDENTIAL_REQUIRED');
    });

    it('accepts explicit valid values with at least one Provider key', () => {
      const cfg = loadRuntimeConfig(VALID_DEPLOYED_ENV);
      expect(cfg.authPassword).toBe('this-is-a-strong-password-12chars');
      expect(cfg.jwtSecret).toBe('this-is-a-32-char-jwt-secret-key!!');
      expect(cfg.providerEncryptionKey).toBe('this-is-a-32-char-encryption-key!');
      expect(cfg.corsAllowlist).toEqual([
        'https://lumen-ink.vercel.app',
        'https://example.com',
      ]);
      expect(cfg.maxUploadBytes).toBe(20971520);
      expect(cfg.maxImagePixels).toBe(40000000);
      expect(cfg.loginWindowMs).toBe(900000);
      expect(cfg.isDeployed).toBe(true);
      expect(cfg.providerEnvManaged).toBe(true);
      expect(cfg.runtimeMode).toBe('persistent');
      expect(cfg.persistence).toBe('enabled');
      expect(cfg.authMode).toBe('password');
    });

    it('accepts NODE_ENV=production as deployed mode', () => {
      const cfg = loadRuntimeConfig({
        NODE_ENV: 'production',
        ...VALID_DEPLOYED_ENV,
        VERCEL: undefined,
      });
      expect(cfg.isDeployed).toBe(true);
    });
  });

  describe('local/test mode', () => {
    it('accepts injected test values without reading real secrets', () => {
      const cfg = loadRuntimeConfig({
        AUTH_PASSWORD: 'test-password',
        JWT_SECRET: 'test-jwt-secret',
        PROVIDER_ENCRYPTION_KEY: 'test-encryption-key',
        CORS_ALLOWLIST: 'http://localhost:5173',
        SEEDREAM_API_KEY: 'sk-test',
      });
      expect(cfg.authPassword).toBe('test-password');
      expect(cfg.jwtSecret).toBe('test-jwt-secret');
      expect(cfg.providerEncryptionKey).toBe('test-encryption-key');
      expect(cfg.corsAllowlist).toEqual(['http://localhost:5173']);
      expect(cfg.isDeployed).toBe(false);
      expect(cfg.providerEnvManaged).toBe(false);
    });

    it('uses safe local defaults when no env is set', () => {
      const cfg = loadRuntimeConfig({});
      expect(cfg.authPassword).toBe('changeme');
      expect(cfg.jwtSecret).toBe('lumen-ink-local-dev-secret-32chars!!');
      expect(cfg.providerEncryptionKey).toBe('lumen-ink-local-dev-enc-key-32chars');
      expect(cfg.corsAllowlist).toEqual(['http://localhost:5173', 'http://localhost:3001']);
      expect(cfg.isDeployed).toBe(false);
    });
  });

  describe('CORS allowlist parsing', () => {
    it('trims whitespace around origins', () => {
      const cfg = loadRuntimeConfig({
        CORS_ALLOWLIST: ' https://a.com , https://b.com ',
      });
      expect(cfg.corsAllowlist).toEqual(['https://a.com', 'https://b.com']);
    });

    it('deduplicates identical origins', () => {
      const cfg = loadRuntimeConfig({
        CORS_ALLOWLIST: 'https://a.com,https://a.com',
      });
      expect(cfg.corsAllowlist).toEqual(['https://a.com']);
    });
  });
});
