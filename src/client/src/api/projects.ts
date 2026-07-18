/**
 * PERSIST-001 Task 8 — typed Project/Job HTTP client.
 *
 * Thin axios wrappers around the authenticated V2 REST surface exposed by
 * `src/server/routes/projects.ts` and `src/server/routes/jobs.ts`. Every
 * function returns typed DTOs; errors propagate as `ApiError` instances
 * that carry the stable `errorCode`/`diagnosticId` from the server.
 *
 * The caller is responsible for setting `axios.defaults.headers.common
 * Authorization` before invoking these helpers (AppV2 already does this).
 *
 * Idempotency contract:
 *  - `createJob` requires an `idempotencyKey`. The same key replayed within
 *    the server's idempotency window returns the original Job without
 *    enqueuing a duplicate.
 */

import axios from 'axios';
import type { EditRecipe } from '../../../shared/types';

// --- DTOs -----------------------------------------------------------------

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

export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeVersionId?: string;
  approvedVersionId?: string;
}

export interface AssetDto {
  id: string;
  projectId: string;
  /** Server returns a redacted form (e.g. `redacted://asset_xxx.bin`). */
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface VersionDto {
  id: string;
  projectId: string;
  assetId: string;
  label: string;
  createdAt: string;
}

export interface GenerationJobDto {
  id: string;
  projectId: string;
  prompt: string;
  status: GenerationJobStatus;
  providerId?: string;
  model?: string;
  inputVersionId?: string;
  resultVersionId?: string;
  error?: string;
  errorCode?: string;
  idempotencyKey?: string;
  attempt?: number;
  parentJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSnapshotDto {
  project: ProjectDto;
  assets: AssetDto[];
  versions: VersionDto[];
  activeVersion?: VersionDto;
  approvedVersion?: VersionDto;
  /** Signed URLs keyed by the *redacted* storage key returned in AssetDto. */
  signedUrls: Record<string, string>;
}

export interface CreateJobInput {
  projectId: string;
  prompt: string;
  inputVersionId?: string;
  providerId?: string;
  model?: string;
  outputSize?: '1k' | '2k' | '4k';
  /** Recipe JSON stored on the Job for audit. */
  recipe?: EditRecipe;
}

export interface ApiError extends Error {
  errorCode?: string;
  diagnosticId?: string;
  status?: number;
}

function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as
      | { errorCode?: string; message?: string; diagnosticId?: string; error?: string }
      | undefined;
    const out: ApiError = new Error(
      body?.message || body?.error || err.message || 'request failed'
    );
    out.errorCode = body?.errorCode;
    out.diagnosticId = body?.diagnosticId;
    out.status = err.response?.status;
    return out;
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// --- Project endpoints ----------------------------------------------------

export async function createProject(
  file: File,
  name: string
): Promise<ProjectSnapshotDto> {
  const imageBase64 = await fileToBase64(file);
  try {
    const res = await axios.post<ProjectSnapshotDto>(
      '/api/projects',
      { name, imageBase64, mimeType: file.type },
      { timeout: 30_000 }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getProject(id: string): Promise<ProjectSnapshotDto> {
  try {
    const res = await axios.get<ProjectSnapshotDto>(`/api/projects/${id}`, {
      timeout: 15_000,
    });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await axios.delete(`/api/projects/${id}`, { timeout: 15_000 });
  } catch (err) {
    throw toApiError(err);
  }
}

export async function activateVersion(
  projectId: string,
  versionId: string
): Promise<ProjectDto> {
  try {
    const res = await axios.post<ProjectDto>(
      `/api/projects/${projectId}/versions/${versionId}/activate`,
      {},
      { timeout: 15_000 }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function approveVersion(
  projectId: string,
  versionId: string
): Promise<ProjectDto> {
  try {
    const res = await axios.post<ProjectDto>(
      `/api/projects/${projectId}/versions/${versionId}/approve`,
      {},
      { timeout: 15_000 }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

// --- Job endpoints --------------------------------------------------------

export async function createJob(
  input: CreateJobInput & { idempotencyKey: string }
): Promise<GenerationJobDto> {
  try {
    const res = await axios.post<GenerationJobDto>(
      `/api/projects/${input.projectId}/jobs`,
      {
        prompt: input.prompt,
        inputVersionId: input.inputVersionId,
        providerId: input.providerId,
        model: input.model,
        outputSize: input.outputSize,
        recipe: input.recipe,
      },
      {
        headers: { 'Idempotency-Key': input.idempotencyKey },
        timeout: 15_000,
      }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getJob(id: string): Promise<GenerationJobDto> {
  try {
    const res = await axios.get<GenerationJobDto>(`/api/jobs/${id}`, {
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function listJobsByProject(
  projectId: string
): Promise<GenerationJobDto[]> {
  try {
    const res = await axios.get<GenerationJobDto[]>(
      `/api/projects/${projectId}/jobs`,
      { timeout: 10_000 }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function cancelJob(id: string): Promise<GenerationJobDto> {
  try {
    const res = await axios.post<GenerationJobDto>(
      `/api/jobs/${id}/cancel`,
      {},
      { timeout: 10_000 }
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function retryJob(id: string): Promise<{
  job: GenerationJobDto;
  parentJob: GenerationJobDto;
}> {
  try {
    const res = await axios.post(`/api/jobs/${id}/retry`, {}, { timeout: 15_000 });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

// --- Helpers --------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string'));
        return;
      }
      // Strip the `data:<mime>;base64,` prefix — the server expects raw
      // base64 in `imageBase64`.
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns true when a Job status is terminal (no more polling needed).
 * Used by the useProject hook to stop polling.
 */
export function isTerminalJobStatus(status: GenerationJobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
