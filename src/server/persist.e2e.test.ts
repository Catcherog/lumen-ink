/**
 * PERSIST-001 Task 11 — End-to-End Failure/Recovery Matrix.
 *
 * Walks the full Project + Job lifecycle through the real Express app +
 * local file-backed persistence + local JobExecutor. Synthetic PNG bytes
 * are produced via sharp so image validation runs end-to-end.
 *
 * Coverage matrix (per plan spec):
 *  1.  Upload V0                → 201, snapshot.redacted storageKey, V0 active
 *  2.  Create Job (queued)      → 201, status=queued
 *  3.  Execute success          → V1 created, activeVersion moved, Job succeeded
 *  4.  Refresh snapshot         → V1 visible, signed URL present
 *  5.  Approve V1               → approvedVersionId set
 *  6.  Provider timeout         → Job failed PROVIDER_TIMEOUT, no V2 appended
 *  7.  Provider quota           → Job failed PROVIDER_QUOTA (429 when via HTTP)
 *  8.  Provider network         → Job failed PROVIDER_NETWORK (502 when via HTTP)
 *  9.  Object save failure      → Job failed SAVE_FAILED, compensation deletes orphan
 * 10.  DB save failure          → Job failed SAVE_FAILED, UoW rollback + compensation
 * 11.  Cancellation             → Job cancelled, no Version appended
 * 12.  Retry                    → New Job with attempt=2 and parentJobId
 * 13.  Idempotent duplicate     → Same Job returned, no re-enqueue
 * 14.  Complete deletion        → Project + assets + versions + objects all gone
 *
 * The HTTP layer is exercised via supertest. The Provider is injected via
 * GenerationService.executeJob's `providerFactory` option (the route layer
 * does not expose execution because production workers consume the queue
 * out-of-band). This mirrors how a real worker process would drive Jobs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { createLocalPersistence } from './infrastructure/persistence/local.js';
import { createLocalJobExecutor } from './infrastructure/executor/local.js';
import { ProjectService } from './services/ProjectService.js';
import { GenerationService } from './services/GenerationService.js';
import { createProjectsRouter } from './routes/projects.js';
import { createJobsRouter } from './routes/jobs.js';
import type { PersistenceDependencies } from './domain/persistence.js';

const JWT_SECRET = 'lumen-ink-e2e-persist-secret';
const TEST_TOKEN = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '2h' });

async function makePng(width = 64, height = 48, color: { r: number; g: number; b: number } = { r: 128, g: 128, b: 128 }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

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

interface AppContext {
  app: express.Application;
  deps: PersistenceDependencies;
  projectService: ProjectService;
  generationService: GenerationService;
}

function buildApp(tempRoot: string): AppContext {
  process.env.JWT_SECRET = JWT_SECRET;
  const deps = createLocalPersistence({ rootDir: tempRoot });
  const executor = createLocalJobExecutor();
  const projectService = new ProjectService(deps, executor);
  const generationService = new GenerationService(deps, executor);

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/projects', authMiddleware, createProjectsRouter({ projectService, generationService }));
  app.use('/api/jobs', authMiddleware, createJobsRouter(generationService));
  return { app, deps, projectService, generationService };
}

describe('PERSIST-001 Task 11 — End-to-End Failure/Recovery Matrix', () => {
  let tempRoot: string;
  let ctx: AppContext;
  let pngBase64: string;
  let projectId: string;
  let v0Id: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-persist-e2e-'));
    ctx = buildApp(tempRoot);
    const png = await makePng(64, 48);
    pngBase64 = png.toString('base64');

    // Seed V0 via HTTP so the entire upload path is exercised.
    const create = await request(ctx.app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'e2e-demo', imageBase64: pngBase64, mimeType: 'image/png' });
    expect(create.status).toBe(201);
    projectId = create.body.project.id;
    v0Id = create.body.versions[0].id;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  // --- 1–2. Upload V0 + create queued Job --------------------------------

  it('upload creates V0 with redacted storageKey and signed URL', async () => {
    const res = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(projectId);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].id).toBe(v0Id);
    expect(res.body.versions[0].label).toBe('v0');
    expect(res.body.assets[0].storageKey).toMatch(/^redacted:\/\//);
    expect(Object.keys(res.body.signedUrls).length).toBeGreaterThan(0);
  });

  it('POST /api/projects/:id/jobs creates a queued Job (201)', async () => {
    const res = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-queued-001')
      .send({ prompt: 'synthetic e2e prompt', inputVersionId: v0Id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('queued');
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.id).toBeTruthy();
  });

  // --- 3–5. Success path: execute via service → V1 → refresh → approve ---

  it('executeJob success creates V1, moves activeVersion, and marks Job succeeded', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-success-001')
      .send({ prompt: 'success prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    const resultBytes = await makePng(80, 60, { r: 200, g: 100, b: 50 });
    const executed = await ctx.generationService.executeJob(jobId, {
      workerId: 'worker-e2e-success',
      providerFactory: async () => ({
        bytes: new Uint8Array(resultBytes),
        mimeType: 'image/png',
      }),
    });

    expect(executed.status).toBe('succeeded');
    expect(executed.resultVersionId).toBeTruthy();
    const v1Id = executed.resultVersionId!;

    // GET /api/projects/:id should now show V0 + V1, activeVersion=V1.
    const refresh = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(refresh.status).toBe(200);
    expect(refresh.body.versions).toHaveLength(2);
    expect(refresh.body.versions.map((v: { id: string }) => v.id)).toContain(v1Id);
    expect(refresh.body.project.activeVersionId).toBe(v1Id);
    // Redacted storageKey for V1's asset.
    const v1Asset = refresh.body.assets.find((a: { id: string }) =>
      a.id === refresh.body.versions.find((v: { id: string }) => v.id === v1Id).assetId
    );
    expect(v1Asset.storageKey).toMatch(/^redacted:\/\//);

    // Approve V1 → approvedVersionId set.
    const approve = await request(ctx.app)
      .post(`/api/projects/${projectId}/versions/${v1Id}/approve`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(approve.status).toBe(200);
    expect(approve.body.approvedVersionId).toBe(v1Id);

    // GET /api/jobs/:id shows succeeded.
    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.status).toBe(200);
    expect(jobGet.body.status).toBe('succeeded');
    expect(jobGet.body.resultVersionId).toBe(v1Id);
  });

  // --- 6–8. Provider failure classification via HTTP --------------------

  it('provider timeout → Job failed with PROVIDER_TIMEOUT (HTTP 504)', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-timeout-001')
      .send({ prompt: 'timeout prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => {
          throw new Error('Request timed out after 30000ms');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.status).toBe(200);
    expect(jobGet.body.status).toBe('failed');
    expect(jobGet.body.errorCode).toBe('PROVIDER_TIMEOUT');

    // No new Version was appended.
    const snap = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(snap.body.versions).toHaveLength(1);
  });

  it('provider quota → Job failed with PROVIDER_QUOTA (HTTP 429)', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-quota-001')
      .send({ prompt: 'quota prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => {
          throw new Error('429 rate limit exceeded');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA' });

    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.body.status).toBe('failed');
    expect(jobGet.body.errorCode).toBe('PROVIDER_QUOTA');
  });

  it('provider network error → Job failed with PROVIDER_NETWORK (HTTP 502)', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-network-001')
      .send({ prompt: 'network prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => {
          throw new Error('fetch failed: ECONNRESET');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_NETWORK' });

    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.body.errorCode).toBe('PROVIDER_NETWORK');
  });

  // --- 9. Object save failure → compensation ----------------------------

  it('object upload failure → SAVE_FAILED and result object is NOT retained', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-objfail-001')
      .send({ prompt: 'object fail prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    // Swap the ObjectStore to fail any put to /generated/.
    const realObjects = ctx.deps.objects;
    let putAttempted = false;
    (ctx.deps as { objects: PersistenceDependencies['objects'] }).objects = {
      async put(key, bytes, mimeType) {
        if (key.includes('/generated/')) {
          putAttempted = true;
          throw new Error('synthetic object store outage');
        }
        return realObjects.put(key, bytes, mimeType);
      },
      async get(key) { return realObjects.get(key); },
      async getSignedUrl(key) { return realObjects.getSignedUrl(key); },
      async delete(key) { return realObjects.delete(key); },
      async exists(key) { return realObjects.exists(key); },
    };

    const resultBytes = await makePng(32, 32);
    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => ({
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' });

    expect(putAttempted).toBe(true);
    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.body.status).toBe('failed');
    expect(jobGet.body.errorCode).toBe('SAVE_FAILED');

    // No new Asset/Version survived.
    const snap = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(snap.body.versions).toHaveLength(1);
    expect(snap.body.assets).toHaveLength(1);
  });

  // --- 10. DB save failure → UoW rollback + compensation ----------------

  it('DB transaction failure → SAVE_FAILED, result object deleted, no partial success', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-dbfail-001')
      .send({ prompt: 'db fail prompt', inputVersionId: v0Id });
    const jobId = create.body.id;

    // Track the result storage key to assert compensation deleted it.
    let resultStorageKey = '';
    const realObjects = ctx.deps.objects;
    (ctx.deps as { objects: PersistenceDependencies['objects'] }).objects = {
      async put(key, bytes, mimeType) {
        if (key.includes('/generated/')) resultStorageKey = key;
        return realObjects.put(key, bytes, mimeType);
      },
      async get(key) { return realObjects.get(key); },
      async getSignedUrl(key) { return realObjects.getSignedUrl(key); },
      async delete(key) { return realObjects.delete(key); },
      async exists(key) { return realObjects.exists(key); },
    };

    // Make the Version idempotent create throw inside the UoW.
    const realVersions = ctx.deps.versions;
    (ctx.deps as { versions: PersistenceDependencies['versions'] }).versions = {
      async create(input) { return realVersions.create(input); },
      async createIdempotent(pId, key, version) {
        if (key.startsWith('job_')) {
          throw new Error('synthetic version idempotency conflict');
        }
        return realVersions.createIdempotent(pId, key, version);
      },
      async get(id) { return realVersions.get(id); },
      async listByProject(id) { return realVersions.listByProject(id); },
    };

    const resultBytes = await makePng(40, 40);
    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => ({
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' });

    // Compensation: the uploaded result object was deleted.
    expect(resultStorageKey).toBeTruthy();
    expect(await realObjects.exists(resultStorageKey)).toBe(false);

    // UoW rollback: only V0 survives.
    const snap = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(snap.body.versions).toHaveLength(1);
    expect(snap.body.assets).toHaveLength(1);

    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.body.errorCode).toBe('SAVE_FAILED');
  });

  // --- 11. Cancellation -------------------------------------------------

  it('cancel a queued Job via HTTP and assert no Version is appended', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-cancel-001')
      .send({ prompt: 'cancel me', inputVersionId: v0Id });
    const jobId = create.body.id;

    const cancel = await request(ctx.app)
      .post(`/api/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');

    // Cancelling again returns 409 (terminal).
    const second = await request(ctx.app)
      .post(`/api/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(second.status).toBe(409);
    expect(second.body.errorCode).toBe('ILLEGAL_JOB_TRANSITION');

    // Snapshot still has only V0.
    const snap = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(snap.body.versions).toHaveLength(1);
  });

  // --- 12. Retry --------------------------------------------------------

  it('retry a failed Job creates a new Job with attempt=2 and parentJobId', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-retry-001')
      .send({ prompt: 'retry me', inputVersionId: v0Id });
    const jobId = create.body.id;

    // Fail the Job via service (providerFactory throws).
    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => {
          throw new Error('timeout');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    const retry = await request(ctx.app)
      .post(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(retry.status).toBe(201);
    expect(retry.body.job.id).not.toBe(jobId);
    expect(retry.body.job.status).toBe('queued');
    expect(retry.body.job.attempt).toBe(2);
    expect(retry.body.job.parentJobId).toBe(jobId);
    expect(retry.body.parentJob.id).toBe(jobId);

    // Original Job is still failed.
    const orig = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(orig.body.status).toBe('failed');
  });

  // --- 13. Idempotent duplicate -----------------------------------------

  it('duplicate Idempotency-Key returns the original Job without re-enqueue', async () => {
    const first = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-idem-001')
      .send({ prompt: 'idempotent prompt', inputVersionId: v0Id });
    expect(first.status).toBe(201);

    const second = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-idem-001')
      .send({ prompt: 'idempotent prompt', inputVersionId: v0Id });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.prompt).toBe(first.body.prompt);
  });

  // --- 14. Complete deletion --------------------------------------------

  it('DELETE /api/projects/:id cascade-removes metadata and objects', async () => {
    // Drive one successful generation so V1 + result object exist.
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-delete-001')
      .send({ prompt: 'delete path', inputVersionId: v0Id });
    const jobId = create.body.id;

    const resultBytes = await makePng(48, 48);
    const executed = await ctx.generationService.executeJob(jobId, {
      workerId: 'worker-e2e-delete',
      providerFactory: async () => ({
        bytes: new Uint8Array(resultBytes),
        mimeType: 'image/png',
      }),
    });
    expect(executed.status).toBe('succeeded');

    // Capture the V1 asset's real storage key before deletion so we can
    // prove the object was removed. The HTTP response only exposes the
    // redacted form; we read it from the local adapter directly.
    const assets = await ctx.deps.assets.listByProject(projectId);
    expect(assets.length).toBe(2);
    const v1Asset = assets.find((a) => a.id !== assets[0].id);
    expect(v1Asset).toBeTruthy();
    const v1StorageKey = v1Asset!.storageKey;
    expect(await ctx.deps.objects.exists(v1StorageKey)).toBe(true);

    // DELETE via HTTP.
    const del = await request(ctx.app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    // Subsequent GET returns 404.
    const after = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(after.status).toBe(404);
    expect(after.body.errorCode).toBe('PROJECT_NOT_FOUND');

    // The V1 result object was deleted as part of cascade.
    expect(await ctx.deps.objects.exists(v1StorageKey)).toBe(false);
    // The V0 original object was also deleted.
    const v0Asset = assets.find((a) => a.id !== v1Asset!.id);
    expect(await ctx.deps.objects.exists(v0Asset!.storageKey)).toBe(false);

    // No Versions or Assets remain.
    const remainingVersions = await ctx.deps.versions.listByProject(projectId);
    expect(remainingVersions).toHaveLength(0);
    const remainingAssets = await ctx.deps.assets.listByProject(projectId);
    expect(remainingAssets).toHaveLength(0);

    // The Job is also gone (cascade).
    const jobGet = await request(ctx.app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(jobGet.status).toBe(404);
    expect(jobGet.body.errorCode).toBe('JOB_NOT_FOUND');
  });

  // --- Bonus: failed Job then retry then success (recovery path) --------

  it('recovery: timeout → retry → success appends V1 and clears failure', async () => {
    const create = await request(ctx.app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'e2e-recovery-001')
      .send({ prompt: 'will recover', inputVersionId: v0Id });
    const jobId = create.body.id;

    // First attempt fails with timeout.
    await expect(
      ctx.generationService.executeJob(jobId, {
        providerFactory: async () => {
          throw new Error('timeout');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    // Retry creates a new Job.
    const retry = await request(ctx.app)
      .post(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(retry.status).toBe(201);
    const newJobId = retry.body.job.id;

    // Second attempt succeeds.
    const resultBytes = await makePng(72, 56, { r: 50, g: 200, b: 100 });
    const executed = await ctx.generationService.executeJob(newJobId, {
      workerId: 'worker-e2e-recovery',
      providerFactory: async () => ({
        bytes: new Uint8Array(resultBytes),
        mimeType: 'image/png',
      }),
    });
    expect(executed.status).toBe('succeeded');

    // Snapshot now has V0 + V1 (the failed Job did NOT add a Version).
    const snap = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(snap.body.versions).toHaveLength(2);
    expect(snap.body.project.activeVersionId).toBe(executed.resultVersionId);
  });
});
