/**
 * PERSIST-001 FINAL-CLOSURE AC-07/AC-08: worker recovery route HTTP tests.
 *
 * Verifies that:
 *  - AC-07: authorized GET /api/worker/recover hits the real recovery
 *    handler and returns 200 with the `WorkerRecoveryResult` payload.
 *    Vercel Cron invokes the configured cron `path` via GET, so GET must
 *    be wired to the real handler (not 404 / 405).
 *  - AC-08: missing or wrong CRON_SECRET returns 401; CRON_SECRET unset
 *    returns 503 (recovery disabled); internal error returns 500.
 *  - GET and POST share the same handler (AC-07 "复用同一个 handler,
 *    不复制恢复逻辑"): identical payload shape for both verbs.
 *
 * Uses `createCloudBaseMockPersistence` so the test does NOT touch real
 * CloudBase. The mock implements the same `PersistenceDependencies`
 * interface the production adapter does.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCloudBaseMockPersistence } from '../infrastructure/persistence/cloudbase-mock.js';
import { createWorkerRouter } from './worker.js';
import type { PersistenceDependencies, GenerationJob } from '../domain/persistence.js';

const CRON_SECRET = 'test-cron-secret-1234567890';

function fakeProviderFactory(
  _job: GenerationJob,
  input: { bytes: Uint8Array; mimeType: string }
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const out = new Uint8Array(input.bytes.length + 1);
  out.set(input.bytes, 0);
  out[input.bytes.length] = 0xff;
  return Promise.resolve({ bytes: out, mimeType: input.mimeType });
}

function buildApp(
  deps: PersistenceDependencies,
  options: { cronSecret?: string; providerFactory?: unknown } = {}
): express.Application {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/worker',
    createWorkerRouter({
      deps,
      providerFactory: (options.providerFactory ?? fakeProviderFactory) as typeof fakeProviderFactory,
      leaseSeconds: 60,
      cronSecret: options.cronSecret,
    })
  );
  return app;
}

describe('PERSIST-001 FINAL-CLOSURE AC-07/AC-08: /api/worker/recover route', () => {
  let deps: PersistenceDependencies;

  beforeEach(() => {
    deps = createCloudBaseMockPersistence().deps;
    // Clear CRON_SECRET from the env so each test controls its own auth
    // configuration explicitly via `cronSecret` in buildApp().
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('AC-07 GET: authorized request hits the real recovery handler and returns 200', async () => {
    const app = buildApp(deps, { cronSecret: CRON_SECRET });
    const res = await request(app)
      .get('/api/worker/recover')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      workerId: expect.stringMatching(/^recovery-\d+-[a-z0-9]+$/),
      discovered: 0,
      recovered: [],
      skipped: [],
      failed: [],
    });
    expect(res.body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('AC-07 POST: manual invocation hits the same handler — identical payload shape', async () => {
    const app = buildApp(deps, { cronSecret: CRON_SECRET });
    const res = await request(app)
      .post('/api/worker/recover')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    // Same handler → same payload schema as GET.
    expect(res.body).toMatchObject({
      workerId: expect.stringMatching(/^recovery-\d+-[a-z0-9]+$/),
      discovered: 0,
      recovered: [],
      skipped: [],
      failed: [],
    });
  });

  it('AC-08 GET 401: missing Authorization header → 401 UNAUTHORIZED', async () => {
    const app = buildApp(deps, { cronSecret: CRON_SECRET });
    const res = await request(app).get('/api/worker/recover');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('AC-08 GET 401: wrong Bearer token → 401 UNAUTHORIZED', async () => {
    const app = buildApp(deps, { cronSecret: CRON_SECRET });
    const res = await request(app)
      .get('/api/worker/recover')
      .set('Authorization', 'Bearer wrong-secret-value');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('AC-08 GET 503: CRON_SECRET unset → 503 WORKER_RECOVERY_DISABLED', async () => {
    // No cronSecret passed and no process.env.CRON_SECRET — recovery disabled.
    const app = buildApp(deps, {});
    const res = await request(app)
      .get('/api/worker/recover')
      .set('Authorization', 'Bearer anything');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      errorCode: 'WORKER_RECOVERY_DISABLED',
    });
  });

  it('AC-08 GET 500: recoverPendingJobs throws → 500 WORKER_RECOVERY_FAILED', async () => {
    // Wrap the mock deps so `listLeaseExpired` rejects — this forces
    // `recoverPendingJobs` to throw out of its top-level try/catch and
    // hit the route's 500 path. (Per-Job provider failures are caught
    // internally and recorded in `result.failed`, returning 200 — so
    // they do NOT exercise the 500 path.)
    const throwingDeps: PersistenceDependencies = {
      ...deps,
      jobs: {
        ...deps.jobs,
        listLeaseExpired: () => {
          throw new Error('synthetic listLeaseExpired failure for 500 test');
        },
      },
    };

    const app = buildApp(throwingDeps, { cronSecret: CRON_SECRET });
    const res = await request(app)
      .get('/api/worker/recover')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      errorCode: 'WORKER_RECOVERY_FAILED',
      message: expect.stringContaining('synthetic listLeaseExpired failure'),
    });
  });
});
