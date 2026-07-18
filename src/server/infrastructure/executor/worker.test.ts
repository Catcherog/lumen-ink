import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { createLocalPersistence } from '../persistence/local.js';
import { createWorkerJobExecutor } from './worker.js';
import { ProjectService } from '../../services/ProjectService.js';
import { GenerationService } from '../../services/GenerationService.js';
import type { PersistenceDependencies } from '../../domain/persistence.js';

/**
 * PERSIST-001 P0-01 regression: real Job executor + recovery.
 *
 * Verifies the FIX_PACKET requirements:
 *  - "创建 Job 后真实 executor 可执行并刷新恢复"
 *  - "进程/adapter 重建后 queued/active Job 可接管"
 *
 * The worker executor must:
 *  1. Actually invoke GenerationService.executeJob (not no-op like local)
 *  2. Support recovery: sweeper scans listLeaseExpired and re-enqueues
 *  3. Support adapter rebuild: a fresh adapter pointing at the same store
 *     can observe and resume queued/active Jobs.
 */

async function makePng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; alpha: number }
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: color },
  })
    .png()
    .toBuffer();
}

describe('PERSIST-001 P0-01: createWorkerJobExecutor', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;
  let projectService: ProjectService;
  let generationService: GenerationService;
  let projectId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-worker-'));
    deps = createLocalPersistence({ rootDir: tempRoot });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function seedProject(): Promise<void> {
    const bytes = await makePng(64, 48, { r: 10, g: 20, b: 30, alpha: 1 });
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'worker-demo',
      bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
  }

  it('enqueue actually executes the Job through GenerationService.executeJob', async () => {
    const worker = createWorkerJobExecutor({
      deps,
      providerFactory: async () => ({
        bytes: new Uint8Array(await makePng(32, 32, { r: 1, g: 2, b: 3, alpha: 1 })),
        mimeType: 'image/png',
      }),
      // Use a short poll interval so the test completes quickly.
      pollIntervalMs: 20,
      leaseSeconds: 60,
    });
    const executor = worker.executor;
    const projectServiceLocal = new ProjectService(deps, executor);
    const generationServiceLocal = new GenerationService(deps, executor);
    projectService = projectServiceLocal;
    generationService = generationServiceLocal;
    await seedProject();

    const job = await generationServiceLocal.createJob({
      projectId,
      prompt: 'worker-exec',
      idempotencyKey: 'worker-001',
    });
    expect(job.status).toBe('queued');

    // Start the worker — it should pick up the queued Job and execute it.
    worker.start();

    // Wait for the Job to reach a terminal state.
    const final = await waitForJobTerminal(deps, job.id, 5000);
    expect(final?.status).toBe('succeeded');
    expect(final?.resultVersionId).toBeTruthy();

    worker.stop();
  });

  it('sweeper re-enqueues a Job whose lease has expired', async () => {
    // Use a real (very short) lease so it expires naturally without fake
    // timers. Fake timers would mock setInterval/setTimeout and break both
    // the worker's polling and waitForJobTerminal's polling.
    const worker = createWorkerJobExecutor({
      deps,
      providerFactory: async () => ({
        bytes: new Uint8Array(await makePng(16, 16, { r: 5, g: 6, b: 7, alpha: 1 })),
        mimeType: 'image/png',
      }),
      pollIntervalMs: 20,
      leaseSeconds: 60,
      sweeperIntervalMs: 20,
    });
    const executor = worker.executor;
    projectService = new ProjectService(deps, executor);
    generationService = new GenerationService(deps, executor);
    await seedProject();

    // Create a Job and manually claim it with a short lease to simulate
    // a worker that crashed mid-execution (lease will expire).
    const job = await generationService.createJob({
      projectId,
      prompt: 'sweeper-recover',
      idempotencyKey: 'worker-002',
    });
    // Claim with worker-A and a 200ms lease — short enough to expire
    // quickly, long enough to not race with the claim itself.
    const claimNow = new Date();
    const claimed = await deps.jobs.claim(job.id, {
      workerId: 'worker-A-crashed',
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(claimNow.getTime() + 200).toISOString(),
      now: claimNow.toISOString(),
    });
    expect(claimed).toBe(true);

    // Wait for the lease to expire (300ms > 200ms lease).
    await new Promise((r) => setTimeout(r, 300));

    // Start the worker + sweeper. The sweeper should detect the expired
    // lease and re-enqueue the Job for execution.
    worker.start();

    // Wait for the Job to be taken over and completed.
    const final = await waitForJobTerminal(deps, job.id, 5000);
    expect(final?.status).toBe('succeeded');

    worker.stop();
  });

  it('adapter rebuild: a fresh adapter pointing at the same store can resume Jobs', async () => {
    // Use the same rootDir for both adapters — simulates a process restart
    // where the new adapter reads the persisted state.
    const worker = createWorkerJobExecutor({
      deps,
      providerFactory: async () => ({
        bytes: new Uint8Array(await makePng(24, 24, { r: 9, g: 8, b: 7, alpha: 1 })),
        mimeType: 'image/png',
      }),
      pollIntervalMs: 20,
      leaseSeconds: 60,
    });
    const executor = worker.executor;
    projectService = new ProjectService(deps, executor);
    generationService = new GenerationService(deps, executor);
    await seedProject();

    // Create a Job but don't start the worker yet (simulates Job queued
    // before the worker process starts).
    const job = await generationService.createJob({
      projectId,
      prompt: 'adapter-rebuild',
      idempotencyKey: 'worker-003',
    });
    expect(job.status).toBe('queued');

    // Simulate process restart: create a fresh adapter pointing at the
    // same rootDir, plus a fresh worker.
    const rebuiltDeps = createLocalPersistence({ rootDir: tempRoot });
    const rebuiltWorker = createWorkerJobExecutor({
      deps: rebuiltDeps,
      providerFactory: async () => ({
        bytes: new Uint8Array(await makePng(20, 20, { r: 3, g: 2, b: 1, alpha: 1 })),
        mimeType: 'image/png',
      }),
      pollIntervalMs: 20,
      leaseSeconds: 60,
    });

    // The fresh adapter should observe the queued Job and the new worker
    // should execute it.
    rebuiltWorker.start();

    const final = await waitForJobTerminal(rebuiltDeps, job.id, 5000);
    expect(final?.status).toBe('succeeded');

    rebuiltWorker.stop();
  });

  it('cancel signals best-effort cancellation to the executor', async () => {
    let cancelRequested = false;
    const worker = createWorkerJobExecutor({
      deps,
      providerFactory: async () => {
        // Wait until cancel is requested, then return (simulating a slow
        // provider that gets cancelled mid-flight).
        while (!cancelRequested) {
          await new Promise((r) => setTimeout(r, 10));
        }
        return {
          bytes: new Uint8Array(await makePng(8, 8, { r: 0, g: 0, b: 0, alpha: 1 })),
          mimeType: 'image/png',
        };
      },
      pollIntervalMs: 20,
      leaseSeconds: 60,
    });
    const executor = worker.executor;
    projectService = new ProjectService(deps, executor);
    generationService = new GenerationService(deps, executor);
    await seedProject();

    const job = await generationService.createJob({
      projectId,
      prompt: 'cancel-during-exec',
      idempotencyKey: 'worker-004',
    });

    worker.start();
    // Give the worker a moment to pick up the Job.
    await new Promise((r) => setTimeout(r, 100));

    // Cancel the Job via the executor.
    const cancelResult = await executor.cancel(job.id);
    expect(cancelResult).toBe('best_effort');
    cancelRequested = true;

    // Cancel via GenerationService (atomically terminates publication).
    const cancelled = await generationService.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');

    worker.stop();
  });
});

/**
 * Poll a Job until it reaches a terminal state or timeout.
 */
async function waitForJobTerminal(
  deps: PersistenceDependencies,
  jobId: string,
  timeoutMs: number
): Promise<{ status: string; resultVersionId?: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await deps.jobs.get(jobId);
    if (job && (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled')) {
      return { status: job.status, resultVersionId: job.resultVersionId };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
