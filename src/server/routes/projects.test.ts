/**
 * PERSIST-001 Task 6 — Project API route tests.
 *
 * Uses supertest against a real Express app with `authMiddleware`
 * bypassed by signing a test JWT. The persistence layer is the local
 * file-backed adapter rooted in a tmp directory so tests run hermetically.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    create: {
      width,
      height,
      channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
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
  app.use('/api/projects', (req, res, next) => {
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
  }, createProjectsRouter({ projectService, generationService }));

  return app;
}

describe('PERSIST-001 Task 6 — Project API routes', () => {
  let tempRoot: string;
  let app: express.Application;
  let pngBase64: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-routes-proj-'));
    app = buildApp(tempRoot);
    const png = await makePng(64, 48);
    pngBase64 = png.toString('base64');
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/projects/proj_test');
    expect(res.status).toBe(401);
  });

  it('POST /api/projects creates a Project with V0 and returns 201', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.project.name).toBe('demo');
    expect(res.body.project.activeVersionId).toBe(res.body.versions[0].id);
    expect(res.body.versions[0].label).toBe('v0');
    expect(res.body.assets).toHaveLength(1);
    // Storage keys must be redacted.
    expect(res.body.assets[0].storageKey).toMatch(/^redacted:\/\//);
    // Signed URL must be present in the snapshot.
    expect(Object.keys(res.body.signedUrls).length).toBeGreaterThan(0);
  });

  it('POST /api/projects rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('UPLOAD_INVALID');
  });

  it('GET /api/projects/:id returns the Project snapshot', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });
    const id = create.body.project.id;

    const res = await request(app)
      .get(`/api/projects/${id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(id);
    expect(res.body.versions).toHaveLength(1);
  });

  it('GET /api/projects/:id on a missing Project returns 404 with errorCode', async () => {
    const res = await request(app)
      .get('/api/projects/proj_missing')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('PROJECT_NOT_FOUND');
    expect(res.body.diagnosticId).toBeTruthy();
  });

  it('DELETE /api/projects/:id cascade deletes and returns { deleted: true }', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });
    const id = create.body.project.id;

    const res = await request(app)
      .delete(`/api/projects/${id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Subsequent GET returns 404.
    const after = await request(app)
      .get(`/api/projects/${id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(after.status).toBe(404);
  });

  it('POST .../versions/:vid/activate updates the active pointer', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });
    const projectId = create.body.project.id;
    const v0Id = create.body.versions[0].id;

    const res = await request(app)
      .post(`/api/projects/${projectId}/versions/${v0Id}/activate`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.activeVersionId).toBe(v0Id);
  });

  it('POST .../versions/:vid/activate on a foreign version returns 404', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });

    const res = await request(app)
      .post(`/api/projects/${create.body.project.id}/versions/ver_foreign/activate`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('VERSION_NOT_FOUND');
  });

  it('POST .../versions/:vid/approve updates the approved pointer', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'demo', imageBase64: pngBase64, mimeType: 'image/png' });
    const projectId = create.body.project.id;
    const v0Id = create.body.versions[0].id;

    const res = await request(app)
      .post(`/api/projects/${projectId}/versions/${v0Id}/approve`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.approvedVersionId).toBe(v0Id);
  });
});

// ===========================================================================
// RF-R10-05 (R9-LEDGER-01 / M-01): DELETE retry-required protocol.
//
// GPT verdict (FIX_REQUIRED):
//  "R9-LEDGER-01: service 返回 ledgerUpdateFailed=true，route 仍返回成功，
//   client 丢弃响应并清空本地项目。没有 caller retry，也没有后台重放。
//   Required Fix: 让 server 将此状态转换为明确 retry-required 协议并调度
//   durable reconciliation，或让 client 解析结果且不清空恢复入口；新增端到端测试。"
//
// These tests verify the server route's HTTP-level retry-required protocol:
//  - 200 + retryRequired=false when cleanup fully succeeded
//  - 202 + retryRequired=true when ledgerUpdateFailed or unresolvedPersistFailed
//  - The route fires reconcileUnresolvedMetadata fire-and-forget when
//    unresolved entries exist
// ===========================================================================

describe('RF-R10-05 (R9-LEDGER-01/M-01): DELETE retry-required protocol', () => {
  function buildAppWithMockService(opts: {
    deleteResult: {
      deleted: true;
      cleanupFailures: string[];
      unresolvedMetadataMissing: string[];
      ledgerUpdateFailed: boolean;
      unresolvedPersistFailed: boolean;
    };
    reconcileResult?: { replayed: number; succeeded: string[]; failed: Array<{ storageKey: string; error: string }> };
  }): { app: express.Application; reconcileSpy: ReturnType<typeof vi.fn> } {
    process.env.JWT_SECRET = JWT_SECRET;
    const reconcileSpy = vi.fn().mockResolvedValue(
      opts.reconcileResult ?? { replayed: 0, succeeded: [], failed: [] }
    );
    const mockProjectService = {
      deleteProject: vi.fn().mockResolvedValue(opts.deleteResult),
      reconcileUnresolvedMetadata: reconcileSpy,
      getProjectSnapshot: vi.fn(),
      createProject: vi.fn(),
      activateVersion: vi.fn(),
      approveVersion: vi.fn(),
    } as unknown as ProjectService;
    const mockGenerationService = {} as unknown as GenerationService;

    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/projects', (req, res, next) => {
      next(); // auth bypassed — mock service has no real state
    }, createProjectsRouter({ projectService: mockProjectService, generationService: mockGenerationService }));
    return { app, reconcileSpy };
  }

  it('DELETE returns 200 + retryRequired=false when cleanup fully succeeded', async () => {
    const { app } = buildAppWithMockService({
      deleteResult: {
        deleted: true,
        cleanupFailures: [],
        unresolvedMetadataMissing: [],
        ledgerUpdateFailed: false,
        unresolvedPersistFailed: false,
      },
    });

    const res = await request(app)
      .delete('/api/projects/proj_clean')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.retryRequired).toBe(false);
  });

  it('DELETE returns 202 + retryRequired=true when ledgerUpdateFailed=true', async () => {
    const { app, reconcileSpy } = buildAppWithMockService({
      deleteResult: {
        deleted: true,
        cleanupFailures: [],
        unresolvedMetadataMissing: ['key-0'],
        ledgerUpdateFailed: true,
        unresolvedPersistFailed: false,
      },
    });

    const res = await request(app)
      .delete('/api/projects/proj_ledger_fail')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(202);
    expect(res.body.deleted).toBe(true);
    expect(res.body.retryRequired).toBe(true);
    // Fire-and-forget reconciliation was triggered (unresolved entries exist).
    expect(reconcileSpy).toHaveBeenCalledWith('proj_ledger_fail');
  });

  it('DELETE returns 202 + retryRequired=true when unresolvedPersistFailed=true', async () => {
    const { app, reconcileSpy } = buildAppWithMockService({
      deleteResult: {
        deleted: true,
        cleanupFailures: [],
        unresolvedMetadataMissing: ['key-0'],
        ledgerUpdateFailed: false,
        unresolvedPersistFailed: true,
      },
    });

    const res = await request(app)
      .delete('/api/projects/proj_persist_fail')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(202);
    expect(res.body.deleted).toBe(true);
    expect(res.body.retryRequired).toBe(true);
    // Reconciliation was triggered.
    expect(reconcileSpy).toHaveBeenCalledWith('proj_persist_fail');
  });

  it('DELETE does NOT call reconcile when no unresolved entries', async () => {
    const { app, reconcileSpy } = buildAppWithMockService({
      deleteResult: {
        deleted: true,
        cleanupFailures: ['key-fail'],
        unresolvedMetadataMissing: [],
        ledgerUpdateFailed: true,
        unresolvedPersistFailed: false,
      },
    });

    const res = await request(app)
      .delete('/api/projects/proj_no_unresolved')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    // retryRequired is true (ledgerUpdateFailed) but no unresolved entries.
    expect(res.status).toBe(202);
    expect(res.body.retryRequired).toBe(true);
    // Reconciliation NOT called (no unresolved entries to replay).
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});
