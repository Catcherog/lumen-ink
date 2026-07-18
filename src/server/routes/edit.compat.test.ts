/**
 * PERSIST-001 Task 7 — /api/edit controlled compatibility layer.
 *
 * Asserts:
 *  - Legacy request (no projectId) preserves the existing synchronous
 *    EditResponse shape { success, imageData, mimeType, meta }.
 *  - V2 request (with projectId + inputVersionId) delegates to
 *    GenerationService.createJob and returns
 *    { success, jobId, status, deprecatedSyncRoute: true } with a
 *    `Deprecation: true` response header.
 *  - Mixed input (projectId + image/mimeType/referenceImages/history/regions)
 *    is rejected with 400.
 *  - Missing prompt / missing Idempotency-Key on V2 path is rejected with 400.
 *  - Unknown projectId on V2 path is rejected with 404 (DomainError).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import sharp from 'sharp';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';
import { createLocalJobExecutor } from '../infrastructure/executor/local.js';
import { ProjectService } from '../services/ProjectService.js';
import { GenerationService } from '../services/GenerationService.js';

// Mock ProviderFactory so the legacy path is deterministic and does not
// touch the real ProviderStore / disk.
vi.mock('../services/providers/ProviderFactory.js', () => ({
  getProvider: vi.fn(),
  getProviderOperationType: vi.fn(),
}));

// Import the mocked module so we can configure return values per-test.
import { getProvider, getProviderOperationType } from '../services/providers/ProviderFactory.js';
import type { ImageProvider } from '../services/providers/ImageProvider.js';
import { createEditRouter } from './edit.js';

const JWT_SECRET = 'lumen-ink-test-secret';
const TEST_TOKEN = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '1h' });

/**
 * Inline auth middleware that reads JWT_SECRET from the test scope, not the
 * module-captured env. The production `authMiddleware` captures the env at
 * module load time, which makes it unsuitable for tests that want to rotate
 * the secret per-suite. This matches the pattern used in projects.test.ts.
 */
function testAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
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

async function makePng(width = 32, height = 24): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function makeMockProvider(): ImageProvider {
  return {
    config: {
      id: 'prov-test',
      name: 'Test Provider',
      type: 'seedream',
      apiKey: 'k',
      defaultModel: 'doubao-seedream-4-5-251128',
      enabled: true,
      isDefault: true,
      hasApiKey: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    generate: vi.fn(async () => ({
      imageData: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
    })),
    edit: vi.fn(async () => ({
      imageData: 'data:image/png;base64,BBBB',
      mimeType: 'image/png',
    })),
    chat: vi.fn(async () => ({
      text: 'mock chat response',
    })),
  } as unknown as ImageProvider;
}

function buildApp(tempRoot: string, generationService: GenerationService): express.Application {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/edit', testAuth, createEditRouter(generationService));
  return app;
}

describe('routes/edit compatibility layer', () => {
  let tempRoot: string;
  let generationService: GenerationService;
  let projectService: ProjectService;
  let app: express.Application;
  let projectId: string;
  let inputVersionId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-edit-compat-'));
    const deps = createLocalPersistence({ rootDir: tempRoot });
    const executor = createLocalJobExecutor();
    projectService = new ProjectService(deps, executor);
    generationService = new GenerationService(deps, executor);
    app = buildApp(tempRoot, generationService);

    // Seed a Project with V0 so the V2 compat path has a real projectId.
    const bytes = await makePng(32, 24);
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'compat-demo',
      bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
    inputVersionId = snapshot.versions[0].id;

    // Default: getProvider returns a mock for legacy tests. V2 tests don't
    // touch the Provider, but having a default keeps the mock clean.
    vi.mocked(getProvider).mockReturnValue(makeMockProvider());
    vi.mocked(getProviderOperationType).mockReturnValue('generate');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  // --- Legacy path -------------------------------------------------------

  it('legacy request without projectId preserves synchronous EditResponse', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ prompt: 'brighten the face' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      imageData: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
    });
    expect(res.body.meta).toMatchObject({
      providerName: 'Test Provider',
      providerType: 'seedream',
      model: 'doubao-seedream-4-5-251128',
      operationType: 'generate',
    });
    // No deprecation header on the legacy path.
    expect(res.headers['deprecation']).toBeUndefined();
  });

  it('legacy request without prompt returns 400', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ image: 'data:image/png;base64,AAAA' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining('prompt'),
    });
  });

  it('legacy request when no Provider is configured returns 400', async () => {
    vi.mocked(getProvider).mockReturnValue(null);

    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ prompt: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Provider');
  });

  // --- V2 compatibility path ---------------------------------------------

  it('V2 request with projectId + Idempotency-Key returns 202 with jobId and Deprecation header', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-001')
      .send({
        projectId,
        inputVersionId,
        prompt: 'remove blemishes',
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      success: true,
      status: 'queued',
      deprecatedSyncRoute: true,
    });
    expect(res.body.jobId).toBeTruthy();
    // Deprecation header must be present on the V2 path.
    expect(res.headers['deprecation']).toBe('true');
    // Link header points to the replacement endpoint.
    expect(res.headers['link']).toContain(`/api/projects/${projectId}/jobs`);
  });

  it('V2 request without Idempotency-Key returns 400', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ projectId, prompt: 'no key' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Idempotency-Key');
  });

  it('V2 request without prompt returns 400', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-002')
      .send({ projectId, inputVersionId });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('prompt');
  });

  it('V2 request with mixed input (projectId + image) returns 400', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-003')
      .send({
        projectId,
        prompt: 'mixed',
        image: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // Error message must point the caller to the V2 endpoint.
    expect(res.body.error).toContain('/api/projects/');
  });

  it('V2 request with unknown projectId returns 404', async () => {
    const res = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-004')
      .send({ projectId: 'proj_does_not_exist', prompt: 'noop' });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('PROJECT_NOT_FOUND');
  });

  it('V2 duplicate Idempotency-Key returns the original jobId', async () => {
    const first = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-dup')
      .send({ projectId, inputVersionId, prompt: 'first' });
    expect(first.status).toBe(202);

    const second = await request(app)
      .post('/api/edit')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'compat-v2-dup')
      .send({ projectId, inputVersionId, prompt: 'second' });

    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId);
  });
});
