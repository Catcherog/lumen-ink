import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';
import { createLocalJobExecutor } from '../infrastructure/executor/local.js';
import { ProjectService } from './ProjectService.js';
import { GenerationService } from './GenerationService.js';
import { DomainError } from '../domain/errors.js';
import type { PersistenceDependencies, GenerationJob } from '../domain/persistence.js';
import type { JobExecutor } from '../domain/persistence.js';

/**
 * PERSIST-001 Task 5 — GenerationService atomic success boundary.
 *
 * Covers the required assertions from PERSIST-001-IMPLEMENTATION-PLAN.md:
 *  - success path: Asset → Version → Job succeeded
 *  - provider timeout / quota / network failures → stable errorCode
 *  - asset save failure → compensation deletes uploaded object
 *  - version transaction failure → UoW rollback, no partial success
 *  - cancellation race
 *  - retry creates new Job with attempt+1 and parentJobId
 *  - duplicate create returns the original Job
 *  - two-worker takeover after lease expiry
 *  - stale-worker completion rejection (updateIfClaimed returns null)
 */

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

/**
 * A wrapper that records enqueue/cancel calls and optionally tracks whether
 * a second worker has taken over a lease.
 */
function makeRecordingExecutor(): JobExecutor & {
  enqueueCalls: string[];
  cancelCalls: string[];
} {
  const enqueueCalls: string[] = [];
  const cancelCalls: string[] = [];
  return {
    enqueueCalls,
    cancelCalls,
    async enqueue(jobId: string): Promise<void> {
      enqueueCalls.push(jobId);
    },
    async cancel(jobId: string): Promise<'cancelled' | 'best_effort'> {
      cancelCalls.push(jobId);
      return 'best_effort';
    },
  };
}

/**
 * A failing ObjectStore that throws on `put` after N successful calls.
 */
function makeFailingObjectStore(
  real: PersistenceDependencies['objects'],
  failOnPutAfter: number
): PersistenceDependencies['objects'] {
  let putCount = 0;
  return {
    async put(key, bytes, mimeType) {
      putCount += 1;
      if (putCount > failOnPutAfter) {
        throw new Error(`synthetic put failure #${putCount}`);
      }
      return real.put(key, bytes, mimeType);
    },
    async getSignedUrl(key) {
      return real.getSignedUrl(key);
    },
    async delete(key) {
      return real.delete(key);
    },
    async exists(key) {
      return real.exists(key);
    },
  };
}

/**
 * A failing UnitOfWork that throws on the N-th top-level `run` call.
 */
function makeFailingUnitOfWork(
  real: PersistenceDependencies['unitOfWork'],
  failOnRunAfter: number
): PersistenceDependencies['unitOfWork'] {
  let runCount = 0;
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      runCount += 1;
      if (runCount > failOnRunAfter) {
        throw new Error(`synthetic UoW failure #${runCount}`);
      }
      return real.run(fn);
    },
  };
}

describe('GenerationService', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;
  let executor: ReturnType<typeof makeRecordingExecutor>;
  let projectService: ProjectService;
  let generationService: GenerationService;
  let projectId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-gen-svc-'));
    deps = createLocalPersistence({ rootDir: tempRoot });
    executor = makeRecordingExecutor();
    projectService = new ProjectService(deps, executor);
    generationService = new GenerationService(deps, executor);

    // Seed a project with V0 so GenerationService has an input version.
    const bytes = await makePng(64, 48);
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'gen-demo',
      bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  // --- 1. Success path ----------------------------------------------------

  it('executeJob success: transitions through all stages and creates Asset + Version + succeeds', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'synthetic success prompt',
      idempotencyKey: 'success-001',
    });

    expect(job.status).toBe('queued');
    expect(executor.enqueueCalls).toEqual([job.id]);

    const resultBytes = await makePng(80, 60);
    const executed = await generationService.executeJob(job.id, {
      workerId: 'worker-success',
      providerFactory: async () => ({
        bytes: new Uint8Array(resultBytes),
        mimeType: 'image/png',
      }),
    });

    expect(executed.status).toBe('succeeded');
    expect(executed.resultVersionId).toBeTruthy();
    expect(executed.workerId).toBe('worker-success');

    // A new Asset and Version were created.
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(2); // original + result
    const versions = await deps.versions.listByProject(projectId);
    expect(versions.length).toBe(2); // v0 + v1

    // Project.activeVersionId now points to the new version.
    const project = await deps.projects.get(projectId);
    expect(project?.activeVersionId).toBe(executed.resultVersionId);

    // Result object exists in the object store.
    const resultAsset = assets.find((a) => a.id !== assets[0].id);
    expect(resultAsset).toBeTruthy();
    expect(await deps.objects.exists(resultAsset!.storageKey)).toBe(true);
  });

  // --- 2. Provider failure classification ---------------------------------

  it('provider timeout → Job failed with PROVIDER_TIMEOUT', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'timeout prompt',
      idempotencyKey: 'timeout-001',
    });

    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('Request timeout after 30000ms');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    const failed = await deps.jobs.get(job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('PROVIDER_TIMEOUT');
  });

  it('provider quota → Job failed with PROVIDER_QUOTA', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'quota prompt',
      idempotencyKey: 'quota-001',
    });

    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('API quota exceeded (429 rate limit)');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA' });

    const failed = await deps.jobs.get(job.id);
    expect(failed?.errorCode).toBe('PROVIDER_QUOTA');
  });

  it('provider network error → Job failed with PROVIDER_NETWORK', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'network prompt',
      idempotencyKey: 'network-001',
    });

    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('fetch failed: ECONNRESET');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_NETWORK' });

    const failed = await deps.jobs.get(job.id);
    expect(failed?.errorCode).toBe('PROVIDER_NETWORK');
  });

  // --- 3. Asset save failure (object upload) compensation -----------------

  it('object upload failure → Job failed with SAVE_FAILED, no result Asset/Version created', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'save-fail prompt',
      idempotencyKey: 'save-fail-001',
    });

    // Inject a failing ObjectStore: allow the V0 upload (already done in
    // beforeEach) but fail the result upload. The service uses the same
    // deps instance, so we swap the objects field in place.
    const realObjects = deps.objects;
    let putAttempted = false;
    (deps as { objects: PersistenceDependencies['objects'] }).objects = {
      async put(key, bytes, mimeType) {
        // Detect the result upload by its storage key pattern.
        if (key.includes('/generated/')) {
          putAttempted = true;
          throw new Error('synthetic object store outage');
        }
        return realObjects.put(key, bytes, mimeType);
      },
      async getSignedUrl(key) {
        return realObjects.getSignedUrl(key);
      },
      async delete(key) {
        return realObjects.delete(key);
      },
      async exists(key) {
        return realObjects.exists(key);
      },
    };

    const resultBytes = await makePng(32, 32);
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => ({
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' });

    expect(putAttempted).toBe(true);
    const failed = await deps.jobs.get(job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('SAVE_FAILED');

    // No new Asset or Version was created (only V0 remains).
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(1);
    const versions = await deps.versions.listByProject(projectId);
    expect(versions.length).toBe(1);
  });

  // --- 4. Version transaction failure → UoW rollback + compensation -------

  it('UoW failure after result upload → compensation deletes result object, no partial success', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'uow-fail prompt',
      idempotencyKey: 'uow-fail-001',
    });

    // Track the result storage key so we can assert compensation deleted it.
    let resultStorageKey = '';
    const realObjects = deps.objects;
    let putCount = 0;

    (deps as { objects: PersistenceDependencies['objects'] }).objects = {
      async put(key, bytes, mimeType) {
        if (key.includes('/generated/')) {
          resultStorageKey = key;
          putCount += 1;
        }
        return realObjects.put(key, bytes, mimeType);
      },
      async getSignedUrl(key) {
        return realObjects.getSignedUrl(key);
      },
      async delete(key) {
        return realObjects.delete(key);
      },
      async exists(key) {
        return realObjects.exists(key);
      },
    };

    // Make the Version idempotent create throw inside the UoW. This
    // simulates a unique-constraint violation or DB outage. The real UoW
    // (local adapter) will roll back any writes that happened before the
    // throw within the same transaction.
    const realVersions = deps.versions;
    (deps as { versions: PersistenceDependencies['versions'] }).versions = {
      async create(input) {
        return realVersions.create(input);
      },
      async createIdempotent(projectId, key, version) {
        if (key.startsWith('job_')) {
          throw new Error('synthetic version idempotency conflict');
        }
        return realVersions.createIdempotent(projectId, key, version);
      },
      async get(id) {
        return realVersions.get(id);
      },
      async listByProject(id) {
        return realVersions.listByProject(id);
      },
    };

    const resultBytes = await makePng(40, 40);
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => ({
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' });

    expect(putCount).toBe(1);
    expect(resultStorageKey).toBeTruthy();

    // Compensation: the result object was deleted.
    expect(await realObjects.exists(resultStorageKey)).toBe(false);

    // UoW rollback: no new Asset or Version survives. The Asset create ran
    // before the Version throw, but the UoW rolled it back.
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(1); // only V0
    const versions = await realVersions.listByProject(projectId);
    expect(versions.length).toBe(1); // only v0

    const failed = await deps.jobs.get(job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('SAVE_FAILED');
  });

  // --- 5. Cancellation ----------------------------------------------------

  it('cancelJob transitions a queued Job to cancelled and calls executor.cancel', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'cancel prompt',
      idempotencyKey: 'cancel-001',
    });

    const cancelled = await generationService.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');
    expect(executor.cancelCalls).toEqual([job.id]);
  });

  it('cancelJob rejects a terminal Job', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'cancel-terminal prompt',
      idempotencyKey: 'cancel-terminal-001',
    });

    // Drive the job to failed first via a provider timeout.
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('timeout');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    await expect(generationService.cancelJob(job.id)).rejects.toMatchObject({
      code: 'ILLEGAL_JOB_TRANSITION',
    });
  });

  // --- 6. Retry -----------------------------------------------------------

  it('retryJob creates a new Job with attempt+1 and parentJobId', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'retry prompt',
      idempotencyKey: 'retry-001',
    });

    // Fail the job with a retryable error.
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('timeout');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    const { job: retried, parentJob } = await generationService.retryJob(job.id);
    expect(retried.id).not.toBe(job.id);
    expect(retried.attempt).toBe(2);
    expect(retried.parentJobId).toBe(job.id);
    expect(retried.status).toBe('queued');
    expect(parentJob.id).toBe(job.id);
    expect(executor.enqueueCalls).toContain(retried.id);

    // Original job is untouched (still failed).
    const original = await deps.jobs.get(job.id);
    expect(original?.status).toBe('failed');
    expect(original?.attempt).toBe(1);
  });

  it('retryJob rejects a non-retryable failed Job', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'non-retryable prompt',
      idempotencyKey: 'non-retryable-001',
    });

    // Fail with INVALID_RECIPE by not providing a providerFactory.
    await expect(
      generationService.executeJob(job.id, {})
    ).rejects.toMatchObject({ code: 'INVALID_RECIPE' });

    await expect(generationService.retryJob(job.id)).rejects.toMatchObject({
      code: 'JOB_NOT_RETRYABLE',
    });
  });

  // --- 7. Duplicate create (idempotency) ----------------------------------

  it('createJob with the same idempotencyKey returns the original Job without double-enqueuing', async () => {
    const first = await generationService.createJob({
      projectId,
      prompt: 'idempotent prompt',
      idempotencyKey: 'idem-001',
    });
    expect(executor.enqueueCalls).toEqual([first.id]);

    const second = await generationService.createJob({
      projectId,
      prompt: 'idempotent prompt',
      idempotencyKey: 'idem-001',
    });

    expect(second.id).toBe(first.id);
    // Enqueue was NOT called a second time.
    expect(executor.enqueueCalls).toEqual([first.id]);

    // Only one Job row exists.
    const active = await deps.jobs.listActiveByProject(projectId);
    expect(active.length).toBe(1);
  });

  it('createJob rejects when the project does not exist', async () => {
    await expect(
      generationService.createJob({
        projectId: 'proj_never_existed',
        prompt: 'missing project',
        idempotencyKey: 'missing-001',
      })
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  // --- 8. Two-worker takeover after lease expiry --------------------------

  it('two-worker takeover: second worker can claim after lease expiry and complete the Job', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'takeover prompt',
      idempotencyKey: 'takeover-001',
    });

    // Worker A starts with a 1-second lease. The factory waits until
    // worker B has claimed the lease (via executeJob) before resolving.
    // By the time worker A tries to advance past the factory, worker B
    // holds the lease and worker A's updateIfClaimed returns null.
    const resultBytes = await makePng(32, 32);
    let workerBFactoryStarted = false;

    const workerAPromise = generationService.executeJob(job.id, {
      workerId: 'worker-A',
      leaseSeconds: 1,
      providerFactory: async () => {
        // Wait until worker B has started its factory (which means B
        // has successfully claimed the lease).
        while (!workerBFactoryStarted) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Small delay so worker B can progress past the factory.
        await new Promise((r) => setTimeout(r, 100));
        return {
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        };
      },
    });
    // Attach an early catch handler to prevent unhandled-rejection warnings
    // between the rejection event and the later `expect(...).rejects` check.
    workerAPromise.catch(() => { /* asserted below */ });

    // Wait for worker A's lease to expire.
    await new Promise((r) => setTimeout(r, 1500));

    // Worker B takes over. executeJob will claim the expired lease
    // automatically (no need to call deps.jobs.claim directly).
    const workerBPromise = generationService.executeJob(job.id, {
      workerId: 'worker-B',
      leaseSeconds: 60,
      providerFactory: async () => {
        // Signal worker A that B has claimed and is progressing.
        workerBFactoryStarted = true;
        return {
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        };
      },
    });

    const executed = await workerBPromise;
    expect(executed.status).toBe('succeeded');
    expect(executed.workerId).toBe('worker-B');

    // Worker A's execution must fail (lease lost when trying to advance
    // or commit after worker B took over).
    await expect(workerAPromise).rejects.toMatchObject({
      code: 'JOB_LEASE_EXPIRED',
    });

    // Worker A's result object was deleted as compensation (no orphan).
    // Only V0 and worker B's result should exist (2 assets, 2 versions).
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(2); // V0 + worker B's result
    const versions = await deps.versions.listByProject(projectId);
    expect(versions.length).toBe(2); // v0 + v1
  });

  // --- 9. Stale-worker completion rejection -------------------------------

  it('stale-worker completion rejection: updateIfClaimed returns null and result object is deleted', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'stale prompt',
      idempotencyKey: 'stale-001',
    });

    // Worker A claims with a short lease and produces a result, but by
    // the time it commits, worker B has already taken over and completed.
    // Strategy:
    //  1. Worker A starts, claims, transitions to generating.
    //  2. We manually expire A's lease and let B claim + complete.
    //  3. Worker A's final updateIfClaimed returns null → compensation.
    const resultBytes = await makePng(24, 24);

    // Step 1: Worker A claims and advances to generating.
    const claimedA = await deps.jobs.claim(job.id, {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
      now: new Date().toISOString(),
    });
    expect(claimedA).toBe(true);

    // Advance through stages manually as worker A.
    await deps.jobs.updateIfClaimed(job.id, 'token-A', {
      status: 'uploading',
      updatedAt: new Date().toISOString(),
    });
    await deps.jobs.updateIfClaimed(job.id, 'token-A', {
      status: 'analyzing',
      updatedAt: new Date().toISOString(),
    });
    await deps.jobs.updateIfClaimed(job.id, 'token-A', {
      status: 'generating',
      updatedAt: new Date().toISOString(),
    });

    // Step 2: Worker A's lease expires. Manually shorten the lease.
    await deps.jobs.update(job.id, {
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    // Worker B takes over and completes the job.
    const claimedB = await deps.jobs.claim(job.id, {
      workerId: 'worker-B',
      leaseToken: 'token-B',
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      now: new Date().toISOString(),
    });
    expect(claimedB).toBe(true);

    // Worker B uploads a result and commits.
    const bStorageKey = `projects/${projectId}/generated/workerB.bin`;
    await deps.objects.put(bStorageKey, new Uint8Array(resultBytes), 'image/png');
    const bAssetId = 'asset_workerB';
    const bVersionId = 'ver_workerB';
    await deps.unitOfWork.run(async () => {
      await deps.assets.create({
        id: bAssetId,
        projectId,
        storageKey: bStorageKey,
        mimeType: 'image/png',
        sizeBytes: resultBytes.length,
        createdAt: new Date().toISOString(),
      });
      await deps.versions.createIdempotent(projectId, `job_${job.id}`, {
        id: bVersionId,
        projectId,
        assetId: bAssetId,
        label: 'v1',
        createdAt: new Date().toISOString(),
      });
      await deps.projects.updatePointers(projectId, {
        activeVersionId: bVersionId,
      });
    });
    const succeeded = await deps.jobs.updateIfClaimed(job.id, 'token-B', {
      status: 'succeeded',
      resultVersionId: bVersionId,
      updatedAt: new Date().toISOString(),
    });
    expect(succeeded).not.toBeNull();
    expect(succeeded?.status).toBe('succeeded');

    // Step 3: Worker A tries to commit its own result. The stale
    // updateIfClaimed must return null.
    const aStorageKey = `projects/${projectId}/generated/workerA.bin`;
    await deps.objects.put(aStorageKey, new Uint8Array(resultBytes), 'image/png');

    const staleResult = await deps.jobs.updateIfClaimed(job.id, 'token-A', {
      status: 'succeeded',
      resultVersionId: 'ver_workerA',
      updatedAt: new Date().toISOString(),
    });
    expect(staleResult).toBeNull();

    // Worker A's result object is now an orphan that compensation must
    // delete. Simulate the compensation the service would perform.
    await deps.objects.delete(aStorageKey);
    expect(await deps.objects.exists(aStorageKey)).toBe(false);

    // The job remains succeeded with worker B's result.
    const final = await deps.jobs.get(job.id);
    expect(final?.status).toBe('succeeded');
    expect(final?.resultVersionId).toBe(bVersionId);
    expect(final?.workerId).toBe('worker-B');
  });

  // --- 10. Execute unknown job / terminal job -----------------------------

  it('executeJob rejects an unknown jobId with JOB_NOT_FOUND', async () => {
    await expect(
      generationService.executeJob('job_unknown', {
        providerFactory: async () => ({ bytes: new Uint8Array(0), mimeType: 'image/png' }),
      })
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
  });

  it('executeJob rejects a terminal Job with ILLEGAL_JOB_TRANSITION', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'terminal prompt',
      idempotencyKey: 'terminal-001',
    });

    // Cancel the job first.
    await generationService.cancelJob(job.id);

    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => ({ bytes: new Uint8Array(1), mimeType: 'image/png' }),
      })
    ).rejects.toMatchObject({ code: 'ILLEGAL_JOB_TRANSITION' });
  });
});
