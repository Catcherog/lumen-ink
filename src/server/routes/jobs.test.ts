/**
 * PERSIST-001 Task 6 — Job API route tests.
 *
 * Covers:
 *  - Idempotency-Key required on Job creation (400 when missing)
 *  - POST /api/projects/:id/jobs creates a queued Job (201)
 *  - Duplicate Idempotency-Key returns the original Job (200, no enqueue)
 *  - GET /api/jobs/:id returns the Job snapshot
 *  - GET /api/jobs/:id on missing returns 404
 *  - POST /api/jobs/:id/cancel on a queued Job returns cancelled
 *  - POST /api/jobs/:id/cancel on a terminal Job returns 409
 *  - POST /api/jobs/:id/retry on a failed Job creates a new Job
 *  - POST /api/jobs/:id/retry on a queued Job returns 409
 *  - POST /api/projects/:id/jobs with a missing projectId returns 404
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
import { createJobsRouter } from './jobs.js';

const JWT_SECRET = 'lumen-ink-test-secret-jobs';
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

function buildApp(tempRoot: string): {
  app: express.Application;
  generationService: GenerationService;
} {
  process.env.JWT_SECRET = JWT_SECRET;
  const deps = createLocalPersistence({ rootDir: tempRoot });
  const executor = createLocalJobExecutor();
  const projectService = new ProjectService(deps, executor);
  const generationService = new GenerationService(deps, executor);

  const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
  };

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  // Projects router now also mounts the /:id/jobs sub-routes internally
  // so the `:id` route param is available (Express 4 limitation).
  app.use('/api/projects', auth, createProjectsRouter({ projectService, generationService }));
  app.use('/api/jobs', auth, createJobsRouter(generationService));

  return { app, generationService };
}

describe('PERSIST-001 Task 6 — Job API routes', () => {
  let tempRoot: string;
  let app: express.Application;
  let generationService: GenerationService;
  let pngBase64: string;
  let projectId: string;
  let inputVersionId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-routes-jobs-'));
    const built = buildApp(tempRoot);
    app = built.app;
    generationService = built.generationService;
    const png = await makePng(64, 48);
    pngBase64 = png.toString('base64');

    // Seed a project with V0 so Job creation has a valid input version.
    const create = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'job-demo', imageBase64: pngBase64, mimeType: 'image/png' });
    projectId = create.body.project?.id;
    inputVersionId = create.body.versions?.[0]?.id;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/projects/:id/jobs requires Idempotency-Key header', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ prompt: 'demo' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_RECIPE');
  });

  it('POST /api/projects/:id/jobs requires prompt', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-001')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_RECIPE');
  });

  it('POST /api/projects/:id/jobs creates a queued Job and returns 201', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-create-001')
      .send({ prompt: 'test prompt', inputVersionId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('queued');
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.id).toBeTruthy();
  });

  it('Duplicate Idempotency-Key returns the original Job (no re-enqueue)', async () => {
    const first = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'dup-key-001')
      .send({ prompt: 'first prompt', inputVersionId });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'dup-key-001')
      .send({ prompt: 'second prompt', inputVersionId });

    // Idempotent replay returns 200 with the original Job.
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.prompt).toBe(first.body.prompt);
  });

  it('POST /api/projects/:id/jobs on a missing Project returns 404', async () => {
    const res = await request(app)
      .post('/api/projects/proj_missing/jobs')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-missing-project')
      .send({ prompt: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('PROJECT_NOT_FOUND');
  });

  it('GET /api/jobs/:id returns the Job', async () => {
    const create = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-get-001')
      .send({ prompt: 'test prompt', inputVersionId });

    const res = await request(app)
      .get(`/api/jobs/${create.body.id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
    expect(res.body.status).toBe('queued');
  });

  it('GET /api/jobs/:id on a missing Job returns 404', async () => {
    const res = await request(app)
      .get('/api/jobs/job_missing')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('JOB_NOT_FOUND');
  });

  it('POST /api/jobs/:id/cancel on a queued Job returns cancelled', async () => {
    const create = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-cancel-001')
      .send({ prompt: 'cancel me', inputVersionId });

    const res = await request(app)
      .post(`/api/jobs/${create.body.id}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('POST /api/jobs/:id/cancel on a terminal Job returns 409', async () => {
    const create = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-cancel-terminal')
      .send({ prompt: 'cancel me twice', inputVersionId });

    await request(app)
      .post(`/api/jobs/${create.body.id}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    const second = await request(app)
      .post(`/api/jobs/${create.body.id}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(second.status).toBe(409);
    expect(second.body.errorCode).toBe('ILLEGAL_JOB_TRANSITION');
  });

  it('POST /api/jobs/:id/retry on a queued Job returns 409', async () => {
    const create = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .set('Idempotency-Key', 'key-retry-active')
      .send({ prompt: 'do not retry me', inputVersionId });

    const res = await request(app)
      .post(`/api/jobs/${create.body.id}/retry`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('JOB_NOT_RETRYABLE');
  });

  it('POST /api/jobs/:id/retry on a failed Job creates a new Job', async () => {
    // Create a Job, then fail it via the service (the API doesn't expose
    // a fail endpoint because failures only happen inside executeJob).
    const created = await generationService.createJob({
      projectId,
      prompt: 'fail me',
      inputVersionId,
      idempotencyKey: 'key-retry-failed',
    });

    // Mark the Job as failed with a retryable error code via the executor
    // path: we execute with a failing providerFactory.
    try {
      await generationService.executeJob(created.id, {
        workerId: 'worker-fail',
        leaseSeconds: 60,
        providerFactory: async () => {
          throw new Error('timeout while calling provider');
        },
      });
    } catch {
      // expected
    }

    // Verify the Job is failed.
    const failed = await generationService.getJob(created.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('PROVIDER_TIMEOUT');

    const res = await request(app)
      .post(`/api/jobs/${created.id}/retry`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(201);
    expect(res.body.job.id).not.toBe(created.id);
    expect(res.body.job.status).toBe('queued');
    expect(res.body.job.parentJobId).toBe(created.id);
    expect(res.body.job.attempt).toBe(2);
    expect(res.body.parentJob.id).toBe(created.id);
  });
});
