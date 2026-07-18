/**
 * PERSIST-001 Task 10 — LegacyHistoryImport.
 *
 * Modal-style panel that surfaces the inspection result of the legacy
 * `edit_history` localStorage and lets the user explicitly confirm
 * importing recoverable entries into the V2 server-backed model.
 *
 * UX rules (per plan spec):
 *  - Inspection runs once on mount via inspectLegacyHistory()
 *  - Renders nothing when there are zero legacy entries
 *  - Shows counts: recoverable (base64), rejected (url-only / no image)
 *  - "下载备份" button always available (lets the user export a JSON
 *    backup before importing, regardless of confirmation)
 *  - "确认导入" button is disabled until the user checks the explicit
 *    confirmation checkbox
 *  - On confirm: calls importRecoverableEntries({ upload, confirmed: true })
 *    and forwards the resulting { imported, skipped, failed } to onImported
 *  - "取消" closes the panel without importing
 *  - When there are zero recoverable entries, no confirm button is shown
 */

import { useMemo, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import {
  inspectLegacyHistory,
  exportLegacyBackup,
  importRecoverableEntries,
  type LegacyInspectionResult,
  type ImportResult,
  type UploadFn,
} from '../../utils/legacyHistory';

export interface LegacyHistoryImportProps {
  /** Caller-supplied upload callback (wraps createProject). */
  upload: UploadFn;
  /** Fires with the import result once importRecoverableEntries resolves. */
  onImported?: (result: ImportResult) => void;
  /** Closes the panel without importing. */
  onClose: () => void;
}

const REASON_LABEL: Record<LegacyInspectionResult['reason'], string> = {
  base64: 'base64 图片',
  url_only_not_recoverable: 'URL 已失效',
  no_image_data: '无图片数据',
};

export default function LegacyHistoryImport({
  upload,
  onImported,
  onClose,
}: LegacyHistoryImportProps) {
  const inspection = useMemo<LegacyInspectionResult[]>(() => inspectLegacyHistory(), []);

  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nothing to do if there are no legacy entries at all.
  if (inspection.length === 0) return null;

  const recoverable = inspection.filter((r) => r.recoverable);
  const rejected = inspection.filter((r) => !r.recoverable);

  // Group rejected entries by reason for the summary.
  const rejectedByReason = rejected.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  const handleDownload = () => {
    try {
      exportLegacyBackup();
    } catch {
      // Backup failures are non-fatal; the import can still proceed.
      setError('备份下载失败，但导入仍可继续');
    }
  };

  const handleConfirm = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importRecoverableEntries({ upload, confirmed: true });
      setResult(res);
      onImported?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="导入旧历史记录"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            导入旧历史记录
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="关闭"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">导入完成</span>
            </div>
            <ul className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
              <li>成功导入：{result.imported} 条</li>
              <li>跳过（无法恢复）：{result.skipped} 条</li>
              <li>失败：{result.failed} 条</li>
            </ul>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              原始记录已备份至 <code>edit_history_backup</code>，未导入的条目保留在 <code>edit_history</code> 中。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              完成
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              检测到 <strong>{inspection.length}</strong> 条旧历史记录：
            </p>
            <ul className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
              <li>
                <CheckCircle2 className="inline w-3 h-3 mr-1 text-emerald-500" />
                可恢复（base64）：{recoverable.length} 条
              </li>
              {Object.entries(rejectedByReason).map(([reason, count]) => (
                <li key={reason}>
                  <AlertTriangle className="inline w-3 h-3 mr-1 text-amber-500" />
                  {REASON_LABEL[reason as LegacyInspectionResult['reason']]}：{count} 条
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download className="w-3.5 h-3.5" />
              下载备份 (JSON)
            </button>

            {recoverable.length > 0 && (
              <>
                <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    我已了解：将把 {recoverable.length} 条 base64 图片上传到服务器创建新项目，
                    原始记录将保留备份。此操作不可撤销。
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={importing}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!confirmed || importing}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? '导入中…' : '确认导入'}
                  </button>
                </div>
              </>
            )}

            {recoverable.length === 0 && (
              <button
                type="button"
                onClick={onClose}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                关闭
              </button>
            )}

            {error && (
              <p className="text-[10px] text-red-600 dark:text-red-400 break-all">{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
