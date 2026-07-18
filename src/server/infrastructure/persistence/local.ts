/**
 * PERSIST-001 local persistence adapter (D-040 converged).
 *
 * File-backed adapter used by:
 *  - the contract test (proves the frozen surface is implementable);
 *  - Windows local development (no CloudBase/Vercel account required);
 *  - integration tests in PERSIST-001 (no external services required).
 *
 * The adapter persists beneath a caller-provided `rootDir`. It must NEVER
 * write to the repository, user home, or a production path. The contract test
 * passes `os.tmpdir()`-rooted paths; production code must pass an explicit
 * absolute path that the operator has approved.
 *
 * Persistence model:
 *  - `metadata.json` holds all entities (projects, assets, versions, jobs,
 *    authThrottle buckets, idempotency index) as a single JSON document.
 *    Atomic writes use `write-temp-then-rename` so a crash never leaves a
 *    partial file.
 *  - `objects/<storageKey>` holds raw object bytes. Cascade deletion removes
 *    these files alongside metadata.
 *
 * UnitOfWork:
 *  - Snapshots in-memory state at the start of `run`.
 *  - On exception, restores in-memory state and re-persists to disk so a
 *    freshly-constructed adapter cannot observe partial writes.
 *  - Nested `run` calls execute the function without additional snapshotting
 *    (top-level rollback covers them).
 *
 * Lease/idempotency semantics:
 *  - `createIdempotent` keys on `idempotencyKey` (Version: per-project;
 *    Job: global). Replaying the same key returns the existing record.
 *  - `claim` is atomic: succeeds only if no other worker holds a non-expired
 *    lease. `heartbeat` extends the lease but only for the current holder.
 *  - `updateIfClaimed` refuses to apply patches when the lease token does
 *    not match, so a stale worker cannot mutate the job after takeover.
 *  - `listLeaseExpired` returns active jobs whose lease has expired; the
 *    orchestrator uses this to requeue or fail them.
 *
 * This adapter is NOT concurrent-safe across processes. PERSIST-001 production
 * deployments use CloudBase PostgreSQL; the local adapter is for PoC, local
 * dev, and tests that run single-process.
 */

import { promises as fs } from 'fs';
import path from 'path';
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

interface LocalState {
  projects: Record<string, Project>;
  assets: Record<string, Asset>;
  versions: Record<string, Version>;
  jobs: Record<string, GenerationJob>;
  authThrottle: Record<string, AuthThrottleBucket>;
  // Idempotency indexes (PERSIST Task 3).
  // versionIndex: `${projectId}::${idempotencyKey}` → versionId
  versionIndex: Record<string, string>;
  // jobIndex: idempotencyKey → jobId
  jobIndex: Record<string, string>;
}

function emptyState(): LocalState {
  return {
    projects: {},
    assets: {},
    versions: {},
    jobs: {},
    authThrottle: {},
    versionIndex: {},
    jobIndex: {},
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

function cloneState(state: LocalState): LocalState {
  return {
    projects: { ...state.projects },
    assets: { ...state.assets },
    versions: { ...state.versions },
    jobs: { ...state.jobs },
    authThrottle: { ...state.authThrottle },
    versionIndex: { ...state.versionIndex },
    jobIndex: { ...state.jobIndex },
  };
}

export interface LocalPersistenceOptions {
  rootDir: string;
}

export function createLocalPersistence(
  options: LocalPersistenceOptions
): PersistenceDependencies {
  const rootDir = path.resolve(options.rootDir);
  const metadataPath = path.join(rootDir, 'metadata.json');
  const objectsDir = path.join(rootDir, 'objects');

  // In-memory state; loaded lazily on first access.
  let state: LocalState = emptyState();
  let loaded = false;
  let unitOfWorkDepth = 0;
  let unitOfWorkSnapshot: LocalState | null = null;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalState>;
      state = {
        projects: parsed.projects ?? {},
        assets: parsed.assets ?? {},
        versions: parsed.versions ?? {},
        jobs: parsed.jobs ?? {},
        authThrottle: parsed.authThrottle ?? {},
        versionIndex: parsed.versionIndex ?? {},
        jobIndex: parsed.jobIndex ?? {},
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        state = emptyState();
      } else {
        throw err;
      }
    }
  }

  async function persist(): Promise<void> {
    await fs.mkdir(rootDir, { recursive: true });
    const tmp = `${metadataPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, metadataPath);
  }

  function objectPath(storageKey: string): string {
    // Normalize: prevent path escape by stripping leading slashes and joining.
    const normalized = storageKey.replace(/^[/\\]+/, '').replace(/\.\.+/g, '.');
    return path.join(objectsDir, normalized);
  }

  // --- ProjectRepository --------------------------------------------------

  const projects: ProjectRepository = {
    async create(input: Project): Promise<Project> {
      await ensureLoaded();
      if (state.projects[input.id]) {
        throw new Error(`PROJECT_ALREADY_EXISTS:${input.id}`);
      }
      state.projects[input.id] = { ...input };
      await persist();
      return { ...input };
    },

    async get(id: string): Promise<Project | null> {
      await ensureLoaded();
      const found = state.projects[id];
      return found ? { ...found } : null;
    },

    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      await ensureLoaded();
      const found = state.projects[id];
      if (!found) throw new Error(`PROJECT_NOT_FOUND:${id}`);
      const updated: Project = {
        ...found,
        activeVersionId: input.activeVersionId ?? found.activeVersionId,
        approvedVersionId: input.approvedVersionId ?? found.approvedVersionId,
        updatedAt: new Date().toISOString(),
      };
      state.projects[id] = updated;
      await persist();
      return { ...updated };
    },

    async deleteCascade(id: string): Promise<void> {
      await ensureLoaded();
      const project = state.projects[id];
      if (!project) return;

      // Collect asset storage keys for object cleanup.
      const assetIds = Object.keys(state.assets).filter(
        (assetId) => state.assets[assetId].projectId === id
      );
      const storageKeys = assetIds.map((assetId) => state.assets[assetId].storageKey);

      // Delete object bytes.
      await Promise.all(
        storageKeys.map(async (key) => {
          try {
            await fs.unlink(objectPath(key));
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          }
        })
      );

      // Delete versions whose projectId matches (and their idempotency rows).
      for (const versionId of Object.keys(state.versions)) {
        if (state.versions[versionId].projectId === id) {
          delete state.versions[versionId];
        }
      }
      for (const indexKey of Object.keys(state.versionIndex)) {
        if (indexKey.startsWith(`${id}::`)) {
          delete state.versionIndex[indexKey];
        }
      }

      // Delete jobs whose projectId matches (and their idempotency rows).
      for (const jobId of Object.keys(state.jobs)) {
        if (state.jobs[jobId].projectId === id) {
          const job = state.jobs[jobId];
          if (job.idempotencyKey) delete state.jobIndex[job.idempotencyKey];
          delete state.jobs[jobId];
        }
      }

      // Delete assets.
      for (const assetId of assetIds) {
        delete state.assets[assetId];
      }

      // Delete the project itself.
      delete state.projects[id];

      await persist();
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      await ensureLoaded();
      if (state.assets[input.id]) {
        throw new Error(`ASSET_ALREADY_EXISTS:${input.id}`);
      }
      state.assets[input.id] = { ...input };
      await persist();
      return { ...input };
    },

    async get(id: string): Promise<Asset | null> {
      await ensureLoaded();
      const found = state.assets[id];
      return found ? { ...found } : null;
    },

    async listByProject(projectId: string): Promise<Asset[]> {
      await ensureLoaded();
      return Object.values(state.assets)
        .filter((a) => a.projectId === projectId)
        .map((a) => ({ ...a }));
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      await ensureLoaded();
      if (state.versions[input.id]) {
        throw new Error(`VERSION_ALREADY_EXISTS:${input.id}`);
      }
      state.versions[input.id] = { ...input };
      await persist();
      return { ...input };
    },

    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      await ensureLoaded();
      const indexKey = `${projectId}::${idempotencyKey}`;
      const existingId = state.versionIndex[indexKey];
      if (existingId) {
        const existing = state.versions[existingId];
        if (existing) return { ...existing };
        // Index stale (record was removed); fall through and recreate.
      }
      if (state.versions[version.id]) {
        throw new Error(`VERSION_ALREADY_EXISTS:${version.id}`);
      }
      state.versions[version.id] = { ...version };
      state.versionIndex[indexKey] = version.id;
      await persist();
      return { ...version };
    },

    async get(id: string): Promise<Version | null> {
      await ensureLoaded();
      const found = state.versions[id];
      return found ? { ...found } : null;
    },

    async listByProject(projectId: string): Promise<Version[]> {
      await ensureLoaded();
      return Object.values(state.versions)
        .filter((v) => v.projectId === projectId)
        .map((v) => ({ ...v }));
    },
  };

  // --- JobRepository ------------------------------------------------------

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      await ensureLoaded();
      if (state.jobs[input.id]) {
        throw new Error(`JOB_ALREADY_EXISTS:${input.id}`);
      }
      state.jobs[input.id] = { ...input };
      if (input.idempotencyKey) {
        state.jobIndex[input.idempotencyKey] = input.id;
      }
      await persist();
      return { ...input };
    },

    async createIdempotent(
      input: GenerationJob
    ): Promise<{ job: GenerationJob; created: boolean }> {
      await ensureLoaded();
      if (input.idempotencyKey) {
        const existingId = state.jobIndex[input.idempotencyKey];
        if (existingId) {
          const existing = state.jobs[existingId];
          if (existing) return { job: { ...existing }, created: false };
        }
      }
      if (state.jobs[input.id]) {
        throw new Error(`JOB_ALREADY_EXISTS:${input.id}`);
      }
      state.jobs[input.id] = { ...input };
      if (input.idempotencyKey) {
        state.jobIndex[input.idempotencyKey] = input.id;
      }
      await persist();
      return { job: { ...input }, created: true };
    },

    async get(id: string): Promise<GenerationJob | null> {
      await ensureLoaded();
      const found = state.jobs[id];
      return found ? { ...found } : null;
    },

    async update(
      id: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob> {
      await ensureLoaded();
      const found = state.jobs[id];
      if (!found) throw new Error(`JOB_NOT_FOUND:${id}`);
      const updated: GenerationJob = {
        ...found,
        ...patch,
        id: found.id,
        projectId: found.projectId,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      state.jobs[id] = updated;
      await persist();
      return { ...updated };
    },

    async updateIfClaimed(
      id: string,
      leaseToken: string,
      patch: Partial<GenerationJob>
    ): Promise<GenerationJob | null> {
      await ensureLoaded();
      const found = state.jobs[id];
      if (!found) return null;
      if (!found.leaseToken || found.leaseToken !== leaseToken) return null;
      const updated: GenerationJob = {
        ...found,
        ...patch,
        id: found.id,
        projectId: found.projectId,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      state.jobs[id] = updated;
      await persist();
      return { ...updated };
    },

    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      await ensureLoaded();
      const found = state.jobs[id];
      if (!found) throw new Error(`JOB_NOT_FOUND:${id}`);
      // Allow claim if no lease, lease expired, or same worker re-claiming.
      const nowMs = Date.parse(input.now);
      const currentExpiry = found.leaseExpiresAt ? Date.parse(found.leaseExpiresAt) : 0;
      const heldByOther =
        found.leaseToken &&
        found.leaseToken !== input.leaseToken &&
        currentExpiry > nowMs;
      if (heldByOther) return false;
      const updated: GenerationJob = {
        ...found,
        workerId: input.workerId,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
      };
      state.jobs[id] = updated;
      await persist();
      return true;
    },

    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      await ensureLoaded();
      const found = state.jobs[id];
      if (!found) return false;
      if (!found.leaseToken || found.leaseToken !== input.leaseToken) return false;
      const updated: GenerationJob = {
        ...found,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now,
      };
      state.jobs[id] = updated;
      await persist();
      return true;
    },

    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      await ensureLoaded();
      return Object.values(state.jobs)
        .filter(
          (j) =>
            j.projectId === projectId &&
            ACTIVE_JOB_STATUSES.includes(j.status)
        )
        .map((j) => ({ ...j }));
    },

    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      await ensureLoaded();
      const nowMs = Date.parse(now);
      return Object.values(state.jobs)
        .filter((j) => {
          if (!ACTIVE_JOB_STATUSES.includes(j.status)) return false;
          if (!j.leaseExpiresAt) return false;
          return Date.parse(j.leaseExpiresAt) <= nowMs;
        })
        .map((j) => ({ ...j }));
    },
  };

  // --- ObjectStore --------------------------------------------------------

  const objects: ObjectStore = {
    async put(key: string, bytes: Uint8Array, _mimeType: string): Promise<void> {
      await ensureLoaded();
      const filePath = objectPath(key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, bytes);
    },

    async getSignedUrl(key: string): Promise<string> {
      // Local PoC returns a file:// URL. Production adapters (CloudBase PG
      // Storage) return time-limited HTTPS presigned URLs.
      const filePath = objectPath(key);
      return `file://${filePath}`;
    },

    async delete(key: string): Promise<void> {
      const filePath = objectPath(key);
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },

    async exists(key: string): Promise<boolean> {
      const filePath = objectPath(key);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };

  // --- UnitOfWork ---------------------------------------------------------

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await ensureLoaded();
      // Top-level UoW only. Nested calls reuse the outer snapshot.
      const isTopLevel = unitOfWorkDepth === 0;
      if (isTopLevel) {
        unitOfWorkSnapshot = cloneState(state);
        unitOfWorkDepth = 1;
      }
      try {
        return await fn();
      } catch (err) {
        if (isTopLevel && unitOfWorkSnapshot) {
          state = unitOfWorkSnapshot;
          // Re-persist the rolled-back state so a fresh adapter cannot
          // observe partial writes.
          await persist();
        }
        throw err;
      } finally {
        if (isTopLevel) {
          unitOfWorkSnapshot = null;
          unitOfWorkDepth = 0;
        }
      }
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      await ensureLoaded();
      const found = state.authThrottle[key];
      return found ? { ...found } : null;
    },

    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      await ensureLoaded();
      state.authThrottle[key] = { ...value };
      await persist();
    },

    async delete(key: string): Promise<void> {
      await ensureLoaded();
      delete state.authThrottle[key];
      await persist();
    },
  };

  return {
    projects,
    assets,
    versions,
    jobs,
    objects,
    unitOfWork,
    authThrottle,
  };
}
