/**
 * PERSIST-001 P0-02A contract test: UnitOfWork shares one PoolClient.
 *
 * Verifies the FIX_PACKET requirement:
 *  > 保证 Asset、Version、Project pointer 和 Job conditional succeeded 使用同一个
 *  > PostgreSQL transaction client。最终条件更新失败时，必须回滚全部 metadata，
 *  > 并补偿删除已上传对象。
 *
 * Strategy:
 *  - Mock the `pg` module with a fake Pool class. Each `connect()` issues a
 *    new FakeClient with a unique id. Each `client.query(sql, params)`
 *    records the clientId + sql so the test can assert which client handled
 *    which write.
 *  - Inside `unitOfWork.run(...)`: all four writes (Asset.create,
 *    Version.createIdempotent, Project.updatePointers, Job.updateIfClaimed)
 *    MUST share the same clientId, and BEGIN/COMMIT/ROLLBACK must be issued
 *    on that same client.
 *  - Outside `unitOfWork.run(...)`: each repository write MUST open its
 *    own short-lived client and release it after.
 *  - When Job.updateIfClaimed returns null (final conditional failed):
 *    ROLLBACK is issued, no COMMIT.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module-level state mutated by the mock classes -----------------------
// These must be declared at module scope so the mock factory (which is
// hoisted above the imports) can reference them via closure. The mock
// factory itself cannot reference classes declared at the bottom of the
// file because those are not hoisted (only `var` and function declarations
// are hoisted, not `class`).

let queryLog: QueryRecord[] = [];
let nextClientId = 0;

interface QueryRecord {
  clientId: string;
  sql: string;
  params?: unknown[];
}

class FakeClient {
  public id: string;
  public released = false;
  constructor() {
    nextClientId += 1;
    this.id = `client-${nextClientId}`;
  }
  async query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number; command: string }> {
    queryLog.push({ clientId: this.id, sql, params });
    // Detect UPDATE on generation_jobs with WHERE lease_token = $2:
    // if the lease token is 'STALE_TOKEN', return 0 rows to simulate the
    // conditional update failing (lease lost).
    if (
      sql.includes('UPDATE generation_jobs') &&
      sql.includes('lease_token = $2') &&
      params &&
      params[1] === 'STALE_TOKEN'
    ) {
      return { rows: [] as T[], rowCount: 0, command: 'UPDATE' };
    }
    // For UPDATE...RETURNING * on projects, return a fake updated row.
    if (sql.includes('UPDATE projects') && sql.includes('RETURNING *')) {
      const row = {
        id: (params?.[0] as string) ?? 'proj-1',
        name: 'Test',
        created_at: new Date(),
        updated_at: new Date(),
        active_version_id: (params?.[1] as string) ?? null,
        approved_version_id: (params?.[2] as string) ?? null,
      };
      return { rows: [row] as T[], rowCount: 1, command: 'UPDATE' };
    }
    // SELECT * FROM generation_jobs WHERE id = $1 returns a row.
    if (sql.startsWith('SELECT * FROM generation_jobs')) {
      const row = {
        id: params?.[0] ?? 'job-1',
        project_id: 'proj-1',
        prompt: 'p',
        status: 'succeeded',
        provider_id: null,
        model: null,
        input_version_id: null,
        result_version_id: null,
        error: null,
        error_code: null,
        idempotency_key: null,
        worker_id: 'worker-1',
        lease_token: 'TOKEN-1',
        lease_expires_at: new Date(),
        attempt: 1,
        parent_job_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      return { rows: [row] as T[], rowCount: 1, command: 'SELECT' };
    }
    return { rows: [] as T[], rowCount: 0, command: 'SELECT' };
  }
  release(): void {
    this.released = true;
  }
}

// Pool must be a class (constructor) so `new pgModule.Pool(...)` works.
class FakePool {
  async connect(): Promise<FakeClient> {
    return new FakeClient();
  }
  async end(): Promise<void> {}
  async query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number; command: string }> {
    queryLog.push({ clientId: 'pool-direct', sql, params });
    return { rows: [] as T[], rowCount: 0, command: sql.split(' ')[0] };
  }
}

vi.mock('pg', () => {
  return {
    Pool: FakePool,
    default: { Pool: FakePool },
  };
});

// Import AFTER vi.mock so the mocked module is used by cloudbase.ts.
import { createCloudBasePersistence, type CloudBasePersistenceOptions } from './cloudbase.js';

const OPTIONS: CloudBasePersistenceOptions = {
  postgresUrl: 'postgresql://user:pass@host:5432/db',
  envId: 'env-1',
  bucketId: 'bucket-1',
  storageToken: 'token-1',
  signedUrlTtlSeconds: 900,
};

async function freshDeps() {
  queryLog = [];
  nextClientId = 0;
  const deps = createCloudBasePersistence(OPTIONS);
  await deps.ensureReady();
  return deps;
}

describe('PERSIST-001 P0-02A: UnitOfWork shares one PoolClient', () => {
  let deps: Awaited<ReturnType<typeof freshDeps>>;

  beforeEach(async () => {
    deps = await freshDeps();
  });

  it('Asset.create + Version.createIdempotent + Project.updatePointers + Job.updateIfClaimed all use the SAME client inside unitOfWork.run', async () => {
    const assetInput = {
      id: 'asset-1',
      projectId: 'proj-1',
      storageKey: 'proj-1/key',
      mimeType: 'image/png',
      sizeBytes: 10,
      createdAt: new Date().toISOString(),
    };
    const versionInput = {
      id: 'ver-1',
      projectId: 'proj-1',
      assetId: 'asset-1',
      label: 'v1',
      createdAt: new Date().toISOString(),
    };

    await deps.unitOfWork.run(async () => {
      await deps.assets.create(assetInput);
      await deps.versions.createIdempotent('proj-1', 'idem-1', versionInput);
      await deps.projects.updatePointers('proj-1', { activeVersionId: 'ver-1' });
      await deps.jobs.updateIfClaimed('job-1', 'TOKEN-1', { status: 'succeeded' });
    });

    // Find the client that ran BEGIN — that's the transaction client.
    const beginRecord = queryLog.find((r) => r.sql === 'BEGIN');
    expect(beginRecord).toBeDefined();
    const txClientId = beginRecord!.clientId;

    // All 4 writes + BEGIN + COMMIT must use the same client.
    const writeQueries = queryLog.filter(
      (r) =>
        r.sql.includes('INSERT INTO assets') ||
        r.sql.includes('INSERT INTO versions') ||
        r.sql.includes('INSERT INTO version_idempotency') ||
        r.sql.includes('UPDATE projects') ||
        r.sql.includes('UPDATE generation_jobs')
    );
    expect(writeQueries.length).toBeGreaterThanOrEqual(4);
    for (const q of writeQueries) {
      expect(q.clientId).toBe(txClientId);
    }

    // COMMIT was issued on the same client.
    const commitRecord = queryLog.find((r) => r.sql === 'COMMIT');
    expect(commitRecord?.clientId).toBe(txClientId);
    // No ROLLBACK was issued.
    expect(queryLog.find((r) => r.sql === 'ROLLBACK')).toBeUndefined();
  });

  it('when unitOfWork.run throws, ROLLBACK is issued on the same client and no COMMIT runs', async () => {
    const txError = new Error('SIMULATED_FAILURE');
    await expect(
      deps.unitOfWork.run(async () => {
        await deps.assets.create({
          id: 'asset-2',
          projectId: 'proj-1',
          storageKey: 'proj-1/key2',
          mimeType: 'image/png',
          sizeBytes: 10,
          createdAt: new Date().toISOString(),
        });
        throw txError;
      })
    ).rejects.toThrow('SIMULATED_FAILURE');

    const beginRecord = queryLog.find((r) => r.sql === 'BEGIN');
    expect(beginRecord).toBeDefined();
    const txClientId = beginRecord!.clientId;

    const rollbackRecord = queryLog.find((r) => r.sql === 'ROLLBACK');
    expect(rollbackRecord).toBeDefined();
    expect(rollbackRecord!.clientId).toBe(txClientId);

    // No COMMIT.
    expect(queryLog.find((r) => r.sql === 'COMMIT')).toBeUndefined();
  });

  it('outside unitOfWork.run, each repository call opens its own client', async () => {
    await deps.projects.get('proj-1');
    await deps.projects.get('proj-2');

    // Each call to a repository method (outside a UoW) must open a fresh
    // client from the pool. The fake pool issues a unique ID per connect(),
    // so the two gets should use different client IDs.
    const selectQueries = queryLog.filter((r) =>
      r.sql.startsWith('SELECT * FROM projects')
    );
    expect(selectQueries).toHaveLength(2);
    expect(selectQueries[0].clientId).not.toBe(selectQueries[1].clientId);
  });

  it('nested unitOfWork.run reuses the outer transaction client (no nested BEGIN)', async () => {
    await deps.unitOfWork.run(async () => {
      const outerBegin = queryLog.find((r) => r.sql === 'BEGIN');
      expect(outerBegin).toBeDefined();
      const outerClientId = outerBegin!.clientId;

      // Nested UoW — should NOT issue another BEGIN/COMMIT/ROLLBACK.
      await deps.unitOfWork.run(async () => {
        await deps.assets.create({
          id: 'asset-nested',
          projectId: 'proj-1',
          storageKey: 'k',
          mimeType: 'image/png',
          sizeBytes: 1,
          createdAt: new Date().toISOString(),
        });
      });

      // The nested insert used the same client as the outer BEGIN.
      const nestedInsert = queryLog.find(
        (r) => r.sql.includes('INSERT INTO assets') && r.params?.[0] === 'asset-nested'
      );
      expect(nestedInsert?.clientId).toBe(outerClientId);
    });

    // Only ONE BEGIN (the outer one), one COMMIT.
    const begins = queryLog.filter((r) => r.sql === 'BEGIN');
    expect(begins).toHaveLength(1);
    const commits = queryLog.filter((r) => r.sql === 'COMMIT');
    expect(commits).toHaveLength(1);
  });

  // PERSIST-001 FINAL-CLOSURE AC-05 / AC-06: the production GenerationService
  // atomic success boundary wraps Asset.create + Version.createIdempotent +
  // Project.updatePointers + Job.updateIfClaimed in a single UoW. If the
  // final Job conditional update returns null (lease was taken over by
  // another worker between UoW begin and the conditional update), the
  // service throws JOB_LEASE_EXPIRED inside the UoW so the entire
  // transaction rolls back — no metadata leak survives. The result object
  // is then compensated by the outer catch (covered separately by
  // `GenerationService.p0.test.ts` P0-02 on the local adapter).
  it('AC-05/AC-06: final Job conditional failure (lease lost) → ROLLBACK on the same client; no COMMIT', async () => {
    const assetInput = {
      id: 'asset-stale',
      projectId: 'proj-1',
      storageKey: 'proj-1/stale',
      mimeType: 'image/png',
      sizeBytes: 4,
      createdAt: new Date().toISOString(),
    };
    const versionInput = {
      id: 'ver-stale',
      projectId: 'proj-1',
      assetId: 'asset-stale',
      label: 'v-stale',
      createdAt: new Date().toISOString(),
    };

    await expect(
      deps.unitOfWork.run(async () => {
        await deps.assets.create(assetInput);
        await deps.versions.createIdempotent('proj-1', 'idem-stale', versionInput);
        await deps.projects.updatePointers('proj-1', { activeVersionId: 'ver-stale' });
        // STALE_TOKEN triggers the FakeClient to return 0 rows, simulating
        // a lease-token mismatch (the lease was taken over by another worker).
        const updated = await deps.jobs.updateIfClaimed('job-1', 'STALE_TOKEN', {
          status: 'succeeded',
          resultVersionId: 'ver-stale',
        });
        if (!updated) {
          // Mirror GenerationService.executeJob's behavior: throw inside
          // the UoW so the transaction rolls back.
          throw new Error('JOB_LEASE_EXPIRED: simulated final conditional failure');
        }
      })
    ).rejects.toThrow('JOB_LEASE_EXPIRED');

    // Verify ROLLBACK was issued on the same client that ran BEGIN.
    const beginRecord = queryLog.find((r) => r.sql === 'BEGIN');
    expect(beginRecord).toBeDefined();
    const txClientId = beginRecord!.clientId;

    const rollbackRecord = queryLog.find((r) => r.sql === 'ROLLBACK');
    expect(rollbackRecord).toBeDefined();
    expect(rollbackRecord!.clientId).toBe(txClientId);

    // No COMMIT was issued.
    expect(queryLog.find((r) => r.sql === 'COMMIT')).toBeUndefined();

    // All four writes (Asset.create, Version.createIdempotent,
    // Project.updatePointers, jobs.updateIfClaimed) used the same client as
    // BEGIN — proving they were all in the same transaction and would be
    // rolled back together at the PostgreSQL level.
    const writeQueries = queryLog.filter(
      (r) =>
        r.sql.includes('INSERT INTO assets') ||
        r.sql.includes('INSERT INTO versions') ||
        r.sql.includes('INSERT INTO version_idempotency') ||
        r.sql.includes('UPDATE projects') ||
        r.sql.includes('UPDATE generation_jobs')
    );
    expect(writeQueries.length).toBeGreaterThanOrEqual(4);
    for (const q of writeQueries) {
      expect(q.clientId).toBe(txClientId);
    }

    // The final Job update used STALE_TOKEN and was issued on the tx client.
    const jobUpdateRecord = queryLog.find(
      (r) =>
        r.sql.includes('UPDATE generation_jobs') &&
        r.params?.[1] === 'STALE_TOKEN'
    );
    expect(jobUpdateRecord).toBeDefined();
    expect(jobUpdateRecord!.clientId).toBe(txClientId);
  });
});
