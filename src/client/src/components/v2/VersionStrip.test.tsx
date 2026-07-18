import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VersionStrip from './VersionStrip';
import type { ProjectSnapshotDto, VersionDto } from '../../api/projects';

// ===== Fixtures =====

function makeVersion(overrides: Partial<VersionDto> = {}): VersionDto {
  return {
    id: `ver_${Math.random().toString(36).slice(2, 8)}`,
    projectId: 'proj_test',
    assetId: `asset_${Math.random().toString(36).slice(2, 8)}`,
    label: 'v0',
    createdAt: '2026-07-18T10:00:00.000Z',
    ...overrides,
  };
}

function makeSnapshot(
  versions: VersionDto[],
  overrides: Partial<ProjectSnapshotDto> = {}
): ProjectSnapshotDto {
  const activeVersion = versions[0];
  return {
    project: {
      id: 'proj_test',
      name: '测试项目',
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:00:00.000Z',
      activeVersionId: activeVersion?.id,
    },
    assets: versions.map((_, i) => ({
      id: `asset_${i}`,
      projectId: 'proj_test',
      storageKey: `redacted://asset_${i}.bin`,
      mimeType: 'image/png',
      sizeBytes: 1024,
      createdAt: '2026-07-18T10:00:00.000Z',
    })),
    versions,
    activeVersion,
    signedUrls: Object.fromEntries(
      versions.map((v, i) => [`redacted://asset_${i}.bin`, `https://signed/${v.id}`])
    ),
    ...overrides,
  };
}

// ===== Tests =====

describe('VersionStrip (PERSIST-001 Task 9)', () => {
  it('renders one chip per Version with ordinal label', () => {
    const snapshot = makeSnapshot([
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
      makeVersion({ id: 'ver_2', label: 'v2' }),
    ]);
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId={null}
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByText('v0')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('marks the active Version with an active indicator', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions, {
      project: {
        id: 'proj_test',
        name: '测试项目',
        createdAt: '2026-07-18T10:00:00.000Z',
        updatedAt: '2026-07-18T10:00:00.000Z',
        activeVersionId: 'ver_1',
      },
      activeVersion: versions[1],
    });
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId={null}
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    // The chip for ver_1 should carry the active marker (aria-current).
    const chip1 = screen.getByText('v1').closest('button');
    expect(chip1?.getAttribute('aria-current')).toBe('true');
    const chip0 = screen.getByText('v0').closest('button');
    expect(chip0?.getAttribute('aria-current')).toBe('false');
  });

  it('clicking a chip only VIEWS the Version; it does NOT activate', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions);
    const onView = vi.fn();
    const onActivate = vi.fn();
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId={null}
        onViewVersion={onView}
        onActivate={onActivate}
        onApprove={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('v1'));
    expect(onView).toHaveBeenCalledWith('ver_1');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('marks the viewed Version with a viewed indicator distinct from active', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions); // active = ver_0
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId="ver_1"
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    const chip1 = screen.getByText('v1').closest('button');
    // viewed chip carries data-viewed="true"
    expect(chip1?.getAttribute('data-viewed')).toBe('true');
    // active chip is ver_0 — it is NOT viewed
    const chip0 = screen.getByText('v0').closest('button');
    expect(chip0?.getAttribute('data-viewed')).toBe('false');
  });

  it('shows Activate and Approve buttons only on the viewed Version', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions);
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId="ver_1"
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    // Only one Activate and one Approve button visible
    const activateBtns = screen.getAllByRole('button', { name: /设为当前/i });
    const approveBtns = screen.getAllByRole('button', { name: /锁定/i });
    expect(activateBtns).toHaveLength(1);
    expect(approveBtns).toHaveLength(1);
  });

  it('clicking Activate calls onActivate with the viewed Version id', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions);
    const onActivate = vi.fn();
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId="ver_1"
        onViewVersion={vi.fn()}
        onActivate={onActivate}
        onApprove={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /设为当前/i }));
    expect(onActivate).toHaveBeenCalledWith('ver_1');
  });

  it('clicking Approve calls onApprove with the viewed Version id', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions);
    const onApprove = vi.fn();
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId="ver_1"
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={onApprove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /锁定/i }));
    expect(onApprove).toHaveBeenCalledWith('ver_1');
  });

  it('marks the approved Version with an approved indicator', () => {
    const versions = [
      makeVersion({ id: 'ver_0', label: 'v0' }),
      makeVersion({ id: 'ver_1', label: 'v1' }),
    ];
    const snapshot = makeSnapshot(versions, {
      project: {
        id: 'proj_test',
        name: '测试项目',
        createdAt: '2026-07-18T10:00:00.000Z',
        updatedAt: '2026-07-18T10:00:00.000Z',
        activeVersionId: 'ver_0',
        approvedVersionId: 'ver_1',
      },
      approvedVersion: versions[1],
    });
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId={null}
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    const chip1 = screen.getByText('v1').closest('button');
    expect(chip1?.getAttribute('data-approved')).toBe('true');
  });

  it('renders nothing when snapshot is null', () => {
    const { container } = render(
      <VersionStrip
        snapshot={null}
        viewedVersionId={null}
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the project name in the strip header', () => {
    const snapshot = makeSnapshot([makeVersion()]);
    render(
      <VersionStrip
        snapshot={snapshot}
        viewedVersionId={null}
        onViewVersion={vi.fn()}
        onActivate={vi.fn()}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByText('测试项目')).toBeInTheDocument();
  });
});
