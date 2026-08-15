/**
 * PERSIST-001 Task 11 — Client End-to-End Failure/Recovery Matrix.
 *
 * Integration test that combines the REAL useProject hook + JobStatusPanel +
 * VersionStrip and mocks ONLY the HTTP boundary (axios). This proves the
 * full client-side recovery contract:
 *
 *  1. Refresh recovery          — projectId prop fetches snapshot + active Job
 *  2. Real status labels        — JobStatusPanel renders the correct Chinese
 *                                  label for each of the 9 Job statuses
 *  3. Explicit activate/approve — clicking "设为当前" / "锁定" calls the right
 *                                  HTTP endpoint via useProject
 *  4. Failure not adding a V    — a failed Job does NOT append a Version
 *  5. Cancel/retry actions      — clicking cancel/retry calls the right endpoint
 *  6. No percentage text        — JobStatusPanel never synthesizes "X%"
 *
 * Axios is mocked via `vi.mock("axios")` so every HTTP call is intercepted.
 * The real `api/projects.ts` wrappers run on top of the mock, exercising the
 * full error-mapping path (`toApiError`, `isTerminalJobStatus`, etc.).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState, useCallback } from 'react';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

// --- Mock axios at the HTTP boundary ---------------------------------------

interface MockRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  body?: unknown;
  config?: AxiosRequestConfig;
}
type RouteHandler = (req: MockRequest) => Promise<unknown>;

const httpHandlers = new Map<string, RouteHandler>();

/** Match a concrete URL against a pattern like `/api/projects/:id`. */
function matchRoute(method: string, url: string): { pattern: string; handler: RouteHandler } | null {
  // Try exact match first.
  const exact = httpHandlers.get(`${method} ${url}`);
  if (exact) return { pattern: url, handler: exact };
  // Try pattern match by replacing path segments with `:param`.
  for (const [key, handler] of httpHandlers) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    if (patternMatches(pattern, url)) {
      return { pattern, handler };
    }
  }
  return null;
}

function patternMatches(pattern: string, url: string): boolean {
  const pSeg = pattern.split('/').filter(Boolean);
  const uSeg = url.split('/').filter(Boolean);
  if (pSeg.length !== uSeg.length) return false;
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(':')) continue;
    if (pSeg[i] !== uSeg[i]) return false;
  }
  return true;
}

vi.mock('axios', () => {
  const mockAxios = {
    get: vi.fn(async (url: string, config?: AxiosRequestConfig) => {
      const match = matchRoute('GET', url);
      if (!match) {
        const err = new Error(`GET ${url} not mocked`) as unknown as { isAxiosError: boolean; response: { status: number; data: unknown } };
        err.isAxiosError = true;
        err.response = { status: 404, data: { errorCode: 'NOT_MOCKED' } };
        throw err;
      }
      const data = await match.handler({ method: 'GET', url, config: config ?? {} });
      return { data, status: 200, statusText: 'OK', headers: {}, config: config ?? {} } as AxiosResponse;
    }),
    post: vi.fn(async (url: string, body?: unknown, config?: AxiosRequestConfig) => {
      const match = matchRoute('POST', url);
      if (!match) {
        const err = new Error(`POST ${url} not mocked`) as unknown as { isAxiosError: boolean; response: { status: number; data: unknown } };
        err.isAxiosError = true;
        err.response = { status: 500, data: { errorCode: 'NOT_MOCKED' } };
        throw err;
      }
      const data = await match.handler({ method: 'POST', url, body, config: config ?? {} });
      return { data, status: 200, statusText: 'OK', headers: {}, config: config ?? {} } as AxiosResponse;
    }),
    delete: vi.fn(async (url: string, config?: AxiosRequestConfig) => {
      const match = matchRoute('DELETE', url);
      if (!match) {
        const err = new Error(`DELETE ${url} not mocked`) as unknown as { isAxiosError: boolean; response: { status: number; data: unknown } };
        err.isAxiosError = true;
        err.response = { status: 404, data: { errorCode: 'NOT_MOCKED' } };
        throw err;
      }
      const data = await match.handler({ method: 'DELETE', url, config: config ?? {} });
      return { data, status: 200, statusText: 'OK', headers: {}, config: config ?? {} } as AxiosResponse;
    }),
    isAxiosError: (err: unknown): err is { response?: { status: number; data: unknown } } =>
      err instanceof Error && (err as { isAxiosError?: boolean }).isAxiosError === true,
    defaults: { headers: { common: {} } },
  };
  return { default: mockAxios };
});

function mockRoute(method: 'GET' | 'POST' | 'DELETE', pattern: string, handler: RouteHandler): void {
  httpHandlers.set(`${method} ${pattern}`, handler);
}

function clearRoutes(): void {
  httpHandlers.clear();
}

// --- Imports that depend on the axios mock ---------------------------------

import { useProject } from './hooks/useProject';
import JobStatusPanel from './components/v2/JobStatusPanel';
import VersionStrip from './components/v2/VersionStrip';
import type { ProjectSnapshotDto, GenerationJobDto, GenerationJobStatus } from './api/projects';

// --- Fixtures --------------------------------------------------------------

function makeSnapshot(overrides: Partial<ProjectSnapshotDto> = {}): ProjectSnapshotDto {
  return {
    project: {
      id: 'proj_1',
      name: 'persist-e2e',
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
    signedUrls: { 'asset_0': 'https://signed.example/asset_0' },
    ...overrides,
  };
}

function makeJob(overrides: Partial<GenerationJobDto> = {}): GenerationJobDto {
  return {
    id: 'job_1',
    projectId: 'proj_1',
    prompt: 'e2e prompt',
    status: 'queued',
    createdAt: '2026-07-18T00:00:00Z',
    updatedAt: '2026-07-18T00:00:00Z',
    ...overrides,
  };
}

// --- Integration harness ---------------------------------------------------

/**
 * Minimal wrapper that wires useProject → JobStatusPanel + VersionStrip,
 * mirroring AppV2's wiring without the login/provider/editor complexity.
 */
function PersistHarness({ projectId }: { projectId: string }) {
  const project = useProject(projectId, { pollIntervalMs: 50 });
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);

  const handleCancel = useCallback(async (jobId: string) => {
    void jobId;
    await project.cancel();
  }, [project]);

  const handleRetry = useCallback(async (jobId: string) => {
    void jobId;
    await project.retry();
  }, [project]);

  const handleActivate = useCallback(async (versionId: string) => {
    await project.activate(versionId);
    setViewedVersionId(versionId);
  }, [project]);

  const handleApprove = useCallback(async (versionId: string) => {
    await project.approve(versionId);
  }, [project]);

  return (
    <div>
      <JobStatusPanel
        job={project.activeJob}
        onCancel={handleCancel}
        onRetry={handleRetry}
      />
      <VersionStrip
        snapshot={project.snapshot}
        viewedVersionId={viewedVersionId}
        onViewVersion={setViewedVersionId}
        onActivate={handleActivate}
        onApprove={handleApprove}
      />
      {project.error && (
        <div data-testid="persist-error">{project.error.message}</div>
      )}
    </div>
  );
}

// --- Tests -----------------------------------------------------------------

describe('PERSIST-001 Task 11 — Client E2E failure/recovery matrix', () => {
  beforeEach(() => {
    clearRoutes();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- 1. Refresh recovery ------------------------------------------------

  it('refresh recovers snapshot + active Job from the server', async () => {
    const snapshot = makeSnapshot();
    const job = makeJob({ status: 'queued' });
    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => [job]);

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('persist-e2e')).toBeInTheDocument();
    });

    // JobStatusPanel renders the queued label.
    expect(screen.getByText('排队中')).toBeInTheDocument();
    // VersionStrip shows V0.
    expect(screen.getByText('v0')).toBeInTheDocument();
  });

  it('refresh with no active Jobs renders no JobStatusPanel', async () => {
    const snapshot = makeSnapshot();
    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => []);

    const { container } = render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('persist-e2e')).toBeInTheDocument();
    });
    // No status label text anywhere.
    expect(container.textContent).not.toContain('排队中');
    expect(container.textContent).not.toContain('生成中');
  });

  // --- 2. Real status labels ----------------------------------------------

  it.each([
    ['queued', '排队中'],
    ['uploading', '上传中'],
    ['analyzing', '分析中'],
    ['generating', '生成中'],
    ['postprocessing', '后处理中'],
    ['saving', '保存中'],
    ['succeeded', '已完成'],
    ['failed', '失败'],
    ['cancelled', '已取消'],
  ] as [GenerationJobStatus, string][])(
    'JobStatusPanel shows "%s" → "%s"',
    async (status, label) => {
      const snapshot = makeSnapshot();
      const job = makeJob({ status });
      mockRoute('GET', '/api/projects/:id', async () => snapshot);
      mockRoute('GET', '/api/projects/:id/jobs', async () => [job]);

      render(<PersistHarness projectId="proj_1" />);

      await waitFor(() => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    }
  );

  // --- 3. Explicit activate/approve --------------------------------------

  it('clicking "设为当前" calls POST /api/projects/:id/versions/:vid/activate', async () => {
    const versions = [
      { id: 'ver_0', projectId: 'proj_1', assetId: 'asset_0', label: 'v0', createdAt: '2026-07-18T00:00:00Z' },
      { id: 'ver_1', projectId: 'proj_1', assetId: 'asset_1', label: 'v1', createdAt: '2026-07-18T00:01:00Z' },
    ];
    const snapshot = makeSnapshot({
      versions,
      assets: [
        { id: 'asset_0', projectId: 'proj_1', storageKey: 'redacted://asset_0.bin', mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-07-18T00:00:00Z' },
        { id: 'asset_1', projectId: 'proj_1', storageKey: 'redacted://asset_1.bin', mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-07-18T00:01:00Z' },
      ],
      activeVersion: versions[1],
      signedUrls: {
        'asset_0': 'https://signed.example/asset_0',
        'asset_1': 'https://signed.example/asset_1',
      },
    });
    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => []);

    const activateCalls: string[] = [];
    mockRoute('POST', '/api/projects/:id/versions/:vid/activate', async (req) => {
      // Extract the versionId from the URL.
      const match = req.url.match(/versions\/([^/]+)\/activate/);
      const vid = match ? match[1] : 'unknown';
      activateCalls.push(vid);
      return {
        ...snapshot.project,
        activeVersionId: vid,
      };
    });

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    // Click v0 to view it (so the Activate button appears for v0).
    fireEvent.click(screen.getByText('v0'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /设为当前/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /设为当前/i }));
    await waitFor(() => {
      expect(activateCalls).toEqual(['ver_0']);
    });
  });

  it('clicking "锁定" calls POST /api/projects/:id/versions/:vid/approve', async () => {
    const versions = [
      { id: 'ver_0', projectId: 'proj_1', assetId: 'asset_0', label: 'v0', createdAt: '2026-07-18T00:00:00Z' },
      { id: 'ver_1', projectId: 'proj_1', assetId: 'asset_1', label: 'v1', createdAt: '2026-07-18T00:01:00Z' },
    ];
    const snapshot = makeSnapshot({
      versions,
      assets: [
        { id: 'asset_0', projectId: 'proj_1', storageKey: 'redacted://asset_0.bin', mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-07-18T00:00:00Z' },
        { id: 'asset_1', projectId: 'proj_1', storageKey: 'redacted://asset_1.bin', mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-07-18T00:01:00Z' },
      ],
      activeVersion: versions[1],
      signedUrls: {
        'asset_0': 'https://signed.example/asset_0',
        'asset_1': 'https://signed.example/asset_1',
      },
    });
    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => []);

    const approveCalls: string[] = [];
    mockRoute('POST', '/api/projects/:id/versions/:vid/approve', async (req) => {
      const match = req.url.match(/versions\/([^/]+)\/approve/);
      const vid = match ? match[1] : 'unknown';
      approveCalls.push(vid);
      return {
        ...snapshot.project,
        approvedVersionId: vid,
      };
    });

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('v1'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /锁定/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /锁定/i }));
    await waitFor(() => {
      expect(approveCalls).toEqual(['ver_1']);
    });
  });

  // --- 4. Failure does not append a Version ------------------------------

  it('a failed active Job does NOT append a Version to the snapshot', async () => {
    const snapshot = makeSnapshot();
    const failed = makeJob({
      id: 'job_fail',
      status: 'failed',
      errorCode: 'PROVIDER_TIMEOUT',
      error: 'PROVIDER_TIMEOUT: timed out',
    });

    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => [failed]);

    render(<PersistHarness projectId="proj_1" />);

    // The failed Job is the active Job — its label is shown.
    await waitFor(() => {
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    // The error message is surfaced.
    expect(screen.getByText(/PROVIDER_TIMEOUT/)).toBeInTheDocument();

    // The snapshot still has only V0 — failed Job did not add a Version.
    expect(screen.getAllByText('v0')).toHaveLength(1);
    expect(screen.queryByText('v1')).toBeNull();
  });

  // --- 5. Cancel / retry actions -----------------------------------------

  it('clicking "取消" calls POST /api/jobs/:id/cancel', async () => {
    const snapshot = makeSnapshot();
    // Active (non-terminal) job so the cancel button is visible.
    const job = makeJob({ id: 'job_cancel', status: 'generating' });
    const cancelled = makeJob({ id: 'job_cancel', status: 'cancelled' });

    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => [job]);

    const cancelCalls: string[] = [];
    mockRoute('POST', '/api/jobs/:id/cancel', async (req) => {
      const match = req.url.match(/jobs\/([^/]+)\/cancel/);
      const jid = match ? match[1] : 'unknown';
      cancelCalls.push(jid);
      return cancelled;
    });

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('生成中')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /取消/i }));
    await waitFor(() => {
      expect(cancelCalls).toEqual(['job_cancel']);
    });
    await waitFor(() => {
      expect(screen.getByText('已取消')).toBeInTheDocument();
    });
  });

  it('clicking "重试" calls POST /api/jobs/:id/retry and replaces activeJob', async () => {
    const snapshot = makeSnapshot();
    // Failed job so the retry button is visible.
    const failed = makeJob({ id: 'job_old', status: 'failed', errorCode: 'PROVIDER_TIMEOUT' });
    const newJob = makeJob({
      id: 'job_new',
      status: 'queued',
      attempt: 2,
      parentJobId: 'job_old',
    });

    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => [failed]);

    const retryCalls: string[] = [];
    mockRoute('POST', '/api/jobs/:id/retry', async (req) => {
      const match = req.url.match(/jobs\/([^/]+)\/retry/);
      const jid = match ? match[1] : 'unknown';
      retryCalls.push(jid);
      return { job: newJob, parentJob: failed };
    });
    // Polling the new job returns it as queued (non-terminal) — we don't
    // want polling to interfere with this test, so we return the new job
    // itself, which is already queued.
    mockRoute('GET', '/api/jobs/:id', async () => newJob);

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /重试/i }));
    await waitFor(() => {
      expect(retryCalls).toEqual(['job_old']);
    });
    // activeJob is replaced; the panel flips back to "排队中".
    await waitFor(() => {
      expect(screen.getByText('排队中')).toBeInTheDocument();
    });
  });

  // --- 6. No percentage text ---------------------------------------------

  it('never renders any "X%" percentage text across all Job statuses', async () => {
    const statuses: GenerationJobStatus[] = [
      'queued',
      'uploading',
      'analyzing',
      'generating',
      'postprocessing',
      'saving',
      'succeeded',
      'failed',
      'cancelled',
    ];

    for (const status of statuses) {
      const snapshot = makeSnapshot();
      const job = makeJob({ status });
      mockRoute('GET', '/api/projects/:id', async () => snapshot);
      mockRoute('GET', '/api/projects/:id/jobs', async () => [job]);

      const { container, unmount } = render(<PersistHarness projectId="proj_1" />);
      await waitFor(() => {
        expect(container.textContent).toContain('persist-e2e');
      });
      // No "X%" anywhere.
      expect(container.textContent).not.toMatch(/\d+%/);
      unmount();
      clearRoutes();
    }
  });

  // --- Bonus: snapshot with multiple Versions renders all chips ----------

  it('snapshot with V0 + V1 renders both chips and marks the active one', async () => {
    const versions = [
      { id: 'ver_0', projectId: 'proj_1', assetId: 'asset_0', label: 'v0', createdAt: '2026-07-18T00:00:00Z' },
      { id: 'ver_1', projectId: 'proj_1', assetId: 'asset_1', label: 'v1', createdAt: '2026-07-18T00:01:00Z' },
    ];
    const snapshot = makeSnapshot({
      versions,
      assets: [
        { id: 'asset_0', projectId: 'proj_1', storageKey: 'redacted://asset_0.bin', mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-07-18T00:00:00Z' },
        { id: 'asset_1', projectId: 'proj_1', storageKey: 'redacted://asset_1.bin', mimeType: 'image/png', sizeBytes: 200, createdAt: '2026-07-18T00:01:00Z' },
      ],
      activeVersion: versions[1],
      signedUrls: {
        'asset_0': 'https://signed.example/asset_0',
        'asset_1': 'https://signed.example/asset_1',
      },
    });
    mockRoute('GET', '/api/projects/:id', async () => snapshot);
    mockRoute('GET', '/api/projects/:id/jobs', async () => []);

    render(<PersistHarness projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('v0')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    // v1 is the active version.
    const chip1 = screen.getByText('v1').closest('button');
    expect(chip1?.getAttribute('aria-current')).toBe('true');
    const chip0 = screen.getByText('v0').closest('button');
    expect(chip0?.getAttribute('aria-current')).toBe('false');
  });
});
