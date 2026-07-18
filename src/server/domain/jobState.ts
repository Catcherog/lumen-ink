/**
 * PERSIST-001 GenerationJob state machine.
 *
 * Nine real stages reflect the actual lifecycle of a server-side Provider
 * call: queued → uploading → analyzing → generating → postprocessing →
 * saving → succeeded. Any stage may transition to `failed` or `cancelled`
 * (except terminal states themselves).
 *
 * Retryability: only transient failures (timeout, quota-temporary, network,
 * save-temporary) may be retried. Recipe/validation errors are permanent.
 */

import { DomainError } from './errors.js';
import type { GenerationJob } from './persistence.js';

export type JobStatus =
  | 'queued'
  | 'uploading'
  | 'analyzing'
  | 'generating'
  | 'postprocessing'
  | 'saving'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  'queued',
  'uploading',
  'analyzing',
  'generating',
  'postprocessing',
  'saving',
] as const;

const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['uploading', 'cancelled', 'failed'],
  uploading: ['analyzing', 'generating', 'cancelled', 'failed'],
  analyzing: ['generating', 'cancelled', 'failed'],
  generating: ['postprocessing', 'saving', 'cancelled', 'failed'],
  postprocessing: ['saving', 'cancelled', 'failed'],
  saving: ['succeeded', 'cancelled', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_QUOTA',
  'PROVIDER_NETWORK',
  'SAVE_FAILED',
]);

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export function isActiveJobStatus(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionJob(from: JobStatus, to: JobStatus): JobStatus {
  if (!canTransition(from, to)) {
    throw new DomainError({
      code: 'ILLEGAL_JOB_TRANSITION',
      message: `ILLEGAL_JOB_TRANSITION: 不允许的任务状态迁移：${from} → ${to}`,
      cause: { from, to },
    });
  }
  return to;
}

export function isCancellableJobStatus(status: JobStatus): boolean {
  // Terminal states cannot be cancelled.
  return ACTIVE_JOB_STATUSES.includes(status);
}

export function canRetryJob(job: Pick<GenerationJob, 'status' | 'errorCode'>): boolean {
  if (job.status !== 'failed') return false;
  if (!job.errorCode) return false;
  return RETRYABLE_ERROR_CODES.has(job.errorCode);
}
