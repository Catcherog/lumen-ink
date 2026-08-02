import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ephemeral-demo server bootstrap', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('boots without selecting CloudBase or creating auth/persistence services', async () => {
    process.env.VERCEL = '1';
    process.env.LUMEN_RUNTIME_MODE = 'ephemeral-demo';
    process.env.PERSISTENCE_BACKEND = 'disabled';
    process.env.AUTH_MODE = 'disabled';
    process.env.CORS_ALLOWLIST = 'https://lumen-ink.vercel.app';

    const { default: app } = await import('./index.js');

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      status: 'ok',
      runtimeMode: 'ephemeral-demo',
      persistence: 'disabled',
      auth: 'disabled',
    });

    const runtime = await request(app).get('/api/runtime');
    expect(runtime.status).toBe(200);
    expect(runtime.body.features).toEqual({
      authentication: false,
      persistence: false,
      cloudHistory: false,
      manualDownload: true,
    });

    const rejectedOrigin = await request(app)
      .get('/api/health')
      .set('Origin', 'https://not-allowed.example.com');
    expect(rejectedOrigin.status).toBe(403);
    expect(rejectedOrigin.body).toMatchObject({
      success: false,
      errorCode: 'CORS_ORIGIN_NOT_ALLOWED',
    });

    const allowedOrigin = await request(app)
      .get('/api/health')
      .set('Origin', 'https://lumen-ink.vercel.app');
    expect(allowedOrigin.status).toBe(200);
    expect(allowedOrigin.headers['access-control-allow-origin']).toBe('https://lumen-ink.vercel.app');

    const auth = await request(app).post('/api/auth').send({ password: 'ignored' });
    expect(auth.status).toBe(409);
    expect(auth.body.errorCode).toBe('AUTH_DISABLED_IN_EPHEMERAL_MODE');

    const providers = await request(app).get('/api/providers');
    expect(providers.status).toBe(409);
    expect(providers.body.errorCode).toBe('PERSISTENCE_DISABLED');
  });
});
