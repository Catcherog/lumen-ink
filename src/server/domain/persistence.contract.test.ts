import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type {
  PersistenceDependencies,
  Project,
  Asset,
  Version,
  GenerationJob,
} from './persistence';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';

/**
 * STORAGE-001 contract test.
 *
 * Proves the frozen persistence contract works for any adapter by exercising
 * the local adapter. PERSIST-001 will repeat this test against production
 * adapters without modifying the contract.
 *
 * Required assertion sequence from
 * INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 2 Step 1:
 *  - Create synthetic Project, original Asset, V0, queued Job, throttle bucket.
 *  - Construct a NEW adapter instance with the same temp directory.
 *  - Reload all five records.
 *  - Update the Job.
 *  - deleteCascade the Project.
 *  - Assert Project, Asset, Version, Job, and object bytes are absent.
 *  - Delete throttle bucket and assert it is absent.
 */

describe('STORAGE-001 persistence contract (local PoC)', () => {
  let tempRoot: string;
  let deps: PersistenceDependencies;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lumen-storage-contract-')
    );
    deps = createLocalPersistence({ rootDir: tempRoot });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('recovers records after adapter re-instantiation and cascades deletion', async () => {
    const now = new Date('2026-07-18T00:00:00Z').toISOString();

    const project: Project = {
      id: 'proj_synthetic_001',
      name: 'Synthetic PoC Project',
      createdAt: now,
      updatedAt: now,
    };

    const asset: Asset = {
      id: 'asset_original_001',
      projectId: project.id,
      storageKey: `projects/${project.id}/assets/asset_original_001.bin`,
      mimeType: 'image/png',
      sizeBytes: 12,
      createdAt: now,
    };

    const version: Version = {
      id: 'ver_v0_001',
      projectId: project.id,
      assetId: asset.id,
      label: 'v0',
      createdAt: now,
    };

    const job: GenerationJob = {
      id: 'job_queued_001',
      projectId: project.id,
      prompt: 'synthetic prompt for PoC',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    const throttleKey = 'auth-throttle:192.0.2.1';
    const throttleBucket = { failures: 3, windowStartedAt: now };

    // Step 1: persist everything through the first adapter instance.
    await deps.unitOfWork.run(async () => {
      await deps.projects.create(project);
      await deps.assets.create(asset);
      await deps.versions.create(version);
      await deps.jobs.create(job);
      await deps.authThrottle.put(throttleKey, throttleBucket);
    });

    const objectBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    await deps.objects.put(asset.storageKey, objectBytes, asset.mimeType);
    expect(await deps.objects.exists(asset.storageKey)).toBe(true);

    // Step 2: re-instantiate the adapter with the same root directory to prove
    // records are durable (not just held in memory).
    const reloaded = createLocalPersistence({ rootDir: tempRoot });

    // Step 3: required assertions from the plan.
    expect(await reloaded.projects.get(project.id)).not.toBeNull();
    expect(await reloaded.assets.listByProject(project.id)).toHaveLength(1);
    expect(await reloaded.versions.listByProject(project.id)).toHaveLength(1);
    expect(await reloaded.jobs.get(job.id)).toMatchObject({ status: 'queued' });

    // AuthThrottle record also survives re-instantiation.
    expect(await reloaded.authThrottle.get(throttleKey)).toMatchObject({
      failures: 3,
    });

    // Step 4: update the Job and observe the patched state.
    const running = await reloaded.jobs.update(job.id, {
      status: 'generating',
      updatedAt: new Date('2026-07-18T00:00:05Z').toISOString(),
    });
    expect(running.status).toBe('generating');
    expect((await reloaded.jobs.get(job.id))?.status).toBe('generating');

    // listActiveByProject must include active jobs but exclude terminal ones.
    const activeBefore = await reloaded.jobs.listActiveByProject(project.id);
    expect(activeBefore.map((j) => j.id)).toContain(job.id);

    await reloaded.jobs.update(job.id, { status: 'succeeded' });
    const activeAfter = await reloaded.jobs.listActiveByProject(project.id);
    expect(activeAfter.map((j) => j.id)).not.toContain(job.id);

    // updatePointers must persist active/approved version pointers.
    await reloaded.projects.updatePointers(project.id, {
      activeVersionId: version.id,
      approvedVersionId: version.id,
    });
    const projectAfterPointers = await reloaded.projects.get(project.id);
    expect(projectAfterPointers?.activeVersionId).toBe(version.id);
    expect(projectAfterPointers?.approvedVersionId).toBe(version.id);

    // Step 5: cascade delete must remove project, assets, versions, jobs, and
    // object bytes.
    await reloaded.projects.deleteCascade(project.id);

    expect(await reloaded.projects.get(project.id)).toBeNull();
    expect(await reloaded.assets.listByProject(project.id)).toHaveLength(0);
    expect(await reloaded.versions.listByProject(project.id)).toHaveLength(0);
    expect(await reloaded.jobs.get(job.id)).toBeNull();
    expect(await reloaded.objects.exists(asset.storageKey)).toBe(false);

    // Step 6: throttle bucket is independent of project cascade; delete and
    // assert absence.
    await reloaded.authThrottle.delete(throttleKey);
    expect(await reloaded.authThrottle.get(throttleKey)).toBeNull();
  });

  it('UnitOfWork rolls back on exception (no partial writes visible to a fresh instance)', async () => {
    const now = new Date('2026-07-18T00:00:00Z').toISOString();
    const project: Project = {
      id: 'proj_uow_rollback',
      name: 'UoW Rollback PoC',
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      deps.unitOfWork.run(async () => {
        await deps.projects.create(project);
        throw new Error('synthetic rollback');
      })
    ).rejects.toThrow('synthetic rollback');

    // A fresh adapter must not see the rolled-back project.
    const reloaded = createLocalPersistence({ rootDir: tempRoot });
    expect(await reloaded.projects.get(project.id)).toBeNull();
  });

  it('ObjectStore rejects reads of unknown keys without throwing unexpected errors', async () => {
    expect(await deps.objects.exists('projects/unknown/missing.bin')).toBe(false);
    await expect(deps.objects.delete('projects/unknown/missing.bin')).resolves.toBeUndefined();
    // Signed URL for missing key is allowed to be a deterministic placeholder;
    // the contract only requires the call to return a string.
    const url = await deps.objects.getSignedUrl('projects/unknown/missing.bin');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });
});
