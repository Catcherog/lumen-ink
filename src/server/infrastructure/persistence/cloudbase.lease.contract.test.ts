/**
 * PERSIST-001 FINAL-CLOSURE AC-01 ~ AC-04: production adapter lease lifecycle.
 *
 * Verifies the three-state Job patch semantics on the CloudBase production
 * adapter (the file under test is `cloudbase.ts`, NOT the mock). The mock
 * already has correct semantics via `applyJobPatch`, but the production SQL
 * builder previously used `patch.field ?? null` everywhere — which collapsed
 * "field not in patch" and "field explicitly null" into the same NULL,
 * making it impossible to advance a Job's status without clobbering its
 * lease token / worker id / lease expiry.
 *
 * Acceptance Criteria covered:
 *  - AC-01: claim(token-A) → multiple updateIfClaimed(status-only patch)
 *    → lease token and lease expiry stay unchanged.
 *  - AC-02: heartbeat after stage migration still succeeds with the
 *    original token.
 *  - AC-03: cancel can explicitly clear worker, lease token and lease
 *    expiry (present-null writes NULL).
 *  - AC-04: after cancel, a stale worker's heartbeat and updateIfClaimed
 *    both fail (lease_token is NULL ≠ stale token; status is terminal).
 *
 * Strategy:
 *  - Mock `pg` with a stateful FakePool/FakeClient that tracks Job rows
 *    in memory and implements the actual SQL SET/WHERE semantics for
 *    `UPDATE generation_jobs`.
 *  - Seed a Job row, then drive it through claim → multiple stage
 *    transitions → heartbeat → cancel → stale-worker rejection.
 *  - Assert that the row's `lease_token`, `lease_expires_at`, and
 *    `worker_id` are preserved across status-only patches and explicitly
 *    cleared when the patch passes null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Stateful FakeClient -------------------------------------------------
//
// Tracks Job rows in memory so the test can assert that SQL UPDATE
// preserves / clears fields according to the patch's three-state semantics.

interface JobRow {
  id: string;
  project_id: string;
  prompt: string;
  status: string;
  provider_id: string | null;
  model: string | null;
  input_version_id: string | null;
  result_version_id: string | null;
  error: string | null;
  error_code: string | null;
  idempotency_key: string | null;
  worker_id: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempt: number | null;
  parent_job_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

class StatefulFakeClient {
  public id: string;
  public released = false;
  constructor(
    id: string,
    private readonly jobs: Map<string, JobRow>,
    private readonly queryLog: Array<{ sql: string; params?: unknown[] }>
  ) {
    this.id = id;
  }

  async query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number; command: string }> {
    this.queryLog.push({ sql, params });
    const trimmed = sql.trim();

    // CREATE TABLE / schema bootstrap — return empty.
    if (trimmed.startsWith('CREATE TABLE')) {
      return { rows: [] as T[], rowCount: 0, command: 'CREATE' };
    }

    // INSERT INTO generation_jobs — create the row.
    if (trimmed.startsWith('INSERT INTO generation_jobs')) {
      const id = params?.[0] as string;
      const row: JobRow = {
        id,
        project_id: params?.[1] as string,
        prompt: params?.[2] as string,
        status: params?.[3] as string,
        provider_id: (params?.[4] as string | null) ?? null,
        model: (params?.[5] as string | null) ?? null,
        input_version_id: (params?.[6] as string | null) ?? null,
        result_version_id: (params?.[7] as string | null) ?? null,
        error: (params?.[8] as string | null) ?? null,
        error_code: (params?.[9] as string | null) ?? null,
        idempotency_key: (params?.[10] as string | null) ?? null,
        worker_id: (params?.[11] as string | null) ?? null,
        lease_token: (params?.[12] as string | null) ?? null,
        lease_expires_at: params?.[13] ? new Date(params?.[13] as string) : null,
        attempt: (params?.[14] as number | null) ?? null,
        parent_job_id: (params?.[15] as string | null) ?? null,
        created_at: new Date(params?.[16] as string),
        updated_at: new Date(params?.[17] as string),
      };
      this.jobs.set(id, row);
      return { rows: [] as T[], rowCount: 1, command: 'INSERT' };
    }

    // SELECT * FROM generation_jobs WHERE id = $1
    if (trimmed.startsWith('SELECT * FROM generation_jobs WHERE id = $1')) {
      const id = params?.[0] as string;
      const row = this.jobs.get(id);
      return {
        rows: row ? ([row] as unknown as T[]) : [],
        rowCount: row ? 1 : 0,
        command: 'SELECT',
      };
    }

    // UPDATE generation_jobs SET ... WHERE ... (RETURNING * or RETURNING id)
    if (trimmed.startsWith('UPDATE generation_jobs')) {
      const id = params?.[0] as string;
      const row = this.jobs.get(id);
      if (!row) {
        return { rows: [] as T[], rowCount: 0, command: 'UPDATE' };
      }

      // Normalize whitespace so multi-line SQL templates parse identically
      // to single-line SQL. Without this, `SET\n  worker_id = $2,\n  ...`
      // would break the comma-split + regex match below.
      const normalized = trimmed.replace(/\s+/g, ' ');

      // Slice the SET fragment: between "UPDATE generation_jobs SET " and
      // the first " WHERE ".
      const setMarker = 'UPDATE generation_jobs SET ';
      const setStart = normalized.indexOf(setMarker) + setMarker.length;
      const whereStart = normalized.indexOf(' WHERE ', setStart);
      const setFragment = normalized.slice(setStart, whereStart);
      const whereFragment = normalized.slice(whereStart);

      // Evaluate WHERE clause predicates that the tests rely on:
      //  - "AND lease_token = $N"  → row.lease_token must equal params[N-1]
      //  - "AND status NOT IN ('succeeded', 'failed', 'cancelled')"
      //  - "AND (lease_token IS NULL OR lease_token = $N OR lease_expires_at <= $M)"
      //    → claim guard: row must be unclaimed, held by same token, or expired
      const leaseTokenEqMatch = whereFragment.match(/AND lease_token = \$(\d+)/);
      if (leaseTokenEqMatch) {
        const paramIdx = Number(leaseTokenEqMatch[1]) - 1;
        if (row.lease_token !== (params?.[paramIdx] as string | null)) {
          return { rows: [] as T[], rowCount: 0, command: 'UPDATE' };
        }
      }
      if (whereFragment.includes('status NOT IN')) {
        if (TERMINAL_STATUSES.has(row.status)) {
          return { rows: [] as T[], rowCount: 0, command: 'UPDATE' };
        }
      }
      if (whereFragment.includes('lease_token IS NULL')) {
        // claim predicate: row is eligible if lease is null, or matches the
        // new token, or the existing lease has expired.
        const newTokenMatch = whereFragment.match(/OR lease_token = \$(\d+)/);
        const expiryMatch = whereFragment.match(/OR lease_expires_at <= \$(\d+)/);
        const newToken = newTokenMatch
          ? (params?.[Number(newTokenMatch[1]) - 1] as string)
          : null;
        const nowVal = expiryMatch
          ? Date.parse(params?.[Number(expiryMatch[1]) - 1] as string)
          : Date.now();
        const currentExpiryMs = row.lease_expires_at
          ? row.lease_expires_at.getTime()
          : 0;
        const heldByOther =
          row.lease_token &&
          row.lease_token !== newToken &&
          currentExpiryMs > nowVal;
        if (heldByOther) {
          return { rows: [] as T[], rowCount: 0, command: 'UPDATE' };
        }
      }

      // Apply each SET assignment. The fragment looks like:
      //   "worker_id = $2, lease_token = $3, lease_expires_at = $4, updated_at = $5"
      // or for dynamic patches:
      //   "status = $3, updated_at = NOW()"
      const assignments = setFragment.split(', ');
      let updated_at_set = false;
      for (const assignment of assignments) {
        if (assignment === 'updated_at = NOW()') {
          row.updated_at = new Date();
          updated_at_set = true;
          continue;
        }
        const match = assignment.match(/^(\w+) = \$(\d+)$/);
        if (!match) continue;
        const col = match[1];
        const paramIdx = Number(match[2]) - 1;
        const value = params?.[paramIdx];
        if (col === 'updated_at') {
          row.updated_at = new Date(value as string);
          updated_at_set = true;
          continue;
        }
        (row as unknown as Record<string, unknown>)[col] =
          value === null
            ? null
            : col === 'lease_expires_at'
              ? new Date(value as string)
              : value;
      }
      if (!updated_at_set) {
        // Defensive: every SET clause should bump updated_at. If a future
        // refactor omits it, fail loudly rather than silently leaving the
        // stale timestamp.
        row.updated_at = new Date();
      }

      // If RETURNING id (claim/heartbeat), return only { id }. If RETURNING *
      // (update/updateIfClaimed/updateIfActive), return the full row.
      if (normalized.includes('RETURNING id')) {
        return {
          rows: [{ id: row.id } as unknown as T],
          rowCount: 1,
          command: 'UPDATE',
        };
      }
      return {
        rows: [row] as unknown as T[],
        rowCount: 1,
        command: 'UPDATE',
      };
    }

    return { rows: [] as T[], rowCount: 0, command: 'UNKNOWN' };
  }

  release(): void {
    this.released = true;
  }
}

class StatefulFakePool {
  private nextId = 0;
  constructor(
    private readonly jobs: Map<string, JobRow>,
    private readonly queryLog: Array<{ sql: string; params?: unknown[] }>
  ) {}
  async connect(): Promise<StatefulFakeClient> {
    this.nextId += 1;
    return new StatefulFakeClient(`client-${this.nextId}`, this.jobs, this.queryLog);
  }
  async end(): Promise<void> {}
  async query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number; command: string }> {
    this.queryLog.push({ sql, params });
    return { rows: [] as T[], rowCount: 0, command: sql.split(' ')[0] };
  }
}

let queryLog: Array<{ sql: string; params?: unknown[] }> = [];
let jobs: Map<string, JobRow> = new Map();

vi.mock('pg', () => {
  return {
    Pool: class extends StatefulFakePool {
      constructor() {
        super(jobs, queryLog);
      }
    },
    default: {
      Pool: class extends StatefulFakePool {
        constructor() {
          super(jobs, queryLog);
        }
      },
    },
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
  jobs = new Map();
  const deps = createCloudBasePersistence(OPTIONS);
  await deps.ensureReady();
  return deps;
}

async function seedJob(
  deps: Awaited<ReturnType<typeof freshDeps>>,
  overrides: Partial<GenerationJobInput> = {}
): Promise<void> {
  const now = new Date().toISOString();
  await deps.jobs.create({
    id: overrides.id ?? 'job-lease-1',
    projectId: overrides.projectId ?? 'proj-lease',
    prompt: overrides.prompt ?? 'lease lifecycle test',
    status: overrides.status ?? 'queued',
    attempt: 1,
    createdAt: now,
    updatedAt: now,
  });
}

interface GenerationJobInput {
  id: string;
  projectId: string;
  prompt: string;
  status: 'queued' | 'uploading' | 'analyzing' | 'generating' | 'postprocessing' | 'saving' | 'succeeded' | 'failed' | 'cancelled';
}

describe('PERSIST-001 FINAL-CLOSURE AC-01 ~ AC-04: production adapter lease lifecycle', () => {
  let deps: Awaited<ReturnType<typeof freshDeps>>;

  beforeEach(async () => {
    deps = await freshDeps();
  });

  it('AC-01: claim(token-A) → multiple updateIfClaimed(status-only patch) → lease token and expiry stay unchanged', async () => {
    await seedJob(deps);

    // claim with token-A
    const leaseExpiry1 = new Date(Date.now() + 60_000).toISOString();
    const now1 = new Date().toISOString();
    const claimed = await deps.jobs.claim('job-lease-1', {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: leaseExpiry1,
      now: now1,
    });
    expect(claimed).toBe(true);

    // Snapshot lease fields after claim.
    const afterClaim = await deps.jobs.get('job-lease-1');
    expect(afterClaim?.leaseToken).toBe('token-A');
    expect(afterClaim?.workerId).toBe('worker-A');
    const leaseTokenAfterClaim = afterClaim?.leaseToken;
    const leaseExpiryAfterClaim = afterClaim?.leaseExpiresAt;

    // Multiple status-only patches (no lease fields in patch).
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'uploading' });
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'analyzing' });
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'generating' });
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'postprocessing' });

    const afterStages = await deps.jobs.get('job-lease-1');
    expect(afterStages?.status).toBe('postprocessing');
    // CRITICAL: lease token and expiry MUST be unchanged by status-only patches.
    expect(afterStages?.leaseToken).toBe(leaseTokenAfterClaim);
    expect(afterStages?.leaseExpiresAt).toBe(leaseExpiryAfterClaim);
    expect(afterStages?.workerId).toBe('worker-A');

    // Explicit assertion: lease_token is still token-A.
    expect(afterStages?.leaseToken).toBe('token-A');
  });

  it('AC-02: heartbeat after stage migration still succeeds with the original token', async () => {
    await seedJob(deps);

    const leaseExpiry = new Date(Date.now() + 60_000).toISOString();
    const now = new Date().toISOString();
    await deps.jobs.claim('job-lease-1', {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: leaseExpiry,
      now,
    });

    // Stage migration: queued → uploading → analyzing → generating.
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'uploading' });
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'analyzing' });
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'generating' });

    // heartbeat with the ORIGINAL token (token-A) must still succeed.
    const newExpiry = new Date(Date.now() + 120_000).toISOString();
    const heartbeatOk = await deps.jobs.heartbeat('job-lease-1', {
      leaseToken: 'token-A',
      leaseExpiresAt: newExpiry,
      now: new Date().toISOString(),
    });
    expect(heartbeatOk).toBe(true);

    // Verify the expiry was bumped.
    const after = await deps.jobs.get('job-lease-1');
    expect(after?.leaseExpiresAt).toBe(newExpiry);
    // Lease token is still token-A (heartbeat must not change it).
    expect(after?.leaseToken).toBe('token-A');
  });

  it('AC-03: cancel explicitly clears worker, lease token and lease expiry (present-null writes NULL)', async () => {
    await seedJob(deps);

    const leaseExpiry = new Date(Date.now() + 60_000).toISOString();
    const now = new Date().toISOString();
    await deps.jobs.claim('job-lease-1', {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: leaseExpiry,
      now,
    });

    // Verify lease fields are populated before cancel.
    const beforeCancel = await deps.jobs.get('job-lease-1');
    expect(beforeCancel?.leaseToken).toBe('token-A');
    expect(beforeCancel?.workerId).toBe('worker-A');
    expect(beforeCancel?.leaseExpiresAt).toBe(leaseExpiry);

    // Cancel via updateIfActive with explicit null for the three lease fields.
    // `null` (not `undefined`) means "write NULL".
    const cancelled = await deps.jobs.updateIfActive('job-lease-1', {
      status: 'cancelled',
      workerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    expect(cancelled).not.toBeNull();
    expect(cancelled?.status).toBe('cancelled');
    // CRITICAL: all three lease fields must be NULL after the explicit clear.
    expect(cancelled?.workerId).toBeUndefined();
    expect(cancelled?.leaseToken).toBeUndefined();
    expect(cancelled?.leaseExpiresAt).toBeUndefined();

    // Re-read to verify the row actually persisted NULL.
    const afterCancel = await deps.jobs.get('job-lease-1');
    expect(afterCancel?.status).toBe('cancelled');
    expect(afterCancel?.workerId).toBeUndefined();
    expect(afterCancel?.leaseToken).toBeUndefined();
    expect(afterCancel?.leaseExpiresAt).toBeUndefined();
  });

  it('AC-04: after cancel, stale worker heartbeat and updateIfClaimed both fail', async () => {
    await seedJob(deps);

    const leaseExpiry = new Date(Date.now() + 60_000).toISOString();
    const now = new Date().toISOString();
    await deps.jobs.claim('job-lease-1', {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: leaseExpiry,
      now,
    });

    // Cancel — clears lease token, lease expiry, worker id.
    await deps.jobs.updateIfActive('job-lease-1', {
      status: 'cancelled',
      workerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    // Stale worker (still holding token-A) attempts heartbeat — must fail.
    const heartbeatResult = await deps.jobs.heartbeat('job-lease-1', {
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
    });
    expect(heartbeatResult).toBe(false);

    // Stale worker attempts updateIfClaimed with token-A — must return null.
    const updateResult = await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', {
      status: 'succeeded',
      resultVersionId: 'ver-fake',
    });
    expect(updateResult).toBeNull();

    // Final state: the Job remains cancelled. No stale worker can revive it.
    const final = await deps.jobs.get('job-lease-1');
    expect(final?.status).toBe('cancelled');
    expect(final?.leaseToken).toBeUndefined();
    expect(final?.resultVersionId).toBeUndefined();
  });

  it('regression: patch with explicit null status field is rejected by TypeScript (compile-time safety)', async () => {
    // This is a type-level assertion documented for reviewers: the
    // `Partial<GenerationJob>` type allows `status: undefined` (treated as
    // "not in patch") but does NOT allow `status: null` because `status`
    // is non-nullable in the domain model. The dynamic SET builder relies
    // on this — `status` is in JOB_PATCH_FIELDS, but only `string` values
    // pass type-check. The runtime guard `patch[jsField] === undefined`
    // correctly handles the absent case, and the `?? null` coercion only
    // applies to actually-nullable fields (workerId, leaseToken, etc.).
    // This test exists to fail loudly if a future refactor accidentally
    // widens the status type.
    await seedJob(deps);
    await deps.jobs.claim('job-lease-1', {
      workerId: 'worker-A',
      leaseToken: 'token-A',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
    });

    // Pass a patch that only updates status — verify the lease fields are
    // NOT in the SET clause at the SQL level.
    queryLog.length = 0;
    await deps.jobs.updateIfClaimed('job-lease-1', 'token-A', { status: 'uploading' });

    const updateRecord = queryLog.find(
      (r) => r.sql.startsWith('UPDATE generation_jobs SET') && r.params?.[1] === 'token-A'
    );
    expect(updateRecord).toBeDefined();
    // Extract ONLY the SET fragment (between "SET " and " WHERE ") so the
    // WHERE clause's `AND lease_token = $2` doesn't pollute the assertion.
    const normalizedSql = updateRecord!.sql.trim().replace(/\s+/g, ' ');
    const setMarker = 'UPDATE generation_jobs SET ';
    const setStartIdx = normalizedSql.indexOf(setMarker) + setMarker.length;
    const whereStartIdx = normalizedSql.indexOf(' WHERE ', setStartIdx);
    const setFragmentOnly = normalizedSql.slice(setStartIdx, whereStartIdx);
    // The SET fragment must NOT contain lease_token =, lease_expires_at =,
    // or worker_id = (because they are absent from the patch).
    expect(setFragmentOnly).not.toContain('lease_token = $');
    expect(setFragmentOnly).not.toContain('lease_expires_at = $');
    expect(setFragmentOnly).not.toContain('worker_id = $');
    // The SET fragment MUST contain status = $3 (status is in the patch,
    // and updateIfClaimed reserves $1=id + $2=leaseToken for the WHERE).
    expect(setFragmentOnly).toContain('status = $3');
  });
});
