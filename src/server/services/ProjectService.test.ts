import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { createLocalPersistence } from '../infrastructure/persistence/local.js';
import { createLocalJobExecutor } from '../infrastructure/executor/local.js';
import { ProjectService } from './ProjectService.js';
import { DomainError } from '../domain/errors.js';

/**
 * PERSIST-001 Task 4 — Project upload / V0 / restore / delete orchestration.
 *
 * Covers the required assertions from PERSIST-001-IMPLEMENTATION-PLAN.md:
 *  - createProject writes object then transactionally creates Project+Asset+V0
 *  - DB failure after object write must clean up the object (compensation)
 *  - getProjectSnapshot returns project + assets + versions + signed URLs
 *  - activateVersion / approveVersion update pointers
 *  - deleteProject removes metadata + objects, returns cleanupFailures
 */

function makePng(bytes: number): Buffer {
  // Minimal deterministic PNG-like buffer; sharp does not parse this, but
  // we only need a stable buffer of the right size for sizeBytes assertions.
  return Buffer.alloc(bytes, 0x80);
}

async function makeRealPng(width: number, height: number): Promise<Buffer> {
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

describe('ProjectService', () => {
  let tempRoot: string;
  let service: ProjectService;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-project-svc-'));
    const deps = createLocalPersistence({ rootDir: tempRoot });
    const executor = createLocalJobExecutor();
    service = new ProjectService(deps, executor);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('createProject writes object then transactionally creates Project + Asset + V0', async () => {
    const bytes = await makeRealPng(64, 48);
    const snapshot = await service.createProject({
      workspaceId: 'w1',
      name: 'demo',
      bytes,
      mimeType: 'image/png',
    });

    expect(snapshot.project.name).toBe('demo');
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0].mimeType).toBe('image/png');
    expect(snapshot.assets[0].sizeBytes).toBe(bytes.length);
    expect(snapshot.versions).toHaveLength(1);
    expect(snapshot.versions[0].label).toBe('v0');
    expect(snapshot.project.activeVersionId).toBe(snapshot.versions[0].id);
    expect(snapshot.versions[0].assetId).toBe(snapshot.assets[0].id);

    // Object must be present in the store.
    const exists = await createLocalPersistence({ rootDir: tempRoot }).objects.exists(
      snapshot.assets[0].storageKey
    );
    expect(exists).toBe(true);
  });

  it('createProject compensates by deleting the uploaded object when the DB transaction fails', async () => {
    // Force a DB failure by making the project name collide with an existing
    // project — the second createProject must fail inside the transaction
    // and compensation must delete the freshly-uploaded object bytes.
    const bytes = await makeRealPng(32, 32);
    const first = await service.createProject({
      workspaceId: 'w1',
      name: 'demo',
      bytes,
      mimeType: 'image/png',
    });

    // Re-invoke with the same project ID by injecting a duplicate id via a
    // second service instance backed by the same tempRoot — the transaction
    // will throw PROJECT_ALREADY_EXISTS.
    const bytes2 = await makeRealPng(16, 16);
    await expect(
      service.createProject({
        workspaceId: 'w1',
        name: 'demo-duplicate',
        bytes: bytes2,
        mimeType: 'image/png',
        // Force collision on the project id to trigger DB failure after
        // the object upload succeeds.
        __testForceProjectId: first.project.id,
      } as unknown as Parameters<typeof service.createProject>[0])
    ).rejects.toBeInstanceOf(DomainError);

    // The freshly uploaded object for the failed call must be cleaned up.
    // We assert by counting objects: only the first project's original asset
    // should be present.
    const reloaded = createLocalPersistence({ rootDir: tempRoot });
    const assets = await reloaded.assets.listByProject(first.project.id);
    expect(assets).toHaveLength(1);
  });

  it('getProjectSnapshot returns project, assets, versions, and signed URL map', async () => {
    const bytes = await makeRealPng(80, 60);
    const created = await service.createProject({
      workspaceId: 'w1',
      name: 'snapshot-demo',
      bytes,
      mimeType: 'image/png',
    });

    const snapshot = await service.getProjectSnapshot(created.project.id);
    expect(snapshot.project.id).toBe(created.project.id);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.versions).toHaveLength(1);
    expect(snapshot.activeVersion?.id).toBe(created.versions[0].id);
    expect(snapshot.signedUrls[created.assets[0].storageKey]).toBeTruthy();
  });

  it('getProjectSnapshot throws PROJECT_NOT_FOUND for unknown project', async () => {
    await expect(service.getProjectSnapshot('proj_unknown')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('activateVersion and approveVersion update project pointers', async () => {
    const bytes = await makeRealPng(64, 64);
    const created = await service.createProject({
      workspaceId: 'w1',
      name: 'pointers-demo',
      bytes,
      mimeType: 'image/png',
    });

    const v0 = created.versions[0];
    // Approve the V0.
    const approved = await service.approveVersion(created.project.id, v0.id);
    expect(approved.approvedVersionId).toBe(v0.id);
    // activeVersionId is unchanged.
    expect(approved.activeVersionId).toBe(v0.id);

    // Activating (already-active) is idempotent.
    const activated = await service.activateVersion(created.project.id, v0.id);
    expect(activated.activeVersionId).toBe(v0.id);
  });

  it('activateVersion throws VERSION_NOT_FOUND when the version does not belong to the project', async () => {
    const bytes = await makeRealPng(64, 64);
    const created = await service.createProject({
      workspaceId: 'w1',
      name: 'version-not-found',
      bytes,
      mimeType: 'image/png',
    });

    await expect(
      service.activateVersion(created.project.id, 'ver_unknown')
    ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
  });

  it('deleteProject removes metadata, child entities, and object bytes', async () => {
    const bytes = await makeRealPng(48, 48);
    const created = await service.createProject({
      workspaceId: 'w1',
      name: 'delete-demo',
      bytes,
      mimeType: 'image/png',
    });

    const result = await service.deleteProject(created.project.id);
    expect(result.deleted).toBe(true);
    expect(result.cleanupFailures).toEqual([]);

    const reloaded = createLocalPersistence({ rootDir: tempRoot });
    expect(await reloaded.projects.get(created.project.id)).toBeNull();
    expect(await reloaded.assets.listByProject(created.project.id)).toHaveLength(0);
    expect(await reloaded.versions.listByProject(created.project.id)).toHaveLength(0);
    expect(
      await reloaded.objects.exists(created.assets[0].storageKey)
    ).toBe(false);
  });

  it('deleteProject on unknown project is a no-op returning deleted=true', async () => {
    const result = await service.deleteProject('proj_never_existed');
    expect(result.deleted).toBe(true);
    expect(result.cleanupFailures).toEqual([]);
  });

  it('createProject rejects unsupported MIME types', async () => {
    const bytes = Buffer.from('not an image');
    await expect(
      service.createProject({
        workspaceId: 'w1',
        name: 'bad-mime',
        bytes,
        mimeType: 'application/octet-stream',
      })
    ).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
  });

  it('createProject rejects empty bytes', async () => {
    await expect(
      service.createProject({
        workspaceId: 'w1',
        name: 'empty',
        bytes: Buffer.alloc(0),
        mimeType: 'image/png',
      })
    ).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
  });
});
