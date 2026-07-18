/**
 * PERSIST-001 Task 10 — legacy history backup & explicit import.
 *
 * Three pure-ish utilities that bridge the legacy localStorage-backed
 * `edit_history` (written by `useEditor`) to the V2 server-backed
 * Project/Version model:
 *
 *  - inspectLegacyHistory(): read-only inspection; returns per entry
 *    `{ id, recoverable, reason }` without mutating localStorage.
 *  - exportLegacyBackup(): downloads `lumen-edit-history-backup-<ISO>.json`
 *    with the original entries so the user always has an out-of-band
 *    recovery copy.
 *  - importRecoverableEntries({ upload, confirmed }): uploads recoverable
 *    image bytes through a caller-supplied callback (which wraps the V2
 *    Project/Asset APIs). Requires explicit confirmation, retains a
 *    backup of the original entries, retains rejected/failed entries in
 *    `edit_history`, and never removes localStorage on failure.
 *
 * Design rules:
 *  - Only entries with a base64 `resultImage` are recoverable. URL-only
 *    entries are treated as expired/unfetchable and rejected.
 *  - Inspection and backup never mutate `edit_history`.
 *  - Import is all-or-nothing per entry: a failed upload leaves that
 *    entry in `edit_history` so the user can retry.
 */

/** Shape useEditor writes to localStorage (a subset of HistoryEntry). */
export interface LegacyHistoryEntry {
  id: string;
  prompt?: string;
  tool?: string;
  params?: Record<string, unknown>;
  providerId?: string;
  regions?: unknown[];
  /** Base64 image data (may be a data URI or raw base64). */
  resultImage?: string;
  /** Remote URL (e.g. GLM signed URL) — not recoverable. */
  resultImageUrl?: string;
  resultMimeType?: string;
  text?: string;
  timestamp: number;
}

export interface LegacyInspectionResult {
  id: string;
  recoverable: boolean;
  reason:
    | 'base64'
    | 'url_only_not_recoverable'
    | 'no_image_data';
}

/** A recoverable entry handed to the caller-supplied upload callback. */
export interface RecoverableEntry {
  id: string;
  prompt: string;
  /** Raw base64 (data URI prefix stripped). */
  base64: string;
  mimeType: string;
  timestamp: number;
}

export interface ImportResult {
  imported: number;
  /** Rejected by inspectLegacyHistory (URL-only or no image data). */
  skipped: number;
  /** Upload callback rejected. */
  failed: number;
}

export type UploadFn = (entry: RecoverableEntry) => Promise<void>;

const STORAGE_KEY = 'edit_history';
const BACKUP_KEY = 'edit_history_backup';

// --- Reading -------------------------------------------------------------

function readEntries(): LegacyHistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is LegacyHistoryEntry =>
      e !== null && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string'
  );
}

// --- Inspection ----------------------------------------------------------

export function inspectLegacyHistory(): LegacyInspectionResult[] {
  // Read-only: never mutate localStorage here.
  const entries = readEntries();
  return entries.map((entry) => {
    const hasBase64 = !!entry.resultImage && entry.resultImage.trim().length > 0;
    if (hasBase64) {
      return { id: entry.id, recoverable: true, reason: 'base64' };
    }
    const hasUrl = !!entry.resultImageUrl && entry.resultImageUrl.trim().length > 0;
    if (hasUrl) {
      return { id: entry.id, recoverable: false, reason: 'url_only_not_recoverable' };
    }
    return { id: entry.id, recoverable: false, reason: 'no_image_data' };
  });
}

// --- Backup --------------------------------------------------------------

function isoTimestampForFilename(d: Date): string {
  // YYYY-MM-DDTHHMMSSZ — colon-free so the filename works on Windows.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function exportLegacyBackup(): boolean {
  const entries = readEntries();
  if (entries.length === 0) return false;

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lumen-edit-history-backup-${isoTimestampForFilename(new Date())}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release the blob URL. Synchronous revocation is safe here because
  // `anchor.click()` has already queued the navigation synchronously;
  // the user agent captured the URL by the time click() returned.
  URL.revokeObjectURL(url);
  return true;
}

// --- Import --------------------------------------------------------------

function stripDataUriPrefix(value: string): string {
  const commaIdx = value.indexOf(',');
  if (commaIdx < 0) return value;
  const prefix = value.slice(0, commaIdx);
  if (!prefix.startsWith('data:') || !prefix.includes('base64')) return value;
  return value.slice(commaIdx + 1);
}

function extractMimeType(entry: LegacyHistoryEntry): string {
  // Prefer the entry's explicit mimeType, then the data URI media type,
  // then a sensible default.
  if (entry.resultMimeType && entry.resultMimeType.trim()) {
    return entry.resultMimeType;
  }
  if (entry.resultImage && entry.resultImage.startsWith('data:')) {
    const semi = entry.resultImage.indexOf(';');
    if (semi > 5) {
      return entry.resultImage.slice(5, semi);
    }
  }
  return 'image/png';
}

function writeBackup(entries: LegacyHistoryEntry[]): void {
  const payload = {
    version: 1,
    backedUpAt: new Date().toISOString(),
    entries,
  };
  localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
}

function writeRemaining(entries: LegacyHistoryEntry[]): void {
  if (entries.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
}

export async function importRecoverableEntries(opts: {
  upload: UploadFn;
  confirmed: boolean;
}): Promise<ImportResult> {
  if (!opts.confirmed) {
    return { imported: 0, skipped: 0, failed: 0 };
  }

  const entries = readEntries();
  if (entries.length === 0) {
    return { imported: 0, skipped: 0, failed: 0 };
  }

  // Always snapshot the original entries before any mutation, so the user
  // has an out-of-band recovery copy even if every upload fails.
  writeBackup(entries);

  const inspection = inspectLegacyHistory();
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0 };

  // Walk entries in order; recoverable entries are uploaded one at a time
  // so a single failure does not abort the batch. Retained entries
  // (rejected or failed) stay in `edit_history`.
  const remaining: LegacyHistoryEntry[] = [];
  for (const entry of entries) {
    const verdict = inspection.find((r) => r.id === entry.id);
    if (!verdict || !verdict.recoverable) {
      result.skipped += 1;
      remaining.push(entry);
      continue;
    }
    const recoverable: RecoverableEntry = {
      id: entry.id,
      prompt: entry.prompt ?? '',
      base64: stripDataUriPrefix(entry.resultImage ?? ''),
      mimeType: extractMimeType(entry),
      timestamp: entry.timestamp,
    };
    try {
      await opts.upload(recoverable);
      result.imported += 1;
    } catch {
      result.failed += 1;
      remaining.push(entry);
    }
  }

  writeRemaining(remaining);
  return result;
}
