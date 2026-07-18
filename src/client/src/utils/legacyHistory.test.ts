/**
 * PERSIST-001 Task 10 — legacy history backup & explicit import tests.
 *
 * Asserts the three exported utilities:
 *  - inspectLegacyHistory: per-entry { id, recoverable, reason } without
 *    mutating localStorage
 *  - exportLegacyBackup: downloads `lumen-edit-history-backup-<ISO>.json`
 *    preserving the original JSON content
 *  - importRecoverableEntries: requires explicit confirmation, uploads
 *    recoverable image bytes via caller-supplied callback, retains
 *    rejected entries and a backup, and never removes localStorage on
 *    failure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  inspectLegacyHistory,
  exportLegacyBackup,
  importRecoverableEntries,
  type LegacyHistoryEntry,
  type RecoverableEntry,
} from './legacyHistory';

// Mirror of the lightweight shape useEditor writes to localStorage.
function makeEntry(overrides: Partial<LegacyHistoryEntry> = {}): LegacyHistoryEntry {
  return {
    id: `entry_${Math.random().toString(36).slice(2, 8)}`,
    prompt: 'test prompt',
    resultImageUrl: 'https://example.com/image.png',
    resultMimeType: 'image/png',
    timestamp: Date.now(),
    ...overrides,
  };
}

// jsdom's Blob lacks .text() and Response does not decode Blob parts.
function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsText(blob);
  });
}

describe('inspectLegacyHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks entries with data-URI base64 resultImage as recoverable', () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const result = inspectLegacyHistory();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'e1',
      recoverable: true,
      reason: 'base64',
    });
  });

  it('marks entries with raw base64 resultImage as recoverable', () => {
    const entries = [
      makeEntry({ id: 'e2', resultImage: 'iVBORw0KGgo=' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const result = inspectLegacyHistory();
    expect(result[0]).toEqual({
      id: 'e2',
      recoverable: true,
      reason: 'base64',
    });
  });

  it('rejects URL-only entries as not recoverable (expired/unfetchable URLs)', () => {
    const entries = [
      makeEntry({
        id: 'e3',
        resultImage: undefined,
        resultImageUrl: 'https://expired.example.com/image.png',
      }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const result = inspectLegacyHistory();
    expect(result[0]).toEqual({
      id: 'e3',
      recoverable: false,
      reason: 'url_only_not_recoverable',
    });
  });

  it('marks entries with neither image nor URL as not recoverable', () => {
    const entries = [
      makeEntry({
        id: 'e4',
        resultImage: undefined,
        resultImageUrl: undefined,
        text: 'chat response only',
      }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const result = inspectLegacyHistory();
    expect(result[0]).toEqual({
      id: 'e4',
      recoverable: false,
      reason: 'no_image_data',
    });
  });

  it('does NOT mutate edit_history during inspection', () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
      makeEntry({ id: 'e2', resultImageUrl: 'https://x.com/a.png' }),
    ];
    const serialized = JSON.stringify(entries);
    localStorage.setItem('edit_history', serialized);

    inspectLegacyHistory();

    expect(localStorage.getItem('edit_history')).toBe(serialized);
  });

  it('returns empty array when edit_history is missing', () => {
    expect(inspectLegacyHistory()).toEqual([]);
  });

  it('returns empty array when edit_history is corrupted JSON', () => {
    localStorage.setItem('edit_history', '{corrupted');
    expect(inspectLegacyHistory()).toEqual([]);
  });

  it('skips entries that are not objects', () => {
    localStorage.setItem('edit_history', JSON.stringify(['not-an-object', 42, null]));
    expect(inspectLegacyHistory()).toEqual([]);
  });
});

describe('exportLegacyBackup', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
    vi.useRealTimers();
  });

  it('downloads a JSON backup file with ISO timestamp filename', () => {
    const entries = [makeEntry({ id: 'e1' })];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T10:30:45.000Z'));

    exportLegacyBackup();

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('lumen-edit-history-backup-2026-07-18T103045Z.json');
    expect(anchor.href).toBe('blob:fake');
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
  });

  it('preserves the original JSON content inside the backup blob', async () => {
    const entries = [
      makeEntry({ id: 'e1', prompt: 'preserve me', resultImage: 'data:image/png;base64,abc' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    exportLegacyBackup();

    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    // Read via FileReader (jsdom's Blob lacks .text()).
    const text = await readBlobAsText(blob);
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.entries).toEqual(entries);
  });

  it('returns false and does not download when no history exists', () => {
    expect(exportLegacyBackup()).toBe(false);
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('returns false when edit_history contains invalid JSON', () => {
    localStorage.setItem('edit_history', '{corrupted');
    expect(exportLegacyBackup()).toBe(false);
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});

describe('importRecoverableEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('requires confirmed=true before uploading anything', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn().mockResolvedValue(undefined);

    const result = await importRecoverableEntries({ upload, confirmed: false });

    expect(upload).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(localStorage.getItem('edit_history_backup')).toBeNull();
  });

  it('uploads recoverable entries when confirmed and reports counts', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc', prompt: 'first' }),
      makeEntry({ id: 'e2', resultImage: undefined, resultImageUrl: 'https://expired.com' }),
      makeEntry({ id: 'e3', resultImage: 'iVBORw0KGgo=', prompt: 'third' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn().mockResolvedValue(undefined);

    const result = await importRecoverableEntries({ upload, confirmed: true });

    expect(upload).toHaveBeenCalledTimes(2);
    const firstCall = upload.mock.calls[0][0] as RecoverableEntry;
    expect(firstCall.id).toBe('e1');
    expect(firstCall.prompt).toBe('first');
    expect(firstCall.base64).toBe('abc'); // data URI prefix stripped
    expect(firstCall.mimeType).toBe('image/png');

    const secondCall = upload.mock.calls[1][0] as RecoverableEntry;
    expect(secondCall.id).toBe('e3');
    expect(secondCall.base64).toBe('iVBORw0KGgo=');

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('does NOT remove localStorage when an upload fails', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
    ];
    const serialized = JSON.stringify(entries);
    localStorage.setItem('edit_history', serialized);

    const upload = vi.fn().mockRejectedValue(new Error('network failure'));

    const result = await importRecoverableEntries({ upload, confirmed: true });

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    // localStorage must still contain the original entries unchanged
    expect(localStorage.getItem('edit_history')).toBe(serialized);
  });

  it('retains rejected (non-recoverable) entries in edit_history after import', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
      makeEntry({ id: 'e2', resultImageUrl: 'https://expired.com' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn().mockResolvedValue(undefined);

    await importRecoverableEntries({ upload, confirmed: true });

    const remaining = JSON.parse(localStorage.getItem('edit_history') || '[]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('e2');
  });

  it('retains a backup of the original entries under edit_history_backup', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
      makeEntry({ id: 'e2', resultImageUrl: 'https://expired.com' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn().mockResolvedValue(undefined);

    await importRecoverableEntries({ upload, confirmed: true });

    const backup = localStorage.getItem('edit_history_backup');
    expect(backup).toBeTruthy();
    const parsed = JSON.parse(backup!);
    expect(parsed.entries).toEqual(entries);
    expect(parsed.backedUpAt).toBeTruthy();
  });

  it('continues importing subsequent entries after a failure', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
      makeEntry({ id: 'e2', resultImage: 'data:image/png;base64,def' }),
      makeEntry({ id: 'e3', resultImage: 'data:image/png;base64,ghi' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    const result = await importRecoverableEntries({ upload, confirmed: true });

    expect(upload).toHaveBeenCalledTimes(3);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('keeps failed entries in edit_history so the user can retry', async () => {
    const entries = [
      makeEntry({ id: 'e1', resultImage: 'data:image/png;base64,abc' }),
      makeEntry({ id: 'e2', resultImage: 'data:image/png;base64,def' }),
      makeEntry({ id: 'e3', resultImageUrl: 'https://expired.com' }),
    ];
    localStorage.setItem('edit_history', JSON.stringify(entries));

    const upload = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail'));

    await importRecoverableEntries({ upload, confirmed: true });

    const remaining = JSON.parse(localStorage.getItem('edit_history') || '[]');
    // e1 imported successfully (removed), e2 failed (retained), e3 rejected (retained)
    expect(remaining).toHaveLength(2);
    const ids = remaining.map((e: { id: string }) => e.id);
    expect(ids).toContain('e2');
    expect(ids).toContain('e3');
  });

  it('is a no-op when no history exists', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);

    const result = await importRecoverableEntries({ upload, confirmed: true });

    expect(upload).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(localStorage.getItem('edit_history_backup')).toBeNull();
  });
});
