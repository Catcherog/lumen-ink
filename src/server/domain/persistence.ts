/**
 * STORAGE-001 frozen persistence and executor contracts.
 *
 * This module defines the stable surface consumed by PERSIST-001. Adapters
 * (local, Vercel Postgres + R2, Supabase) implement these interfaces; the
 * PERSIST-001 implementation must not depend on any concrete adapter.
 *
 * Frozen by STORAGE-001 on 2026-07-18. PERSIST-001 consumes these interfaces
 * unchanged. Do not rename, remove, or widen signatures without a new
 * STORAGE task and GPT/user freeze.
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
  | 'running'
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
  get(id: string): Promise<Version | null>;
  listByProject(projectId: string): Promise<Version[]>;
}

export interface JobRepository {
  create(input: GenerationJob): Promise<GenerationJob>;
  get(id: string): Promise<GenerationJob | null>;
  update(id: string, patch: Partial<GenerationJob>): Promise<GenerationJob>;
  listActiveByProject(projectId: string): Promise<GenerationJob[]>;
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
