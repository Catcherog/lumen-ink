import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createCorsErrorHandler,
  createCorsMiddleware,
  isAllowedOrigin,
  type CorsEnvironment,
} from './cors.js';

const CURRENT_PREVIEW = 'https://lumen-mgfwfr51g-catcher1.vercel.app';
const BRANCH_PREVIEW = 'https://lumen-web-ux-p0-r2-trae-catcher1.vercel.app';

const PREVIEW_ENV: CorsEnvironment = {
  CORS_ALLOWLIST: 'https://configured.example.com',
  VERCEL_URL: 'lumen-mgfwfr51g-catcher1.vercel.app',
  VERCEL_BRANCH_URL: 'lumen-web-ux-p0-r2-trae-catcher1.vercel.app',
};

function buildCorsApp(env: CorsEnvironment) {
  const app = express();
  app.use(createCorsMiddleware(env));
  app.post('/api/auth', (_req, res) => {
    res.json({ success: false, error: 'AUTH_TEST_RESPONSE' });
  });
  app.use(createCorsErrorHandler());
  return app;
}

describe('CORS origin policy', () => {
  it('allows the production origin even when it is not repeated in CORS_ALLOWLIST', () => {
    expect(isAllowedOrigin('https://lumen-ink.vercel.app', PREVIEW_ENV)).toBe(true);
  });

  it('allows the exact VERCEL_URL deployment origin', () => {
    expect(isAllowedOrigin(CURRENT_PREVIEW, PREVIEW_ENV)).toBe(true);
  });

  it('allows the exact VERCEL_BRANCH_URL origin', () => {
    expect(isAllowedOrigin(BRANCH_PREVIEW, PREVIEW_ENV)).toBe(true);
  });

  it('allows an explicitly configured origin and preserves local development ports', () => {
    expect(isAllowedOrigin('https://configured.example.com', PREVIEW_ENV)).toBe(true);
    expect(
      isAllowedOrigin('http://localhost:5173', {
        ...PREVIEW_ENV,
        CORS_ALLOWLIST: 'http://localhost:5173',
      })
    ).toBe(true);
  });

  it('rejects malicious lookalike origins', () => {
    for (const origin of [
      'https://lumen-ink.vercel.app.attacker.com',
      'https://attacker-lumen-ink.vercel.app',
      'https://lumen-mgfwfr51g-catcher1.vercel.app.attacker.com',
      'https://lumen-mgfwfr51g-catcher1.vercel.app@attacker.com',
      'https://lumen-mgfwfr51g-catcher1.vercel.app.',
      'https://lumen-mgfwfr51g-catcher1.vercel.app:443',
      'https://lumen-mgfwfr51g-catcher1.vercel.app:0443',
      'https://lumen-mgfwfr51g-catcher1.vercel.app/path',
      'http://lumen-mgfwfr51g-catcher1.vercel.app',
    ]) {
      expect(isAllowedOrigin(origin, PREVIEW_ENV), origin).toBe(false);
    }
  });

  it('does not allow an unrelated vercel.app deployment', () => {
    expect(isAllowedOrigin('https://other-project.vercel.app', PREVIEW_ENV)).toBe(false);
  });

  it('allows requests without an Origin header', () => {
    expect(isAllowedOrigin(undefined, PREVIEW_ENV)).toBe(true);
  });
});

describe('CORS middleware at /api/auth', () => {
  it('returns CORS headers for an allowed Preview preflight', async () => {
    const res = await request(buildCorsApp(PREVIEW_ENV))
      .options('/api/auth')
      .set('Origin', CURRENT_PREVIEW)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(CURRENT_PREVIEW);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('content-type');
  });

  it('serves /api/auth for an allowed Preview without a CORS error', async () => {
    const res = await request(buildCorsApp(PREVIEW_ENV))
      .post('/api/auth')
      .set('Origin', CURRENT_PREVIEW)
      .send({ password: 'wrong' });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(CURRENT_PREVIEW);
    expect(res.body).toEqual({ success: false, error: 'AUTH_TEST_RESPONSE' });
  });

  it('returns structured 403 JSON for a rejected Origin instead of HTML 500', async () => {
    const res = await request(buildCorsApp(PREVIEW_ENV))
      .post('/api/auth')
      .set('Origin', 'https://other-project.vercel.app')
      .send({ password: 'wrong' });

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ error: 'CORS_ORIGIN_NOT_ALLOWED' });
    expect(res.text).not.toContain('<html');
  });

  it('keeps a request without Origin usable', async () => {
    const res = await request(buildCorsApp(PREVIEW_ENV))
      .post('/api/auth')
      .send({ password: 'wrong' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: 'AUTH_TEST_RESPONSE' });
  });
});
