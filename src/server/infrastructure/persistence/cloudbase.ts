/**
 * PERSIST-001 P0-01: CloudBase PostgreSQL + PG Storage production adapter.
 *
 * This adapter implements the frozen `PersistenceDependencies` surface using
 * CloudBase PostgreSQL for metadata and CloudBase PG Storage for object
 * bytes. It is selected when `VERCEL=1` and the required CloudBase
 * configuration is present.
 *
 * Design:
 *  - Configuration is validated eagerly at factory invocation time. Missing
 *    or partial config throws `CLOUDBASE_CONFIG_REQUIRED` so deployed mode
 *    fails fast rather than silently falling back to the local adapter.
 *  - The `pg` module is loaded lazily via dynamic `import('pg')` so the
 *    production adapter does not add a hard dependency to local dev / test
 *    environments. If `pg` is not installed, methods throw
 *    `PG_MODULE_REQUIRED` with a clear install hint.
 *  - The SQL layer mirrors the row shapes exercised by
 *    `cloudbase-mock.ts` (snake_case columns, idempotency indexes, lease
 *    fields). The schema is created idempotently on first connection via
 *    `ensureSchema()`.
 *  - Object storage uses CloudBase PG Storage's HTTP API (put/get/delete
 *    with bearer token). Signed URLs are produced via the storage token
 *    endpoint.
 *
 * Tests do NOT exercise this adapter against a real CloudBase instance.
 * The selection test in `select.test.ts` verifies that the factory is
 * chosen when config is present and that it returns a `__brand: 'cloudbase'`
 * deps object. The mock adapter (`cloudbase-mock.ts`) covers the contract
 * surface in tests.
 *
 * CloudBase live credentials are configured by the operator in the deploy
 * environment (Vercel Dashboard / `.env` on the host) and never enter the
 * repository or test fixtures.
 */

import type {
  PersistenceDependencies,
  Project,
  Asset,
  Version,
  GenerationJob,
  GenerationJobStatus,
  ProjectRepository,
  AssetRepository,
  VersionRepository,
  JobRepository,
  ObjectStore,
  UnitOfWork,
  AuthThrottleRepository,
  AuthThrottleBucket,
} from '../../domain/persistence.js';

const TERMINAL_JOB_STATUSES: GenerationJobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

function isTerminalStatus(status: GenerationJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export interface CloudBasePersistenceOptions {
  /** PostgreSQL connection URL (e.g. `postgresql://user:pass@host:5432/db`). */
  postgresUrl: string;
  /** CloudBase PG Storage private bucket name. */
  storageBucket: string;
  /** CloudBase PG Storage bearer token (or service-account-derived token). */
  storageToken: string;
  /** Optional: signed URL TTL in seconds (default 900 = 15 min). */
  signedUrlTtlSeconds?: number;
}

export interface CloudBasePersistenceDeps extends PersistenceDependencies {
  /** Brand marker so tests can distinguish production from local adapter. */
  __brand: 'cloudbase';
  /**
   * Lazily establish the PostgreSQL connection pool and ensure the schema
   * exists. Called by the server boot sequence after `selectPersistenceByEnv`.
   * Idempotent.
   */
  ensureReady(): Promise<void>;
  /** Close all open connections. Called on graceful shutdown. */
  close(): Promise<void>;
}

/**
 * Validate CloudBase configuration. Throws CLOUDBASE_CONFIG_REQUIRED if any
 * required field is missing or empty.
 */
export function validateCloudBaseConfig(
  options: Partial<CloudBasePersistenceOptions>
): asserts options is CloudBasePersistenceOptions {
  const missing: string[] = [];
  if (!options.postgresUrl) missing.push('CLOUDBASE_POSTGRES_URL');
  if (!options.storageBucket) missing.push('CLOUDBASE_STORAGE_BUCKET');
  if (!options.storageToken) missing.push('CLOUDBASE_STORAGE_TOKEN');
  if (missing.length > 0) {
    throw new Error(
      `CLOUDBASE_CONFIG_REQUIRED: missing required env vars: ${missing.join(', ')}`
    );
  }
}

/**
 * Create a CloudBase-backed PersistenceDependencies bundle.
 *
 * The adapter validates config eagerly and defers actual PostgreSQL /
 * storage connection until `ensureReady()` is called. Methods that are
 * invoked before `ensureReady()` completes throw `CLOUDBASE_NOT_READY` so
 * the boot sequence fails fast instead of silently no-op'ing.
 */
export function createCloudBasePersistence(
  options: CloudBasePersistenceOptions
): CloudBasePersistenceDeps {
  validateCloudBaseConfig(options);

  const signedUrlTtl = options.signedUrlTtlSeconds ?? 900;
  let ready = false;
  let pool: unknown | null = null;

  async function ensureReady(): Promise<void> {
    if (ready) return;
    // Lazy-load pg so local dev / test environments don't require it.
    let pgModule: typeof import('pg');
    try {
      pgModule = await import('pg');
    } catch {
      throw new Error(
        'PG_MODULE_REQUIRED: CloudBase adapter requires the "pg" package. Run `npm install pg` in the deployed environment.'
      );
    }
    pool = new pgModule.Pool({
      connectionString: options.postgresUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    await ensureSchema(pool);
    ready = true;
  }

  async function ensureSchema(poolInstance: unknown): Promise<void> {
    // Schema is created idempotently. The SQL mirrors the row shapes used
    // by cloudbase-mock.ts so the field-mapping layer is consistent.
    // Implementation is intentionally thin — production hardening (indexes,
    // partitions, migrations) is deferred to a dedicated STORAGE task.
    const client = await (poolInstance as { connect: () => Promise<unknown> }).connect();
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          active_version_id TEXT,
          approved_version_id TEXT
        );
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          storage_key TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS versions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS version_idempotency (
          project_id TEXT NOT NULL,
          key TEXT NOT NULL,
          version_id TEXT NOT NULL,
          PRIMARY KEY (project_id, key)
        );
        CREATE TABLE IF NOT EXISTS generation_jobs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL,
          provider_id TEXT,
          model TEXT,
          input_version_id TEXT,
          result_version_id TEXT,
          error TEXT,
          error_code TEXT,
          idempotency_key TEXT,
          worker_id TEXT,
          lease_token TEXT,
          lease_expires_at TIMESTAMPTZ,
          attempt INTEGER,
          parent_job_id TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS job_idempotency (
          key TEXT PRIMARY KEY,
          job_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_throttle (
          key TEXT PRIMARY KEY,
          failures INTEGER NOT NULL,
          window_started_at TIMESTAMPTZ NOT NULL
        );
      `;
      await (client as { query: (sql: string) => Promise<unknown> }).query(sql);
    } finally {
      await (client as { release: () => void }).release();
    }
  }

  async function close(): Promise<void> {
    if (pool) {
      await (pool as { end: () => Promise<void> }).end();
      pool = null;
    }
    ready = false;
  }

  function assertReady(): void {
    if (!ready) {
      throw new Error(
        'CLOUDBASE_NOT_READY: ensureReady() must be called before invoking adapter methods'
      );
    }
  }

  // --- ProjectRepository (delegates to pg Pool) ---------------------------

  const projects: ProjectRepository = {
    async create(input: Project): Promise<Project> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO projects (id, name, created_at, updated_at, active_version_id, approved_version_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.id,
            input.name,
            input.createdAt,
            input.updatedAt,
            input.activeVersionId ?? null,
            input.approvedVersionId ?? null,
          ]
        );
        return { ...input };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async get(id: string): Promise<Project | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM projects WHERE id = $1`,
          [id]
        );
        const row = result.rows[0] as
          | {
              id: string;
              name: string;
              created_at: Date;
              updated_at: Date;
              active_version_id: string | null;
              approved_version_id: string | null;
            }
          | undefined;
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          activeVersionId: row.active_version_id ?? undefined,
          approvedVersionId: row.approved_version_id ?? undefined,
        };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE projects
           SET active_version_id = COALESCE($2, active_version_id),
               approved_version_id = COALESCE($3, approved_version_id),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, input.activeVersionId ?? null, input.approvedVersionId ?? null]
        );
        const row = result.rows[0] as {
          id: string;
          name: string;
          created_at: Date;
          updated_at: Date;
          active_version_id: string | null;
          approved_version_id: string | null;
        };
        return {
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          activeVersionId: row.active_version_id ?? undefined,
          approvedVersionId: row.approved_version_id ?? undefined,
        };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async deleteCascade(id: string): Promise<void> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        // Collect asset storage keys for object cleanup.
        const assetResult = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT storage_key FROM assets WHERE project_id = $1`,
          [id]
        );
        const storageKeys = (
          assetResult.rows as { storage_key: string }[]
        ).map((r) => r.storage_key);
        // Delete object bytes via storage API (best-effort).
        await Promise.all(
          storageKeys.map(async (key: string) => {
            try {
              await deleteObject(options, key);
            } catch {
              // Swallow — orphaned bytes are retryable.
            }
          })
        );
        // CASCADE handles versions, jobs, idempotency rows.
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `DELETE FROM projects WHERE id = $1`,
          [id]
        );
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO assets (id, project_id, storage_key, mime_type, size_bytes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.id,
            input.projectId,
            input.storageKey,
            input.mimeType,
            input.sizeBytes,
            input.createdAt,
          ]
        );
        return { ...input };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async get(id: string): Promise<Asset | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM assets WHERE id = $1`,
          [id]
        );
        const row = result.rows[0] as
          | {
              id: string;
              project_id: string;
              storage_key: string;
              mime_type: string;
              size_bytes: number;
              created_at: Date;
            }
          | undefined;
        if (!row) return null;
        return {
          id: row.id,
          projectId: row.project_id,
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          createdAt: row.created_at.toISOString(),
        };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async listByProject(projectId: string): Promise<Asset[]> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM assets WHERE project_id = $1`,
          [projectId]
        );
        return (
          result.rows as {
            id: string;
            project_id: string;
            storage_key: string;
            mime_type: string;
            size_bytes: number;
            created_at: Date;
          }[]
        ).map((r) => ({
            id: r.id,
            projectId: r.project_id,
            storageKey: r.storage_key,
            mimeType: r.mime_type,
            sizeBytes: r.size_bytes,
            createdAt: r.created_at.toISOString(),
          })
        );
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO versions (id, project_id, asset_id, label, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.id, input.projectId, input.assetId, input.label, input.createdAt]
        );
        return { ...input };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
        // Check idempotency index.
        const existing = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT version_id FROM version_idempotency WHERE project_id = $1 AND key = $2`,
          [projectId, idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const existingId = (existing.rows[0] as { version_id: string }).version_id;
          const existingVersion = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
            `SELECT * FROM versions WHERE id = $1`,
            [existingId]
          );
          await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
          const row = existingVersion.rows[0] as {
            id: string;
            project_id: string;
            asset_id: string;
            label: string;
            created_at: Date;
          };
          return {
            id: row.id,
            projectId: row.project_id,
            assetId: row.asset_id,
            label: row.label,
            createdAt: row.created_at.toISOString(),
          };
        }
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO versions (id, project_id, asset_id, label, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [version.id, version.projectId, version.assetId, version.label, version.createdAt]
        );
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO version_idempotency (project_id, key, version_id) VALUES ($1, $2, $3)`,
          [projectId, idempotencyKey, version.id]
        );
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
        return { ...version };
      } catch (err) {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
        throw err;
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async get(id: string): Promise<Version | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM versions WHERE id = $1`,
          [id]
        );
        const row = result.rows[0] as
          | {
              id: string;
              project_id: string;
              asset_id: string;
              label: string;
              created_at: Date;
            }
          | undefined;
        if (!row) return null;
        return {
          id: row.id,
          projectId: row.project_id,
          assetId: row.asset_id,
          label: row.label,
          createdAt: row.created_at.toISOString(),
        };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async listByProject(projectId: string): Promise<Version[]> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM versions WHERE project_id = $1`,
          [projectId]
        );
        return (
          result.rows as {
            id: string;
            project_id: string;
            asset_id: string;
            label: string;
            created_at: Date;
          }[]
        ).map((r) => ({
            id: r.id,
            projectId: r.project_id,
            assetId: r.asset_id,
            label: r.label,
            createdAt: r.created_at.toISOString(),
          })
        );
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  // --- JobRepository ------------------------------------------------------

  function jobFromRow(row: {
    id: string;
    project_id: string;
    prompt: string;
    status: GenerationJobStatus;
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
  }): GenerationJob {
    return {
      id: row.id,
      projectId: row.project_id,
      prompt: row.prompt,
      status: row.status,
      providerId: row.provider_id ?? undefined,
      model: row.model ?? undefined,
      inputVersionId: row.input_version_id ?? undefined,
      resultVersionId: row.result_version_id ?? undefined,
      error: row.error ?? undefined,
      errorCode: row.error_code ?? undefined,
      idempotencyKey: row.idempotency_key ?? undefined,
      workerId: row.worker_id ?? undefined,
      leaseToken: row.lease_token ?? undefined,
      leaseExpiresAt: row.lease_expires_at?.toISOString() ?? undefined,
      attempt: row.attempt ?? undefined,
      parentJobId: row.parent_job_id ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO generation_jobs
           (id, project_id, prompt, status, provider_id, model, input_version_id, result_version_id,
            error, error_code, idempotency_key, worker_id, lease_token, lease_expires_at, attempt,
            parent_job_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            input.id,
            input.projectId,
            input.prompt,
            input.status,
            input.providerId ?? null,
            input.model ?? null,
            input.inputVersionId ?? null,
            input.resultVersionId ?? null,
            input.error ?? null,
            input.errorCode ?? null,
            input.idempotencyKey ?? null,
            input.workerId ?? null,
            input.leaseToken ?? null,
            input.leaseExpiresAt ?? null,
            input.attempt ?? null,
            input.parentJobId ?? null,
            input.createdAt,
            input.updatedAt,
          ]
        );
        if (input.idempotencyKey) {
          await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
            `INSERT INTO job_idempotency (key, job_id) VALUES ($1, $2)
             ON CONFLICT (key) DO NOTHING`,
            [input.idempotencyKey, input.id]
          );
        }
        return { ...input };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async createIdempotent(
      input: GenerationJob
    ): Promise<{ job: GenerationJob; created: boolean }> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
        if (input.idempotencyKey) {
          const existing = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
            `SELECT job_id FROM job_idempotency WHERE key = $1`,
            [input.idempotencyKey]
          );
          if (existing.rows.length > 0) {
            const existingId = (existing.rows[0] as { job_id: string }).job_id;
            const existingJob = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
              `SELECT * FROM generation_jobs WHERE id = $1`,
              [existingId]
            );
            await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
            if (existingJob.rows.length === 0) {
              // Stale index — fall through and recreate.
            } else {
              return {
                job: jobFromRow(existingJob.rows[0] as Parameters<typeof jobFromRow>[0]),
                created: false,
              };
            }
          }
        }
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO generation_jobs
           (id, project_id, prompt, status, provider_id, model, input_version_id, result_version_id,
            error, error_code, idempotency_key, worker_id, lease_token, lease_expires_at, attempt,
            parent_job_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            input.id,
            input.projectId,
            input.prompt,
            input.status,
            input.providerId ?? null,
            input.model ?? null,
            input.inputVersionId ?? null,
            input.resultVersionId ?? null,
            input.error ?? null,
            input.errorCode ?? null,
            input.idempotencyKey ?? null,
            input.workerId ?? null,
            input.leaseToken ?? null,
            input.leaseExpiresAt ?? null,
            input.attempt ?? null,
            input.parentJobId ?? null,
            input.createdAt,
            input.updatedAt,
          ]
        );
        if (input.idempotencyKey) {
          await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
            `INSERT INTO job_idempotency (key, job_id) VALUES ($1, $2)`,
            [input.idempotencyKey, input.id]
          );
        }
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
        return { job: { ...input }, created: true };
      } catch (err) {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
        throw err;
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async get(id: string): Promise<GenerationJob | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM generation_jobs WHERE id = $1`,
          [id]
        );
        const row = result.rows[0] as Parameters<typeof jobFromRow>[0] | undefined;
        return row ? jobFromRow(row) : null;
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async update(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE generation_jobs SET
             status = COALESCE($2, status),
             provider_id = COALESCE($3, provider_id),
             model = COALESCE($4, model),
             input_version_id = COALESCE($5, input_version_id),
             result_version_id = COALESCE($6, result_version_id),
             error = COALESCE($7, error),
             error_code = COALESCE($8, error_code),
             worker_id = COALESCE($9, worker_id),
             lease_token = COALESCE($10, lease_token),
             lease_expires_at = COALESCE($11, lease_expires_at),
             attempt = COALESCE($12, attempt),
             parent_job_id = COALESCE($13, parent_job_id),
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            patch.status ?? null,
            patch.providerId ?? null,
            patch.model ?? null,
            patch.inputVersionId ?? null,
            patch.resultVersionId ?? null,
            patch.error ?? null,
            patch.errorCode ?? null,
            patch.workerId ?? null,
            patch.leaseToken ?? null,
            patch.leaseExpiresAt ?? null,
            patch.attempt ?? null,
            patch.parentJobId ?? null,
          ]
        );
        if (result.rows.length === 0) {
          throw new Error(`JOB_NOT_FOUND:${id}`);
        }
        return jobFromRow(result.rows[0] as Parameters<typeof jobFromRow>[0]);
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async updateIfClaimed(
      id: string,
      leaseToken: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE generation_jobs SET
             status = COALESCE($3, status),
             provider_id = COALESCE($4, provider_id),
             model = COALESCE($5, model),
             input_version_id = COALESCE($6, input_version_id),
             result_version_id = COALESCE($7, result_version_id),
             error = COALESCE($8, error),
             error_code = COALESCE($9, error_code),
             worker_id = COALESCE($10, worker_id),
             lease_token = CASE WHEN $11::text IS NULL THEN NULL ELSE COALESCE(lease_token, lease_token) END,
             lease_expires_at = CASE WHEN $12::timestamptz IS NULL THEN NULL ELSE COALESCE(lease_expires_at, lease_expires_at) END,
             attempt = COALESCE($13, attempt),
             parent_job_id = COALESCE($14, parent_job_id),
             updated_at = NOW()
           WHERE id = $1
             AND lease_token = $2
             AND status NOT IN ('succeeded', 'failed', 'cancelled')
           RETURNING *`,
          [
            id,
            leaseToken,
            patch.status ?? null,
            patch.providerId ?? null,
            patch.model ?? null,
            patch.inputVersionId ?? null,
            patch.resultVersionId ?? null,
            patch.error ?? null,
            patch.errorCode ?? null,
            patch.workerId ?? null,
            patch.leaseToken ?? null,
            patch.leaseExpiresAt ?? null,
            patch.attempt ?? null,
            patch.parentJobId ?? null,
          ]
        );
        if (result.rows.length === 0) return null;
        return jobFromRow(result.rows[0] as Parameters<typeof jobFromRow>[0]);
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async updateIfActive(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE generation_jobs SET
             status = COALESCE($2, status),
             provider_id = COALESCE($3, provider_id),
             model = COALESCE($4, model),
             input_version_id = COALESCE($5, input_version_id),
             result_version_id = COALESCE($6, result_version_id),
             error = COALESCE($7, error),
             error_code = COALESCE($8, error_code),
             worker_id = CASE WHEN $9::text IS NULL THEN NULL ELSE COALESCE(worker_id, worker_id) END,
             lease_token = CASE WHEN $10::text IS NULL THEN NULL ELSE COALESCE(lease_token, lease_token) END,
             lease_expires_at = CASE WHEN $11::timestamptz IS NULL THEN NULL ELSE COALESCE(lease_expires_at, lease_expires_at) END,
             attempt = COALESCE($12, attempt),
             parent_job_id = COALESCE($13, parent_job_id),
             updated_at = NOW()
           WHERE id = $1
             AND status NOT IN ('succeeded', 'failed', 'cancelled')
           RETURNING *`,
          [
            id,
            patch.status ?? null,
            patch.providerId ?? null,
            patch.model ?? null,
            patch.inputVersionId ?? null,
            patch.resultVersionId ?? null,
            patch.error ?? null,
            patch.errorCode ?? null,
            patch.workerId ?? null,
            patch.leaseToken ?? null,
            patch.leaseExpiresAt ?? null,
            patch.attempt ?? null,
            patch.parentJobId ?? null,
          ]
        );
        if (result.rows.length === 0) return null;
        return jobFromRow(result.rows[0] as Parameters<typeof jobFromRow>[0]);
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE generation_jobs SET
             worker_id = $2,
             lease_token = $3,
             lease_expires_at = $4,
             updated_at = $5
           WHERE id = $1
             AND status NOT IN ('succeeded', 'failed', 'cancelled')
             AND (
               lease_token IS NULL
               OR lease_token = $3
               OR lease_expires_at <= $5
             )
           RETURNING id`,
          [id, input.workerId, input.leaseToken, input.leaseExpiresAt, input.now]
        );
        if (result.rows.length === 0) {
          // Check if the job exists at all (for the JOB_NOT_FOUND throw).
          const exists = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
            `SELECT id FROM generation_jobs WHERE id = $1`,
            [id]
          );
          if (exists.rows.length === 0) {
            throw new Error(`JOB_NOT_FOUND:${id}`);
          }
          return false;
        }
        return true;
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `UPDATE generation_jobs SET
             lease_expires_at = $3,
             updated_at = $4
           WHERE id = $1
             AND lease_token = $2
             AND status NOT IN ('succeeded', 'failed', 'cancelled')
           RETURNING id`,
          [id, input.leaseToken, input.leaseExpiresAt, input.now]
        );
        return result.rows.length > 0;
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM generation_jobs
           WHERE project_id = $1
             AND status IN ('queued', 'uploading', 'analyzing', 'generating', 'postprocessing', 'saving')`,
          [projectId]
        );
        return result.rows.map((r) => jobFromRow(r as Parameters<typeof jobFromRow>[0]));
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        // Jobs with no lease (queued, never claimed) are available for
        // recovery. Jobs with an expired lease are also available.
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM generation_jobs
           WHERE status IN ('queued', 'uploading', 'analyzing', 'generating', 'postprocessing', 'saving')
             AND (lease_expires_at IS NULL OR lease_expires_at <= $1)`,
          [now]
        );
        return result.rows.map((r) => jobFromRow(r as Parameters<typeof jobFromRow>[0]));
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  // --- ObjectStore (CloudBase PG Storage via HTTP API) --------------------

  const objects: ObjectStore = {
    async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
      assertReady();
      await putObject(options, key, bytes, mimeType);
    },
    async get(key: string): Promise<Uint8Array> {
      assertReady();
      return getObject(options, key);
    },
    async getSignedUrl(key: string): Promise<string> {
      assertReady();
      return getSignedUrl(options, key, signedUrlTtl);
    },
    async delete(key: string): Promise<void> {
      assertReady();
      await deleteObject(options, key);
    },
    async exists(key: string): Promise<boolean> {
      assertReady();
      return objectExists(options, key);
    },
  };

  // --- UnitOfWork (PostgreSQL transaction) --------------------------------

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
        try {
          const result = await fn();
          await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
          return result;
        } catch (err) {
          await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
          throw err;
        }
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
          `SELECT * FROM auth_throttle WHERE key = $1`,
          [key]
        );
        const row = result.rows[0] as
          | { key: string; failures: number; window_started_at: Date }
          | undefined;
        if (!row) return null;
        return {
          failures: row.failures,
          windowStartedAt: row.window_started_at.toISOString(),
        };
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `INSERT INTO auth_throttle (key, failures, window_started_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET
             failures = EXCLUDED.failures,
             window_started_at = EXCLUDED.window_started_at`,
          [key, value.failures, value.windowStartedAt]
        );
      } finally {
        (client as { release: () => void }).release();
      }
    },
    async delete(key: string): Promise<void> {
      assertReady();
      const client = await (pool as { connect: () => Promise<unknown> }).connect();
      try {
        await (client as { query: (sql: string, params: unknown[]) => Promise<unknown> }).query(
          `DELETE FROM auth_throttle WHERE key = $1`,
          [key]
        );
      } finally {
        (client as { release: () => void }).release();
      }
    },
  };

  return {
    __brand: 'cloudbase',
    projects,
    assets,
    versions,
    jobs,
    objects,
    unitOfWork,
    authThrottle,
    ensureReady,
    close,
  };
}

// --- CloudBase PG Storage HTTP helpers (module-private) -------------------

async function putObject(
  options: CloudBasePersistenceOptions,
  key: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<void> {
  const url = `https://${options.storageBucket}.tcb-api.tencentcloudapi.com/objects/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
      'Content-Type': mimeType,
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) {
    throw new Error(`OBJECT_PUT_FAILED: ${response.status} ${response.statusText}`);
  }
}

async function getObject(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<Uint8Array> {
  const url = `https://${options.storageBucket}.tcb-api.tencentcloudapi.com/objects/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
    },
  });
  if (response.status === 404) {
    throw new Error(`OBJECT_NOT_FOUND:${key}`);
  }
  if (!response.ok) {
    throw new Error(`OBJECT_GET_FAILED: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function deleteObject(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<void> {
  const url = `https://${options.storageBucket}.tcb-api.tencentcloudapi.com/objects/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
    },
  });
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`OBJECT_DELETE_FAILED: ${response.status} ${response.statusText}`);
  }
}

async function objectExists(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<boolean> {
  const url = `https://${options.storageBucket}.tcb-api.tencentcloudapi.com/objects/${encodeURIComponent(key)}/head`;
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
    },
  });
  return response.ok;
}

async function getSignedUrl(
  options: CloudBasePersistenceOptions,
  key: string,
  ttlSeconds: number
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const url = `https://${options.storageBucket}.tcb-api.tencentcloudapi.com/objects/${encodeURIComponent(key)}/signed-url`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresAt }),
  });
  if (!response.ok) {
    throw new Error(`SIGNED_URL_FAILED: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}
