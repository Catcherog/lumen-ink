import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JobStatusPanel from './JobStatusPanel';
import type { GenerationJobDto, GenerationJobStatus } from '../../api/projects';

// ===== Fixtures =====

function makeJob(overrides: Partial<GenerationJobDto> = {}): GenerationJobDto {
  return {
    id: 'job_test',
    projectId: 'proj_test',
    prompt: 'test prompt',
    status: 'queued',
    createdAt: '2026-07-18T10:00:00.000Z',
    updatedAt: '2026-07-18T10:00:00.000Z',
    ...overrides,
  };
}

// ===== Tests =====

describe('JobStatusPanel (PERSIST-001 Task 9)', () => {
  describe('status label mapping', () => {
    const cases: Array<[GenerationJobStatus, string]> = [
      ['queued', '排队中'],
      ['uploading', '上传中'],
      ['analyzing', '分析中'],
      ['generating', '生成中'],
      ['postprocessing', '后处理中'],
      ['saving', '保存中'],
      ['succeeded', '已完成'],
      ['failed', '失败'],
      ['cancelled', '已取消'],
    ];

    for (const [status, label] of cases) {
      it(`renders status ${status} as "${label}"`, () => {
        render(
          <JobStatusPanel
            job={makeJob({ status })}
            onCancel={vi.fn()}
            onRetry={vi.fn()}
          />
        );
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    }
  });

  describe('cancel button', () => {
    const cancellable: GenerationJobStatus[] = [
      'queued',
      'uploading',
      'analyzing',
      'generating',
      'postprocessing',
      'saving',
    ];
    const nonCancellable: GenerationJobStatus[] = ['succeeded', 'failed', 'cancelled'];

    for (const status of cancellable) {
      it(`shows cancel button for status ${status}`, () => {
        render(
          <JobStatusPanel
            job={makeJob({ status })}
            onCancel={vi.fn()}
            onRetry={vi.fn()}
          />
        );
        expect(screen.getByRole('button', { name: /取消/i })).toBeInTheDocument();
      });
    }

    for (const status of nonCancellable) {
      it(`hides cancel button for status ${status}`, () => {
        render(
          <JobStatusPanel
            job={makeJob({ status })}
            onCancel={vi.fn()}
            onRetry={vi.fn()}
          />
        );
        expect(screen.queryByRole('button', { name: /^取消$/i })).toBeNull();
      });
    }

    it('clicking cancel calls onCancel with the Job id', () => {
      const onCancel = vi.fn();
      render(
        <JobStatusPanel
          job={makeJob({ id: 'job_x', status: 'generating' })}
          onCancel={onCancel}
          onRetry={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /取消/i }));
      expect(onCancel).toHaveBeenCalledWith('job_x');
    });
  });

  describe('retry button', () => {
    it('shows retry button only when status is failed', () => {
      const { rerender } = render(
        <JobStatusPanel
          job={makeJob({ status: 'failed' })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument();

      rerender(
        <JobStatusPanel
          job={makeJob({ status: 'succeeded' })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /重试/i })).toBeNull();
    });

    it('hides retry button for cancelled Jobs', () => {
      render(
        <JobStatusPanel
          job={makeJob({ status: 'cancelled' })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /重试/i })).toBeNull();
    });

    it('clicking retry calls onRetry with the Job id', () => {
      const onRetry = vi.fn();
      render(
        <JobStatusPanel
          job={makeJob({ id: 'job_y', status: 'failed' })}
          onCancel={vi.fn()}
          onRetry={onRetry}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /重试/i }));
      expect(onRetry).toHaveBeenCalledWith('job_y');
    });
  });

  describe('error display', () => {
    it('shows the error message when Job has failed with an error', () => {
      render(
        <JobStatusPanel
          job={makeJob({
            status: 'failed',
            error: 'PROVIDER_TIMEOUT: 调用超时',
          })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      expect(screen.getByText(/PROVIDER_TIMEOUT: 调用超时/)).toBeInTheDocument();
    });

    it('does not show error block when Job has not failed', () => {
      render(
        <JobStatusPanel
          job={makeJob({ status: 'generating' })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      // No error block rendered — query for the message text should be null
      expect(screen.queryByText(/PROVIDER_/i)).toBeNull();
    });
  });

  describe('percentage text', () => {
    it('never renders any percentage text regardless of status', () => {
      const { rerender } = render(
        <JobStatusPanel
          job={makeJob({ status: 'generating' })}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      );
      // No text matching "X%" should appear
      expect(screen.queryByText(/\d+%/)).toBeNull();

      for (const status of ['queued', 'uploading', 'saving', 'succeeded'] as GenerationJobStatus[]) {
        rerender(
          <JobStatusPanel
            job={makeJob({ status })}
            onCancel={vi.fn()}
            onRetry={vi.fn()}
          />
        );
        expect(screen.queryByText(/\d+%/)).toBeNull();
      }
    });
  });

  it('renders nothing when job is null', () => {
    const { container } = render(
      <JobStatusPanel job={null} onCancel={vi.fn()} onRetry={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
