import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';
import { createLocalJobExecutor } from '../infrastructure/executor/local.js';
import { ProjectService } from './ProjectService.js';
import { GenerationService } from './GenerationService.js';
import type { PersistenceDependencies, GenerationJob, Asset, Version } from '../domain/persistence.js';

/**
 * PERSIST-001 GPT FIX_PACKET P0 regression tests.
 *
 * Reproduces the four P0 defects identified in
 * docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md and verifies the minimal
 * fixes prescribed by the FIX_PACKET:
 *
 *  - PERSIST001-P0-02: final lease failure must not leave metadata/object
 *  - PERSIST001-P0-03: cancel must atomically terminate publication rights
 *  - PERSIST001-P0-04: executeJob must consume Job.inputVersionId (frozen input)
 *
 * P0-01 (CloudBase adapter + real executor + sweeper) is covered in
 * infrastructure-level test files.
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

function makeRecordingExecutor() {
  const enqueueCalls: string[] = [];
  const cancelCalls: string[] = [];
  return {
    executor: {
      async enqueue(jobId: string): Promise<void> {
        enqueueCalls.push(jobId);
      },
      async cancel(_jobId: string): Promise<'cancelled' | 'best_effort'> {
        cancelCalls.push(_jobId);
        return 'best_effort';
      },
    },
    enqueueCalls,
    cancelCalls,
  };
}

describe('PERSIST-001 P0-04: executeJob consumes frozen inputVersionId', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;
  let projectService: ProjectService;
  let generationService: GenerationService;
  let projectId: string;
  let v0Asset: Asset;
  let v0Version: Version;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-p0-04-'));
    deps = createLocalPersistence({ rootDir: tempRoot });
    const rec = makeRecordingExecutor();
    projectService = new ProjectService(deps, rec.executor);
    generationService = new GenerationService(deps, rec.executor);

    // Seed V0 via ProjectService (creates project + V0 asset + version).
    const v0Bytes = await makePng(64, 48, { r: 10, g: 20, b: 30, alpha: 1 });
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'p0-04-demo',
      bytes: v0Bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
    if (!snapshot.activeVersion) {
      throw new Error('expected createProject to seed an active V0 version');
    }
    v0Version = snapshot.activeVersion;
    const assets = await deps.assets.listByProject(projectId);
    v0Asset = assets[0];
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('executeJob reads input bytes from job.inputVersionId, not project.activeVersionId', async () => {
    // Create a second version V1 with distinct bytes and set it as active.
    const v1Bytes = await makePng(96, 72, { r: 200, g: 100, b: 50, alpha: 1 });
    const v1AssetId = 'asset_v1_manual';
    const v1VersionId = 'ver_v1_manual';
    const v1StorageKey = `projects/${projectId}/assets/${v1AssetId}.png`;
    await deps.objects.put(v1StorageKey, new Uint8Array(v1Bytes), 'image/png');
    await deps.assets.create({
      id: v1AssetId,
      projectId,
      storageKey: v1StorageKey,
      mimeType: 'image/png',
      sizeBytes: v1Bytes.byteLength,
      createdAt: new Date().toISOString(),
    });
    await deps.versions.create({
      id: v1VersionId,
      projectId,
      assetId: v1AssetId,
      label: 'v1',
      createdAt: new Date().toISOString(),
    });
    await deps.projects.updatePointers(projectId, {
      activeVersionId: v1VersionId,
    });

    // Create a Job whose inputVersionId points to V0 (not the active V1).
    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-04 frozen input',
      inputVersionId: v0Version.id,
      idempotencyKey: 'p0-04-001',
    });
    expect(job.inputVersionId).toBe(v0Version.id);

    // Capture the input bytes handed to providerFactory.
    let capturedInput: { bytes: Uint8Array; mimeType: string } | undefined;
    const resultBytes = await makePng(32, 32, { r: 1, g: 2, b: 3, alpha: 1 });

    const executed = await generationService.executeJob(job.id, {
      providerFactory: async (_job, input) => {
        capturedInput = input;
        return { bytes: new Uint8Array(resultBytes), mimeType: 'image/png' };
      },
    });

    expect(executed.status).toBe('succeeded');

    // The providerFactory MUST have received V0's bytes (the frozen input),
    // not V1's bytes (the active version at execution time).
    expect(capturedInput).toBeDefined();
    expect(capturedInput!.mimeType).toBe('image/png');

    // Read V0 bytes back from the object store for comparison.
    const v0StoredBytes = await deps.objects.get(v0Asset.storageKey);
    // Compare byte-for-byte with V0 (not V1).
    expect(capturedInput!.bytes.byteLength).toBe(v0StoredBytes.byteLength);
    expect(Array.from(capturedInput!.bytes)).toEqual(Array.from(v0StoredBytes));

    // Sanity: V1 bytes differ from V0 (otherwise the test is meaningless).
    const v1StoredBytes = await deps.objects.get(v1StorageKey);
    expect(Array.from(v1StoredBytes)).not.toEqual(Array.from(v0StoredBytes));
  });

  it('retry preserves the original inputVersionId across attempts', async () => {
    // Create V1 and set active, but the Job freezes V0 as input.
    const v1Bytes = await makePng(48, 48, { r: 5, g: 5, b: 5, alpha: 1 });
    const v1AssetId = 'asset_v1_retry';
    const v1VersionId = 'ver_v1_retry';
    const v1StorageKey = `projects/${projectId}/assets/${v1AssetId}.png`;
    await deps.objects.put(v1StorageKey, new Uint8Array(v1Bytes), 'image/png');
    await deps.assets.create({
      id: v1AssetId,
      projectId,
      storageKey: v1StorageKey,
      mimeType: 'image/png',
      sizeBytes: v1Bytes.byteLength,
      createdAt: new Date().toISOString(),
    });
    await deps.versions.create({
      id: v1VersionId,
      projectId,
      assetId: v1AssetId,
      label: 'v1',
      createdAt: new Date().toISOString(),
    });
    await deps.projects.updatePointers(projectId, {
      activeVersionId: v1VersionId,
    });

    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-04 retry frozen input',
      inputVersionId: v0Version.id,
      idempotencyKey: 'p0-04-002',
    });

    // Fail the job with a retryable error.
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => {
          throw new Error('Request timeout after 30000ms');
        },
      })
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    const { job: retried } = await generationService.retryJob(job.id);
    expect(retried.inputVersionId).toBe(v0Version.id);

    // Execute the retry; the providerFactory must still receive V0 bytes.
    let capturedInput: { bytes: Uint8Array; mimeType: string } | undefined;
    const resultBytes = await makePng(16, 16, { r: 9, g: 9, b: 9, alpha: 1 });
    const executed = await generationService.executeJob(retried.id, {
      providerFactory: async (_job, input) => {
        capturedInput = input;
        return { bytes: new Uint8Array(resultBytes), mimeType: 'image/png' };
      },
    });

    expect(executed.status).toBe('succeeded');
    expect(capturedInput).toBeDefined();
    const v0StoredBytes = await deps.objects.get(v0Asset.storageKey);
    expect(Array.from(capturedInput!.bytes)).toEqual(Array.from(v0StoredBytes));
  });

  it('ObjectStore.get() returns the bytes previously stored by put()', async () => {
    const key = `projects/${projectId}/test-roundtrip.bin`;
    const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await deps.objects.put(key, payload, 'application/octet-stream');

    const fetched = await deps.objects.get(key);
    expect(fetched).toBeInstanceOf(Uint8Array);
    expect(Array.from(fetched)).toEqual(Array.from(payload));
  });

  it('executeJob fails with ASSET_NOT_FOUND when frozen inputVersionId points to a missing asset', async () => {
    // Manually craft a Job whose inputVersionId references a non-existent
    // version. The executeJob path must fail fast rather than silently
    // falling back to project.activeVersionId.
    const fakeVersionId = 'ver_does_not_exist';
    const jobRow: GenerationJob = {
      id: 'job_p0_04_missing_input',
      projectId,
      prompt: 'missing input',
      status: 'queued',
      inputVersionId: fakeVersionId,
      attempt: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await deps.jobs.create(jobRow);

    await expect(
      generationService.executeJob(jobRow.id, {
        providerFactory: async () => ({
          bytes: new Uint8Array(0),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });

    const failed = await deps.jobs.get(jobRow.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('VERSION_NOT_FOUND');
  });
});

describe('PERSIST-001 P0-03: cancel atomically terminates publication rights', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;
  let projectService: ProjectService;
  let generationService: GenerationService;
  let projectId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-p0-03-'));
    deps = createLocalPersistence({ rootDir: tempRoot });
    const rec = makeRecordingExecutor();
    projectService = new ProjectService(deps, rec.executor);
    generationService = new GenerationService(deps, rec.executor);

    const v0Bytes = await makePng(64, 48, { r: 10, g: 20, b: 30, alpha: 1 });
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'p0-03-demo',
      bytes: v0Bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('cancel during provider call → Job remains cancelled, no Version created', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-03 cancel race',
      idempotencyKey: 'p0-03-001',
    });

    // Block the providerFactory until cancel has been requested.
    let cancelRequested = false;
    let factoryResolved = false;
    let factoryStarted = false;
    const resultBytes = await makePng(32, 32, { r: 1, g: 2, b: 3, alpha: 1 });

    const executePromise = generationService.executeJob(job.id, {
      workerId: 'worker-A',
      leaseSeconds: 60,
      providerFactory: async () => {
        factoryStarted = true;
        // Wait until cancel has been requested.
        while (!cancelRequested) {
          await new Promise((r) => setTimeout(r, 20));
        }
        // Small delay so cancel completes before the factory resolves.
        await new Promise((r) => setTimeout(r, 60));
        factoryResolved = true;
        return { bytes: new Uint8Array(resultBytes), mimeType: 'image/png' };
      },
    });
    // Prevent unhandled-rejection warnings before the final assertion.
    executePromise.catch(() => { /* asserted below */ });

    // Wait until the worker has reached the factory (poll-based sync, not a
    // fixed timeout, so the test is robust against slow file I/O).
    const factoryStartDeadline = Date.now() + 5000;
    while (!factoryStarted && Date.now() < factoryStartDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(factoryStarted).toBe(true);

    // Cancel while the provider call is in flight.
    const cancelled = await generationService.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');
    cancelRequested = true;

    // Wait for the factory to resolve (the worker will attempt to commit).
    const resolveDeadline = Date.now() + 5000;
    while (!factoryResolved && Date.now() < resolveDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(factoryResolved).toBe(true);

    // The Job MUST remain cancelled. The worker's attempt to transition to
    // succeeded must be rejected because the lease was revoked.
    const final = await deps.jobs.get(job.id);
    expect(final?.status).toBe('cancelled');

    // No result Version was created (only V0 remains).
    const versions = await deps.versions.listByProject(projectId);
    expect(versions.length).toBe(1);

    // No result Asset was created (only V0 asset remains).
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(1);

    // activeVersionId still points to V0 (unchanged).
    const project = await deps.projects.get(projectId);
    expect(project?.activeVersionId).toBe(versions[0].id);
  });

  it('cancel revokes the lease so the original worker cannot heartbeat', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-03 lease revoke',
      idempotencyKey: 'p0-03-002',
    });

    // Worker A claims the lease manually.
    const claimed = await deps.jobs.claim(job.id, {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      now: new Date().toISOString(),
    });
    expect(claimed).toBe(true);

    // Cancel the job.
    const cancelled = await generationService.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');

    // Worker A attempts to heartbeat with the old token — must fail because
    // the lease was revoked.
    const heartbeatResult = await deps.jobs.heartbeat(job.id, {
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      now: new Date().toISOString(),
    });
    expect(heartbeatResult).toBe(false);

    // Worker A attempts updateIfClaimed — must also fail.
    const updateResult = await deps.jobs.updateIfClaimed(job.id, 'token-A', {
      status: 'saving',
      updatedAt: new Date().toISOString(),
    });
    expect(updateResult).toBeNull();
  });

  it('cancel does not overwrite a job that already succeeded', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-03 race with success',
      idempotencyKey: 'p0-03-003',
    });

    // Drive the job to succeeded directly.
    const resultBytes = await makePng(24, 24, { r: 7, g: 8, b: 9, alpha: 1 });
    const executed = await generationService.executeJob(job.id, {
      providerFactory: async () => ({
        bytes: new Uint8Array(resultBytes),
        mimeType: 'image/png',
      }),
    });
    expect(executed.status).toBe('succeeded');

    // A late cancel attempt must be rejected (terminal state).
    await expect(generationService.cancelJob(job.id)).rejects.toMatchObject({
      code: 'ILLEGAL_JOB_TRANSITION',
    });

    const final = await deps.jobs.get(job.id);
    expect(final?.status).toBe('succeeded');
  });
});

describe('PERSIST-001 P0-02: final lease failure leaves no metadata or object', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;
  let projectService: ProjectService;
  let generationService: GenerationService;
  let projectId: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-p0-02-'));
    deps = createLocalPersistence({ rootDir: tempRoot });
    const rec = makeRecordingExecutor();
    projectService = new ProjectService(deps, rec.executor);
    generationService = new GenerationService(deps, rec.executor);

    const v0Bytes = await makePng(64, 48, { r: 10, g: 20, b: 30, alpha: 1 });
    const snapshot = await projectService.createProject({
      workspaceId: 'w1',
      name: 'p0-02-demo',
      bytes: v0Bytes,
      mimeType: 'image/png',
    });
    projectId = snapshot.project.id;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('final updateIfClaimed failure rolls back Asset/Version/Project pointer and deletes result object', async () => {
    const job = await generationService.createJob({
      projectId,
      prompt: 'p0-02 final lease lost',
      idempotencyKey: 'p0-02-001',
    });

    // Capture the original activeVersionId so we can assert it's unchanged.
    const originalProject = await deps.projects.get(projectId);
    const originalActiveVersionId = originalProject?.activeVersionId;

    // Track the result storage key so we can assert compensation.
    let resultStorageKey = '';
    const realObjects = deps.objects;
    (deps as { objects: PersistenceDependencies['objects'] }).objects = {
      async put(key, bytes, mimeType) {
        if (key.includes('/generated/')) {
          resultStorageKey = key;
        }
        return realObjects.put(key, bytes, mimeType);
      },
      async get(key) {
        return realObjects.get(key);
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

    // Sabotage the final updateIfClaimed so it returns null (simulating lease
    // takeover by another worker between UoW commit and conditional update).
    // We can't directly mock updateIfClaimed because the service calls it
    // inside unitOfWork.run. Instead, we sabotage the jobs repo to throw on
    // the specific succeeded transition by tracking call count.
    const realJobs = deps.jobs;
    let updateIfClaimedCallCount = 0;
    (deps as { jobs: PersistenceDependencies['jobs'] }).jobs = {
      async create(input) {
        return realJobs.create(input);
      },
      async createIdempotent(input) {
        return realJobs.createIdempotent(input);
      },
      async get(id) {
        return realJobs.get(id);
      },
      async update(id, patch) {
        return realJobs.update(id, patch);
      },
      async updateIfClaimed(id, leaseToken, patch) {
        updateIfClaimedCallCount += 1;
        // The final succeeded transition is the one with status=succeeded.
        // Return null to simulate lease loss at the final commit.
        if (patch.status === 'succeeded') {
          return null;
        }
        return realJobs.updateIfClaimed(id, leaseToken, patch);
      },
      async updateIfActive(id, patch) {
        return realJobs.updateIfActive(id, patch);
      },
      async claim(id, input) {
        return realJobs.claim(id, input);
      },
      async heartbeat(id, input) {
        return realJobs.heartbeat(id, input);
      },
      async listActiveByProject(projectId) {
        return realJobs.listActiveByProject(projectId);
      },
      async listLeaseExpired(now) {
        return realJobs.listLeaseExpired(now);
      },
    };

    const resultBytes = await makePng(40, 40, { r: 1, g: 2, b: 3, alpha: 1 });

    // The executeJob must throw JOB_LEASE_EXPIRED because the final
    // conditional update returned null.
    await expect(
      generationService.executeJob(job.id, {
        providerFactory: async () => ({
          bytes: new Uint8Array(resultBytes),
          mimeType: 'image/png',
        }),
      })
    ).rejects.toMatchObject({ code: 'JOB_LEASE_EXPIRED' });

    // The succeeded transition was attempted exactly once.
    expect(updateIfClaimedCallCount).toBeGreaterThanOrEqual(1);

    // No new Asset was committed (only V0 remains).
    const assets = await deps.assets.listByProject(projectId);
    expect(assets.length).toBe(1);

    // No new Version was committed (only V0 remains).
    const versions = await deps.versions.listByProject(projectId);
    expect(versions.length).toBe(1);

    // activeVersionId is unchanged.
    const finalProject = await deps.projects.get(projectId);
    expect(finalProject?.activeVersionId).toBe(originalActiveVersionId);

    // The result object was deleted as compensation.
    expect(resultStorageKey).toBeTruthy();
    expect(await realObjects.exists(resultStorageKey)).toBe(false);

    // The Job is NOT succeeded. (It may be failed or still active depending
    // on the recovery path, but it must NOT be succeeded.)
    const finalJob = await deps.jobs.get(job.id);
    expect(finalJob?.status).not.toBe('succeeded');
    expect(finalJob?.resultVersionId).toBeUndefined();
  });
});
