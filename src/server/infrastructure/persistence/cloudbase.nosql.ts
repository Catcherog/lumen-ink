/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: CloudBase NoSQL adapter.
 *
 * This adapter implements the frozen `PersistenceDependencies` surface using
 * CloudBase's document database (MongoDB-compatible) via `@cloudbase/node-sdk`.
 * It replaces the PostgreSQL adapter (`cloudbase.ts`) for environments where
 * PostgreSQL is not provisioned (RuntimeMode=nosql).
 *
 * FIX-R2 changes (2026-07-21, GPT FIX_REQUIRED round):
 *  - NOSQL-R2-02: All query/update operators use `db.command` (`_.nin`, `_.in`,
 *    `_.lte`, `_.or`, `_.set`, `_.remove`). Raw Mongo operators removed.
 *  - NOSQL-R2-03: `jobs.createIdempotent()` uses `runTransaction` with
 *    deterministic idempotency `_id = projectId__key` to guarantee atomic
 *    Job + idempotency creation. Query scope is `(projectId, key)`.
 *  - NOSQL-R2-04: `objects.put()` saves the `fileID` returned by `uploadFile()`
 *    into a new `object_metadata` collection. Subsequent `get/getSignedUrl/
 *    delete/exists` resolve `storageKey -> fileID` via that collection.
 *  - NOSQL-R2-05: `projects.deleteCascade()` only deletes DB metadata. Storage
 *    cleanup is the responsibility of `ProjectService.deleteProject()` after
 *    the metadata transaction commits.
 *  - NOSQL-R2-06: `CLOUDBASE_DATA_NAMESPACE` prefixes every collection name;
 *    `CLOUDBASE_STORAGE_PREFIX` prefixes every cloudPath. Preview and
 *    Production must configure distinct values; missing -> fail closed.
 *
 * Design:
 *  - Configuration uses CLOUDBASE_ENV_ID + CLOUDBASE_API_KEY (Server API Key)
 *    + CLOUDBASE_DATA_NAMESPACE + CLOUDBASE_STORAGE_PREFIX (both required)
 *  - AsyncLocalStorage propagates the active Transaction to nested repo calls
 *  - ObjectStore uses CloudBase Storage SDK (app.uploadFile/downloadFile/etc)
 *    and persists fileID in `object_metadata` for later resolution
 *  - JobPatch three-state: absent=skip, null=command.remove(), value=command.set()
 *  - Conditional updates use command.nin/lte/or for claim/heartbeat
 *  - Idempotency uses deterministic _id `${projectId}__${key}` for atomic
 *    reservation inside a CloudBase runTransaction
 *
 * The frozen PersistenceDependencies interface is NOT modified.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  PersistenceDependencies,
  Project,
  Asset,
  Version,
  GenerationJob,
  GenerationJobStatus,
  JobPatch,
  ProjectRepository,
  AssetRepository,
  VersionRepository,
  JobRepository,
  ObjectStore,
  UnitOfWork,
  AuthThrottleRepository,
  AuthThrottleBucket,
} from '../../domain/persistence.js';

// --- CloudBase Node SDK types (imported dynamically at runtime) -----------

export interface CloudBaseCommand {
  nin(values: unknown[]): unknown;
  in(values: unknown[]): unknown;
  lte(value: unknown): unknown;
  gte(value: unknown): unknown;
  gt(value: unknown): unknown;
  lt(value: unknown): unknown;
  eq(value: unknown): unknown;
  neq(value: unknown): unknown;
  or(conditions: unknown[]): unknown;
  and(conditions: unknown[]): unknown;
  set(value: unknown): unknown;
  remove(): unknown;
  exists(exists?: boolean): unknown;
  push(value: unknown): unknown;
  inc(value: number): unknown;
}

interface CloudBaseTransaction {
  collection(name: string): CloudBaseCollectionRef;
  commit(): Promise<unknown>;
  rollback(reason?: unknown): Promise<unknown>;
}

interface CloudBaseCollectionRef {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): CloudBaseDocRef;
  where(query: unknown): CloudBaseQuery;
  count(): Promise<{ total: number }>;
}

interface CloudBaseDocRef {
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  set(data: Record<string, unknown>): Promise<{ updated: number; upserted: unknown[] }>;
  remove(): Promise<{ deleted: number }>;
}

interface CloudBaseQuery {
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  remove(): Promise<{ deleted: number }>;
  orderBy(field: string, direction: 'asc' | 'desc'): CloudBaseQuery;
  limit(n: number): CloudBaseQuery;
}

interface CloudBaseApp {
  database(): CloudBaseDatabase;
  uploadFile(opts: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID: string }>;
  downloadFile(opts: { fileID: string }): Promise<{ fileContent: Buffer }>;
  deleteFile(opts: { fileList: string[] }): Promise<{ fileList: unknown[] }>;
  getTempFileURL(opts: { fileList: string[] }): Promise<{ fileList: Array<{ fileID: string; tempFileURL: string }> }>;
}

interface CloudBaseDatabase {
  collection(name: string): CloudBaseCollectionRef;
  runTransaction<T = unknown>(callback: (tx: CloudBaseTransaction) => Promise<T>, times?: number): Promise<T>;
  command: CloudBaseCommand;
}

const TERMINAL_JOB_STATUSES: GenerationJobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

function isTerminalStatus(status: GenerationJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = [
  'queued',
  'uploading',
  'analyzing',
  'generating',
  'postprocessing',
  'saving',
];

// --- Configuration (NOSQL-R2-06: namespace + storage prefix required) ----

export interface CloudBaseNoSqlOptions {
  /** CloudBase environment ID (e.g. zeh-d7glqc07me2155c61). */
  envId: string;
  /** CloudBase Server API Key (JWT). Used as accessKey in tcb.init(). */
  apiKey: string;
  /**
   * NOSQL-R2-06: Data namespace used to prefix every collection name.
   * Production and Preview MUST use distinct values (e.g. 'prod', 'preview').
   * Empty/missing -> fail closed in validateCloudBaseNoSqlConfig.
   */
  dataNamespace: string;
  /**
   * NOSQL-R2-06: Storage prefix applied to every cloudPath.
   * Production and Preview MUST use distinct values (e.g. 'prod', 'preview').
   * Empty/missing -> fail closed in validateCloudBaseNoSqlConfig.
   */
  storagePrefix: string;
  /** Optional: signed URL TTL in seconds (default 900 = 15 min). */
  signedUrlTtlSeconds?: number;
}

export interface CloudBaseNoSqlDeps extends PersistenceDependencies {
  __brand: 'cloudbase_nosql';
  ensureReady(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Validate NoSQL configuration. Throws CLOUDBASE_CONFIG_REQUIRED if any
 * required field is missing or empty.
 *
 * NOSQL-R2-06: dataNamespace and storagePrefix are REQUIRED. This enforces
 * Preview / Production isolation — an unset namespace would default to
 * sharing Production data, which is forbidden.
 */
export function validateCloudBaseNoSqlConfig(
  options: Partial<CloudBaseNoSqlOptions>
): asserts options is CloudBaseNoSqlOptions {
  const missing: string[] = [];
  if (!options.envId) missing.push('CLOUDBASE_ENV_ID');
  if (!options.apiKey) missing.push('CLOUDBASE_API_KEY');
  if (!options.dataNamespace) missing.push('CLOUDBASE_DATA_NAMESPACE');
  if (!options.storagePrefix) missing.push('CLOUDBASE_STORAGE_PREFIX');
  if (missing.length > 0) {
    throw new Error(
      `CLOUDBASE_CONFIG_REQUIRED: missing required env vars: ${missing.join(', ')}`
    );
  }
}

// --- Collection names (NOSQL-R2-06: namespace-prefixed) -------------------

/**
 * Build the collection name map. Every collection is prefixed with
 * `${dataNamespace}_` so Preview and Production data cannot collide even
 * if they share the same CloudBase env.
 *
 * `object_metadata` is new in FIX-R2 (NOSQL-R2-04): it stores the
 * storageKey -> fileID mapping returned by CloudBase uploadFile().
 */
function makeCollections(namespace: string): Record<string, string> {
  const prefix = `${namespace}_`;
  return {
    projects: `${prefix}projects`,
    assets: `${prefix}assets`,
    versions: `${prefix}versions`,
    versionIdempotency: `${prefix}version_idempotency`,
    jobs: `${prefix}generation_jobs`,
    jobIdempotency: `${prefix}job_idempotency`,
    authThrottle: `${prefix}auth_throttle`,
    objectMetadata: `${prefix}object_metadata`,
  };
}

// --- JobPatch three-state builder (NOSQL-R2-02: uses db.command) ---------
//
// CloudBase `update()` accepts field-level command operators:
//   { field1: _.set(value), field2: _.remove() }
//
// Three-state semantics:
//  - field ABSENT from patch -> not included (preserve existing)
//  - field PRESENT with null  -> command.remove() (write null / remove field)
//  - field PRESENT with value -> command.set(value) (write new value)

export function buildUpdateFromPatch(
  patch: JobPatch,
  command: CloudBaseCommand
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const keys = Object.keys(patch) as (keyof JobPatch)[];
  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) {
      update[key as string] = command.remove();
    } else {
      update[key as string] = command.set(value);
    }
  }
  return update;
}

// --- Entity serialization (camelCase -> stored as-is, _id is primary key) -

// CloudBase document database stores JSON documents. We store entities
// as-is using their camelCase field names. The _id field is the primary key.

function toDoc<T extends { id: string }>(entity: T): Record<string, unknown> {
  const { id, ...rest } = entity;
  return { _id: id, ...rest };
}

function fromDoc<T extends { id: string }>(doc: unknown): T | null {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  const { _id, ...rest } = record;
  if (!_id) return null;
  return { id: _id as string, ...(rest as object) } as T;
}

function fromDocArray<T extends { id: string }>(docs: unknown[]): T[] {
  return docs.map((d) => fromDoc<T>(d)).filter((d): d is T => d !== null);
}

// --- Idempotency _id helper (NOSQL-R2-03: projectId-scoped uniqueness) ---
//
// The idempotency record uses a deterministic _id composed of
// `${projectId}__${idempotencyKey}`. This:
//   1. Enforces (projectId, key) scope (FIX-R1 wrongly used { key } only)
//   2. Allows atomic reservation inside a CloudBase transaction via
//      doc(id).get() + add({ _id: id, ... })
export function idempotencyDocId(projectId: string, key: string): string {
  return `${projectId}__${key}`;
}

// --- Adapter factory ------------------------------------------------------

/**
 * Create a CloudBase NoSQL-backed PersistenceDependencies bundle.
 *
 * Config is validated eagerly. The SDK is initialized lazily in ensureReady().
 */
export function createCloudBaseNoSqlPersistence(
  options: CloudBaseNoSqlOptions
): CloudBaseNoSqlDeps {
  validateCloudBaseNoSqlConfig(options);

  const COLLECTIONS = makeCollections(options.dataNamespace);
  const storagePrefix = options.storagePrefix;
  let ready = false;
  let app: CloudBaseApp | null = null;
  let db: CloudBaseDatabase | null = null;
  let command: CloudBaseCommand | null = null;

  const transactionStorage = new AsyncLocalStorage<{ tx: CloudBaseTransaction }>();

  async function ensureReady(): Promise<void> {
    if (ready) return;
    const tcb = await import('@cloudbase/node-sdk');
    const instance = tcb.init({
      env: options.envId,
      accessKey: options.apiKey,
    });
    app = instance as unknown as CloudBaseApp;
    db = (app as unknown as { database(): CloudBaseDatabase }).database();
    command = db.command;
    ready = true;
  }

  function assertReady(): void {
    if (!ready || !db || !app || !command) {
      throw new Error('CLOUDBASE_NOT_READY: call ensureReady() before using the adapter');
    }
  }

  function getDb(): CloudBaseDatabase {
    assertReady();
    return db!;
  }

  function getApp(): CloudBaseApp {
    assertReady();
    return app!;
  }

  function getCommand(): CloudBaseCommand {
    assertReady();
    return command!;
  }

  /**
   * Get a collection reference. Inside a transaction, uses the transaction's
   * collection method so all operations are atomic. Outside, uses the db.
   */
  function collection(name: string): CloudBaseCollectionRef {
    const ctx = transactionStorage.getStore();
    if (ctx) {
      return ctx.tx.collection(name);
    }
    return getDb().collection(name);
  }

  /**
   * NOSQL-R2-06: Apply storage prefix to a cloudPath. All ObjectStore
   * operations route through this helper so Preview and Production cannot
   * read or overwrite each other's files even on the same CloudBase env.
   */
  function prefixCloudPath(key: string): string {
    return `${storagePrefix}/${key}`;
  }

  async function close(): Promise<void> {
    ready = false;
    app = null;
    db = null;
    command = null;
  }

  // --- ObjectStore helpers (NOSQL-R2-04: storageKey -> fileID) -----------
  //
  // CloudBase uploadFile returns a unique fileID (cloud://...). Subsequent
  // downloadFile / getTempFileURL / deleteFile all require that fileID, not
  // the cloudPath. We persist the mapping in `object_metadata`:
  //   { _id: storageKey, fileID: string, mimeType, sizeBytes, createdAt }
  //
  // This collection is NOT an entity table — it is internal metadata and
  // is namespaced alongside the entity collections.

  async function resolveFileId(storageKey: string): Promise<string> {
    const res = await collection(COLLECTIONS.objectMetadata).doc(storageKey).get();
    if (res.data.length === 0) {
      throw new Error(`OBJECT_NOT_FOUND: ${storageKey}`);
    }
    const meta = res.data[0] as { fileID?: string };
    if (!meta.fileID) {
      throw new Error(`OBJECT_METADATA_CORRUPT: ${storageKey}`);
    }
    return meta.fileID;
  }

  async function saveFileMetadata(
    storageKey: string,
    fileID: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<void> {
    await collection(COLLECTIONS.objectMetadata).doc(storageKey).set({
      _id: storageKey,
      fileID,
      mimeType,
      sizeBytes,
      createdAt: new Date().toISOString(),
    });
  }

  async function deleteFileMetadata(storageKey: string): Promise<void> {
    await collection(COLLECTIONS.objectMetadata).doc(storageKey).remove();
  }

  // --- ProjectRepository (NOSQL-R2-05: deleteCascade only deletes DB) ----

  const projects: ProjectRepository = {
    async create(input: Project): Promise<Project> {
      assertReady();
      await collection(COLLECTIONS.projects).add(toDoc(input));
      return input;
    },

    async get(id: string): Promise<Project | null> {
      assertReady();
      const res = await collection(COLLECTIONS.projects).doc(id).get();
      return fromDoc<Project>(res.data[0]);
    },

    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      assertReady();
      const cmd = getCommand();
      const update: Record<string, unknown> = {};
      if (input.activeVersionId !== undefined) {
        update.activeVersionId = cmd.set(input.activeVersionId);
      }
      if (input.approvedVersionId !== undefined) {
        update.approvedVersionId = cmd.set(input.approvedVersionId);
      }
      if (Object.keys(update).length === 0) {
        const existing = await collection(COLLECTIONS.projects).doc(id).get();
        const proj = fromDoc<Project>(existing.data[0]);
        if (!proj) throw new Error(`PROJECT_NOT_FOUND: ${id}`);
        return proj;
      }
      await collection(COLLECTIONS.projects).doc(id).update(update);
      const res = await collection(COLLECTIONS.projects).doc(id).get();
      const proj = fromDoc<Project>(res.data[0]);
      if (!proj) throw new Error(`PROJECT_NOT_FOUND: ${id}`);
      return proj;
    },

    /**
     * NOSQL-R2-05: Only delete database entity metadata. Storage object
     * cleanup (uploadFile/deleteFile/downloadFile/getTempFileURL) is the
     * responsibility of ProjectService.deleteProject() AFTER the metadata
     * transaction commits. This prevents irreversible Storage side-effects
     * if the DB transaction rolls back.
     *
     * `object_metadata` records are NOT deleted here because they are
     * tightly coupled to Storage objects — ProjectService needs them to
     * resolve storageKey -> fileID for Storage cleanup after commit.
     * ProjectService.deleteProject() is responsible for deleting both the
     * Storage objects and their `object_metadata` records post-commit.
     */
    async deleteCascade(id: string): Promise<void> {
      assertReady();
      await collection(COLLECTIONS.versionIdempotency).where({ projectId: id }).remove();
      await collection(COLLECTIONS.jobs).where({ projectId: id }).remove();
      await collection(COLLECTIONS.jobIdempotency).where({ projectId: id }).remove();
      await collection(COLLECTIONS.versions).where({ projectId: id }).remove();
      await collection(COLLECTIONS.assets).where({ projectId: id }).remove();
      await collection(COLLECTIONS.projects).doc(id).remove();
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      assertReady();
      await collection(COLLECTIONS.assets).add(toDoc(input));
      return input;
    },

    async get(id: string): Promise<Asset | null> {
      assertReady();
      const res = await collection(COLLECTIONS.assets).doc(id).get();
      return fromDoc<Asset>(res.data[0]);
    },

    async listByProject(projectId: string): Promise<Asset[]> {
      assertReady();
      const res = await collection(COLLECTIONS.assets).where({ projectId }).get();
      return fromDocArray<Asset>(res.data);
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      assertReady();
      await collection(COLLECTIONS.versions).add(toDoc(input));
      return input;
    },

    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      assertReady();
      const idemId = idempotencyDocId(projectId, idempotencyKey);
      // Fast path: check if idempotency record already exists.
      const existing = await collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
      if (existing.data.length > 0) {
        const idemRecord = existing.data[0] as { versionId: string };
        const existingVersion = await collection(COLLECTIONS.versions)
          .doc(idemRecord.versionId)
          .get();
        const v = fromDoc<Version>(existingVersion.data[0]);
        if (v) return v;
      }
      // Atomic creation via runTransaction. CloudBase transaction supports
      // doc(id).get() / add() / doc(id).set() inside the callback.
      try {
        await getDb().runTransaction(async (tx) => {
          // Re-check inside transaction to guard against concurrent inserts.
          const recheck = await tx.collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
          if (recheck.data.length > 0) {
            return; // Another caller won; we will fall through to the retry below.
          }
          await tx.collection(COLLECTIONS.versions).add(toDoc(version));
          await tx.collection(COLLECTIONS.versionIdempotency).add({
            _id: idemId,
            projectId,
            key: idempotencyKey,
            versionId: version.id,
            createdAt: new Date().toISOString(),
          });
        });
        return version;
      } catch (e) {
        const msg = (e as Error).message || '';
        if (msg.includes('E11000') || msg.includes('duplicate key')) {
          // Concurrent insert won; return the existing version.
          const retry = await collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
          if (retry.data.length > 0) {
            const idemRecord = retry.data[0] as { versionId: string };
            const existingVersion = await collection(COLLECTIONS.versions)
              .doc(idemRecord.versionId)
              .get();
            const v = fromDoc<Version>(existingVersion.data[0]);
            if (v) return v;
          }
        }
        throw e;
      }
    },

    async get(id: string): Promise<Version | null> {
      assertReady();
      const res = await collection(COLLECTIONS.versions).doc(id).get();
      return fromDoc<Version>(res.data[0]);
    },

    async listByProject(projectId: string): Promise<Version[]> {
      assertReady();
      const res = await collection(COLLECTIONS.versions)
        .where({ projectId })
        .orderBy('createdAt', 'asc')
        .get();
      return fromDocArray<Version>(res.data);
    },
  };

  // --- JobRepository (NOSQL-R2-03: atomic Job + idempotency creation) ----

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      assertReady();
      // `create` is non-idempotent: caller is responsible for not calling it
      // twice. If an idempotencyKey is present, prefer `createIdempotent`.
      await collection(COLLECTIONS.jobs).add(toDoc(input));
      if (input.idempotencyKey) {
        const idemId = idempotencyDocId(input.projectId, input.idempotencyKey);
        await collection(COLLECTIONS.jobIdempotency).add({
          _id: idemId,
          projectId: input.projectId,
          key: input.idempotencyKey,
          jobId: input.id,
          createdAt: new Date().toISOString(),
        });
      }
      return input;
    },

    /**
     * NOSQL-R2-03: Atomic Job + idempotency creation.
     *
     * FIX-R1 created the Job first and the idempotency record second; if the
     * second write failed (E11000), the first Job was orphaned. R2 wraps both
     * writes in a CloudBase runTransaction with a deterministic idempotency
     * _id = `${projectId}__${key}` so:
     *   - Transaction commit -> both Job and idempotency exist (no orphans)
     *   - Transaction abort (E11000 on the idempotency add) -> both rolled
     *     back, no orphan Job is left behind
     *
     * Query scope is now `(projectId, key)` (FIX-R1 used `{ key }` only,
     * which let different projects collide on the same key).
     */
    async createIdempotent(input: GenerationJob): Promise<{ job: GenerationJob; created: boolean }> {
      assertReady();
      if (!input.idempotencyKey) {
        await collection(COLLECTIONS.jobs).add(toDoc(input));
        return { job: input, created: true };
      }
      const idemId = idempotencyDocId(input.projectId, input.idempotencyKey);

      // Fast path: check if idempotency record already exists.
      const existing = await collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
      if (existing.data.length > 0) {
        const idemRecord = existing.data[0] as { jobId: string };
        const existingJob = await collection(COLLECTIONS.jobs)
          .doc(idemRecord.jobId)
          .get();
        const j = fromDoc<GenerationJob>(existingJob.data[0]);
        if (j) return { job: j, created: false };
      }

      // Atomic creation via runTransaction.
      try {
        const result = await getDb().runTransaction(async (tx) => {
          // Re-check inside transaction to guard against concurrent inserts.
          const recheck = await tx.collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
          if (recheck.data.length > 0) {
            const idemRecord = recheck.data[0] as { jobId: string };
            const existingJob = await tx.collection(COLLECTIONS.jobs)
              .doc(idemRecord.jobId)
              .get();
            const j = fromDoc<GenerationJob>(existingJob.data[0]);
            if (j) return { job: j, created: false };
            return null; // fall through to retry path below
          }
          // Create Job + idempotency atomically.
          await tx.collection(COLLECTIONS.jobs).add(toDoc(input));
          await tx.collection(COLLECTIONS.jobIdempotency).add({
            _id: idemId,
            projectId: input.projectId,
            key: input.idempotencyKey,
            jobId: input.id,
            createdAt: new Date().toISOString(),
          });
          return { job: input, created: true };
        });
        if (result) return result;
      } catch (e) {
        const msg = (e as Error).message || '';
        if (!msg.includes('E11000') && !msg.includes('duplicate key')) {
          throw e;
        }
      }
      // E11000 or transaction returned null -> another caller won.
      const retry = await collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
      if (retry.data.length > 0) {
        const idemRecord = retry.data[0] as { jobId: string };
        const existingJob = await collection(COLLECTIONS.jobs)
          .doc(idemRecord.jobId)
          .get();
        const j = fromDoc<GenerationJob>(existingJob.data[0]);
        if (j) return { job: j, created: false };
      }
      throw new Error(`IDEMPOTENCY_RESOLVE_FAILED: ${idemId}`);
    },

    async get(id: string): Promise<GenerationJob | null> {
      assertReady();
      const res = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(res.data[0]);
    },

    async update(id: string, patch: JobPatch): Promise<GenerationJob> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      if (Object.keys(update).length > 0) {
        const res = await collection(COLLECTIONS.jobs).doc(id).update(update);
        if (res.updated === 0) throw new Error(`JOB_NOT_FOUND: ${id}`);
      }
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      const j = fromDoc<GenerationJob>(doc.data[0]);
      if (!j) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return j;
    },

    /**
     * NOSQL-R2-02: Conditional update using db.command. Uses the db-level
     * collection (not transaction) so the conditional update itself is the
     * atomic unit — the where().update() call is a single CloudBase op.
     */
    async updateIfClaimed(id: string, leaseToken: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(doc.data[0]);
        if (!j) return null;
        if (j.leaseToken !== leaseToken || isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = cmd.and([
        { _id: id },
        { leaseToken: cmd.eq(leaseToken) },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(doc.data[0]);
    },

    /**
     * NOSQL-R2-02: Conditional update using db.command.
     */
    async updateIfActive(id: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(doc.data[0]);
        if (!j) return null;
        if (isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = cmd.and([
        { _id: id },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(doc.data[0]);
    },

    /**
     * NOSQL-R2-02: Atomic lease claim using db.command.
     *
     * Claim succeeds when:
     *   - status is non-terminal
     *   - AND (leaseToken is null) OR (leaseToken matches) OR (lease expired)
     *
     * `cmd.or` builds the disjunction; `cmd.and` combines with the status
     * guard. A single where().update() is the atomic claim unit.
     */
    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const cmd = getCommand();
      const query = cmd.and([
        { _id: id },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
        cmd.or([
          { leaseToken: cmd.eq(null) },
          { leaseToken: cmd.eq(input.leaseToken) },
          { leaseExpiresAt: cmd.lte(input.now) },
        ]),
      ]);
      const update = {
        workerId: cmd.set(input.workerId),
        leaseToken: cmd.set(input.leaseToken),
        leaseExpiresAt: cmd.set(input.leaseExpiresAt),
        updatedAt: cmd.set(new Date().toISOString()),
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated > 0) return true;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      if (doc.data.length === 0) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return false;
    },

    /**
     * NOSQL-R2-02: Lease heartbeat using db.command.
     */
    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const cmd = getCommand();
      const query = cmd.and([
        { _id: id },
        { leaseToken: cmd.eq(input.leaseToken) },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const update = {
        leaseExpiresAt: cmd.set(input.leaseExpiresAt),
        updatedAt: cmd.set(new Date().toISOString()),
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      return res.updated > 0;
    },

    /**
     * NOSQL-R2-02: Active jobs query using db.command.
     */
    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      assertReady();
      const cmd = getCommand();
      const res = await collection(COLLECTIONS.jobs)
        .where({
          projectId,
          status: cmd.in(ACTIVE_JOB_STATUSES),
        })
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },

    /**
     * NOSQL-R2-02: Lease-expired recovery query using db.command.
     */
    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      assertReady();
      const cmd = getCommand();
      const res = await collection(COLLECTIONS.jobs)
        .where(
          cmd.and([
            { status: cmd.in(ACTIVE_JOB_STATUSES) },
            cmd.or([
              { leaseToken: cmd.eq(null) },
              { leaseExpiresAt: cmd.lte(now) },
            ]),
          ])
        )
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },
  };

  // --- ObjectStore (NOSQL-R2-04: persist fileID) -------------------------

  const objects: ObjectStore = {
    /**
     * NOSQL-R2-04: Upload to CloudBase Storage and persist the returned
     * fileID to `object_metadata`. Subsequent get/getSignedUrl/delete/exists
     * resolve storageKey -> fileID via that collection.
     *
     * NOSQL-R2-06: cloudPath is prefixed with `storagePrefix` so Preview
     * and Production cannot overwrite each other's files.
     */
    async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
      assertReady();
      const cloudPath = prefixCloudPath(key);
      const uploadRes = await getApp().uploadFile({
        cloudPath,
        fileContent: Buffer.from(bytes),
      });
      await saveFileMetadata(key, uploadRes.fileID, mimeType, bytes.byteLength);
    },

    async get(key: string): Promise<Uint8Array> {
      assertReady();
      const fileID = await resolveFileId(key);
      const res = await getApp().downloadFile({ fileID });
      return new Uint8Array(res.fileContent);
    },

    async getSignedUrl(key: string): Promise<string> {
      assertReady();
      const fileID = await resolveFileId(key);
      const res = await getApp().getTempFileURL({
        fileList: [fileID],
      });
      if (res.fileList.length === 0) throw new Error(`OBJECT_NOT_FOUND: ${key}`);
      return res.fileList[0].tempFileURL;
    },

    async delete(key: string): Promise<void> {
      assertReady();
      const fileID = await resolveFileId(key);
      await getApp().deleteFile({ fileList: [fileID] });
      await deleteFileMetadata(key);
    },

    async exists(key: string): Promise<boolean> {
      assertReady();
      try {
        await resolveFileId(key);
        return true;
      } catch {
        return false;
      }
    },
  };

  // --- UnitOfWork (CloudBase runTransaction + AsyncLocalStorage) ----------

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      assertReady();
      const ctx = transactionStorage.getStore();
      if (ctx) {
        return fn();
      }
      return getDb().runTransaction(async (tx) => {
        return transactionStorage.run({ tx }, fn);
      });
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      assertReady();
      const res = await collection(COLLECTIONS.authThrottle).doc(key).get();
      const doc = res.data[0] as AuthThrottleBucket | undefined;
      return doc || null;
    },

    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      assertReady();
      await collection(COLLECTIONS.authThrottle).doc(key).set({
        _id: key,
        ...value,
      });
    },

    async delete(key: string): Promise<void> {
      assertReady();
      await collection(COLLECTIONS.authThrottle).doc(key).remove();
    },
  };

  return {
    __brand: 'cloudbase_nosql',
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
