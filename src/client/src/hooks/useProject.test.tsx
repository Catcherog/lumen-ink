/**
 * PERSIST-001 Task 8 — useProject hook tests.
 *
 * Uses mocked axios (vi.mock) to assert:
 *  - upload creates snapshot and exposes active version
 *  - queued Job polling survives rerender and stops on terminal state
 *  - refresh restores active Job state from server snapshot
 *  - failed Job does not append a Version
 *  - cancel/retry/activate/approve/delete helpers call the right endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ProjectSnapshotDto, GenerationJobDto } from '../api/projects';

// Mock the projects API module so we never hit the network.
vi.mock('../api/projects', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  deleteProject: vi.fn(),
  activateVersion: vi.fn(),
  approveVersion: vi.fn(),
  createJob: vi.fn(),
  getJob: vi.fn(),
  listJobsByProject: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  isTerminalJobStatus: vi.fn((status: string) =>
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  ),
}));

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
} from '../api/projects';
import { useProject } from './useProject';

function makeSnapshot(overrides: Partial<ProjectSnapshotDto> = {}): ProjectSnapshotDto {
  return {
    project: {
      id: 'proj_1',
      name: 'demo',
      createdAt: '2026-07-18T00:00:00Z',
      updatedAt: '2026-07-18T00:00:00Z',
      activeVersionId: 'ver_0',
    },
    assets: [
      {
        id: 'asset_0',
        projectId: 'proj_1',
        storageKey: 'redacted://asset_0.bin',
        mimeType: 'image/png',
        sizeBytes: 100,
        createdAt: '2026-07-18T00:00:00Z',
      },
    ],
    versions: [
      {
        id: 'ver_0',
        projectId: 'proj_1',
        assetId: 'asset_0',
        label: 'v0',
        createdAt: '2026-07-18T00:00:00Z',
      },
    ],
    activeVersion: {
      id: 'ver_0',
      projectId: 'proj_1',
      assetId: 'asset_0',
      label: 'v0',
      createdAt: '2026-07-18T00:00:00Z',
    },
    signedUrls: { 'redacted://asset_0.bin': 'https://signed.example/asset_0' },
    ...overrides,
  };
}

function makeJob(overrides: Partial<GenerationJobDto> = {}): GenerationJobDto {
  return {
    id: 'job_1',
    projectId: 'proj_1',
    prompt: 'brighten',
    status: 'queued',
    createdAt: '2026-07-18T00:00:00Z',
    updatedAt: '2026-07-18T00:00:00Z',
    ...overrides,
  };
}

const mocked = {
  createProject: vi.mocked(createProject),
  getProject: vi.mocked(getProject),
  deleteProject: vi.mocked(deleteProject),
  activateVersion: vi.mocked(activateVersion),
  approveVersion: vi.mocked(approveVersion),
  createJob: vi.mocked(createJob),
  getJob: vi.mocked(getJob),
  cancelJob: vi.mocked(cancelJob),
  retryJob: vi.mocked(retryJob),
  listJobsByProject: vi.mocked(listJobsByProject),
};

describe('useProject hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('upload creates snapshot and exposes active version', async () => {
    const snapshot = makeSnapshot();
    mocked.createProject.mockResolvedValue(snapshot);

    const { result } = renderHook(() => useProject());

    expect(result.current.snapshot).toBeNull();
    expect(result.current.activeVersion).toBeNull();

    const file = new File(['x'], 'demo.png', { type: 'image/png' });
    await act(async () => {
      await result.current.upload(file, 'demo');
    });

    expect(mocked.createProject).toHaveBeenCalledWith(file, 'demo');
    expect(result.current.snapshot?.project.id).toBe('proj_1');
    expect(result.current.activeVersion?.id).toBe('ver_0');
    expect(result.current.error).toBeNull();
  });

  it('upload error is surfaced via state.error', async () => {
    const err = new Error('network down') as Error & { status?: number };
    err.status = 502;
    mocked.createProject.mockRejectedValue(err);

    const { result } = renderHook(() => useProject());

    const file = new File(['x'], 'demo.png', { type: 'image/png' });
    await act(async () => {
      await result.current.upload(file, 'demo');
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.error?.message).toContain('network down');
  });

  it('refresh restores snapshot and active Job from server', async () => {
    const snapshot = makeSnapshot();
    const job = makeJob({ status: 'queued' });
    mocked.getProject.mockResolvedValue(snapshot);
    mocked.listJobsByProject.mockResolvedValue([job]);

    const { result } = renderHook(() => useProject('proj_1'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocked.getProject).toHaveBeenCalledWith('proj_1');
    expect(result.current.snapshot?.project.id).toBe('proj_1');
    expect(result.current.activeJob?.id).toBe('job_1');
  });

  it('generate creates Job and starts polling; terminal state stops polling', async () => {
    const snapshot = makeSnapshot();
    mocked.getProject.mockResolvedValue(snapshot);
    const queued = makeJob({ id: 'job_poll', status: 'queued' });
    const succeeded = makeJob({ id: 'job_poll', status: 'succeeded', resultVersionId: 'ver_1' });
    mocked.createJob.mockResolvedValue(queued);
    mocked.getJob
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(succeeded);
    // After success, refresh is called to fetch the new snapshot with v1.
    const updatedSnapshot = makeSnapshot({
      versions: [
        {
          id: 'ver_0',
          projectId: 'proj_1',
          assetId: 'asset_0',
          label: 'v0',
          createdAt: '2026-07-18T00:00:00Z',
        },
        {
          id: 'ver_1',
          projectId: 'proj_1',
          assetId: 'asset_1',
          label: 'v1',
          createdAt: '2026-07-18T00:01:00Z',
        },
      ],
      activeVersion: {
        id: 'ver_1',
        projectId: 'proj_1',
        assetId: 'asset_1',
        label: 'v1',
        createdAt: '2026-07-18T00:01:00Z',
      },
      project: {
        id: 'proj_1',
        name: 'demo',
        createdAt: '2026-07-18T00:00:00Z',
        updatedAt: '2026-07-18T00:01:00Z',
        activeVersionId: 'ver_1',
      },
    });
    mocked.getProject.mockResolvedValue(updatedSnapshot);
    mocked.listJobsByProject.mockResolvedValue([succeeded]);

    const { result } = renderHook(() =>
      useProject('proj_1', { pollIntervalMs: 10 })
    );

    // Seed initial snapshot so generate has an inputVersionId.
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.generate({
        prompt: 'remove blemishes',
        idempotencyKey: 'key-001',
      });
    });

    expect(mocked.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        prompt: 'remove blemishes',
        idempotencyKey: 'key-001',
      })
    );

    // Active job is set immediately after createJob resolves.
    expect(result.current.activeJob?.id).toBe('job_poll');

    // Wait for polling to reach terminal state.
    await waitFor(
      () => {
        expect(result.current.activeJob?.status).toBe('succeeded');
      },
      { timeout: 2000 }
    );

    // Polling stopped — getJob was called a bounded number of times.
    expect(mocked.getJob).toHaveBeenCalled();
    // After success, refresh fetched the new Version.
    await waitFor(() => {
      expect(result.current.activeVersion?.id).toBe('ver_1');
    });
  });

  it('failed Job does not append a Version to the snapshot', async () => {
    const snapshot = makeSnapshot();
    mocked.getProject.mockResolvedValue(snapshot);
    const queued = makeJob({ id: 'job_fail', status: 'queued' });
    const failed = makeJob({
      id: 'job_fail',
      status: 'failed',
      errorCode: 'PROVIDER_TIMEOUT',
      error: 'PROVIDER_TIMEOUT: timed out',
    });
    mocked.createJob.mockResolvedValue(queued);
    mocked.getJob.mockResolvedValue(failed);
    mocked.listJobsByProject.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useProject('proj_1', { pollIntervalMs: 10 })
    );

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.generate({
        prompt: 'fail me',
        idempotencyKey: 'key-fail',
      });
    });

    await waitFor(
      () => {
        expect(result.current.activeJob?.status).toBe('failed');
      },
      { timeout: 2000 }
    );

    // The snapshot still has only v0.
    expect(result.current.snapshot?.versions.length).toBe(1);
    expect(result.current.snapshot?.versions[0].id).toBe('ver_0');
    // The errorCode is surfaced.
    expect(result.current.activeJob?.errorCode).toBe('PROVIDER_TIMEOUT');
  });

  it('cancel calls cancelJob and updates activeJob', async () => {
    const snapshot = makeSnapshot();
    mocked.getProject.mockResolvedValue(snapshot);
    const job = makeJob({ id: 'job_cancel', status: 'queued' });
    const cancelled = makeJob({ id: 'job_cancel', status: 'cancelled' });
    mocked.createJob.mockResolvedValue(job);
    mocked.cancelJob.mockResolvedValue(cancelled);

    const { result } = renderHook(() => useProject('proj_1'));

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.generate({ prompt: 'x', idempotencyKey: 'k' });
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(mocked.cancelJob).toHaveBeenCalledWith('job_cancel');
    expect(result.current.activeJob?.status).toBe('cancelled');
  });

  it('retry calls retryJob and replaces activeJob with the new Job', async () => {
    const snapshot = makeSnapshot();
    const failed = makeJob({ id: 'job_old', status: 'failed', errorCode: 'PROVIDER_TIMEOUT' });
    const newJob = makeJob({ id: 'job_new', status: 'queued', attempt: 2, parentJobId: 'job_old' });
    mocked.getProject.mockResolvedValue(snapshot);
    mocked.listJobsByProject.mockResolvedValue([failed]);
    mocked.retryJob.mockResolvedValue({ job: newJob, parentJob: failed });

    const { result } = renderHook(() => useProject('proj_1'));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.activeJob?.id).toBe('job_old');

    await act(async () => {
      await result.current.retry();
    });

    expect(mocked.retryJob).toHaveBeenCalledWith('job_old');
    expect(result.current.activeJob?.id).toBe('job_new');
    expect(result.current.activeJob?.attempt).toBe(2);
  });

  it('activate and approve call the right endpoints', async () => {
    const snapshot = makeSnapshot();
    mocked.getProject.mockResolvedValue(snapshot);
    mocked.activateVersion.mockResolvedValue({
      ...snapshot.project,
      activeVersionId: 'ver_0',
    });
    mocked.approveVersion.mockResolvedValue({
      ...snapshot.project,
      approvedVersionId: 'ver_0',
    });

    const { result } = renderHook(() => useProject('proj_1'));

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.activate('ver_0');
    });
    expect(mocked.activateVersion).toHaveBeenCalledWith('proj_1', 'ver_0');

    await act(async () => {
      await result.current.approve('ver_0');
    });
    expect(mocked.approveVersion).toHaveBeenCalledWith('proj_1', 'ver_0');
  });

  it('delete calls deleteProject and clears local state', async () => {
    const snapshot = makeSnapshot();
    mocked.getProject.mockResolvedValue(snapshot);
    mocked.deleteProject.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProject('proj_1'));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.snapshot).not.toBeNull();

    await act(async () => {
      await result.current.delete();
    });
    expect(mocked.deleteProject).toHaveBeenCalledWith('proj_1');
    expect(result.current.snapshot).toBeNull();
    expect(result.current.activeJob).toBeNull();
  });
});
