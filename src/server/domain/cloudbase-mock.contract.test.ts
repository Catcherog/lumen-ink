import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Project,
  Asset,
  Version,
  GenerationJob,
} from './persistence';
import { createCloudBaseMockPersistence } from '../infrastructure/persistence/cloudbase-mock.js';

/**
 * STORAGE-001 CloudBase mock adapter PoC tests.
 *
 * Validates the preferred candidate (Vercel Hobby + CloudBase PostgreSQL +
 * CloudBase PG Storage) against the frozen `PersistenceDependencies`
 * interface, plus PoC-only helpers for lease/heartbeat and idempotency.
 *
 * Required scenarios (per STORAGE-001 revision):
 *  1. repository CRUD with field mapping (camelCase ↔ snake_case)
 *  2. transaction failure produces no partial Version/Job success state
 *  3. private object signed URL adaptation
 *  4. project deletion cleans metadata and objects
 *  5. job lease expiry allows safe retry
 *  6. same idempotencyKey does not produce duplicate Version
 *
 * This file does NOT connect to CloudBase. It does not read credentials.
 * It does not migrate production Provider/Upload/Job/Version paths.
 */

describe('STORAGE-001 CloudBase mock adapter PoC', () => {
  let adapter: ReturnType<typeof createCloudBaseMockPersistence>;

  beforeEach(() => {
    adapter = createCloudBaseMockPersistence({
      signedUrlSecret: 'test-secret',
      signedUrlTtlSeconds: 900,
    });
  });

  // --- Scenario 1: Repository CRUD with field mapping ---------------------

  it('1. repository CRUD round-trips through camelCase ↔ snake_case field mapping', async () => {
    const fixed = new Date('2026-07-18T00:00:00Z');
    adapter.setFixedNow(fixed);
    const now = fixed.toISOString();
    const project: Project = {
      id: 'proj_cb_001',
      name: 'CloudBase PoC Project',
      createdAt: now,
      updatedAt: now,
      activeVersionId: 'ver_cb_v0',
      approvedVersionId: 'ver_cb_v0',
    };

    const asset: Asset = {
      id: 'asset_cb_001',
      projectId: project.id,
      storageKey: `projects/${project.id}/assets/asset_cb_001.png`,
      mimeType: 'image/png',
      sizeBytes: 12,
      createdAt: now,
    };

    const version: Version = {
      id: 'ver_cb_v0',
      projectId: project.id,
      assetId: asset.id,
      label: 'v0',
      createdAt: now,
    };

    const job: GenerationJob = {
      id: 'job_cb_001',
      projectId: project.id,
      prompt: 'synthetic prompt for CloudBase PoC',
      status: 'queued',
      providerId: 'seedream',
      model: 'doubao-seedream-4-5',
      createdAt: now,
      updatedAt: now,
    };

    // Create via frozen interface.
    await adapter.deps.projects.create(project);
    await adapter.deps.assets.create(asset);
    await adapter.deps.versions.create(version);
    await adapter.deps.jobs.create(job);
    await adapter.deps.authThrottle.put('auth-throttle:192.0.2.1', {
      failures: 2,
      windowStartedAt: now,
    });

    // Read via frozen interface — domain camelCase restored.
    const fetchedProject = await adapter.deps.projects.get(project.id);
    expect(fetchedProject).toEqual(project);
    const fetchedAsset = await adapter.deps.assets.get(asset.id);
    expect(fetchedAsset).toEqual(asset);
    const fetchedVersion = await adapter.deps.versions.get(version.id);
    expect(fetchedVersion).toEqual(version);
    const fetchedJob = await adapter.deps.jobs.get(job.id);
    expect(fetchedJob).toEqual(job);
    const fetchedThrottle = await adapter.deps.authThrottle.get(
      'auth-throttle:192.0.2.1'
    );
    expect(fetchedThrottle).toEqual({ failures: 2, windowStartedAt: now });

    // listByProject returns domain-typed entities.
    expect(await adapter.deps.assets.listByProject(project.id)).toEqual([asset]);
    expect(await adapter.deps.versions.listByProject(project.id)).toEqual([
      version,
    ]);
    expect(await adapter.deps.jobs.listActiveByProject(project.id)).toEqual([
      job,
    ]);

    // updatePointers persists pointer changes; advance time so updated_at
    // changes deterministically.
    const updatedTime = new Date('2026-07-18T00:00:05Z');
    adapter.setFixedNow(updatedTime);
    const updated = await adapter.deps.projects.updatePointers(project.id, {
      activeVersionId: version.id,
      approvedVersionId: undefined,
    });
    expect(updated.activeVersionId).toBe(version.id);
    expect(updated.approvedVersionId).toBe(version.id);
    expect(updated.updatedAt).toBe(updatedTime.toISOString());

    // PG-style rows expose snake_case columns.
    const rows = adapter.dumpPgStyleRows();
    expect(rows.projects[0]).toMatchObject({
      id: project.id,
      name: project.name,
      created_at: now,
      updated_at: updatedTime.toISOString(),
      active_version_id: version.id,
      approved_version_id: version.id,
    });
    expect(rows.assets[0]).toMatchObject({
      id: asset.id,
      project_id: project.id,
      storage_key: asset.storageKey,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes,
      created_at: now,
    });
    expect(rows.versions[0]).toMatchObject({
      id: version.id,
      project_id: project.id,
      asset_id: asset.id,
      label: version.label,
      created_at: now,
    });
    expect(rows.jobs[0]).toMatchObject({
      id: job.id,
      project_id: job.projectId,
      prompt: job.prompt,
      status: 'queued',
      provider_id: 'seedream',
      model: 'doubao-seedream-4-5',
      result_version_id: null,
      error: null,
      lease_expires_at: null,
    });
    expect(rows.authThrottle[0]).toMatchObject({
      key: 'auth-throttle:192.0.2.1',
      failures: 2,
      window_started_at: now,
    });
  });

  // --- Scenario 2: Transaction failure produces no partial success ---------

  it('2. UnitOfWork rolls back Version and Job — no partial success state visible', async () => {
    const now = '2026-07-18T00:00:00Z';
    const project: Project = {
      id: 'proj_cb_uow_002',
      name: 'UoW Rollback PoC',
      createdAt: now,
      updatedAt: now,
    };

    await adapter.deps.projects.create(project);

    // Attempt to create Version + Job in a transaction that throws mid-way.
    // The Version write succeeds locally, then we throw before Job write.
    await expect(
      adapter.deps.unitOfWork.run(async () => {
        await adapter.deps.versions.create({
          id: 'ver_cb_uow_partial',
          projectId: project.id,
          assetId: 'asset_cb_uow_partial',
          label: 'v-partial',
          createdAt: now,
        });
        throw new Error('synthetic rollback before Job create');
      })
    ).rejects.toThrow('synthetic rollback before Job create');

    // Neither Version nor Job should be visible after rollback.
    expect(
      await adapter.deps.versions.get('ver_cb_uow_partial')
    ).toBeNull();
    expect(
      await adapter.deps.versions.listByProject(project.id)
    ).toHaveLength(0);
    expect(
      await adapter.deps.jobs.listActiveByProject(project.id)
    ).toHaveLength(0);

    // Project (written BEFORE the transaction) must remain.
    expect(await adapter.deps.projects.get(project.id)).toEqual(project);
  });

  // --- Scenario 3: Private object signed URL adaptation -------------------

  it('3. ObjectStore emits private signed URLs with expiry and deterministic signature', async () => {
    const fixed = new Date('2026-07-18T12:00:00Z');
    adapter.setFixedNow(fixed);

    const key = 'projects/proj_cb_003/assets/asset_cb_003.png';
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    await adapter.deps.objects.put(key, bytes, 'image/png');

    expect(await adapter.deps.objects.exists(key)).toBe(true);

    const url = await adapter.deps.objects.getSignedUrl(key);
    expect(url.startsWith('https://cloudbase-mock.example.com/private/signed?'))
      .toBe(true);

    const parsed = new URL(url);
    expect(parsed.searchParams.get('bucket')).toBe('lumen-private-mock');
    expect(parsed.searchParams.get('key')).toBe(key);
    // TTL is 900s (15 min) per beforeEach.
    const expiresAt = Number(parsed.searchParams.get('expires'));
    expect(expiresAt).toBe(Math.floor(fixed.getTime() / 1000) + 900);
    // Signature is deterministic given (secret, key, expiry).
    const signature = parsed.searchParams.get('signature');
    expect(signature).toMatch(/^[0-9a-f]{8}$/);
    expect(signature?.length).toBe(8);

    // Two calls with the same fixed now return identical signatures.
    const url2 = await adapter.deps.objects.getSignedUrl(key);
    expect(url2).toBe(url);

    // Advancing time changes the expiry and the signature.
    adapter.setFixedNow(new Date('2026-07-18T12:10:00Z'));
    const url3 = await adapter.deps.objects.getSignedUrl(key);
    expect(url3).not.toBe(url);

    // Signed URL is still issued for missing keys (PoC allows placeholder).
    // Production adapter must enforce a stricter policy in PERSIST-001.
    const missingUrl = await adapter.deps.objects.getSignedUrl(
      'projects/unknown/missing.bin'
    );
    expect(typeof missingUrl).toBe('string');
    expect(missingUrl.length).toBeGreaterThan(0);
  });

  // --- Scenario 4: Project deletion cleans metadata and objects -----------

  it('4. deleteCascade removes project metadata, child entities, and object bytes', async () => {
    const now = '2026-07-18T00:00:00Z';
    const project: Project = {
      id: 'proj_cb_del_004',
      name: 'Cascade Delete PoC',
      createdAt: now,
      updatedAt: now,
    };
    const asset: Asset = {
      id: 'asset_cb_del_004',
      projectId: project.id,
      storageKey: `projects/${project.id}/assets/asset_cb_del_004.bin`,
      mimeType: 'image/png',
      sizeBytes: 4,
      createdAt: now,
    };
    const version: Version = {
      id: 'ver_cb_del_004',
      projectId: project.id,
      assetId: asset.id,
      label: 'v0',
      createdAt: now,
    };
    const job: GenerationJob = {
      id: 'job_cb_del_004',
      projectId: project.id,
      prompt: 'cascade delete PoC',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    await adapter.deps.projects.create(project);
    await adapter.deps.assets.create(asset);
    await adapter.deps.versions.create(version);
    await adapter.deps.jobs.create(job);

    const bytes = new Uint8Array([10, 20, 30, 40]);
    await adapter.deps.objects.put(asset.storageKey, bytes, asset.mimeType);
    expect(await adapter.deps.objects.exists(asset.storageKey)).toBe(true);

    await adapter.deps.projects.deleteCascade(project.id);

    expect(await adapter.deps.projects.get(project.id)).toBeNull();
    expect(
      await adapter.deps.assets.listByProject(project.id)
    ).toHaveLength(0);
    expect(
      await adapter.deps.versions.listByProject(project.id)
    ).toHaveLength(0);
    expect(await adapter.deps.jobs.get(job.id)).toBeNull();
    expect(await adapter.deps.objects.exists(asset.storageKey)).toBe(false);

    // PG-style rows must also be empty for the deleted project.
    const rows = adapter.dumpPgStyleRows();
    expect(rows.projects).toHaveLength(0);
    expect(rows.assets).toHaveLength(0);
    expect(rows.versions).toHaveLength(0);
    expect(rows.jobs).toHaveLength(0);
  });

  // --- Scenario 5: Job lease expiry allows safe retry ---------------------

  it('5. Job lease expires after TTL and allows safe retry by a second worker', async () => {
    const t0 = new Date('2026-07-18T12:00:00Z');
    adapter.setFixedNow(t0);

    const job: GenerationJob = {
      id: 'job_cb_lease_005',
      projectId: 'proj_cb_lease_005',
      prompt: 'lease retry PoC',
      status: 'running',
      createdAt: t0.toISOString(),
      updatedAt: t0.toISOString(),
    };
    await adapter.deps.jobs.create(job);

    // Worker A acquires a 30-second lease.
    const leaseA = await adapter.acquireJobLease(job.id, 30);
    expect(leaseA.acquired).toBe(true);
    expect(leaseA.currentHolder).not.toBeNull();

    // Worker B tries immediately — must fail because lease is still valid.
    const leaseB = await adapter.acquireJobLease(job.id, 30);
    expect(leaseB.acquired).toBe(false);
    expect(leaseB.currentHolder).toBe(leaseA.currentHolder);

    // Worker A heartbeats — lease extends.
    const tPlus10 = new Date('2026-07-18T12:00:10Z');
    const heartbeatOk = await adapter.heartbeatJobLease(job.id, 30, tPlus10);
    expect(heartbeatOk).toBe(true);
    const heartbeated = await adapter.deps.jobs.get(job.id);
    expect(heartbeated?.updatedAt).toBe(tPlus10.toISOString());

    // At t0+45s (past original lease but within heartbeat-extended window),
    // the heartbeat extension (tPlus10 + 30s = tPlus40) has also expired.
    const tPlus45 = new Date('2026-07-18T12:00:45Z');
    const expired = await adapter.listLeaseExpiredJobs(tPlus45);
    expect(expired.map((j) => j.id)).toContain(job.id);

    // Worker B can now safely acquire the lease again (retry).
    const leaseBRetry = await adapter.acquireJobLease(job.id, 30, tPlus45);
    expect(leaseBRetry.acquired).toBe(true);
    expect(leaseBRetry.currentHolder).not.toBe(leaseA.currentHolder);

    // Worker B explicitly releases the lease.
    const tPlus60 = new Date('2026-07-18T12:01:00Z');
    await adapter.releaseJobLease(job.id, tPlus60);
    const released = await adapter.deps.jobs.get(job.id);
    // PG row's lease_expires_at is null again.
    const rows = adapter.dumpPgStyleRows();
    expect(rows.jobs[0].lease_expires_at).toBeNull();
    expect(released?.updatedAt).toBe(tPlus60.toISOString());

    // A new worker can immediately acquire after release.
    const leaseC = await adapter.acquireJobLease(job.id, 30, tPlus60);
    expect(leaseC.acquired).toBe(true);
  });

  // --- Scenario 6: Idempotency key prevents duplicate Version -------------

  it('6. createVersionIdempotent returns the same Version for the same idempotencyKey', async () => {
    const now = '2026-07-18T00:00:00Z';
    const project: Project = {
      id: 'proj_cb_idem_006',
      name: 'Idempotency PoC',
      createdAt: now,
      updatedAt: now,
    };
    const asset: Asset = {
      id: 'asset_cb_idem_006',
      projectId: project.id,
      storageKey: `projects/${project.id}/assets/asset_cb_idem_006.png`,
      mimeType: 'image/png',
      sizeBytes: 8,
      createdAt: now,
    };
    await adapter.deps.projects.create(project);
    await adapter.deps.assets.create(asset);

    const idempotencyKey = 'retry-key-abc-001';
    const versionInput: Version = {
      id: 'ver_cb_idem_006',
      projectId: project.id,
      assetId: asset.id,
      label: 'v0',
      createdAt: now,
    };

    // First call creates the Version.
    const first = await adapter.createVersionIdempotent(
      project.id,
      idempotencyKey,
      versionInput
    );
    expect(first).toEqual(versionInput);

    // Second call with the SAME idempotencyKey returns the existing Version.
    const second = await adapter.createVersionIdempotent(
      project.id,
      idempotencyKey,
      // Caller passes a different Version.id, but the adapter must ignore it
      // and return the originally-created Version.
      { ...versionInput, id: 'ver_cb_idem_duplicate_attempt' }
    );
    expect(second).toEqual(versionInput);
    expect(second.id).toBe('ver_cb_idem_006');

    // No duplicate Version row was created.
    expect(await adapter.deps.versions.listByProject(project.id)).toHaveLength(
      1
    );

    // A different idempotencyKey creates a new Version.
    const third = await adapter.createVersionIdempotent(
      project.id,
      'retry-key-def-002',
      { ...versionInput, id: 'ver_cb_idem_007', label: 'v1' }
    );
    expect(third.id).toBe('ver_cb_idem_007');
    expect(await adapter.deps.versions.listByProject(project.id)).toHaveLength(
      2
    );

    // PG rows match — only one row for the first idempotencyKey.
    const rows = adapter.dumpPgStyleRows();
    expect(rows.versions.map((v) => v.id).sort()).toEqual([
      'ver_cb_idem_006',
      'ver_cb_idem_007',
    ]);
  });
});
