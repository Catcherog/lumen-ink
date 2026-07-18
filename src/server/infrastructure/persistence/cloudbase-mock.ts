/**
 * PERSIST-001 CloudBase mock adapter (D-040 converged).
 *
 * Simulates the preferred candidate — Vercel Hobby + CloudBase PostgreSQL +
 * CloudBase PG Storage — without any real CloudBase account, network call, or
 * production secret.
 *
 * Scope (per STORAGE-001 revision + D-040 convergence):
 *  - Implements the frozen `PersistenceDependencies` surface **unchanged**,
 *    including the converged 9-stage JobStatus, idempotent Version/Job create,
 *    lease-aware Job update/claim/heartbeat/listLeaseExpired.
 *  - Does NOT connect to CloudBase. Does NOT read environment credentials.
 *  - Does NOT migrate production Provider/Upload/Job/Version paths.
 *
 * Mapping summary (mock, illustrative — production SQL shapes finalized in
 * PERSIST Task 5 GenerationService):
 *  - `ProjectRepository`     → rows of `projects` (id, name, created_at, updated_at, active_version_id, approved_version_id)
 *  - `AssetRepository`       → rows of `assets` (id, project_id, storage_key, mime_type, size_bytes, created_at)
 *  - `VersionRepository`     → rows of `versions` (id, project_id, asset_id, label, created_at) +
 *                              `version_idempotency` (project_id, key, version_id)
 *  - `JobRepository`         → rows of `generation_jobs` (id, project_id, prompt, status, provider_id,
 *                              model, result_version_id, error, error_code, idempotency_key, worker_id,
 *                              lease_token, lease_expires_at, attempt, created_at, updated_at) +
 *                              `job_idempotency` (key, job_id)
 *  - `ObjectStore`           → CloudBase PG Storage private bucket (in-memory map keyed by storageKey)
 *  - `UnitOfWork`            → PostgreSQL transaction (snapshot + commit/rollback simulation)
 *  - `AuthThrottleRepository`→ rows of `auth_throttle` (key, failures, window_started_at)
 *
 * Field-name mapping: domain uses camelCase; PG layer uses snake_case.
 * The mock stores PG-style rows and exposes a `dumpPgStyleRows` helper so
 * tests can assert the field-mapping layer (camelCase ↔ snake_case) is
 * well-defined.
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
  input_version_id: string | null;
  result_version_id: string | null;
  error: string | null;
  error_code: string | null;
  idempotency_key: string | null;
  worker_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt: number | null;
  parent_job_id: string | null;
  created_at: string;
  updated_at: string;
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
  versionIdempotency: Record<string, string>;
  // PG-style index for idempotent job creation.
  // Key format: idempotencyKey → jobId
  jobIdempotency: Record<string, string>;
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
    input_version_id: j.inputVersionId ?? null,
    result_version_id: j.resultVersionId ?? null,
    error: j.error ?? null,
    error_code: j.errorCode ?? null,
    idempotency_key: j.idempotencyKey ?? null,
    worker_id: j.workerId ?? null,
    lease_token: j.leaseToken ?? null,
    lease_expires_at: j.leaseExpiresAt ?? null,
    attempt: j.attempt ?? null,
    parent_job_id: j.parentJobId ?? null,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
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
    inputVersionId: r.input_version_id ?? undefined,
    resultVersionId: r.result_version_id ?? undefined,
    error: r.error ?? undefined,
    errorCode: r.error_code ?? undefined,
    idempotencyKey: r.idempotency_key ?? undefined,
    workerId: r.worker_id ?? undefined,
    leaseToken: r.lease_token ?? undefined,
    leaseExpiresAt: r.lease_expires_at ?? undefined,
    attempt: r.attempt ?? undefined,
    parentJobId: r.parent_job_id ?? undefined,
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

const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = [
  'queued',
  'uploading',
  'analyzing',
  'generating',
  'postprocessing',
  'saving',
];

function emptyState(): MockDbState {
  return {
    projects: {},
    assets: {},
    versions: {},
    jobs: {},
    authThrottle: {},
    versionIdempotency: {},
    jobIdempotency: {},
  };
}

function cloneDbState(state: MockDbState): MockDbState {
  return {
    projects: { ...state.projects },
    assets: { ...state.assets },
    versions: { ...state.versions },
    jobs: { ...state.jobs },
    authThrottle: { ...state.authThrottle },
    versionIdempotency: { ...state.versionIdempotency },
    jobIdempotency: { ...state.jobIdempotency },
  };
}

export interface CloudBaseMockPersistence {
  deps: PersistenceDependencies;
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

      // Delete versions whose project_id matches (and their idempotency rows).
      for (const vId of Object.keys(state.versions)) {
        if (state.versions[vId].project_id === id) {
          delete state.versions[vId];
        }
      }
      for (const indexKey of Object.keys(state.versionIdempotency)) {
        if (indexKey.startsWith(`${id}::`)) {
          delete state.versionIdempotency[indexKey];
        }
      }

      // Delete jobs whose project_id matches (and their idempotency rows).
      for (const jId of Object.keys(state.jobs)) {
        if (state.jobs[jId].project_id === id) {
          const job = state.jobs[jId];
          if (job.idempotency_key) {
            delete state.jobIdempotency[job.idempotency_key];
          }
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

    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      const indexKey = `${projectId}::${idempotencyKey}`;
      const existingId = state.versionIdempotency[indexKey];
      if (existingId) {
        const existingRow = state.versions[existingId];
        if (existingRow) {
          return versionFromRow(existingRow);
        }
      }
      if (state.versions[version.id]) {
        throw new Error(`VERSION_ALREADY_EXISTS:${version.id}`);
      }
      state.versions[version.id] = versionToRow(version);
      state.versionIdempotency[indexKey] = version.id;
      return { ...version };
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

  function applyJobPatch(row: JobRow, patch: Partial<GenerationJob>): JobRow {
    return {
      id: row.id,
      project_id: row.project_id,
      prompt: row.prompt,
      status: patch.status ?? row.status,
      provider_id:
        patch.providerId === undefined
          ? row.provider_id
          : (patch.providerId ?? null),
      model:
        patch.model === undefined ? row.model : (patch.model ?? null),
      input_version_id:
        patch.inputVersionId === undefined
          ? row.input_version_id
          : (patch.inputVersionId ?? null),
      result_version_id:
        patch.resultVersionId === undefined
          ? row.result_version_id
          : (patch.resultVersionId ?? null),
      error:
        patch.error === undefined ? row.error : (patch.error ?? null),
      error_code:
        patch.errorCode === undefined
          ? row.error_code
          : (patch.errorCode ?? null),
      idempotency_key: row.idempotency_key,
      worker_id:
        patch.workerId === undefined ? row.worker_id : (patch.workerId ?? null),
      lease_token:
        patch.leaseToken === undefined ? row.lease_token : (patch.leaseToken ?? null),
      lease_expires_at:
        patch.leaseExpiresAt === undefined
          ? row.lease_expires_at
          : (patch.leaseExpiresAt ?? null),
      attempt:
        patch.attempt === undefined ? row.attempt : (patch.attempt ?? null),
      parent_job_id:
        patch.parentJobId === undefined
          ? row.parent_job_id
          : (patch.parentJobId ?? null),
      created_at: row.created_at,
      updated_at: patch.updatedAt ?? now().toISOString(),
    };
  }

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      if (state.jobs[input.id]) {
        throw new Error(`JOB_ALREADY_EXISTS:${input.id}`);
      }
      state.jobs[input.id] = jobToRow(input);
      if (input.idempotencyKey) {
        state.jobIdempotency[input.idempotencyKey] = input.id;
      }
      return { ...input };
    },

    async createIdempotent(
      input: GenerationJob
    ): Promise<{ job: GenerationJob; created: boolean }> {
      if (input.idempotencyKey) {
        const existingId = state.jobIdempotency[input.idempotencyKey];
        if (existingId) {
          const existingRow = state.jobs[existingId];
          if (existingRow) {
            return { job: jobFromRow(existingRow), created: false };
          }
        }
      }
      if (state.jobs[input.id]) {
        throw new Error(`JOB_ALREADY_EXISTS:${input.id}`);
      }
      state.jobs[input.id] = jobToRow(input);
      if (input.idempotencyKey) {
        state.jobIdempotency[input.idempotencyKey] = input.id;
      }
      return { job: { ...input }, created: true };
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
      const updated = applyJobPatch(row, patch);
      state.jobs[id] = updated;
      return jobFromRow(updated);
    },

    async updateIfClaimed(
      id: string,
      leaseToken: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      const row = state.jobs[id];
      if (!row) return null;
      if (!row.lease_token || row.lease_token !== leaseToken) return null;
      const updated = applyJobPatch(row, patch);
      state.jobs[id] = updated;
      return jobFromRow(updated);
    },

    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      const row = state.jobs[id];
      if (!row) throw new Error(`JOB_NOT_FOUND:${id}`);
      const nowMs = Date.parse(input.now);
      const currentExpiry = row.lease_expires_at
        ? Date.parse(row.lease_expires_at)
        : 0;
      const heldByOther =
        row.lease_token &&
        row.lease_token !== input.leaseToken &&
        currentExpiry > nowMs;
      if (heldByOther) return false;
      state.jobs[id] = {
        ...row,
        worker_id: input.workerId,
        lease_token: input.leaseToken,
        lease_expires_at: input.leaseExpiresAt,
        updated_at: input.now,
      };
      return true;
    },

    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      const row = state.jobs[id];
      if (!row) return false;
      if (!row.lease_token || row.lease_token !== input.leaseToken) return false;
      state.jobs[id] = {
        ...row,
        lease_expires_at: input.leaseExpiresAt,
        updated_at: input.now,
      };
      return true;
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

    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      const nowMs = Date.parse(now);
      return Object.values(state.jobs)
        .filter((j) => {
          if (!ACTIVE_JOB_STATUSES.includes(j.status)) return false;
          if (!j.lease_expires_at) return false;
          return Date.parse(j.lease_expires_at) <= nowMs;
        })
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

  // --- Test-only helpers (NOT on the frozen interface) --------------------

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
