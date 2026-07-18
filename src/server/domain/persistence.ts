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
  resultVersionId?: string;
  error?: string;
  errorCode?: string;
  idempotencyKey?: string;
  workerId?: string;
  leaseToken?: string;
  leaseExpiresAt?: string;
  attempt?: number;
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
   * Conditional update — only applies if the caller holds the current lease.
   * Returns null if the lease token does not match or the job is gone.
   */
  updateIfClaimed(
    id: string,
    leaseToken: string,
    patch: Partial<GenerationJob>
  ): Promise<GenerationJob | null>;
  /**
   * Atomic lease claim. Returns true if this caller acquired the lease;
   * false if another worker holds a non-expired lease.
   */
  claim(
    id: string,
    input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
  ): Promise<boolean>;
  /** Extend the current lease. Returns false if the caller no longer holds it. */
  heartbeat(
    id: string,
    input: { leaseToken: string; leaseExpiresAt: string; now: string }
  ): Promise<boolean>;
  listActiveByProject(projectId: string): Promise<GenerationJob[]>;
  /** List jobs whose lease has expired but are still in an active state. */
  listLeaseExpired(now: string): Promise<GenerationJob[]>;
}

export interface ObjectStore {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
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
