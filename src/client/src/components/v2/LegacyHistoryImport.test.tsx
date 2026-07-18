/**
 * PERSIST-001 Task 10 — LegacyHistoryImport component tests.
 *
 * Verifies the explicit-import UI:
 *  - Shows inspection counts (recoverable + rejected with reasons)
 *  - Download backup button invokes exportLegacyBackup
 *  - Confirm import requires the checkbox AND the button
 *  - Confirm button calls importRecoverableEntries with confirmed=true
 *    and forwards the result to onImported
 *  - Cancel button closes the panel without importing
 *  - Renders nothing when there are no legacy entries
 *  - No confirm button when there are zero recoverable entries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LegacyHistoryImport from './LegacyHistoryImport';

// Mock the legacyHistory utilities so the component test stays focused on
// the UI contract and never touches real localStorage.
vi.mock('../../utils/legacyHistory', () => ({
  inspectLegacyHistory: vi.fn(),
  exportLegacyBackup: vi.fn(),
  importRecoverableEntries: vi.fn(),
}));

import {
  inspectLegacyHistory,
  exportLegacyBackup,
  importRecoverableEntries,
} from '../../utils/legacyHistory';
import type { LegacyInspectionResult, ImportResult, UploadFn } from '../../utils/legacyHistory';

const mockedInspect = inspectLegacyHistory as ReturnType<typeof vi.fn>;
const mockedExport = exportLegacyBackup as ReturnType<typeof vi.fn>;
const mockedImport = importRecoverableEntries as ReturnType<typeof vi.fn>;

function makeInspection(overrides: LegacyInspectionResult[] = []): LegacyInspectionResult[] {
  return overrides;
}

describe('LegacyHistoryImport (PERSIST-001 Task 10)', () => {
  beforeEach(() => {
    mockedInspect.mockReset();
    mockedExport.mockReset();
    mockedImport.mockReset();
  });

  it('renders nothing when there are no legacy entries', () => {
    mockedInspect.mockReturnValue([]);
    const { container } = render(
      <LegacyHistoryImport upload={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows recoverable and rejected counts from inspection', () => {
    mockedInspect.mockReturnValue(
      makeInspection([
        { id: 'e1', recoverable: true, reason: 'base64' },
        { id: 'e2', recoverable: true, reason: 'base64' },
        { id: 'e3', recoverable: false, reason: 'url_only_not_recoverable' },
        { id: 'e4', recoverable: false, reason: 'no_image_data' },
      ])
    );
    render(<LegacyHistoryImport upload={vi.fn()} onClose={vi.fn()} />);

    // "可恢复（base64）：2 条" — total count appears in the recoverable row.
    expect(screen.getByText(/可恢复（base64）：2 条/)).toBeTruthy();
    // Rejected reasons rendered with their counts.
    expect(screen.getByText(/URL 已失效：1 条/)).toBeTruthy();
    expect(screen.getByText(/无图片数据：1 条/)).toBeTruthy();
  });

  it('download backup button invokes exportLegacyBackup', () => {
    mockedInspect.mockReturnValue(
      makeInspection([{ id: 'e1', recoverable: true, reason: 'base64' }])
    );
    mockedExport.mockReturnValue(true);
    render(<LegacyHistoryImport upload={vi.fn()} onClose={vi.fn()} />);

    const downloadBtn = screen.getByRole('button', { name: /下载备份/i });
    fireEvent.click(downloadBtn);
    expect(mockedExport).toHaveBeenCalledOnce();
  });

  it('confirm import button is disabled until the confirmation checkbox is checked', () => {
    mockedInspect.mockReturnValue(
      makeInspection([{ id: 'e1', recoverable: true, reason: 'base64' }])
    );
    mockedImport.mockResolvedValue({ imported: 1, skipped: 0, failed: 0 } satisfies ImportResult);
    render(<LegacyHistoryImport upload={vi.fn()} onClose={vi.fn()} />);

    const confirmBtn = screen.getByRole('button', { name: /确认导入/i });
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);
  });

  it('clicking confirm with checkbox checked triggers importRecoverableEntries and onImported', async () => {
    mockedInspect.mockReturnValue(
      makeInspection([{ id: 'e1', recoverable: true, reason: 'base64' }])
    );
    const importResult: ImportResult = { imported: 1, skipped: 0, failed: 0 };
    mockedImport.mockResolvedValue(importResult);
    const upload: UploadFn = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();

    render(
      <LegacyHistoryImport
        upload={upload}
        onImported={onImported}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /确认导入/i }));

    await waitFor(() => {
      expect(mockedImport).toHaveBeenCalledWith({ upload, confirmed: true });
    });
    expect(onImported).toHaveBeenCalledWith(importResult);
  });

  it('cancel button closes the panel without importing', () => {
    mockedInspect.mockReturnValue(
      makeInspection([{ id: 'e1', recoverable: true, reason: 'base64' }])
    );
    const onClose = vi.fn();
    render(<LegacyHistoryImport upload={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /取消/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockedImport).not.toHaveBeenCalled();
  });

  it('shows per-entry reason text for rejected entries', () => {
    mockedInspect.mockReturnValue(
      makeInspection([
        { id: 'e1', recoverable: false, reason: 'url_only_not_recoverable' },
        { id: 'e2', recoverable: false, reason: 'no_image_data' },
      ])
    );
    render(<LegacyHistoryImport upload={vi.fn()} onClose={vi.fn()} />);

    // Both reasons should be visible
    expect(screen.getByText(/URL 已失效/)).toBeTruthy();
    expect(screen.getByText(/无图片数据/)).toBeTruthy();
    // No confirm button when there are zero recoverable entries
    expect(screen.queryByRole('button', { name: /确认导入/i })).toBeNull();
  });
});
