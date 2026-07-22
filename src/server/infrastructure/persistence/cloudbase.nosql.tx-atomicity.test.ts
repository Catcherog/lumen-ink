/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4: P0 transaction atomicity tests.
 *
 * Verifies Workstreams A-D (withCurrentOrNewTransaction, transaction-aware
 * Job conditional updates, versions.createIdempotent using
 * withCurrentOrNewTransaction, jobs.create delegation) work correctly.
 *
 * AC coverage: AC-01 through AC-08.
 */

import { describe, it, expect, beforeEach, vi, vi as _vi } from 'vitest';
import type { MockCloudBaseState } from './cloudbase.nosql.mock.js';
import { createMockCloudBaseState, createMockCloudBaseApp } from './cloudbase.nosql.mock.js';

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
import type { Project, Asset, Version, GenerationJob } from '../../domain/persistence.js';

// --- Fixtures ---

const OPTIONS: CloudBaseNoSqlOptions = {
  envId: 'test-env',
  apiKey: 'test-key',
  dataNamespace: 'prod',
  storagePrefix: 'prod',
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

async function makeReadyDeps() {
  const state = createMockCloudBaseState(OPTIONS.envId);
  const app = createMockCloudBaseApp(state);
  mockContainer.state = state;
  mockContainer.app = app;
  const deps = createCloudBaseNoSqlPersistence(OPTIONS);
  await deps.ensureReady();
  return { deps, state, app };
}

// --- Tests ---

describe('FIX-R4 P0 Transaction Atomicity', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // AC-01: Inside unitOfWork.run(), call jobs.updateIfClaimed() →
  // state.runTransactionCount === 1 (not 2)
  it('AC-01: updateIfClaimed inside unitOfWork.run reuses the outer transaction', async () => {
    const { deps, state } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);
    // Claim the job first (outside a transaction)
    await deps.jobs.claim('job-1', {
      workerId: 'w1',
      leaseToken: 'tok-1',
      leaseExpiresAt: '2026-07-21T00:05:00.000Z',
      now: '2026-07-21T00:00:00.000Z',
    });

    state.runTransactionCount = 0;

    // Now updateIfClaimed INSIDE unitOfWork.run
    await deps.unitOfWork.run(async () => {
      await deps.jobs.updateIfClaimed('job-1', 'tok-1', { status: 'generating' });
    });

    // Only ONE transaction was opened (the outer unitOfWork.run)
    expect(state.runTransactionCount).toBe(1);
    await deps.close();
  });

  // AC-02: Outside unitOfWork.run(), call versions.createIdempotent() →
  // state.runTransactionCount === 1
  it('AC-02: createIdempotent outside unitOfWork.run opens exactly one transaction', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);
    const asset = makeAsset('a1', 'p1', 'key-1');
    await deps.assets.create(asset);

    state.runTransactionCount = 0;

    const version = makeVersion('v1', 'p1', 'a1');
    await deps.versions.createIdempotent('p1', 'key-v1', version);

    expect(state.runTransactionCount).toBe(1);
    await deps.close();
  });

  // AC-03: Inside unitOfWork.run(), call jobs.updateIfClaimed() →
  // verify it uses tx (set commitShouldFail=true → update should roll back)
  it('AC-03: updateIfClaimed inside tx rolls back on commit failure', async () => {
    const { deps, state } = setup;
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);
    await deps.jobs.claim('job-1', {
      workerId: 'w1',
      leaseToken: 'tok-1',
      leaseExpiresAt: '2026-07-21T00:05:00.000Z',
      now: '2026-07-21T00:00:00.000Z',
    });

    const originalStatus = (await deps.jobs.get('job-1'))!.status;

    // Make commit fail
    state.commitShouldFail = true;

    await expect(
      deps.unitOfWork.run(async () => {
        await deps.jobs.updateIfClaimed('job-1', 'tok-1', { status: 'generating' });
      })
    ).rejects.toThrow('COMMIT_FAILED');

    // The update should have rolled back — status unchanged
    const jobAfter = await deps.jobs.get('job-1');
    expect(jobAfter!.status).toBe(originalStatus);

    await deps.close();
  });

  // AC-04: Inside unitOfWork.run(), create Version idempotent + Asset +
  // update Project pointer + update Job → all in same tx. Set
  // commitShouldFail=true → NONE of them persist.
  it('AC-04: multi-entity tx rolls back entirely on commit failure', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);
    const job = makeJob('job-1', 'p1');
    await deps.jobs.create(job);
    await deps.jobs.claim('job-1', {
      workerId: 'w1',
      leaseToken: 'tok-1',
      leaseExpiresAt: '2026-07-21T00:05:00.000Z',
      now: '2026-07-21T00:00:00.000Z',
    });

    state.commitShouldFail = true;

    await expect(
      deps.unitOfWork.run(async () => {
        const asset = makeAsset('a-new', 'p1', 'key-new');
        await deps.assets.create(asset);
        const version = makeVersion('v-new', 'p1', 'a-new');
        await deps.versions.createIdempotent('p1', 'key-new', version);
        await deps.projects.updatePointers('p1', { activeVersionId: 'v-new' });
        await deps.jobs.updateIfClaimed('job-1', 'tok-1', { status: 'succeeded', resultVersionId: 'v-new' });
      })
    ).rejects.toThrow('COMMIT_FAILED');

    // NONE of the entities persisted
    expect(await deps.assets.get('a-new')).toBeNull();
    expect(await deps.versions.get('v-new')).toBeNull();
    const projAfter = await deps.projects.get('p1');
    expect(projAfter!.activeVersionId).toBeUndefined();
    const jobAfter = await deps.jobs.get('job-1');
    expect(jobAfter!.status).toBe('queued');
    expect(jobAfter!.resultVersionId).toBeUndefined();

    await deps.close();
  });

  // AC-05: Same as AC-04 but verify each entity count in collections after rollback.
  it('AC-05: rollback leaves zero new docs in all collections', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);

    const initialAssetCount = state.database.collections.get('prod_assets')?.docs.size ?? 0;
    const initialVersionCount = state.database.collections.get('prod_versions')?.docs.size ?? 0;
    const initialIdemCount =
      state.database.collections.get('prod_version_idempotency')?.docs.size ?? 0;

    state.commitShouldFail = true;

    await expect(
      deps.unitOfWork.run(async () => {
        await deps.assets.create(makeAsset('a-1', 'p1', 'k-1'));
        await deps.versions.createIdempotent(
          'p1',
          'key-1',
          makeVersion('v-1', 'p1', 'a-1')
        );
      })
    ).rejects.toThrow('COMMIT_FAILED');

    // Counts unchanged after rollback
    expect(state.database.collections.get('prod_assets')?.docs.size ?? 0).toBe(initialAssetCount);
    expect(state.database.collections.get('prod_versions')?.docs.size ?? 0).toBe(initialVersionCount);
    expect(state.database.collections.get('prod_version_idempotency')?.docs.size ?? 0).toBe(
      initialIdemCount
    );

    await deps.close();
  });

  // AC-06: Set retryOnConflict=true → call versions.createIdempotent →
  // verify only ONE Version created (no duplicate after retry).
  it('AC-06: createIdempotent with retryOnConflict creates exactly one version', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);
    await deps.assets.create(makeAsset('a1', 'p1', 'key-1'));

    state.retryOnConflict = true;

    const version = makeVersion('v1', 'p1', 'a1');
    await deps.versions.createIdempotent('p1', 'retry-key', version);

    // Only one version + one idempotency record
    expect(state.database.collections.get('prod_versions')?.docs.size).toBe(1);
    expect(state.database.collections.get('prod_version_idempotency')?.docs.size).toBe(1);

    await deps.close();
  });

  // AC-07: Two concurrent createIdempotent calls with same key →
  // only one Version + one mapping.
  it('AC-07: concurrent createIdempotent with same key → one version, one mapping', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);
    await deps.assets.create(makeAsset('a1', 'p1', 'key-1'));

    const versionA = makeVersion('v-a', 'p1', 'a1');
    const versionB = makeVersion('v-b', 'p1', 'a1');

    const [resultA, resultB] = await Promise.all([
      deps.versions.createIdempotent('p1', 'shared-key', versionA),
      deps.versions.createIdempotent('p1', 'shared-key', versionB),
    ]);

    // Both return the same version (the winner)
    expect(resultA.id).toBe(resultB.id);

    // Only ONE version + one idempotency record
    expect(state.database.collections.get('prod_versions')?.docs.size).toBe(1);
    expect(state.database.collections.get('prod_version_idempotency')?.docs.size).toBe(1);

    await deps.close();
  });

  // AC-08: jobs.create(jobWithIdempotencyKey) → verify it delegates to
  // createIdempotent (check that jobIdempotency record exists).
  it('AC-08: jobs.create with idempotencyKey delegates to createIdempotent', async () => {
    const { deps, state } = setup;
    const project = makeProject('p1');
    await deps.projects.create(project);

    const job = makeJob('job-1', 'p1', 'idem-key-1');
    await deps.jobs.create(job);

    // Job exists
    expect(await deps.jobs.get('job-1')).not.toBeNull();

    // Idempotency record exists (proves delegation to createIdempotent)
    const idemCollection = state.database.collections.get('prod_job_idempotency');
    expect(idemCollection?.docs.size).toBe(1);

    const idemDoc = idemCollection?.docs.values().next().value as unknown as {
      key: string;
      projectId: string;
      jobId: string;
    };
    expect(idemDoc.key).toBe('idem-key-1');
    expect(idemDoc.projectId).toBe('p1');
    expect(idemDoc.jobId).toBe('job-1');

    await deps.close();
  });
});
