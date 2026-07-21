/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01: CloudBase NoSQL (document database) adapter.
 *
 * This adapter implements the frozen `PersistenceDependencies` surface using
 * CloudBase's document database (MongoDB-compatible) via `@cloudbase/node-sdk`.
 * It replaces the PostgreSQL adapter (`cloudbase.ts`) for environments where
 * PostgreSQL is not provisioned (RuntimeMode=nosql).
 *
 * Gate P0 PoC verified (2026-07-21):
 *  - API Key (accessKey) authentication works with Node SDK
 *  - Cross-collection transactions via db.runTransaction() commit and rollback
 *  - Concurrent conditional updates enforce exclusive claim
 *  - Unique indexes enforce idempotency (E11000 duplicate key error)
 *  - Environment-scoped JWT (no CAM master key needed)
 *
 * Design:
 *  - Configuration uses CLOUDBASE_ENV_ID + CLOUDBASE_API_KEY (Server API Key)
 *  - AsyncLocalStorage propagates the active Transaction to nested repo calls
 *  - ObjectStore uses CloudBase Storage SDK (app.uploadFile/downloadFile/etc)
 *  - JobPatch three-state: absent=skip, null=$unset, value=$set
 *  - Conditional updates use where({...}).update({...}) for claim/heartbeat
 *  - Unique indexes on version_idempotency and job_idempotency collections
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

interface CloudBaseTransaction {
  collection(name: string): CloudBaseCollectionRef;
  commit(): Promise<unknown>;
  rollback(reason?: unknown): Promise<unknown>;
}

interface CloudBaseCollectionRef {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): CloudBaseDocRef;
  where(query: Record<string, unknown>): CloudBaseQuery;
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

// --- Configuration --------------------------------------------------------

export interface CloudBaseNoSqlOptions {
  /** CloudBase environment ID (e.g. zeh-d7glqc07me2155c61). */
  envId: string;
  /** CloudBase Server API Key (JWT). Used as accessKey in tcb.init(). */
  apiKey: string;
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
 */
export function validateCloudBaseNoSqlConfig(
  options: Partial<CloudBaseNoSqlOptions>
): asserts options is CloudBaseNoSqlOptions {
  const missing: string[] = [];
  if (!options.envId) missing.push('CLOUDBASE_ENV_ID');
  if (!options.apiKey) missing.push('CLOUDBASE_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `CLOUDBASE_CONFIG_REQUIRED: missing required env vars: ${missing.join(', ')}`
    );
  }
}

// --- JobPatch three-state builder -----------------------------------------

/**
 * Build a CloudBase update object from a JobPatch.
 *
 * Three-state semantics:
 *  - field ABSENT from patch -> not included (preserve existing)
 *  - field PRESENT with null  -> $unset (write null / remove field)
 *  - field PRESENT with value -> $set (write new value)
 */
function buildUpdateFromPatch(patch: JobPatch): Record<string, unknown> {
  const setFields: Record<string, unknown> = {};
  const unsetFields: Record<string, string> = {};
  const keys = Object.keys(patch) as (keyof JobPatch)[];
  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) {
      unsetFields[key as string] = '';
    } else {
      setFields[key as string] = value;
    }
  }
  const update: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) update.$set = setFields;
  if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;
  return update;
}

// --- Collection names -----------------------------------------------------

const COLLECTIONS = {
  projects: 'projects',
  assets: 'assets',
  versions: 'versions',
  versionIdempotency: 'version_idempotency',
  jobs: 'generation_jobs',
  jobIdempotency: 'job_idempotency',
  authThrottle: 'auth_throttle',
} as const;

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

  const signedUrlTtl = options.signedUrlTtlSeconds ?? 900;
  let ready = false;
  let app: CloudBaseApp | null = null;
  let db: CloudBaseDatabase | null = null;

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
    ready = true;
  }

  function assertReady(): void {
    if (!ready || !db || !app) {
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

  async function close(): Promise<void> {
    ready = false;
    app = null;
    db = null;
  }

  // --- ProjectRepository --------------------------------------------------

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
      const setFields: Record<string, unknown> = {};
      if (input.activeVersionId !== undefined) setFields.activeVersionId = input.activeVersionId;
      if (input.approvedVersionId !== undefined) setFields.approvedVersionId = input.approvedVersionId;
      const update: Record<string, unknown> = {};
      if (Object.keys(setFields).length > 0) update.$set = setFields;
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

    async deleteCascade(id: string): Promise<void> {
      assertReady();
      const assets = await collection(COLLECTIONS.assets).where({ projectId: id }).get();
      const versions = await collection(COLLECTIONS.versions).where({ projectId: id }).get();
      const jobs = await collection(COLLECTIONS.jobs).where({ projectId: id }).get();
      for (const asset of assets.data) {
        const a = asset as Asset;
        if (a.storageKey) {
          try { await getApp().deleteFile({ fileList: [a.storageKey] }); } catch { }
        }
      }
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
      const existing = await collection(COLLECTIONS.versionIdempotency)
        .where({ projectId, key: idempotencyKey })
        .get();
      if (existing.data.length > 0) {
        const idemRecord = existing.data[0] as { versionId: string };
        const existingVersion = await collection(COLLECTIONS.versions)
          .doc(idemRecord.versionId)
          .get();
        const v = fromDoc<Version>(existingVersion.data[0]);
        if (v) return v;
      }
      await collection(COLLECTIONS.versions).add(toDoc(version));
      await collection(COLLECTIONS.versionIdempotency).add({
        projectId,
        key: idempotencyKey,
        versionId: version.id,
        createdAt: new Date().toISOString(),
      });
      return version;
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

  // --- JobRepository ------------------------------------------------------

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      assertReady();
      await collection(COLLECTIONS.jobs).add(toDoc(input));
      if (input.idempotencyKey) {
        await collection(COLLECTIONS.jobIdempotency).add({
          key: input.idempotencyKey,
          projectId: input.projectId,
          jobId: input.id,
          createdAt: new Date().toISOString(),
        });
      }
      return input;
    },

    async createIdempotent(input: GenerationJob): Promise<{ job: GenerationJob; created: boolean }> {
      assertReady();
      if (!input.idempotencyKey) {
        await collection(COLLECTIONS.jobs).add(toDoc(input));
        return { job: input, created: true };
      }
      const existing = await collection(COLLECTIONS.jobIdempotency)
        .where({ key: input.idempotencyKey })
        .get();
      if (existing.data.length > 0) {
        const idemRecord = existing.data[0] as { jobId: string };
        const existingJob = await collection(COLLECTIONS.jobs)
          .doc(idemRecord.jobId)
          .get();
        const j = fromDoc<GenerationJob>(existingJob.data[0]);
        if (j) return { job: j, created: false };
      }
      try {
        await collection(COLLECTIONS.jobs).add(toDoc(input));
        await collection(COLLECTIONS.jobIdempotency).add({
          key: input.idempotencyKey,
          projectId: input.projectId,
          jobId: input.id,
          createdAt: new Date().toISOString(),
        });
        return { job: input, created: true };
      } catch (e) {
        const msg = (e as Error).message || '';
        if (msg.includes('E11000') || msg.includes('duplicate key')) {
          const retry = await collection(COLLECTIONS.jobIdempotency)
            .where({ key: input.idempotencyKey })
            .get();
          if (retry.data.length > 0) {
            const idemRecord = retry.data[0] as { jobId: string };
            const existingJob = await collection(COLLECTIONS.jobs)
              .doc(idemRecord.jobId)
              .get();
            const j = fromDoc<GenerationJob>(existingJob.data[0]);
            if (j) return { job: j, created: false };
          }
        }
        throw e;
      }
    },

    async get(id: string): Promise<GenerationJob | null> {
      assertReady();
      const res = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(res.data[0]);
    },

    async update(id: string, patch: JobPatch): Promise<GenerationJob> {
      assertReady();
      const update = buildUpdateFromPatch(patch);
      if (Object.keys(update).length > 0) {
        const res = await collection(COLLECTIONS.jobs).doc(id).update(update);
        if (res.updated === 0) throw new Error(`JOB_NOT_FOUND: ${id}`);
      }
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      const j = fromDoc<GenerationJob>(doc.data[0]);
      if (!j) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return j;
    },

    async updateIfClaimed(id: string, leaseToken: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const update = buildUpdateFromPatch(patch);
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(doc.data[0]);
        if (!j) return null;
        if (j.leaseToken !== leaseToken || isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = {
        _id: id,
        leaseToken,
        status: { $nin: TERMINAL_JOB_STATUSES },
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(doc.data[0]);
    },

    async updateIfActive(id: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const update = buildUpdateFromPatch(patch);
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(doc.data[0]);
        if (!j) return null;
        if (isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = {
        _id: id,
        status: { $nin: TERMINAL_JOB_STATUSES },
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(doc.data[0]);
    },

    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const query = {
        _id: id,
        status: { $nin: TERMINAL_JOB_STATUSES },
        $or: [
          { leaseToken: null },
          { leaseToken: input.leaseToken },
          { leaseExpiresAt: { $lte: input.now } },
        ],
      };
      const update = {
        $set: {
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          leaseExpiresAt: input.leaseExpiresAt,
          updatedAt: new Date().toISOString(),
        },
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated > 0) return true;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      if (doc.data.length === 0) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return false;
    },

    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const query = {
        _id: id,
        leaseToken: input.leaseToken,
        status: { $nin: TERMINAL_JOB_STATUSES },
      };
      const update = {
        $set: {
          leaseExpiresAt: input.leaseExpiresAt,
          updatedAt: new Date().toISOString(),
        },
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      return res.updated > 0;
    },

    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      assertReady();
      const res = await collection(COLLECTIONS.jobs)
        .where({
          projectId,
          status: { $in: ACTIVE_JOB_STATUSES },
        })
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },

    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      assertReady();
      const res = await collection(COLLECTIONS.jobs)
        .where({
          status: { $in: ACTIVE_JOB_STATUSES },
          $or: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { $lte: now } },
          ],
        })
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },
  };

  // --- ObjectStore (CloudBase Storage SDK) --------------------------------

  const objects: ObjectStore = {
    async put(key: string, bytes: Uint8Array, _mimeType: string): Promise<void> {
      assertReady();
      await getApp().uploadFile({
        cloudPath: key,
        fileContent: Buffer.from(bytes),
      });
    },

    async get(key: string): Promise<Uint8Array> {
      assertReady();
      const res = await getApp().downloadFile({ fileID: key });
      return new Uint8Array(res.fileContent);
    },

    async getSignedUrl(key: string): Promise<string> {
      assertReady();
      const res = await getApp().getTempFileURL({
        fileList: [key],
      });
      if (res.fileList.length === 0) throw new Error(`OBJECT_NOT_FOUND: ${key}`);
      return res.fileList[0].tempFileURL;
    },

    async delete(key: string): Promise<void> {
      assertReady();
      await getApp().deleteFile({ fileList: [key] });
    },

    async exists(key: string): Promise<boolean> {
      assertReady();
      try {
        const res = await getApp().getTempFileURL({ fileList: [key] });
        return res.fileList.length > 0 && !!res.fileList[0].tempFileURL;
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
