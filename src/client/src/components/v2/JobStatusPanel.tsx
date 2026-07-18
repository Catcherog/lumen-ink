/**
 * PERSIST-001 Task 9 — JobStatusPanel.
 *
 * Floating overlay that surfaces the active Job's status to the user. The
 * panel never synthesizes a progress percentage — it shows only the raw
 * Job.status mapped to a fixed Chinese label.
 *
 * Behaviors (per plan spec):
 *  - Status labels map exactly:
 *      queued=排队中, uploading=上传中, analyzing=分析中,
 *      generating=生成中, postprocessing=后处理中, saving=保存中,
 *      succeeded=已完成, failed=失败, cancelled=已取消
 *  - Cancel button appears only for cancellable states (any non-terminal
 *    status: queued, uploading, analyzing, generating, postprocessing, saving).
 *  - Retry button appears only when status === 'failed'.
 *  - The Job's `error` message is rendered when the Job has failed.
 *  - Renders nothing when `job` is null.
 */

import { Loader2, X, RotateCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { GenerationJobDto, GenerationJobStatus } from '../../api/projects';

export interface JobStatusPanelProps {
  job: GenerationJobDto | null;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}

const STATUS_LABEL: Record<GenerationJobStatus, string> = {
  queued: '排队中',
  uploading: '上传中',
  analyzing: '分析中',
  generating: '生成中',
  postprocessing: '后处理中',
  saving: '保存中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const CANCELLABLE_STATUSES: ReadonlySet<GenerationJobStatus> = new Set([
  'queued',
  'uploading',
  'analyzing',
  'generating',
  'postprocessing',
  'saving',
]);

function isCancellable(status: GenerationJobStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

function isInProgress(status: GenerationJobStatus): boolean {
  return status !== 'succeeded' && status !== 'failed' && status !== 'cancelled';
}

export default function JobStatusPanel({ job, onCancel, onRetry }: JobStatusPanelProps) {
  if (!job) return null;

  const { status, error } = job;
  const label = STATUS_LABEL[status];
  const cancellable = isCancellable(status);
  const retryable = status === 'failed';
  const inProgress = isInProgress(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'absolute top-3 right-3 z-20 max-w-xs rounded-xl border shadow-sm px-3 py-2',
        status === 'failed'
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30'
          : status === 'succeeded'
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30'
            : status === 'cancelled'
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
              : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {inProgress && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-300" />}
        {status === 'succeeded' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
        {status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
        <span
          className={[
            'text-xs font-medium',
            status === 'failed'
              ? 'text-red-700 dark:text-red-300'
              : status === 'succeeded'
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-blue-700 dark:text-blue-300',
          ].join(' ')}
        >
          {label}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {cancellable && (
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              className="px-1.5 py-0.5 rounded text-[10px] border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-0.5"
            >
              <X className="w-2.5 h-2.5" />
              取消
            </button>
          )}
          {retryable && (
            <button
              type="button"
              onClick={() => onRetry(job.id)}
              className="px-1.5 py-0.5 rounded text-[10px] border border-blue-400 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-0.5"
            >
              <RotateCw className="w-2.5 h-2.5" />
              重试
            </button>
          )}
        </div>
      </div>
      {status === 'failed' && error && (
        <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 break-all">
          {error}
        </p>
      )}
    </div>
  );
}
