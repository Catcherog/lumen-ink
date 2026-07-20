/**
 * PERSIST-001 P0-01 / P0-02: CloudBase PostgreSQL + PG Storage production adapter.
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
 *  - The `pg` module is loaded as a normal runtime dependency (PERSIST001-P0-01A).
 *    It is still imported dynamically so local dev / test environments can
 *    avoid paying the connection cost unless they actually need the adapter.
 *    If `pg` cannot be resolved for any reason, the adapter throws
 *    `PG_MODULE_REQUIRED` with a clear install hint.
 *  - The SQL layer mirrors the row shapes exercised by `cloudbase-mock.ts`
 *    (snake_case columns, idempotency indexes, lease fields). The schema is
 *    created idempotently on first connection via `ensureSchema()`.
 *  - Object storage uses CloudBase PG Storage's official HTTP OpenAPI
 *    (PERSIST001-P0-01B):
 *      Base URL: https://<envId>.api.tcloudbasegateway.com
 *      Upload (POST)   /v1/storages/object/<bucketId>/<objectName>
 *      Download (GET)  /v1/storages/object/<bucketId>/<objectName>
 *      Delete (DELETE) /v1/storages/object/<bucketId>/<objectName>
 *      Exists  (HEAD)  /v1/storages/object/<bucketId>/<objectName>
 *      Signed URL (POST) /v1/storages/object/sign/<bucketId>/<objectName>
 *                       body: {"expiresIn": <seconds>}
 *                       response: {"signedURL": "...", "fullSignedURL": "..."}
 *    Auth: `Authorization: Bearer <service-role API key>` on all mutating
 *    endpoints and on signed-URL generation; read endpoints also accept
 *    anonymous access for public buckets (we always send the header so the
 *    private bucket path works).
 *  - UnitOfWork uses AsyncLocalStorage to propagate the active transaction
 *    client to nested repository calls (PERSIST001-P0-02A). This guarantees
 *    that Asset.create + Version.createIdempotent + Project.updatePointers +
 *    Job.updateIfClaimed all execute on the SAME PoolClient when wrapped in
 *    a single `unitOfWork.run(...)`, so a final Job conditional failure
 *    rolls back all metadata writes in one transaction.
 *
 * Tests do NOT exercise this adapter against a real CloudBase instance.
 * The selection test in `select.test.ts` verifies that the factory is
 * chosen when config is present and that it returns a `__brand: 'cloudbase'`
 * deps object. The HTTP contract test in `cloudbase.http.contract.test.ts`
 * verifies the URL / method / header / body shapes against the official
 * CloudBase PG Storage OpenAPI using a fetch mock. The transaction test in
 * `cloudbase.transaction.contract.test.ts` verifies that all four writes
 * share the same PoolClient.
 *
 * CloudBase live credentials are configured by the operator in the deploy
 * environment (Vercel Dashboard / `.env` on the host) and never enter the
 * repository or test fixtures.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
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

// --- pg types -------------------------------------------------------------
// We import the types lazily alongside the runtime module so that local dev
// environments without `pg` installed can still type-check the rest of the
// server. The dynamic `import('pg')` in `ensureReady` is the single source
// of truth for the runtime module.

interface PgPoolClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number; command: string }>;
  release(): void;
}

interface PgPool {
  connect(): Promise<PgPoolClient>;
  end(): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number; command: string }>;
}

interface PgModule {
  Pool: new (config: unknown) => PgPool;
}

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
  /** CloudBase environment ID (used in the API subdomain). */
  envId: string;
  /** CloudBase PG Storage private bucket ID (path parameter). */
  bucketId: string;
  /**
   * CloudBase service-role API key. Sent as `Authorization: Bearer <token>`
   * to all mutating storage endpoints and signed-URL generation. Bypasses
   * PostgreSQL RLS so the server can manage objects across all projects.
   */
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
  if (!options.envId) missing.push('CLOUDBASE_ENV_ID');
  if (!options.bucketId) missing.push('CLOUDBASE_STORAGE_BUCKET');
  if (!options.storageToken) missing.push('CLOUDBASE_STORAGE_TOKEN');
  if (missing.length > 0) {
    throw new Error(
      `CLOUDBASE_CONFIG_REQUIRED: missing required env vars: ${missing.join(', ')}`
    );
  }
}

/**
 * Build the CloudBase PG Storage base URL for a given environment.
 *
 * Public for testability — the contract test asserts the URL shape.
 */
export function buildStorageBaseUrl(envId: string): string {
  return `https://${envId}.api.tcloudbasegateway.com`;
}

/**
 * Build the full object URL.
 *
 * Public for testability.
 */
export function buildObjectUrl(envId: string, bucketId: string, objectName: string): string {
  const encodedObjectName = objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${buildStorageBaseUrl(envId)}/v1/storages/object/${encodeURIComponent(bucketId)}/${encodedObjectName}`;
}

/**
 * Build the signed-URL generation endpoint.
 *
 * Public for testability.
 */
export function buildSignedUrlEndpoint(envId: string, bucketId: string, objectName: string): string {
  const encodedObjectName = objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${buildStorageBaseUrl(envId)}/v1/storages/object/sign/${encodeURIComponent(bucketId)}/${encodedObjectName}`;
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
  let pool: PgPool | null = null;

  // AsyncLocalStorage carries the active transaction PoolClient so that
  // repository methods invoked inside `unitOfWork.run(...)` use the same
  // client. Outside a transaction, each method opens its own short-lived
  // client from the pool and releases it after the query.
  const transactionStorage = new AsyncLocalStorage<{ client: PgPoolClient }>();

  async function ensureReady(): Promise<void> {
    if (ready) return;
    // Dynamic import keeps local dev / test environments from paying the
    // connection cost unless they actually instantiate this adapter.
    let pgModule: PgModule;
    try {
      pgModule = (await import('pg')) as unknown as PgModule;
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

  async function ensureSchema(poolInstance: PgPool): Promise<void> {
    const client = await poolInstance.connect();
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
      await client.query(sql);
    } finally {
      client.release();
    }
  }

  async function close(): Promise<void> {
    if (pool) {
      await pool.end();
      pool = null;
    }
    ready = false;
  }

  function assertReady(): void {
    if (!ready || !pool) {
      throw new Error(
        'CLOUDBASE_NOT_READY: ensureReady() must be called before invoking adapter methods'
      );
    }
  }

  /**
   * Acquire a client for a single query.
   *  - If a transaction is active (unitOfWork.run), use its client.
   *  - Otherwise, open a fresh client and release it after `fn` completes.
   *
   * The transaction path does NOT release the client — the outer UoW owns it.
   */
  async function withClient<T>(fn: (client: PgPoolClient) => Promise<T>): Promise<T> {
    assertReady();
    const ctx = transactionStorage.getStore();
    if (ctx) {
      return fn(ctx.client);
    }
    const client = await (pool as PgPool).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  // --- ProjectRepository (delegates to pg Pool) ---------------------------

  const projects: ProjectRepository = {
    async create(input: Project): Promise<Project> {
      assertReady();
      await withClient((client) =>
        client.query(
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
        )
      );
      return { ...input };
    },
    async get(id: string): Promise<Project | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          name: string;
          created_at: Date;
          updated_at: Date;
          active_version_id: string | null;
          approved_version_id: string | null;
        }>(
          `SELECT * FROM projects WHERE id = $1`,
          [id]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          activeVersionId: row.active_version_id ?? undefined,
          approvedVersionId: row.approved_version_id ?? undefined,
        };
      });
    },
    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          name: string;
          created_at: Date;
          updated_at: Date;
          active_version_id: string | null;
          approved_version_id: string | null;
        }>(
          `UPDATE projects
           SET active_version_id = COALESCE($2, active_version_id),
               approved_version_id = COALESCE($3, approved_version_id),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, input.activeVersionId ?? null, input.approvedVersionId ?? null]
        );
        const row = result.rows[0];
        if (!row) throw new Error(`PROJECT_NOT_FOUND:${id}`);
        return {
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          activeVersionId: row.active_version_id ?? undefined,
          approvedVersionId: row.approved_version_id ?? undefined,
        };
      });
    },
    async deleteCascade(id: string): Promise<void> {
      assertReady();
      // Collect storage keys first (own client — outside any transaction so
      // we don't hold the transaction open during best-effort object cleanup).
      const storageKeys = await withClient(async (client) => {
        const assetResult = await client.query<{ storage_key: string }>(
          `SELECT storage_key FROM assets WHERE project_id = $1`,
          [id]
        );
        return assetResult.rows.map((r) => r.storage_key);
      });
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
      await withClient((client) =>
        client.query(`DELETE FROM projects WHERE id = $1`, [id])
      );
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      assertReady();
      await withClient((client) =>
        client.query(
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
        )
      );
      return { ...input };
    },
    async get(id: string): Promise<Asset | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          project_id: string;
          storage_key: string;
          mime_type: string;
          size_bytes: number;
          created_at: Date;
        }>(`SELECT * FROM assets WHERE id = $1`, [id]);
        const row = result.rows[0];
        if (!row) return null;
        return {
          id: row.id,
          projectId: row.project_id,
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          createdAt: row.created_at.toISOString(),
        };
      });
    },
    async listByProject(projectId: string): Promise<Asset[]> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          project_id: string;
          storage_key: string;
          mime_type: string;
          size_bytes: number;
          created_at: Date;
        }>(`SELECT * FROM assets WHERE project_id = $1`, [projectId]);
        return result.rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          storageKey: r.storage_key,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          createdAt: r.created_at.toISOString(),
        }));
      });
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      assertReady();
      await withClient((client) =>
        client.query(
          `INSERT INTO versions (id, project_id, asset_id, label, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.id, input.projectId, input.assetId, input.label, input.createdAt]
        )
      );
      return { ...input };
    },
    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      assertReady();
      return withClient(async (client) => {
        // Check idempotency index first.
        const existing = await client.query<{ version_id: string }>(
          `SELECT version_id FROM version_idempotency WHERE project_id = $1 AND key = $2`,
          [projectId, idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const existingId = existing.rows[0].version_id;
          const existingVersion = await client.query<{
            id: string;
            project_id: string;
            asset_id: string;
            label: string;
            created_at: Date;
          }>(`SELECT * FROM versions WHERE id = $1`, [existingId]);
          const row = existingVersion.rows[0];
          if (!row) {
            // Stale index — fall through and recreate.
          } else {
            return {
              id: row.id,
              projectId: row.project_id,
              assetId: row.asset_id,
              label: row.label,
              createdAt: row.created_at.toISOString(),
            };
          }
        }
        await client.query(
          `INSERT INTO versions (id, project_id, asset_id, label, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [version.id, version.projectId, version.assetId, version.label, version.createdAt]
        );
        await client.query(
          `INSERT INTO version_idempotency (project_id, key, version_id) VALUES ($1, $2, $3)`,
          [projectId, idempotencyKey, version.id]
        );
        return { ...version };
      });
    },
    async get(id: string): Promise<Version | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          project_id: string;
          asset_id: string;
          label: string;
          created_at: Date;
        }>(`SELECT * FROM versions WHERE id = $1`, [id]);
        const row = result.rows[0];
        if (!row) return null;
        return {
          id: row.id,
          projectId: row.project_id,
          assetId: row.asset_id,
          label: row.label,
          createdAt: row.created_at.toISOString(),
        };
      });
    },
    async listByProject(projectId: string): Promise<Version[]> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          id: string;
          project_id: string;
          asset_id: string;
          label: string;
          created_at: Date;
        }>(`SELECT * FROM versions WHERE project_id = $1`, [projectId]);
        return result.rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          assetId: r.asset_id,
          label: r.label,
          createdAt: r.created_at.toISOString(),
        }));
      });
    },
  };

  // --- JobRepository ------------------------------------------------------

  interface JobRow {
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
  }

  function jobFromRow(row: JobRow): GenerationJob {
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
      await withClient(async (client) => {
        await client.query(
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
          await client.query(
            `INSERT INTO job_idempotency (key, job_id) VALUES ($1, $2)
             ON CONFLICT (key) DO NOTHING`,
            [input.idempotencyKey, input.id]
          );
        }
      });
      return { ...input };
    },
    async createIdempotent(
      input: GenerationJob
    ): Promise<{ job: GenerationJob; created: boolean }> {
      assertReady();
      return withClient(async (client) => {
        if (input.idempotencyKey) {
          const existing = await client.query<{ job_id: string }>(
            `SELECT job_id FROM job_idempotency WHERE key = $1`,
            [input.idempotencyKey]
          );
          if (existing.rows.length > 0) {
            const existingId = existing.rows[0].job_id;
            const existingJob = await client.query<JobRow>(
              `SELECT * FROM generation_jobs WHERE id = $1`,
              [existingId]
            );
            if (existingJob.rows.length === 0) {
              // Stale index — fall through and recreate.
            } else {
              return {
                job: jobFromRow(existingJob.rows[0]),
                created: false,
              };
            }
          }
        }
        await client.query(
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
          await client.query(
            `INSERT INTO job_idempotency (key, job_id) VALUES ($1, $2)`,
            [input.idempotencyKey, input.id]
          );
        }
        return { job: { ...input }, created: true };
      });
    },
    async get(id: string): Promise<GenerationJob | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
          `SELECT * FROM generation_jobs WHERE id = $1`,
          [id]
        );
        const row = result.rows[0];
        return row ? jobFromRow(row) : null;
      });
    },
    async update(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
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
        return jobFromRow(result.rows[0]);
      });
    },
    async updateIfClaimed(
      id: string,
      leaseToken: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
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
        return jobFromRow(result.rows[0]);
      });
    },
    async updateIfActive(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
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
        return jobFromRow(result.rows[0]);
      });
    },
    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{ id: string }>(
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
          const exists = await client.query<{ id: string }>(
            `SELECT id FROM generation_jobs WHERE id = $1`,
            [id]
          );
          if (exists.rows.length === 0) {
            throw new Error(`JOB_NOT_FOUND:${id}`);
          }
          return false;
        }
        return true;
      });
    },
    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{ id: string }>(
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
      });
    },
    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
          `SELECT * FROM generation_jobs
           WHERE project_id = $1
             AND status IN ('queued', 'uploading', 'analyzing', 'generating', 'postprocessing', 'saving')`,
          [projectId]
        );
        return result.rows.map((r) => jobFromRow(r));
      });
    },
    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<JobRow>(
          `SELECT * FROM generation_jobs
           WHERE status IN ('queued', 'uploading', 'analyzing', 'generating', 'postprocessing', 'saving')
             AND (lease_expires_at IS NULL OR lease_expires_at <= $1)`,
          [now]
        );
        return result.rows.map((r) => jobFromRow(r));
      });
    },
  };

  // --- ObjectStore (CloudBase PG Storage HTTP API — PERSIST001-P0-01B) ----

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

  // --- UnitOfWork (PostgreSQL transaction with AsyncLocalStorage) --------
  //
  // PERSIST001-P0-02A: the transaction PoolClient is propagated to nested
  // repository calls via AsyncLocalStorage. This guarantees that
  // `assets.create`, `versions.createIdempotent`, `projects.updatePointers`,
  // and `jobs.updateIfClaimed` invoked inside `unitOfWork.run(...)` all
  // execute on the SAME PoolClient. A final Job conditional failure rolls
  // back the entire transaction (Asset + Version + Project + Job state) and
  // the outer compensation deletes the uploaded object.

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      assertReady();
      const ctx = transactionStorage.getStore();
      if (ctx) {
        // Nested UoW — reuse the outer transaction client. BEGIN/COMMIT
        // savepoints would be the next-level refinement; for PERSIST-001
        // we only need top-level rollback to cover all four writes.
        return fn();
      }
      const client = await (pool as PgPool).connect();
      try {
        await client.query('BEGIN');
        let result: T;
        try {
          result = await transactionStorage.run({ client }, fn);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Best-effort; the original error is more important.
          }
          throw err;
        }
      } finally {
        client.release();
      }
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      assertReady();
      return withClient(async (client) => {
        const result = await client.query<{
          key: string;
          failures: number;
          window_started_at: Date;
        }>(`SELECT * FROM auth_throttle WHERE key = $1`, [key]);
        const row = result.rows[0];
        if (!row) return null;
        return {
          failures: row.failures,
          windowStartedAt: row.window_started_at.toISOString(),
        };
      });
    },
    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      assertReady();
      await withClient((client) =>
        client.query(
          `INSERT INTO auth_throttle (key, failures, window_started_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET
             failures = EXCLUDED.failures,
             window_started_at = EXCLUDED.window_started_at`,
          [key, value.failures, value.windowStartedAt]
        )
      );
    },
    async delete(key: string): Promise<void> {
      assertReady();
      await withClient((client) =>
        client.query(`DELETE FROM auth_throttle WHERE key = $1`, [key])
      );
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
//
// These functions implement the official CloudBase PG Storage HTTP OpenAPI
// (PERSIST001-P0-01B). They are exported only for the contract test to
// assert the URL/method/header/body shapes via a fetch mock. The contract
// test imports them via the named exports below.

export async function putObject(
  options: CloudBasePersistenceOptions,
  key: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<void> {
  const url = buildObjectUrl(options.envId, options.bucketId, key);
  const response = await fetch(url, {
    method: 'POST',
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

export async function getObject(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<Uint8Array> {
  const url = buildObjectUrl(options.envId, options.bucketId, key);
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

export async function deleteObject(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<void> {
  const url = buildObjectUrl(options.envId, options.bucketId, key);
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

export async function objectExists(
  options: CloudBasePersistenceOptions,
  key: string
): Promise<boolean> {
  const url = buildObjectUrl(options.envId, options.bucketId, key);
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
    },
  });
  return response.ok;
}

export async function getSignedUrl(
  options: CloudBasePersistenceOptions,
  key: string,
  ttlSeconds: number
): Promise<string> {
  const endpoint = buildSignedUrlEndpoint(options.envId, options.bucketId, key);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.storageToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: ttlSeconds }),
  });
  if (!response.ok) {
    throw new Error(`SIGNED_URL_FAILED: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { signedURL: string; fullSignedURL: string };
  return body.signedURL;
}
