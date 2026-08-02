/**
 * LUMEN-RESULT-VIEWER-ASPECT-ALIGNMENT-01 - ResultViewer tests.
 *
 * Tests the shared compare stage structure, slider accessibility,
 * keyboard navigation, and normal view mode aspect ratio preservation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultViewer from './ResultViewer';

// Minimal 1x1 transparent PNG base64 (no data: prefix).
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const defaultProps = {
  originalImage: TINY_PNG,
  originalMimeType: 'image/png',
  resultImage: TINY_PNG,
  resultMimeType: 'image/png',
};

describe('ResultViewer - shared compare stage (AC-01 ~ AC-04)', () => {
  it('renders data-testid="compare-stage" in compare slider mode', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const stage = screen.getByTestId('compare-stage');
    expect(stage).toBeInTheDocument();
  });

  it('stage contains sizing image, result overlay, and original overlay', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const stage = screen.getByTestId('compare-stage');
    const images = stage.querySelectorAll('img');
    // 3 images: sizing image + result overlay + original overlay
    expect(images).toHaveLength(3);
  });

  it('does not render compare stage in result view mode', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="result"
        onViewModeChange={vi.fn()}
      />
    );

    expect(screen.queryByTestId('compare-stage')).toBeNull();
  });
});

describe('ResultViewer - slider accessibility (AC-07)', () => {
  it('slider handle has role="slider" with correct aria attributes', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('tabindex', '0');
  });

  it('ArrowLeft decreases slider position by 1', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });

    expect(slider).toHaveAttribute('aria-valuenow', '49');
  });

  it('ArrowRight increases slider position by 1', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  it('slider does not exceed 100 when pressing ArrowRight repeatedly', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider');
    // Press ArrowRight 60 times (50 + 60 = 110, should clamp to 100)
    for (let i = 0; i < 60; i++) {
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
    }

    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  it('slider does not go below 0 when pressing ArrowLeft repeatedly', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const slider = screen.getByRole('slider');
    // Press ArrowLeft 60 times (50 - 60 = -10, should clamp to 0)
    for (let i = 0; i < 60; i++) {
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    }

    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('ResultViewer - normal view mode aspect ratio (AC-05)', () => {
  it('fit mode image does not use w-full h-full (prevents stretching)', () => {
    const { container } = render(
      <ResultViewer
        {...defaultProps}
        viewMode="result"
        onViewModeChange={vi.fn()}
      />
    );

    const img = container.querySelector('img[alt="生成结果"]');
    expect(img).toBeInTheDocument();
    const classes = img?.className.split(/\s+/) ?? [];
    expect(classes).not.toContain('w-full');
    expect(classes).not.toContain('h-full');
    expect(classes).toContain('object-contain');
    expect(classes).toContain('max-w-full');
    expect(classes).toContain('max-h-full');
  });
});

describe('ResultViewer - split compare mode', () => {
  it('split mode renders two images with object-contain', () => {
    const { container } = render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    // Click the split compare button
    const splitButton = screen.getByTitle('分屏对比');
    fireEvent.click(splitButton);

    // In split mode, there should be no compare-stage
    expect(screen.queryByTestId('compare-stage')).toBeNull();

    // Both images should have object-contain
    const images = container.querySelectorAll('img');
    expect(images.length).toBeGreaterThanOrEqual(2);
    images.forEach((img) => {
      expect(img.className).toContain('object-contain');
    });
  });
});
