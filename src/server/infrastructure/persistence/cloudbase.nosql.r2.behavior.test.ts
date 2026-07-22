/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: Real-behavior test matrix.
 *
 * NOSQL-R2-08 (2026-07-21): 10 scenarios that exercise the adapter's
 * behavior against an in-memory mock of the CloudBase Node SDK. The mock
 * models the semantics the adapter relies on (db.command operators,
 * runTransaction atomicity, E11000 duplicate-key, uploadFile fileID
 * return). It is NOT a real CloudBase connection.
 *
 * Real CloudBase integration tests can be added as a separate, controlled
 * gate; they are not required for this unit test file.
 *
 * Test matrix (per GPT FIX-R1 verdict):
 *  1. Cross-repository transaction commit
 *  2. Transaction callback throw -> rollback
 *  3. Concurrent Job idempotency -> only one Job
 *  4. Concurrent lease claim -> only one worker wins
 *  5. Terminal Job updateIfClaimed -> null (no regression)
 *  6. JobPatch null -> command.remove()
 *  7. Storage lifecycle: put -> get -> getSignedUrl -> delete
 *  8. deleteProject DB failure -> Storage not touched (NOSQL-R2-05)
 *  9. JobPatch uses real buildUpdateFromPatch (not a copied local function)
 * 10. Preview namespace cannot read Production data (NOSQL-R2-06)
 */

import { describe, it, expect, beforeEach, vi, vi as _vi } from 'vitest';
import type { MockCloudBaseState } from './cloudbase.nosql.mock.js';
import { createMockCloudBaseState, createMockCloudBaseApp } from './cloudbase.nosql.mock.js';

// vi.mock is hoisted: the factory cannot close over `let` bindings declared
// later in the file. We use vi.hoisted to create a mutable container that
// the factory can read, and tests can reassign before each run.
const mockContainer = _vi.hoisted(() => ({
  state: null as MockCloudBaseState | null,
  app: null as ReturnType<typeof createMockCloudBaseApp> | null,
}));

vi.mock('@cloudbase/node-sdk', () => ({
  init: () => mockContainer.app,
  default: { init: () => mockContainer.app },
}));

import {
  createCloudBaseNoSqlPersistence,
  type CloudBaseNoSqlOptions,
} from './cloudbase.nosql.js';
import type { Project, Asset, Version, GenerationJob, JobExecutor } from '../../domain/persistence.js';
import { ProjectService } from '../../services/ProjectService.js';

// --- Test fixtures --------------------------------------------------------

const PROD_OPTIONS: CloudBaseNoSqlOptions = {
  envId: 'test-env',
  apiKey: 'test-key',
  dataNamespace: 'prod',
  storagePrefix: 'prod',
};

const PREVIEW_OPTIONS: CloudBaseNoSqlOptions = {
  envId: 'test-env',
  apiKey: 'test-key',
  dataNamespace: 'preview',
  storagePrefix: 'preview',
};

function makeProject(id: string): Project {
  return {
    id,
    name: `project-${id}`,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
}

function makeAsset(id: string, projectId: string, storageKey: string): Asset {
  return {
    id,
    projectId,
    storageKey,
    mimeType: 'image/png',
    sizeBytes: 100,
    createdAt: '2026-07-21T00:00:00.000Z',
  };
}

function makeVersion(id: string, projectId: string, assetId: string): Version {
  return {
    id,
    projectId,
    assetId,
    label: 'v1',
    createdAt: '2026-07-21T00:00:00.000Z',
  };
}

function makeJob(id: string, projectId: string, idempotencyKey?: string): GenerationJob {
  return {
    id,
    projectId,
    prompt: 'test prompt',
    status: 'queued',
    idempotencyKey,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
}

async function makeReadyDeps(options: CloudBaseNoSqlOptions) {
  const state = createMockCloudBaseState(options.envId);
  const app = createMockCloudBaseApp(state);
  mockContainer.state = state;
  mockContainer.app = app;
  const deps = createCloudBaseNoSqlPersistence(options);
  await deps.ensureReady();
  return { deps, state, app };
}

// --- Tests ----------------------------------------------------------------

describe('NOSQL-R2-08 scenario 1: cross-repository transaction commit', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('commits project + asset writes atomically when all succeed', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    const asset = makeAsset('a1', 'p1', 'storage-key-1');

    await deps.unitOfWork.run(async () => {
      await deps.projects.create(project);
      await deps.assets.create(asset);
    });

    // Both writes committed
    const prodCollection = state.database.collections.get('prod_projects');
    const assetCollection = state.database.collections.get('prod_assets');
    expect(prodCollection?.docs.has('p1')).toBe(true);
    expect(assetCollection?.docs.has('a1')).toBe(true);

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 2: transaction callback throw -> rollback', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('rolls back all writes when the callback throws', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    const asset = makeAsset('a1', 'p1', 'storage-key-1');

    await expect(
      deps.unitOfWork.run(async () => {
        await deps.projects.create(project);
        await deps.assets.create(asset);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // Neither write should be visible after rollback
    const prodCollection = state.database.collections.get('prod_projects');
    const assetCollection = state.database.collections.get('prod_assets');
    expect(prodCollection?.docs.has('p1') ?? false).toBe(false);
    expect(assetCollection?.docs.has('a1') ?? false).toBe(false);

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 3: concurrent Job idempotency -> only one Job', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('two concurrent createIdempotent calls with same key -> one Job, one idempotency record', async () => {
    const { deps, state } = setup;
    const jobA = makeJob('job-a', 'p1', 'shared-key');
    const jobB = makeJob('job-b', 'p1', 'shared-key');

    // Fire both concurrently. The mock's runTransaction is not truly
    // interleaving (JS is single-threaded), but the E11000 path exercises
    // the "second caller loses, fetches winner" flow.
    const [resultA, resultB] = await Promise.all([
      deps.jobs.createIdempotent(jobA),
      deps.jobs.createIdempotent(jobB),
    ]);

    // Both calls must return the same Job (the winner)
    expect(resultA.job.id).toBe(resultB.job.id);
    expect(resultA.created || resultB.created).toBe(true);
    expect(resultA.created && resultB.created).toBe(false);

    // Only ONE Job document should exist in the collection
    const jobsCollection = state.database.collections.get('prod_generation_jobs');
    expect(jobsCollection?.docs.size).toBe(1);

    // Only ONE idempotency record should exist
    const idemCollection = state.database.collections.get('prod_job_idempotency');
    expect(idemCollection?.docs.size).toBe(1);
    const idemDoc = idemCollection?.docs.values().next().value as unknown as { key: string; projectId: string; jobId: string };
    expect(idemDoc.projectId).toBe('p1');
    expect(idemDoc.key).toBe('shared-key');
    expect(idemDoc.jobId).toBe(resultA.job.id);

    await deps.close();
  });

  it('different projects with same key -> two Jobs (projectId-scoped uniqueness)', async () => {
    const { deps, state } = setup;
    const jobA = makeJob('job-a', 'p1', 'shared-key');
    const jobB = makeJob('job-b', 'p2', 'shared-key');

    await deps.jobs.createIdempotent(jobA);
    await deps.jobs.createIdempotent(jobB);

    const jobsCollection = state.database.collections.get('prod_generation_jobs');
    expect(jobsCollection?.docs.size).toBe(2);

    const idemCollection = state.database.collections.get('prod_job_idempotency');
    expect(idemCollection?.docs.size).toBe(2);

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 4: concurrent lease claim -> only one worker wins', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('two workers claiming the same job -> only one wins', async () => {
    const { deps } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);

    const now = '2026-07-21T00:00:00.000Z';
    const expires = '2026-07-21T00:05:00.000Z';
    const [claimA, claimB] = await Promise.all([
      deps.jobs.claim('job-1', { workerId: 'w1', leaseToken: 'tok-a', leaseExpiresAt: expires, now }),
      deps.jobs.claim('job-1', { workerId: 'w2', leaseToken: 'tok-b', leaseExpiresAt: expires, now }),
    ]);

    // Exactly one claim succeeds
    const successes = [claimA, claimB].filter(Boolean).length;
    expect(successes).toBe(1);

    await deps.close();
  });

  it('second claim after first lease expires -> second worker wins', async () => {
    const { deps } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);

    const firstClaim = await deps.jobs.claim('job-1', {
      workerId: 'w1',
      leaseToken: 'tok-a',
      leaseExpiresAt: '2026-07-21T00:01:00.000Z',
      now: '2026-07-21T00:00:00.000Z',
    });
    expect(firstClaim).toBe(true);

    // After expiry, w2 can claim
    const secondClaim = await deps.jobs.claim('job-1', {
      workerId: 'w2',
      leaseToken: 'tok-b',
      leaseExpiresAt: '2026-07-21T00:10:00.000Z',
      now: '2026-07-21T00:02:00.000Z',
    });
    expect(secondClaim).toBe(true);

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 5: terminal Job updateIfClaimed -> null', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('updateIfClaimed on a terminal Job returns null', async () => {
    const { deps } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);

    // Move to terminal state
    await deps.jobs.update('job-1', { status: 'succeeded' });

    // Even the lease holder cannot advance a terminal Job
    const result = await deps.jobs.updateIfClaimed('job-1', 'tok-x', {
      status: 'failed',
      error: 'late failure',
    });
    expect(result).toBeNull();

    await deps.close();
  });

  it('updateIfActive on a terminal Job returns null', async () => {
    const { deps } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);
    await deps.jobs.update('job-1', { status: 'cancelled' });

    const result = await deps.jobs.updateIfActive('job-1', { status: 'queued' });
    expect(result).toBeNull();

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 6: JobPatch null -> command.remove()', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('patching workerId=null removes the field from the document', async () => {
    const { deps, state } = setup;
    const job = makeJob('job-1', 'p1');
    job.workerId = 'w1';
    job.leaseToken = 'tok-1';
    job.leaseExpiresAt = '2026-07-21T00:05:00.000Z';
    await deps.jobs.create(job);

    // Cancel: clear lease fields via null patch
    await deps.jobs.update('job-1', {
      status: 'cancelled',
      workerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    const jobsCollection = state.database.collections.get('prod_generation_jobs');
    const doc = jobsCollection?.docs.get('job-1') as Record<string, unknown> | undefined;
    expect(doc).toBeDefined();
    expect(doc!.status).toBe('cancelled');
    expect(doc!.workerId).toBeUndefined();
    expect(doc!.leaseToken).toBeUndefined();
    expect(doc!.leaseExpiresAt).toBeUndefined();

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 7: Storage lifecycle (put/get/url/delete)', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('put saves fileID; get/getSignedUrl/delete resolve via fileID', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-1.png';
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    // put: uploads file + saves fileID to object_metadata
    await deps.objects.put(key, bytes, 'image/png');

    // object_metadata record exists
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);
    const meta = metaCollection?.docs.get(key) as unknown as { fileID: string };
    expect(meta.fileID).toMatch(/^cloud:\/\/test-env\//);

    // Storage file was uploaded with prefixed cloudPath
    expect(state.storage.files.has(meta.fileID)).toBe(true);

    // get: resolves fileID -> downloads bytes
    const fetched = await deps.objects.get(key);
    expect(Array.from(fetched)).toEqual([1, 2, 3, 4, 5]);

    // getSignedUrl: resolves fileID -> temp URL
    const url = await deps.objects.getSignedUrl(key);
    expect(url).toContain('mock-temp-url');

    // exists: true
    expect(await deps.objects.exists(key)).toBe(true);

    // delete: removes file + metadata
    await deps.objects.delete(key);
    expect(state.storage.files.has(meta.fileID)).toBe(false);
    expect(metaCollection?.docs.has(key)).toBe(false);
    expect(await deps.objects.exists(key)).toBe(false);

    await deps.close();
  });

  it('get on unknown key throws OBJECT_NOT_FOUND', async () => {
    const { deps } = setup;
    await expect(deps.objects.get('missing-key')).rejects.toThrow(/OBJECT_NOT_FOUND/);
    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 8: deleteCascade only deletes DB metadata (NOSQL-R2-05)', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('deleteCascade does NOT call Storage deleteFile', async () => {
    const { deps, state, app } = setup;
    const project = makeProject('p1');
    const asset = makeAsset('a1', 'p1', 'storage-key-1');
    await deps.projects.create(project);
    await deps.assets.create(asset);

    // Upload a real Storage object so we can verify it survives deleteCascade
    await deps.objects.put('storage-key-1', new Uint8Array([1, 2, 3]), 'image/png');

    // Spy on deleteFile to prove it is NOT called by deleteCascade
    const deleteFileSpy = vi.spyOn(app, 'deleteFile');

    await deps.projects.deleteCascade('p1');

    // Storage file MUST still exist (deleteCascade did not touch Storage)
    const meta = state.database.collections.get('prod_object_metadata')?.docs.get('storage-key-1') as { fileID: string } | undefined;
    expect(meta).toBeDefined();
    expect(state.storage.files.has(meta!.fileID)).toBe(true);

    // deleteFile was not called by deleteCascade
    expect(deleteFileSpy).not.toHaveBeenCalled();

    // DB metadata IS gone
    expect(state.database.collections.get('prod_projects')?.docs.has('p1')).toBe(false);
    expect(state.database.collections.get('prod_assets')?.docs.has('a1')).toBe(false);

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 9: JobPatch uses real buildUpdateFromPatch', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps(PROD_OPTIONS);
  });

  it('update writes command.set / command.remove operators (not raw $set/$unset)', async () => {
    const { deps, state } = setup;
    const job = makeJob('job-1', 'p1');
    job.workerId = 'w1';
    await deps.jobs.create(job);

    await deps.jobs.update('job-1', {
      status: 'succeeded',
      workerId: null,
      resultVersionId: 'ver-1',
    });

    const doc = state.database.collections.get('prod_generation_jobs')?.docs.get('job-1') as Record<string, unknown>;
    expect(doc.status).toBe('succeeded');
    expect(doc.workerId).toBeUndefined();
    expect(doc.resultVersionId).toBe('ver-1');

    await deps.close();
  });
});

describe('NOSQL-R2-08 scenario 10: Preview/Production share Mock state, isolated by namespace (AC-09)', () => {
  it('Prod and Preview share ONE Mock state but cannot read each other DB or Storage data', async () => {
    // AC-09: Both adapters share ONE MockCloudBaseState (same CloudBase env),
    // isolated ONLY by CLOUDBASE_DATA_NAMESPACE (collection name prefix) and
    // CLOUDBASE_STORAGE_PREFIX (cloudPath prefix). This proves the namespace
    // mechanism — not separate Mock instances — provides isolation.
    const sharedState = createMockCloudBaseState('test-env');
    const sharedApp = createMockCloudBaseApp(sharedState);
    mockContainer.state = sharedState;
    mockContainer.app = sharedApp;

    const prodDeps = createCloudBaseNoSqlPersistence(PROD_OPTIONS);
    await prodDeps.ensureReady();
    const previewDeps = createCloudBaseNoSqlPersistence(PREVIEW_OPTIONS);
    await previewDeps.ensureReady();

    // --- DB isolation ---
    await prodDeps.projects.create(makeProject('p-prod'));
    await previewDeps.projects.create(makeProject('p-preview'));

    // Both collections coexist in the SAME state under different names
    expect(sharedState.database.collections.has('prod_projects')).toBe(true);
    expect(sharedState.database.collections.has('preview_projects')).toBe(true);
    const prodColl = sharedState.database.collections.get('prod_projects')!;
    const previewColl = sharedState.database.collections.get('preview_projects')!;
    expect(prodColl.docs.has('p-prod')).toBe(true);
    expect(prodColl.docs.has('p-preview')).toBe(false);
    expect(previewColl.docs.has('p-preview')).toBe(true);
    expect(previewColl.docs.has('p-prod')).toBe(false);

    // Cross-namespace reads return null
    expect(await prodDeps.projects.get('p-preview')).toBeNull();
    expect(await previewDeps.projects.get('p-prod')).toBeNull();
    // Own-namespace reads succeed
    expect((await prodDeps.projects.get('p-prod'))?.id).toBe('p-prod');
    expect((await previewDeps.projects.get('p-preview'))?.id).toBe('p-preview');

    // --- Storage isolation ---
    await prodDeps.objects.put('asset-1.png', new Uint8Array([1, 2, 3]), 'image/png');
    await previewDeps.objects.put('asset-1.png', new Uint8Array([4, 5, 6]), 'image/png');

    // Both files coexist in the SAME storage under different fileIDs
    const prodFileID = `cloud://test-env/prod/asset-1.png`;
    const previewFileID = `cloud://test-env/preview/asset-1.png`;
    expect(sharedState.storage.files.has(prodFileID)).toBe(true);
    expect(sharedState.storage.files.has(previewFileID)).toBe(true);

    // Each adapter reads its own bytes
    const prodBytes = await prodDeps.objects.get('asset-1.png');
    expect(Array.from(prodBytes)).toEqual([1, 2, 3]);
    const previewBytes = await previewDeps.objects.get('asset-1.png');
    expect(Array.from(previewBytes)).toEqual([4, 5, 6]);

    await prodDeps.close();
    await previewDeps.close();
  });
});

// --- FIX-R3 AC-10: Concurrent idempotency — both transactions read before commit --

describe('FIX-R3 AC-10: concurrent idempotency — both transactions read before commit', () => {
  it('two interleaved transactions competing for same key -> one winner, one E11000', async () => {
    // Force both transactions to complete their first doc().get() before
    // either proceeds to add() + commit. This proves the Mock's commit-time
    // E11000 detection works when both transactions saw no existing doc.
    const state = createMockCloudBaseState('test-env');
    const app = createMockCloudBaseApp(state);
    const db = app.database();

    let readCount = 0;
    let resolveBothRead!: () => void;
    const bothRead = new Promise<void>((resolve) => { resolveBothRead = resolve; });

    const txA = db.runTransaction(async (tx) => {
      const doc = await tx.collection('idem').doc('p1__shared').get();
      readCount++;
      if (readCount === 2) resolveBothRead();
      await bothRead;
      expect(doc.data).toBeNull();
      await tx.collection('idem').add({ _id: 'p1__shared', jobId: 'job-A' });
      await tx.collection('jobs').add({ _id: 'job-A', projectId: 'p1' });
      return 'A';
    });

    const txB = db.runTransaction(async (tx) => {
      const doc = await tx.collection('idem').doc('p1__shared').get();
      readCount++;
      if (readCount === 2) resolveBothRead();
      await bothRead;
      expect(doc.data).toBeNull();
      await tx.collection('idem').add({ _id: 'p1__shared', jobId: 'job-B' });
      await tx.collection('jobs').add({ _id: 'job-B', projectId: 'p1' });
      return 'B';
    });

    const [resultA, resultB] = await Promise.allSettled([txA, txB]);

    const successCount = [resultA, resultB].filter((r) => r.status === 'fulfilled').length;
    const failCount = [resultA, resultB].filter((r) => r.status === 'rejected').length;
    expect(successCount).toBe(1);
    expect(failCount).toBe(1);

    const failed = [resultA, resultB].find(
      (r) => r.status === 'rejected'
    ) as PromiseRejectedResult;
    expect(failed.reason.message).toContain('E11000');

    // One idempotency record, one Job — zero orphans
    expect(state.database.collections.get('idem')?.docs.size).toBe(1);
    expect(state.database.collections.get('jobs')?.docs.size).toBe(1);
  });

  it('adapter createIdempotent handles concurrent E11000 -> one Job, one idem, zero orphans', async () => {
    const { deps, state } = await makeReadyDeps(PROD_OPTIONS);
    const jobA = makeJob('job-a', 'p1', 'shared-key');
    const jobB = makeJob('job-b', 'p1', 'shared-key');

    const [resultA, resultB] = await Promise.all([
      deps.jobs.createIdempotent(jobA),
      deps.jobs.createIdempotent(jobB),
    ]);

    expect(resultA.job.id).toBe(resultB.job.id);
    expect(resultA.created || resultB.created).toBe(true);
    expect(resultA.created && resultB.created).toBe(false);
    expect(state.database.collections.get('prod_generation_jobs')?.docs.size).toBe(1);
    expect(state.database.collections.get('prod_job_idempotency')?.docs.size).toBe(1);

    await deps.close();
  });
});

// --- FIX-R3 AC-05: deleteCascade 100-op limit fail closed -------------------

describe('FIX-R3 AC-05: deleteCascade 100-op limit fail closed', () => {
  it('project with >100 child docs -> CLOUDBASE_TX_LIMIT_EXCEEDED, no partial deletion', async () => {
    const { deps, state } = await makeReadyDeps(PROD_OPTIONS);

    // Create a project with 100 assets (each counts as 1 doc in deleteCascade)
    // + 1 project doc = 101 ops > 100 limit.
    await deps.projects.create(makeProject('p-big'));
    for (let i = 0; i < 100; i++) {
      await deps.assets.create(makeAsset(`a${i}`, 'p-big', `key-${i}`));
    }

    await expect(deps.projects.deleteCascade('p-big')).rejects.toThrow(
      'CLOUDBASE_TX_LIMIT_EXCEEDED'
    );

    // Fail closed: project + all assets still exist (no partial deletion)
    expect(state.database.collections.get('prod_projects')?.docs.has('p-big')).toBe(true);
    expect(state.database.collections.get('prod_assets')?.docs.size).toBe(100);

    await deps.close();
  });

  it('project with exactly 100 child docs -> succeeds (at the limit)', async () => {
    const { deps, state } = await makeReadyDeps(PROD_OPTIONS);

    // FIX-R4: op count is now N + 4 (tombstone add + cleanup keys add +
    // project remove + tombstone remove). 96 assets + 4 = 100 ops exactly.
    await deps.projects.create(makeProject('p-limit'));
    for (let i = 0; i < 96; i++) {
      await deps.assets.create(makeAsset(`a${i}`, 'p-limit', `key-${i}`));
    }

    await deps.projects.deleteCascade('p-limit');

    expect(state.database.collections.get('prod_projects')?.docs.has('p-limit')).toBe(false);
    expect(state.database.collections.get('prod_assets')?.docs.size).toBe(0);

    await deps.close();
  });
});

// --- FIX-R3 AC-06/07/08: Storage boundary on ProjectService.deleteProject ---

describe('FIX-R3 AC-06/07/08: Storage boundary on deleteProject', () => {
  const dummyExecutor: JobExecutor = {
    enqueue: vi.fn(),
    cancel: vi.fn(),
  };

  async function setupProjectWithAssets(
    deps: Awaited<ReturnType<typeof makeReadyDeps>>['deps'],
    assetCount: number
  ): Promise<{ projectId: string; storageKeys: string[] }> {
    const projectId = 'p-delete';
    await deps.projects.create(makeProject(projectId));
    const storageKeys: string[] = [];
    for (let i = 0; i < assetCount; i++) {
      const key = `storage-key-${i}`;
      await deps.objects.put(key, new Uint8Array([i]), 'image/png');
      await deps.assets.create(makeAsset(`a${i}`, projectId, key));
      storageKeys.push(key);
    }
    return { projectId, storageKeys };
  }

  it('AC-06: DB delete failure -> objects.delete called 0 times', async () => {
    const setup = await makeReadyDeps(PROD_OPTIONS);
    const { deps } = setup;
    const service = new ProjectService(deps, dummyExecutor);
    const { projectId, storageKeys } = await setupProjectWithAssets(deps, 3);

    // Spy on objects.delete to count calls
    const deleteSpy = vi.spyOn(deps.objects, 'delete');

    // Make deleteCascade throw by exceeding the 100-op limit.
    // Add 98 more assets (3 + 98 = 101 child docs + 1 project = 102 ops).
    for (let i = 3; i < 101; i++) {
      await deps.assets.create(makeAsset(`a${i}`, projectId, `key-${i}`));
    }

    await expect(service.deleteProject(projectId)).rejects.toThrow(
      'CLOUDBASE_TX_LIMIT_EXCEEDED'
    );

    // AC-06: Storage deleteFile was NEVER called
    expect(deleteSpy).not.toHaveBeenCalled();

    await deps.close();
  });

  it('AC-07: DB delete success -> objects.delete called exactly once per key', async () => {
    const setup = await makeReadyDeps(PROD_OPTIONS);
    const { deps } = setup;
    const service = new ProjectService(deps, dummyExecutor);
    const { projectId, storageKeys } = await setupProjectWithAssets(deps, 3);

    const deleteSpy = vi.spyOn(deps.objects, 'delete');

    const result = await service.deleteProject(projectId);

    expect(result.deleted).toBe(true);
    expect(result.cleanupFailures).toHaveLength(0);
    // AC-07: each object deleted exactly once
    expect(deleteSpy).toHaveBeenCalledTimes(storageKeys.length);
    for (const key of storageKeys) {
      expect(deleteSpy).toHaveBeenCalledWith(key);
    }

    await deps.close();
  });

  it('AC-08: Storage cleanup partial failure -> cleanupFailures preserved, metadata gone', async () => {
    const setup = await makeReadyDeps(PROD_OPTIONS);
    const { deps } = setup;
    const service = new ProjectService(deps, dummyExecutor);
    const { projectId, storageKeys } = await setupProjectWithAssets(deps, 3);

    // Make objects.delete fail for the second key only
    const deleteSpy = vi.spyOn(deps.objects, 'delete').mockImplementation(async (key: string) => {
      if (key === storageKeys[1]) {
        throw new Error('STORAGE_DELETE_FAILED');
      }
    });

    const result = await service.deleteProject(projectId);

    expect(result.deleted).toBe(true);
    // AC-08: failed key is in cleanupFailures (retry info preserved)
    expect(result.cleanupFailures).toEqual([storageKeys[1]]);

    // AC-08: metadata is already gone (DB transaction committed)
    // — not in an uncertain "DB exists but objects partially deleted" state
    expect(await deps.projects.get(projectId)).toBeNull();
    expect((await deps.assets.listByProject(projectId)).length).toBe(0);

    // All 3 delete attempts were made (the loop continues past failures)
    expect(deleteSpy).toHaveBeenCalledTimes(3);

    await deps.close();
  });
});
