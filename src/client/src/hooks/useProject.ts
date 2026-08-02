/**
 * PERSIST-001 Task 8 — useProject hook.
 *
 * React hook that exposes the server-backed Project state to the UI. The
 * hook is the single source of truth for:
 *  - the current ProjectSnapshot (project + assets + versions + signed URLs)
 *  - the active Version (snapshot.activeVersion or the latest version)
 *  - the active Job (the most recent non-terminal Job for this project)
 *  - error state from any failed operation
 *
 * Operations:
 *  - upload(file, name): POST /api/projects — creates a new Project + V0
 *  - refresh(): GET /api/projects/:id + GET /api/projects/:id/jobs
 *  - generate({ prompt, idempotencyKey, recipe? }): POST /api/projects/:id/jobs,
 *    then polls GET /api/jobs/:id until terminal status
 *  - cancel(): POST /api/jobs/:id/cancel
 *  - retry(): POST /api/jobs/:id/retry — replaces activeJob with the new Job
 *  - activate(versionId): POST /api/projects/:id/versions/:vid/activate
 *  - approve(versionId): POST /api/projects/:id/versions/:vid/approve
 *  - delete(): DELETE /api/projects/:id — clears local state
 *
 * Polling contract:
 *  - Polls only non-terminal Jobs at a 1.5s interval (configurable).
 *  - On `succeeded`, calls `refresh()` to fetch the new Version + signed URL
 *    so the UI can display the result.
 *  - On `failed` / `cancelled`, stops polling WITHOUT refreshing — a failed
 *    Job must NOT append a Version to the snapshot.
 *  - Polling is aborted on unmount via a ref flag.
 *  - The hook never synthesizes a progress percentage. The UI can show the
 *    raw Job.status string ('queued', 'uploading', 'generating', etc.).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProject,
  getProject,
  deleteProject,
  activateVersion,
  approveVersion,
  createJob,
  getJob,
  cancelJob,
  retryJob,
  listJobsByProject,
  isTerminalJobStatus,
  type ApiError,
  type ProjectSnapshotDto,
  type GenerationJobDto,
  type GenerationJobStatus,
} from '../api/projects';

export interface GenerateInput {
  prompt: string;
  idempotencyKey: string;
  inputVersionId?: string;
  providerId?: string;
  model?: string;
  outputSize?: '1k' | '2k' | '4k';
  recipe?: import('../../../shared/types').EditRecipe;
}

export interface UseProjectResult {
  /** Server-backed snapshot, or null when no Project is loaded. */
  snapshot: ProjectSnapshotDto | null;
  /** Convenience accessor for snapshot.activeVersion (or null). */
  activeVersion: ProjectSnapshotDto['activeVersion'] | null;
  /** The most recent non-terminal Job, or the last terminal Job if any. */
  activeJob: GenerationJobDto | null;
  /** Last error from any operation; cleared on next successful op. */
  error: ApiError | null;
  /** True while an upload/refresh/generate/cancel/retry is in flight. */
  isLoading: boolean;

  upload(file: File, name: string): Promise<void>;
  refresh(): Promise<void>;
  generate(input: GenerateInput): Promise<void>;
  cancel(): Promise<void>;
  retry(): Promise<void>;
  activate(versionId: string): Promise<void>;
  approve(versionId: string): Promise<void>;
  delete(): Promise<void>;
  clearError(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 1500;

function pickActiveJob(jobs: GenerationJobDto[]): GenerationJobDto | null {
  if (jobs.length === 0) return null;
  // Prefer the most recent non-terminal Job; fall back to the most recent
  // terminal Job so the UI can show "last attempt failed" after polling
  // stops.
  const sorted = [...jobs].sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt) || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt) || 0;
    return tb - ta;
  });
  const active = sorted.find((j) => !isTerminalJobStatus(j.status));
  return active ?? sorted[0];
}

export function useProject(
  projectId?: string,
  options: { pollIntervalMs?: number } = {}
): UseProjectResult {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [snapshot, setSnapshot] = useState<ProjectSnapshotDto | null>(null);
  const [activeJob, setActiveJob] = useState<GenerationJobDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track the previous projectId so we can reset snapshot/job state during
  // render when the id changes (React-recommended pattern for adjusting
  // state on prop changes without setState-in-effect).
  const [prevProjectId, setPrevProjectId] = useState<string | undefined>(projectId);

  // Abort flags for polling and async ops. Refs survive re-renders without
  // re-triggering effects.
  const unmountedRef = useRef(false);
  const pollAbortRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      pollAbortRef.current = true;
    };
  }, []);

  // Reset state during render when projectId changes (React pattern).
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setSnapshot(null);
    setActiveJob(null);
  }

  const refresh = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    setError(null);
    setIsLoading(true);
    try {
      const next = await getProject(projectId);
      if (unmountedRef.current) return;
      setSnapshot(next);
      const jobs = await listJobsByProject(projectId);
      if (unmountedRef.current) return;
      setActiveJob(pickActiveJob(jobs));
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err as ApiError);
    } finally {
      if (!unmountedRef.current) setIsLoading(false);
    }
  }, [projectId]);

  // When projectId changes, auto-refresh so consumers can pass a route
  // param directly. Skip when projectId is undefined (upload-first flow).
  useEffect(() => {
    if (!projectId) return;
    pollAbortRef.current = true; // cancel any in-flight poll from prev id
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh sets isLoading synchronously but this is the standard data-fetching pattern
    void refresh();
  }, [projectId, refresh]);

  const upload = useCallback(async (file: File, name: string): Promise<void> => {
    setError(null);
    setIsLoading(true);
    try {
      const next = await createProject(file, name);
      if (unmountedRef.current) return;
      setSnapshot(next);
      setActiveJob(null);
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err as ApiError);
    } finally {
      if (!unmountedRef.current) setIsLoading(false);
    }
  }, []);

  /**
   * Internal: poll a Job until it reaches a terminal state, then refresh
   * the snapshot if the Job succeeded. Aborts if `pollAbortRef` is set
   * (unmount or new generate/retry call).
   */
  const pollUntilTerminal = useCallback(
    async (jobId: string): Promise<void> => {
      // Reset abort flag for this polling cycle.
      pollAbortRef.current = false;
      while (!unmountedRef.current && !pollAbortRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
        if (unmountedRef.current || pollAbortRef.current) return;
        try {
          const job = await getJob(jobId);
          if (unmountedRef.current || pollAbortRef.current) return;
          setActiveJob(job);
          if (isTerminalJobStatus(job.status)) {
            // On success, refresh to fetch the new Version + signed URL.
            // On failure/cancel, do NOT refresh — a failed Job must not
            // append a Version.
            if (job.status === 'succeeded') {
              await refresh();
            }
            return;
          }
        } catch (err) {
          if (unmountedRef.current || pollAbortRef.current) return;
          setError(err as ApiError);
          return;
        }
      }
    },
    [pollIntervalMs, refresh]
  );

  const generate = useCallback(
    async (input: GenerateInput): Promise<void> => {
      if (!snapshot) {
        setError(new Error('generate: no Project loaded') as ApiError);
        return;
      }
      // Abort any previous polling cycle.
      pollAbortRef.current = true;
      setError(null);
      setIsLoading(true);
      try {
        const job = await createJob({
          projectId: snapshot.project.id,
          prompt: input.prompt,
          inputVersionId: input.inputVersionId ?? snapshot.activeVersion?.id,
          providerId: input.providerId,
          model: input.model,
          outputSize: input.outputSize,
          recipe: input.recipe,
          idempotencyKey: input.idempotencyKey,
        });
        if (unmountedRef.current) return;
        setActiveJob(job);
        // Polling runs in the background; isLoading is released once the
        // Job is enqueued (the UI shows activeJob.status for progress).
        void pollUntilTerminal(job.id);
      } catch (err) {
        if (unmountedRef.current) return;
        setError(err as ApiError);
      } finally {
        if (!unmountedRef.current) setIsLoading(false);
      }
    },
    [snapshot, pollUntilTerminal]
  );

  const cancel = useCallback(async (): Promise<void> => {
    if (!activeJob) return;
    pollAbortRef.current = true;
    setError(null);
    try {
      const updated = await cancelJob(activeJob.id);
      if (unmountedRef.current) return;
      setActiveJob(updated);
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err as ApiError);
    }
  }, [activeJob]);

  const retry = useCallback(async (): Promise<void> => {
    if (!activeJob) return;
    pollAbortRef.current = true;
    setError(null);
    try {
      const { job } = await retryJob(activeJob.id);
      if (unmountedRef.current) return;
      setActiveJob(job);
      void pollUntilTerminal(job.id);
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err as ApiError);
    }
  }, [activeJob, pollUntilTerminal]);

  const activate = useCallback(
    async (versionId: string): Promise<void> => {
      if (!snapshot) return;
      setError(null);
      try {
        const updated = await activateVersion(snapshot.project.id, versionId);
        if (unmountedRef.current) return;
        setSnapshot((prev) =>
          prev ? { ...prev, project: updated, activeVersion: prev.versions.find((v) => v.id === versionId) } : prev
        );
      } catch (err) {
        if (unmountedRef.current) return;
        setError(err as ApiError);
      }
    },
    [snapshot]
  );

  const approve = useCallback(
    async (versionId: string): Promise<void> => {
      if (!snapshot) return;
      setError(null);
      try {
        const updated = await approveVersion(snapshot.project.id, versionId);
        if (unmountedRef.current) return;
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                project: updated,
                approvedVersion: prev.versions.find((v) => v.id === versionId),
              }
            : prev
        );
      } catch (err) {
        if (unmountedRef.current) return;
        setError(err as ApiError);
      }
    },
    [snapshot]
  );

  const deleteProjectFn = useCallback(async (): Promise<void> => {
    if (!snapshot) return;
    pollAbortRef.current = true;
    setError(null);
    try {
      await deleteProject(snapshot.project.id);
      if (unmountedRef.current) return;
      setSnapshot(null);
      setActiveJob(null);
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err as ApiError);
    }
  }, [snapshot]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    snapshot,
    activeVersion: snapshot?.activeVersion ?? null,
    activeJob,
    error,
    isLoading,
    upload,
    refresh,
    generate,
    cancel,
    retry,
    activate,
    approve,
    delete: deleteProjectFn,
    clearError,
  };
}

// Re-export for callers that want the status type alongside the hook.
export type { GenerationJobStatus };
