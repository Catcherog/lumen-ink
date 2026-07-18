/**
 * STORAGE-001 CloudBase mock adapter (PoC).
 *
 * Simulates the preferred candidate — Vercel Hobby + CloudBase PostgreSQL +
 * CloudBase PG Storage — without any real CloudBase account, network call, or
 * production secret. Used by `cloudbase-mock.contract.test.ts` to prove the
 * frozen `PersistenceDependencies` interface is implementable for CloudBase.
 *
 * Scope constraints (per STORAGE-001 revision):
 *  - Implements the frozen `PersistenceDependencies` surface **unchanged**.
 *  - Adds PoC-only helpers (`createVersionIdempotent`, job lease helpers) on
 *    the returned object so tests can validate lease/idempotency semantics
 *    without widening the frozen `PersistenceDependencies` interface. These
 *    helpers live on the concrete adapter, NOT on the frozen contract.
 *  - Does NOT connect to CloudBase. Does NOT read environment credentials.
 *  - Does NOT migrate production Provider/Upload/Job/Version paths.
 *
 * Mapping summary (PoC, illustrative — PERSIST-001 finalizes SQL shapes):
 *  - `ProjectRepository`     → rows of `projects` (id, name, created_at, updated_at, active_version_id, approved_version_id)
 *  - `AssetRepository`       → rows of `assets` (id, project_id, storage_key, mime_type, size_bytes, created_at)
 *  - `VersionRepository`     → rows of `versions` (id, project_id, asset_id, label, created_at)
 *  - `JobRepository`         → rows of `generation_jobs` (id, project_id, prompt, status, provider_id, model, result_version_id, error, created_at, updated_at, lease_expires_at)
 *  - `ObjectStore`           → CloudBase PG Storage private bucket (in-memory map keyed by storageKey)
 *  - `UnitOfWork`            → PostgreSQL transaction (snapshot + commit/rollback simulation)
 *  - `AuthThrottleRepository`→ rows of `auth_throttle` (key, failures, window_started_at)
 *
 * Field-name mapping: domain uses camelCase; PG layer would use snake_case.
 * The mock stores the domain shape directly and exposes a `dumpPgStyleRows`
 * helper so tests can assert the field-mapping layer (camelCase ↔ snake_case)
 * is well-defined.
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

// --- Internal PG-style row shapes (snake_case) ----------------------------

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  active_version_id: string | null;
  approved_version_id: string | null;
}

interface AssetRow {
  id: string;
  project_id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

interface VersionRow {
  id: string;
  project_id: string;
  asset_id: string;
  label: string;
  created_at: string;
}

interface JobRow {
  id: string;
  project_id: string;
  prompt: string;
  status: GenerationJobStatus;
  provider_id: string | null;
  model: string | null;
  result_version_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  lease_expires_at: string | null;
}

interface AuthThrottleRow {
  key: string;
  failures: number;
  window_started_at: string;
}

interface MockDbState {
  projects: Record<string, ProjectRow>;
  assets: Record<string, AssetRow>;
  versions: Record<string, VersionRow>;
  jobs: Record<string, JobRow>;
  authThrottle: Record<string, AuthThrottleRow>;
  // PG-style index for idempotent version creation.
  // Key format: `${projectId}::${idempotencyKey}` → versionId
  idempotencyIndex: Record<string, string>;
}

// --- Object storage simulation --------------------------------------------

interface ObjectRecord {
  bytes: Uint8Array;
  mimeType: string;
  createdAt: string;
}

// --- Field mappers (camelCase ↔ snake_case) -------------------------------

function projectToRow(p: Project): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    active_version_id: p.activeVersionId ?? null,
    approved_version_id: p.approvedVersionId ?? null,
  };
}

function projectFromRow(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    activeVersionId: r.active_version_id ?? undefined,
    approvedVersionId: r.approved_version_id ?? undefined,
  };
}

function assetToRow(a: Asset): AssetRow {
  return {
    id: a.id,
    project_id: a.projectId,
    storage_key: a.storageKey,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    created_at: a.createdAt,
  };
}

function assetFromRow(r: AssetRow): Asset {
  return {
    id: r.id,
    projectId: r.project_id,
    storageKey: r.storage_key,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

function versionToRow(v: Version): VersionRow {
  return {
    id: v.id,
    project_id: v.projectId,
    asset_id: v.assetId,
    label: v.label,
    created_at: v.createdAt,
  };
}

function versionFromRow(r: VersionRow): Version {
  return {
    id: r.id,
    projectId: r.project_id,
    assetId: r.asset_id,
    label: r.label,
    createdAt: r.created_at,
  };
}

function jobToRow(j: GenerationJob): JobRow {
  return {
    id: j.id,
    project_id: j.projectId,
    prompt: j.prompt,
    status: j.status,
    provider_id: j.providerId ?? null,
    model: j.model ?? null,
    result_version_id: j.resultVersionId ?? null,
    error: j.error ?? null,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
    lease_expires_at: null,
  };
}

function jobFromRow(r: JobRow): GenerationJob {
  return {
    id: r.id,
    projectId: r.project_id,
    prompt: r.prompt,
    status: r.status,
    providerId: r.provider_id ?? undefined,
    model: r.model ?? undefined,
    resultVersionId: r.result_version_id ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function throttleToRow(key: string, b: AuthThrottleBucket): AuthThrottleRow {
  return {
    key,
    failures: b.failures,
    window_started_at: b.windowStartedAt,
  };
}

function throttleFromRow(r: AuthThrottleRow): AuthThrottleBucket {
  return {
    failures: r.failures,
    windowStartedAt: r.window_started_at,
  };
}

const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = ['queued', 'running'];

function emptyState(): MockDbState {
  return {
    projects: {},
    assets: {},
    versions: {},
    jobs: {},
    authThrottle: {},
    idempotencyIndex: {},
  };
}

function cloneDbState(state: MockDbState): MockDbState {
  return {
    projects: { ...state.projects },
    assets: { ...state.assets },
    versions: { ...state.versions },
    jobs: { ...state.jobs },
    authThrottle: { ...state.authThrottle },
    idempotencyIndex: { ...state.idempotencyIndex },
  };
}

export interface CloudBaseMockPersistence {
  deps: PersistenceDependencies;
  // PoC-only helpers — NOT part of the frozen PersistenceDependencies
  // surface. PERSIST-001 production adapter may expose equivalent helpers
  // without widening the frozen interface.
  createVersionIdempotent: (
    projectId: string,
    idempotencyKey: string,
    version: Version
  ) => Promise<Version>;
  acquireJobLease: (
    jobId: string,
    leaseSeconds: number,
    now?: Date
  ) => Promise<{ acquired: boolean; currentHolder: string | null }>;
  heartbeatJobLease: (
    jobId: string,
    leaseSeconds: number,
    now?: Date
  ) => Promise<boolean>;
  releaseJobLease: (jobId: string, now?: Date) => Promise<void>;
  listLeaseExpiredJobs: (now?: Date) => Promise<GenerationJob[]>;
  /** Returns a PG-style snapshot (snake_case rows) for field-mapping tests. */
  dumpPgStyleRows: () => {
    projects: ProjectRow[];
    assets: AssetRow[];
    versions: VersionRow[];
    jobs: JobRow[];
    authThrottle: AuthThrottleRow[];
  };
  /** Time override for deterministic lease tests. */
  setFixedNow: (now: Date | null) => void;
}

export interface CloudBaseMockOptions {
  /** Optional seed for signed URL token generation (deterministic in tests). */
  signedUrlSecret?: string;
  /** Default signed URL TTL in seconds. Default 900 (15 min). */
  signedUrlTtlSeconds?: number;
}

export function createCloudBaseMockPersistence(
  options: CloudBaseMockOptions = {}
): CloudBaseMockPersistence {
  const state: MockDbState = emptyState();
  const objectStore = new Map<string, ObjectRecord>();
  const signedUrlSecret = options.signedUrlSecret ?? 'cloudbase-mock-secret';
  const signedUrlTtl = options.signedUrlTtlSeconds ?? 900;
  let fixedNow: Date | null = null;

  function now(): Date {
    return fixedNow ?? new Date();
  }

  // --- ProjectRepository --------------------------------------------------

  const projects: ProjectRepository = {
    async create(input: Project): Promise<Project> {
      if (state.projects[input.id]) {
        throw new Error(`PROJECT_ALREADY_EXISTS:${input.id}`);
      }
      state.projects[input.id] = projectToRow(input);
      return { ...input };
    },

    async get(id: string): Promise<Project | null> {
      const row = state.projects[id];
      return row ? projectFromRow(row) : null;
    },

    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      const row = state.projects[id];
      if (!row) throw new Error(`PROJECT_NOT_FOUND:${id}`);
      const updated: ProjectRow = {
        ...row,
        active_version_id: input.activeVersionId ?? row.active_version_id,
        approved_version_id:
          input.approvedVersionId ?? row.approved_version_id,
        updated_at: now().toISOString(),
      };
      state.projects[id] = updated;
      return projectFromRow(updated);
    },

    async deleteCascade(id: string): Promise<void> {
      const project = state.projects[id];
      if (!project) return;

      // Collect asset storage keys for object cleanup.
      const assetRows = Object.values(state.assets).filter(
        (a) => a.project_id === id
      );
      const storageKeys = assetRows.map((a) => a.storage_key);

      // Delete object bytes (CloudBase PG Storage).
      for (const key of storageKeys) {
        objectStore.delete(key);
      }

      // Delete versions whose project_id matches.
      for (const vId of Object.keys(state.versions)) {
        if (state.versions[vId].project_id === id) {
          delete state.versions[vId];
        }
      }

      // Delete jobs whose project_id matches.
      for (const jId of Object.keys(state.jobs)) {
        if (state.jobs[jId].project_id === id) {
          delete state.jobs[jId];
        }
      }

      // Delete assets.
      for (const a of assetRows) {
        delete state.assets[a.id];
      }

      // Delete the project itself.
      delete state.projects[id];
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      if (state.assets[input.id]) {
        throw new Error(`ASSET_ALREADY_EXISTS:${input.id}`);
      }
      state.assets[input.id] = assetToRow(input);
      return { ...input };
    },

    async get(id: string): Promise<Asset | null> {
      const row = state.assets[id];
      return row ? assetFromRow(row) : null;
    },

    async listByProject(projectId: string): Promise<Asset[]> {
      return Object.values(state.assets)
        .filter((a) => a.project_id === projectId)
        .map(assetFromRow);
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      if (state.versions[input.id]) {
        throw new Error(`VERSION_ALREADY_EXISTS:${input.id}`);
      }
      state.versions[input.id] = versionToRow(input);
      return { ...input };
    },

    async get(id: string): Promise<Version | null> {
      const row = state.versions[id];
      return row ? versionFromRow(row) : null;
    },

    async listByProject(projectId: string): Promise<Version[]> {
      return Object.values(state.versions)
        .filter((v) => v.project_id === projectId)
        .map(versionFromRow);
    },
  };

  // --- JobRepository ------------------------------------------------------

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      if (state.jobs[input.id]) {
        throw new Error(`JOB_ALREADY_EXISTS:${input.id}`);
      }
      state.jobs[input.id] = jobToRow(input);
      return { ...input };
    },

    async get(id: string): Promise<GenerationJob | null> {
      const row = state.jobs[id];
      return row ? jobFromRow(row) : null;
    },

    async update(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob> {
      const row = state.jobs[id];
      if (!row) throw new Error(`JOB_NOT_FOUND:${id}`);
      const updated: JobRow = {
        ...row,
        status: patch.status ?? row.status,
        provider_id:
          patch.providerId === undefined
            ? row.provider_id
            : (patch.providerId ?? null),
        model:
          patch.model === undefined ? row.model : (patch.model ?? null),
        result_version_id:
          patch.resultVersionId === undefined
            ? row.result_version_id
            : (patch.resultVersionId ?? null),
        error:
          patch.error === undefined ? row.error : (patch.error ?? null),
        updated_at: patch.updatedAt ?? now().toISOString(),
        lease_expires_at: row.lease_expires_at,
      };
      state.jobs[id] = updated;
      return jobFromRow(updated);
    },

    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      return Object.values(state.jobs)
        .filter(
          (j) =>
            j.project_id === projectId &&
            ACTIVE_JOB_STATUSES.includes(j.status)
        )
        .map(jobFromRow);
    },
  };

  // --- ObjectStore (CloudBase PG Storage private bucket) ------------------

  const objects: ObjectStore = {
    async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
      objectStore.set(key, {
        bytes: new Uint8Array(bytes),
        mimeType,
        createdAt: now().toISOString(),
      });
    },

    /**
     * Simulates CloudBase `createSignedUrl`. The returned URL encodes:
     *  - bucket name (fixed to `lumen-private-mock`)
     *  - object key
     *  - expiry timestamp
     *  - HMAC signature (deterministic, mock-only — never use in production)
     */
    async getSignedUrl(key: string): Promise<string> {
      const expiresAt = Math.floor(now().getTime() / 1000) + signedUrlTtl;
      const signature = mockHmac(signedUrlSecret, `${key}:${expiresAt}`);
      const params = new URLSearchParams({
        bucket: 'lumen-private-mock',
        key,
        expires: String(expiresAt),
        signature,
      });
      return `https://cloudbase-mock.example.com/private/signed?${params.toString()}`;
    },

    async delete(key: string): Promise<void> {
      objectStore.delete(key);
    },

    async exists(key: string): Promise<boolean> {
      return objectStore.has(key);
    },
  };

  // --- UnitOfWork (PostgreSQL transaction simulation) ---------------------

  let unitOfWorkDepth = 0;
  let unitOfWorkSnapshot: MockDbState | null = null;
  let unitOfWorkObjectSnapshot: Map<string, ObjectRecord> | null = null;

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const isTopLevel = unitOfWorkDepth === 0;
      if (isTopLevel) {
        unitOfWorkSnapshot = cloneDbState(state);
        unitOfWorkObjectSnapshot = new Map(objectStore);
        unitOfWorkDepth = 1;
      }
      try {
        return await fn();
      } catch (err) {
        if (isTopLevel && unitOfWorkSnapshot && unitOfWorkObjectSnapshot) {
          // Restore DB state.
          Object.assign(state, cloneDbState(unitOfWorkSnapshot));
          // Restore object store.
          objectStore.clear();
          for (const [k, v] of unitOfWorkObjectSnapshot) {
            objectStore.set(k, v);
          }
        }
        throw err;
      } finally {
        if (isTopLevel) {
          unitOfWorkSnapshot = null;
          unitOfWorkObjectSnapshot = null;
          unitOfWorkDepth = 0;
        }
      }
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      const row = state.authThrottle[key];
      return row ? throttleFromRow(row) : null;
    },

    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      state.authThrottle[key] = throttleToRow(key, value);
    },

    async delete(key: string): Promise<void> {
      delete state.authThrottle[key];
    },
  };

  // --- PoC-only helpers (NOT on the frozen interface) ---------------------

  async function createVersionIdempotent(
    projectId: string,
    idempotencyKey: string,
    version: Version
  ): Promise<Version> {
    const indexKey = `${projectId}::${idempotencyKey}`;
    const existing = state.idempotencyIndex[indexKey];
    if (existing) {
      const existingRow = state.versions[existing];
      if (existingRow) {
        return versionFromRow(existingRow);
      }
    }
    const created = await versions.create(version);
    state.idempotencyIndex[indexKey] = created.id;
    return created;
  }

  async function acquireJobLease(
    jobId: string,
    leaseSeconds: number,
    nowOverride?: Date
  ): Promise<{ acquired: boolean; currentHolder: string | null }> {
    const at = nowOverride ?? now();
    const row = state.jobs[jobId];
    if (!row) throw new Error(`JOB_NOT_FOUND:${jobId}`);
    if (
      row.lease_expires_at &&
      new Date(row.lease_expires_at).getTime() > at.getTime()
    ) {
      return { acquired: false, currentHolder: row.lease_expires_at };
    }
    const expiresAt = new Date(at.getTime() + leaseSeconds * 1000).toISOString();
    state.jobs[jobId] = {
      ...row,
      lease_expires_at: expiresAt,
      updated_at: at.toISOString(),
    };
    return { acquired: true, currentHolder: expiresAt };
  }

  async function heartbeatJobLease(
    jobId: string,
    leaseSeconds: number,
    nowOverride?: Date
  ): Promise<boolean> {
    const at = nowOverride ?? now();
    const row = state.jobs[jobId];
    if (!row) throw new Error(`JOB_NOT_FOUND:${jobId}`);
    if (!row.lease_expires_at) return false;
    if (new Date(row.lease_expires_at).getTime() <= at.getTime()) {
      return false;
    }
    const expiresAt = new Date(at.getTime() + leaseSeconds * 1000).toISOString();
    state.jobs[jobId] = {
      ...row,
      lease_expires_at: expiresAt,
      updated_at: at.toISOString(),
    };
    return true;
  }

  async function releaseJobLease(jobId: string, nowOverride?: Date): Promise<void> {
    const at = nowOverride ?? now();
    const row = state.jobs[jobId];
    if (!row) return;
    state.jobs[jobId] = {
      ...row,
      lease_expires_at: null,
      updated_at: at.toISOString(),
    };
  }

  async function listLeaseExpiredJobs(nowOverride?: Date): Promise<GenerationJob[]> {
    const at = nowOverride ?? now();
    return Object.values(state.jobs)
      .filter(
        (j) =>
          j.lease_expires_at !== null &&
          new Date(j.lease_expires_at).getTime() <= at.getTime()
      )
      .map(jobFromRow);
  }

  function dumpPgStyleRows() {
    return {
      projects: Object.values(state.projects),
      assets: Object.values(state.assets),
      versions: Object.values(state.versions),
      jobs: Object.values(state.jobs),
      authThrottle: Object.values(state.authThrottle),
    };
  }

  function setFixedNow(nowValue: Date | null): void {
    fixedNow = nowValue;
  }

  return {
    deps: {
      projects,
      assets,
      versions,
      jobs,
      objects,
      unitOfWork,
      authThrottle,
    },
    createVersionIdempotent,
    acquireJobLease,
    heartbeatJobLease,
    releaseJobLease,
    listLeaseExpiredJobs,
    dumpPgStyleRows,
    setFixedNow,
  };
}

/**
 * Deterministic mock HMAC (NOT cryptographically secure).
 * Used only to make signed URLs verifiable in tests. Production adapters
 * must use the real CloudBase signing key flow.
 */
function mockHmac(secret: string, payload: string): string {
  let h = 0;
  const combined = `${secret}:${payload}`;
  for (let i = 0; i < combined.length; i++) {
    h = (h << 5) - h + combined.charCodeAt(i);
    h |= 0;
  }
  // Convert to unsigned hex string (8 chars).
  return (h >>> 0).toString(16).padStart(8, '0');
}
