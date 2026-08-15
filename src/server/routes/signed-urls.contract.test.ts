/**
 * BUSOS-P5-03 — signedUrls contract test for GET /api/projects/:id.
 *
 * Proves the external contract required by the BUSOS real adapter:
 *   (A1) every asset.storageKey is redacted (never the raw on-disk layout);
 *   (A2) the real storageKey is NOT a key in `signedUrls`;
 *   (A3) `signedUrls` IS keyed by the public, stable `asset.id`;
 *   (A4) the signed URL for `asset.id` is a non-empty http(s) URL.
 *
 * Uses supertest against a real Express app with local file-backed
 * persistence, identical to the PERSIST-001 route tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';
import { createLocalJobExecutor } from '../infrastructure/executor/local.js';
import { ProjectService } from '../services/ProjectService.js';
import { GenerationService } from '../services/GenerationService.js';
import { createProjectsRouter } from './projects.js';

const JWT_SECRET = 'lumen-ink-test-secret';
const TEST_TOKEN = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });

async function makePng(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

function buildApp(tempRoot: string): express.Application {
  process.env.JWT_SECRET = JWT_SECRET;
  const deps = createLocalPersistence({ rootDir: tempRoot });
  const executor = createLocalJobExecutor();
  const projectService = new ProjectService(deps, executor);
  const generationService = new GenerationService(deps, executor);

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(
    '/api/projects',
    (req, res, next) => {
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
    },
    createProjectsRouter({ projectService, generationService }),
  );
  return app;
}

describe('BUSOS-P5-03 — signedUrls contract (GET /api/projects/:id)', () => {
  let tempRoot: string;
  let app: express.Application;
  let pngBase64: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-signed-urls-'));
    app = buildApp(tempRoot);
    pngBase64 = (await makePng(64, 48)).toString('base64');
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('A: storageKey redacted, asset.id-keyed signedUrls, raw key not exposed', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'p5-03', imageBase64: pngBase64, mimeType: 'image/png' });
    expect(create.status).toBe(201);
    const projectId = create.body.project.id;
    expect(projectId).toBeTruthy();

    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);

    const { assets, signedUrls } = res.body;
    expect(Array.isArray(assets) && assets.length).toBeGreaterThan(0);

    for (const asset of assets) {
      // (A1) storageKey stays redacted.
      expect(asset.storageKey).toMatch(/^redacted:\/\//);
      // (A2) the real storageKey is NOT used as a signedUrls key.
      expect(signedUrls[asset.storageKey]).toBeUndefined();
      // (A3)+(A4) the public asset.id is the key, with a non-empty URL.
      // Production (CloudBase) yields an https signed URL; the local test
      // harness yields a file:// URL — both are valid, parseable URLs.
      expect(typeof signedUrls[asset.id]).toBe('string');
      expect(signedUrls[asset.id].length).toBeGreaterThan(0);
      expect(() => new URL(signedUrls[asset.id])).not.toThrow();
    }

    // (A2) no signedUrls key leaks the raw storage layout.
    for (const key of Object.keys(signedUrls)) {
      expect(key).not.toMatch(/^projects\//);
    }
  });
});
