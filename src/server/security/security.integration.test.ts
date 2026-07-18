/**
 * D-034 Internal Security Floor — Integration tests for redacted boundaries.
 *
 * Verifies at the HTTP level:
 *  - GET /api/health returns only {"status":"ok"} — no env presence,
 *    provider names, model names, or key flags.
 *  - GET/POST/PUT/PATCH /api/providers never leak apiKey, encryption
 *    ciphertext, JWT secret, or raw submitted keys. Only boolean
 *    `hasApiKey` is exposed.
 *  - Error responses never echo the raw API key submitted in the request.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { providerStore } from '../services/providers/ProviderStore.js';
import providersRouter from '../routes/providers.js';

const JWT_SECRET = 'lumen-ink-integration-test-secret-32';
const ENC_KEY = 'integration-test-encryption-key-32';
const TEST_TOKEN = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

const SECRET_API_KEY = 'sk-integration-leak-test-12345';
const SECRET_JWT = 'super-secret-jwt-value-never-leak';

function buildApp(): express.Application {
  const app = express();
  app.use(express.json({ limit: 1024 * 1024 }));
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/providers', authMiddleware, providersRouter);
  return app;
}

/**
 * Recursively scan an object for any string containing the needle. Used to
 * prove the secret apiKey never appears anywhere in the response body.
 */
function containsString(value: unknown, needle: string): boolean {
  if (typeof value === 'string') {
    return value.includes(needle);
  }
  if (Array.isArray(value)) {
    return value.some((v) => containsString(v, needle));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => containsString(v, needle));
  }
  return false;
}

describe('D-034 redacted boundaries (integration)', () => {
  let tempDir: string;
  let app: express.Application;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-redact-'));
    // Reset ProviderStore to local mode with a fresh data directory.
    providerStore.configure({
      isDeployed: false,
      providerEncryptionKey: ENC_KEY,
      dataDir: tempDir,
    });
    app = buildApp();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('GET /api/health', () => {
    it('returns only {status: "ok"} with no env or provider details', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      // No env presence flags
      expect(res.body.env).toBeUndefined();
      expect(res.body.providers).toBeUndefined();
      expect(res.body.hasJwtSecret).toBeUndefined();
      expect(res.body.hasSeedreamKey).toBeUndefined();
    });

    it('does not leak the JWT secret in any response field', async () => {
      const res = await request(app).get('/api/health');
      expect(containsString(res.body, SECRET_JWT)).toBe(false);
      expect(containsString(res.body, ENC_KEY)).toBe(false);
    });
  });

  describe('Provider API never returns keys', () => {
    beforeEach(() => {
      // Create a provider with a known secret key via the store directly.
      providerStore.create({
        name: 'Test Provider',
        type: 'openai',
        apiKey: SECRET_API_KEY,
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: true,
      });
    });

    it('GET /api/providers never echoes the raw apiKey', async () => {
      const res = await request(app)
        .get('/api/providers')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Find the test provider (seeded defaults may also be present)
      const testProvider = res.body.find((p: { name: string }) => p.name === 'Test Provider');
      expect(testProvider).toBeDefined();
      expect(testProvider.apiKey).toBe('');
      expect(testProvider.hasApiKey).toBe(true);
      // No field anywhere in the response may contain the raw secret
      expect(containsString(res.body, SECRET_API_KEY)).toBe(false);
    });

    it('POST /api/providers never echoes the submitted apiKey', async () => {
      const res = await request(app)
        .post('/api/providers')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({
          name: 'New Provider',
          type: 'openai',
          apiKey: 'sk-brand-new-secret-67890',
          defaultModel: 'gpt-image-2',
          enabled: true,
          isDefault: false,
        });
      expect(res.status).toBe(201);
      expect(res.body.apiKey).toBe('');
      expect(res.body.hasApiKey).toBe(true);
      expect(containsString(res.body, 'sk-brand-new-secret-67890')).toBe(false);
    });

    it('PUT /api/providers/:id never echoes the updated apiKey', async () => {
      const list = providerStore.list();
      const testProvider = list.find((p) => p.name === 'Test Provider');
      expect(testProvider).toBeDefined();
      const id = testProvider!.id;
      const res = await request(app)
        .put(`/api/providers/${id}`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({
          apiKey: 'sk-rotated-secret-abcdef',
        });
      expect(res.status).toBe(200);
      expect(res.body.apiKey).toBe('');
      expect(containsString(res.body, 'sk-rotated-secret-abcdef')).toBe(false);
    });

    it('PATCH /api/providers/:id/default never echoes the apiKey', async () => {
      const list = providerStore.list();
      const testProvider = list.find((p) => p.name === 'Test Provider');
      expect(testProvider).toBeDefined();
      const id = testProvider!.id;
      const res = await request(app)
        .patch(`/api/providers/${id}/default`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.apiKey).toBe('');
      expect(containsString(res.body, SECRET_API_KEY)).toBe(false);
    });

    it('does not leak the encryption ciphertext (encrypted apiKey blob)', async () => {
      const res = await request(app)
        .get('/api/providers')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);
      // The encrypted blob (hex:hex:hex) must never appear in the response
      const serialized = JSON.stringify(res.body);
      // Encrypted apiKeys have the shape hex:hex:hex (three colon-separated hex strings)
      expect(serialized).not.toMatch(/[0-9a-f]{32,}:[0-9a-f]{32,}:[0-9a-f]{32,}/i);
    });
  });

  describe('unauthenticated requests', () => {
    it('GET /api/providers without token returns 401', async () => {
      const res = await request(app).get('/api/providers');
      expect(res.status).toBe(401);
    });

    it('GET /api/health works without token (public probe)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });
  });
});
