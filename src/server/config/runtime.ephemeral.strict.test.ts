import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime.js';

const BASE_EPHEMERAL_ENV: Record<string, string | undefined> = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  LUMEN_RUNTIME_MODE: 'ephemeral-demo',
  PERSISTENCE_BACKEND: 'disabled',
  AUTH_MODE: 'disabled',
  CORS_ALLOWLIST: 'https://preview.example.com',
};

describe('ephemeral-demo runtime contract', () => {
  it('accepts only the complete explicit three-switch configuration', () => {
    expect(loadRuntimeConfig(BASE_EPHEMERAL_ENV)).toMatchObject({
      runtimeMode: 'ephemeral-demo',
      persistence: 'disabled',
      authMode: 'disabled',
      isDeployed: true,
    });
  });

  it('fails closed when PERSISTENCE_BACKEND is missing', () => {
    const env = { ...BASE_EPHEMERAL_ENV };
    delete env.PERSISTENCE_BACKEND;

    expect(() => loadRuntimeConfig(env)).toThrow(
      'EPHEMERAL_PERSISTENCE_BACKEND_REQUIRED',
    );
  });

  it('fails closed when AUTH_MODE is missing', () => {
    const env = { ...BASE_EPHEMERAL_ENV };
    delete env.AUTH_MODE;

    expect(() => loadRuntimeConfig(env)).toThrow('EPHEMERAL_AUTH_MODE_REQUIRED');
  });

  it.each([
    ['PERSISTENCE_BACKEND', ''],
    ['PERSISTENCE_BACKEND', 'cloudbase-nosql'],
    ['AUTH_MODE', ''],
    ['AUTH_MODE', 'password'],
  ] as const)('fails closed for %s=%j', (key, value) => {
    expect(() => loadRuntimeConfig({ ...BASE_EPHEMERAL_ENV, [key]: value })).toThrow(
      key === 'PERSISTENCE_BACKEND'
        ? value === ''
          ? 'EPHEMERAL_PERSISTENCE_BACKEND_REQUIRED'
          : 'EPHEMERAL_PERSISTENCE_MUST_BE_DISABLED'
        : value === ''
          ? 'EPHEMERAL_AUTH_MODE_REQUIRED'
          : 'EPHEMERAL_AUTH_MUST_BE_DISABLED',
    );
  });
});
