import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRuntimeRouter } from './runtime.js';

describe('GET /api/runtime public contract', () => {
  it('returns only the redacted runtime feature descriptor', async () => {
    const app = express();
    app.use('/api/runtime', createRuntimeRouter({
      runtimeMode: 'ephemeral-demo',
      persistence: 'disabled',
      authMode: 'disabled',
      isDeployed: true,
      providerEnvManaged: false,
      authPassword: 'never-return-this',
      jwtSecret: 'never-return-this',
      providerEncryptionKey: 'never-return-this',
      corsAllowlist: ['https://lumen-ink.vercel.app'],
      maxUploadBytes: 20 * 1024 * 1024,
      maxImagePixels: 40_000_000,
      loginWindowMs: 15 * 60 * 1000,
    }));

    const response = await request(app).get('/api/runtime');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      runtimeMode: 'ephemeral-demo',
      persistence: 'disabled',
      auth: 'disabled',
      features: {
        authentication: false,
        persistence: false,
        cloudHistory: false,
        manualDownload: true,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('never-return-this');
    expect(JSON.stringify(response.body)).not.toContain('CORS_ALLOWLIST');
  });
});
