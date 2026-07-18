/**
 * PERSIST-001 frozen persistence and executor contracts (D-040 converged).
 *
 * This module defines the stable surface consumed by PERSIST-001. Adapters
 * (local, CloudBase PostgreSQL + PG Storage, mock) implement these interfaces;
 * the PERSIST-001 implementation must not depend on any concrete adapter.
 *
 * Frozen by STORAGE-001 on 2026-07-18. Converged by D-040 on 2026-07-18 under
 * PERSIST Task 3 — production surface promoted: 9-stage JobStatus, lease/
 * idempotency fields on GenerationJob, idempotent Version create, lease-aware
 * Job create/update/claim/heartbeat/listLeaseExpired.
 *
 * D-040 minimal contract fix (PERSIST-001 FIX_PACKET P0 round, 2026-07-18):
 *  - `ObjectStore.get(key)` added so `executeJob` can load frozen input bytes
 *    from `Job.inputVersionId` (PERSIST001-P0-04).
 *  - `JobRepository.updateIfActive(id, patch)` added so `cancelJob` can
 *    atomically cancel AND revoke the lease without racing a completing
 *    worker (PERSIST001-P0-03).
 *  - `updateIfClaimed`/`heartbeat` now reject terminal jobs defensively so a
 *    cancelled job cannot be advanced by a stale lease holder.
 *
 * Do not rename, remove, or widen signatures without a new STORAGE task and
 * GPT/user freeze.
 */

// --- Entities -------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeVersionId?: string;
  approvedVersionId?: string;
}

export interface Asset {
  id: string;
  projectId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  assetId: string;
  label: string;
  createdAt: string;
}

export type GenerationJobStatus =
  | 'queued'
  | 'uploading'
  | 'analyzing'
  | 'generating'
  | 'postprocessing'
  | 'saving'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface GenerationJob {
  id: string;
  projectId: string;
  prompt: string;
  status: GenerationJobStatus;
  providerId?: string;
  model?: string;
  /** Input version whose asset is the source image for this Job. */
  inputVersionId?: string;
  /** Result version created when the Job succeeds. */
  resultVersionId?: string;
  error?: string;
  errorCode?: string;
  idempotencyKey?: string;
  workerId?: string;
  leaseToken?: string;
  leaseExpiresAt?: string;
  attempt?: number;
  /** Parent Job ID for retries; null/undefined for original Jobs. */
  parentJobId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Repositories ---------------------------------------------------------

export interface ProjectRepository {
  create(input: Project): Promise<Project>;
  get(id: string): Promise<Project | null>;
  updatePointers(
    id: string,
    input: { activeVersionId?: string; approvedVersionId?: string }
  ): Promise<Project>;
  deleteCascade(id: string): Promise<void>;
}

export interface AssetRepository {
  create(input: Asset): Promise<Asset>;
  get(id: string): Promise<Asset | null>;
  listByProject(projectId: string): Promise<Asset[]>;
}

export interface VersionRepository {
  create(input: Version): Promise<Version>;
  /** Idempotent create keyed on (projectId, idempotencyKey). */
  createIdempotent(
    projectId: string,
    idempotencyKey: string,
    version: Version
  ): Promise<Version>;
  get(id: string): Promise<Version | null>;
  listByProject(projectId: string): Promise<Version[]>;
}

export interface JobRepository {
  create(input: GenerationJob): Promise<GenerationJob>;
  /** Idempotent create: returns existing job if idempotencyKey matches. */
  createIdempotent(input: GenerationJob): Promise<{ job: GenerationJob; created: boolean }>;
  get(id: string): Promise<GenerationJob | null>;
  update(id: string, patch: Partial<GenerationJob>): Promise<GenerationJob>;
  /**
   * Conditional update — only applies if the caller holds the current lease
   * AND the job is still in an active (non-terminal) state. Returns null if
   * the lease token does not match, the job is gone, or the job has reached
   * a terminal state (succeeded/failed/cancelled).
   *
   * The terminal-state check is defensive: once a job is cancelled, even a
   * worker holding the original lease must not be able to advance it.
   */
  updateIfClaimed(
    id: string,
    leaseToken: string,
    patch: Partial<GenerationJob>
  ): Promise<GenerationJob | null>;
  /**
   * Conditional update — only applies if the job is still in an active
   * (non-terminal) state. Returns null if the job is gone or terminal.
   *
   * Used by `cancelJob` to atomically cancel AND revoke the lease without
   * racing a worker that may be completing the job concurrently. The caller
   * is not required to hold a lease because cancellation is a user-initiated
   * control-plane action.
   */
  updateIfActive(
    id: string,
    patch: Partial<GenerationJob>
  ): Promise<GenerationJob | null>;
  /**
   * Atomic lease claim. Returns true if this caller acquired the lease;
   * false if another worker holds a non-expired lease.
   *
   * Rejects with JOB_NOT_FOUND if the job is gone. A terminal job (already
   * succeeded/failed/cancelled) cannot be claimed — callers must check
   * status before invoking.
   */
  claim(
    id: string,
    input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
  ): Promise<boolean>;
  /**
   * Extend the current lease. Returns false if the caller no longer holds
   * the lease OR the job has reached a terminal state (the lease may have
   * been revoked by cancellation).
   */
  heartbeat(
    id: string,
    input: { leaseToken: string; leaseExpiresAt: string; now: string }
  ): Promise<boolean>;
  listActiveByProject(projectId: string): Promise<GenerationJob[]>;
  /**
   * List active jobs available for recovery — either never claimed (queued,
   * no lease) or with an expired lease. The worker sweeper uses this to
   * discover jobs that need to be (re-)executed after a crash, restart, or
   * adapter rebuild.
   */
  listLeaseExpired(now: string): Promise<GenerationJob[]>;
}

export interface ObjectStore {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  /**
   * Read object bytes by storage key. Used by `executeJob` to load the
   * frozen input asset (`Job.inputVersionId` → Asset → storageKey → bytes)
   * before invoking the Provider.
   *
   * Throws if the key does not exist (ENOENT or adapter-equivalent).
   */
  get(key: string): Promise<Uint8Array>;
  getSignedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface UnitOfWork {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export interface AuthThrottleBucket {
  failures: number;
  windowStartedAt: string;
}

export interface AuthThrottleRepository {
  get(key: string): Promise<AuthThrottleBucket | null>;
  put(key: string, value: AuthThrottleBucket): Promise<void>;
  delete(key: string): Promise<void>;
}

// --- Dependency bundle ----------------------------------------------------

export interface PersistenceDependencies {
  projects: ProjectRepository;
  assets: AssetRepository;
  versions: VersionRepository;
  jobs: JobRepository;
  objects: ObjectStore;
  unitOfWork: UnitOfWork;
  authThrottle: AuthThrottleRepository;
}

// --- Executor -------------------------------------------------------------

export interface JobExecutor {
  enqueue(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<'cancelled' | 'best_effort'>;
}
