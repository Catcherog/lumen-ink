import { describe, expect, it } from 'vitest';
import {
  ACTIVE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  canRetryJob,
  canTransition,
  isCancellableJobStatus,
  isActiveJobStatus,
  isTerminalJobStatus,
  transitionJob,
} from './jobState.js';
import { DomainError, isDomainError } from './errors.js';

describe('GenerationJob state machine', () => {
  it('allows queued -> uploading -> generating -> saving -> succeeded', () => {
    expect(transitionJob('queued', 'uploading')).toBe('uploading');
    expect(transitionJob('uploading', 'generating')).toBe('generating');
    expect(transitionJob('generating', 'saving')).toBe('saving');
    expect(transitionJob('saving', 'succeeded')).toBe('succeeded');
  });

  it('allows the full nine-stage path queued -> uploading -> analyzing -> generating -> postprocessing -> saving -> succeeded', () => {
    expect(transitionJob('queued', 'uploading')).toBe('uploading');
    expect(transitionJob('uploading', 'analyzing')).toBe('analyzing');
    expect(transitionJob('analyzing', 'generating')).toBe('generating');
    expect(transitionJob('generating', 'postprocessing')).toBe('postprocessing');
    expect(transitionJob('postprocessing', 'saving')).toBe('saving');
    expect(transitionJob('saving', 'succeeded')).toBe('succeeded');
  });

  it('rejects failed -> succeeded', () => {
    expect(() => transitionJob('failed', 'succeeded')).toThrow('ILLEGAL_JOB_TRANSITION');
    expect(() => transitionJob('failed', 'succeeded')).toThrow(DomainError);
  });

  it('rejects succeeded -> any other state', () => {
    expect(() => transitionJob('succeeded', 'failed')).toThrow('ILLEGAL_JOB_TRANSITION');
    expect(() => transitionJob('succeeded', 'cancelled')).toThrow('ILLEGAL_JOB_TRANSITION');
    expect(() => transitionJob('succeeded', 'generating')).toThrow('ILLEGAL_JOB_TRANSITION');
  });

  it('rejects cancelled -> any other state', () => {
    expect(() => transitionJob('cancelled', 'succeeded')).toThrow('ILLEGAL_JOB_TRANSITION');
    expect(() => transitionJob('cancelled', 'failed')).toThrow('ILLEGAL_JOB_TRANSITION');
  });

  it('rejects same-state transitions', () => {
    expect(canTransition('queued', 'queued')).toBe(false);
    expect(canTransition('succeeded', 'succeeded')).toBe(false);
    expect(canTransition('failed', 'failed')).toBe(false);
  });

  it('allows every active stage to fail or cancel', () => {
    for (const from of ACTIVE_JOB_STATUSES) {
      expect(canTransition(from, 'failed')).toBe(true);
      expect(canTransition(from, 'cancelled')).toBe(true);
    }
  });

  it('does not allow terminal states to transition to failed/cancelled', () => {
    for (const terminal of TERMINAL_JOB_STATUSES) {
      expect(canTransition(terminal, 'failed')).toBe(false);
      expect(canTransition(terminal, 'cancelled')).toBe(false);
    }
  });

  it('retries only retryable failed jobs', () => {
    expect(canRetryJob({ status: 'failed', errorCode: 'PROVIDER_TIMEOUT' })).toBe(true);
    expect(canRetryJob({ status: 'failed', errorCode: 'PROVIDER_QUOTA' })).toBe(true);
    expect(canRetryJob({ status: 'failed', errorCode: 'PROVIDER_NETWORK' })).toBe(true);
    expect(canRetryJob({ status: 'failed', errorCode: 'SAVE_FAILED' })).toBe(true);
    expect(canRetryJob({ status: 'failed', errorCode: 'INVALID_RECIPE' })).toBe(false);
  });

  it('does not retry non-failed jobs', () => {
    expect(canRetryJob({ status: 'succeeded', errorCode: undefined })).toBe(false);
    expect(canRetryJob({ status: 'cancelled', errorCode: undefined })).toBe(false);
    expect(canRetryJob({ status: 'queued', errorCode: undefined })).toBe(false);
  });

  it('does not retry failed jobs without an error code', () => {
    expect(canRetryJob({ status: 'failed', errorCode: undefined })).toBe(false);
  });

  it('classifies terminal and active statuses correctly', () => {
    expect(isTerminalJobStatus('succeeded')).toBe(true);
    expect(isTerminalJobStatus('failed')).toBe(true);
    expect(isTerminalJobStatus('cancelled')).toBe(true);
    expect(isTerminalJobStatus('queued')).toBe(false);
    expect(isTerminalJobStatus('generating')).toBe(false);

    expect(isActiveJobStatus('queued')).toBe(true);
    expect(isActiveJobStatus('saving')).toBe(true);
    expect(isActiveJobStatus('succeeded')).toBe(false);
  });

  it('only allows cancellation from active statuses', () => {
    for (const active of ACTIVE_JOB_STATUSES) {
      expect(isCancellableJobStatus(active)).toBe(true);
    }
    for (const terminal of TERMINAL_JOB_STATUSES) {
      expect(isCancellableJobStatus(terminal)).toBe(false);
    }
  });

  it('DomainError carries a stable code and diagnosticId', () => {
    try {
      transitionJob('failed', 'succeeded');
      throw new Error('expected transitionJob to throw');
    } catch (err) {
      expect(isDomainError(err)).toBe(true);
      const e = err as DomainError;
      expect(e.code).toBe('ILLEGAL_JOB_TRANSITION');
      expect(e.diagnosticId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(e.toJSON()).toMatchObject({
        code: 'ILLEGAL_JOB_TRANSITION',
        diagnosticId: e.diagnosticId,
      });
    }
  });
});
