/**
 * LUMEN-RESULT-VIEWER-ASPECT-ALIGNMENT-01 - ResultViewer tests.
 *
 * Tests the shared compare stage structure, slider accessibility,
 * keyboard navigation, normal view mode aspect ratio preservation,
 * calculateContainSize geometry, and slider coordinate mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultViewer, { calculateContainSize } from './ResultViewer';

// Minimal 1x1 transparent PNG base64 (no data: prefix).
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const defaultProps = {
  originalImage: TINY_PNG,
  originalMimeType: 'image/png',
  resultImage: TINY_PNG,
  resultMimeType: 'image/png',
};

// jsdom may not implement setPointerCapture/releasePointerCapture
beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

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

  it('stage contains result overlay and original overlay (no sizing image)', () => {
    render(
      <ResultViewer
        {...defaultProps}
        viewMode="compare"
        onViewModeChange={vi.fn()}
      />
    );

    const stage = screen.getByTestId('compare-stage');
    const images = stage.querySelectorAll('img');
    // 2 images: result overlay + original overlay (sizing image removed in RF-01)
    expect(images).toHaveLength(2);
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

// ---------------------------------------------------------------------------
// RF-02: calculateContainSize geometry tests
// ---------------------------------------------------------------------------

describe('calculateContainSize geometry (RF-02)', () => {
  it('600x1200 portrait inside 500x400 => 200x400', () => {
    expect(
      calculateContainSize({ width: 600, height: 1200 }, { width: 500, height: 400 }),
    ).toEqual({ width: 200, height: 400 });
  });

  it('1200x600 landscape inside 500x400 => 500x250', () => {
    expect(
      calculateContainSize({ width: 1200, height: 600 }, { width: 500, height: 400 }),
    ).toEqual({ width: 500, height: 250 });
  });

  it('1000x1000 square inside 500x400 => 400x400', () => {
    expect(
      calculateContainSize({ width: 1000, height: 1000 }, { width: 500, height: 400 }),
    ).toEqual({ width: 400, height: 400 });
  });

  it('400x200 inside 500x400, no upscale => 400x200', () => {
    expect(
      calculateContainSize({ width: 400, height: 200 }, { width: 500, height: 400 }),
    ).toEqual({ width: 400, height: 200 });
  });

  it('returns 0x0 when source width is zero', () => {
    expect(
      calculateContainSize({ width: 0, height: 100 }, { width: 500, height: 400 }),
    ).toEqual({ width: 0, height: 0 });
  });

  it('returns 0x0 when source height is zero', () => {
    expect(
      calculateContainSize({ width: 100, height: 0 }, { width: 500, height: 400 }),
    ).toEqual({ width: 0, height: 0 });
  });

  it('returns 0x0 when container width is zero', () => {
    expect(
      calculateContainSize({ width: 600, height: 1200 }, { width: 0, height: 400 }),
    ).toEqual({ width: 0, height: 0 });
  });

  it('returns 0x0 when container height is zero', () => {
    expect(
      calculateContainSize({ width: 600, height: 1200 }, { width: 500, height: 0 }),
    ).toEqual({ width: 0, height: 0 });
  });

  it('upscales when allowUpscale is true', () => {
    // 100x100 inside 500x400, upscale => scale = min(5, 4) = 4 => 400x400
    expect(
      calculateContainSize({ width: 100, height: 100 }, { width: 500, height: 400 }, true),
    ).toEqual({ width: 400, height: 400 });
  });

  it('does not upscale by default', () => {
    // 100x100 inside 500x400, no upscale => scale = min(1, 1) = 1 => 100x100
    expect(
      calculateContainSize({ width: 100, height: 100 }, { width: 500, height: 400 }),
    ).toEqual({ width: 100, height: 100 });
  });
});

// ---------------------------------------------------------------------------
// RF-02: Slider coordinate mapping tests
// ---------------------------------------------------------------------------

/** Helper: mock getBoundingClientRect on the compare-stage element. */
function mockStageRect(stage: HTMLElement, left: number, width: number, height = 400) {
  stage.getBoundingClientRect = vi.fn(() => ({
    left,
    top: 0,
    right: left + width,
    bottom: height,
    width,
    height,
    x: left,
    y: 0,
    toJSON: () => {},
  }));
}

/**
 * Helper: dispatch a pointerdown event with a specific clientX.
 * fireEvent.pointerDown in @testing-library may not properly set clientX
 * in jsdom, so we create the event manually using PointerEvent (or
 * MouseEvent fallback) and dispatch via fireEvent.
 */
function firePointerDown(element: HTMLElement, clientX: number, pointerId = 1) {
  const EventConstructor = window.PointerEvent || window.MouseEvent;
  const event = new EventConstructor('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX,
    pointerId,
  } as PointerEventInit);
  fireEvent(element, event);
}

/** Helper: dispatch a pointermove event with a specific clientX. */
function firePointerMove(element: HTMLElement, clientX: number, pointerId = 1) {
  const EventConstructor = window.PointerEvent || window.MouseEvent;
  const event = new EventConstructor('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX,
    pointerId,
  } as PointerEventInit);
  fireEvent(element, event);
}

/** Helper: dispatch a pointercancel event. */
function firePointerCancel(element: HTMLElement, pointerId = 1) {
  const EventConstructor = window.PointerEvent || window.Event;
  const event = new EventConstructor('pointercancel', {
    bubbles: true,
    cancelable: true,
    pointerId,
  } as PointerEventInit);
  fireEvent(element, event);
}

/** Helper: dispatch a lostpointercapture event. */
function fireLostPointerCapture(element: HTMLElement, pointerId = 1) {
  const EventConstructor = window.PointerEvent || window.Event;
  const event = new EventConstructor('lostpointercapture', {
    bubbles: true,
    cancelable: true,
    pointerId,
  } as PointerEventInit);
  fireEvent(element, event);
}

describe('ResultViewer - slider coordinate mapping (RF-02)', () => {
  it('maps clientX to 0% at stage left edge', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 100);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('maps clientX to 25% at quarter width', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 150);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '25');
  });

  it('maps clientX to 50% at center', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 200);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  it('maps clientX to 100% at stage right edge', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 300);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps clientX below stage to 0%', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 50);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('clamps clientX above stage to 100%', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    firePointerDown(stage, 500);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  it('does not move slider when rect.width <= 0 (RF-03 guard)', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    // Mock zero-width rect (element not laid out yet)
    stage.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));

    const slider = screen.getByRole('slider');
    const before = slider.getAttribute('aria-valuenow');

    firePointerDown(stage, 250);

    // Slider should remain at default (50), not change
    expect(slider).toHaveAttribute('aria-valuenow', before);
  });
});

// ---------------------------------------------------------------------------
// RF-03: Pointer cancel / lostpointercapture tests
// ---------------------------------------------------------------------------

describe('ResultViewer - pointer cancel handling (RF-03)', () => {
  it('stops dragging after pointercancel event', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    const slider = screen.getByRole('slider');

    // Start dragging at 25%
    firePointerDown(stage, 150);
    expect(slider).toHaveAttribute('aria-valuenow', '25');

    // Fire pointercancel - should reset isDragging
    firePointerCancel(stage);

    // Subsequent pointerMove should NOT move the slider
    firePointerMove(stage, 300);
    expect(slider).toHaveAttribute('aria-valuenow', '25');
  });

  it('stops dragging after lostpointercapture event', () => {
    render(
      <ResultViewer {...defaultProps} viewMode="compare" onViewModeChange={vi.fn()} />,
    );

    const stage = screen.getByTestId('compare-stage');
    mockStageRect(stage, 100, 200);

    const slider = screen.getByRole('slider');

    // Start dragging at 50%
    firePointerDown(stage, 200);
    expect(slider).toHaveAttribute('aria-valuenow', '50');

    // Fire lostpointercapture - should reset isDragging
    fireLostPointerCapture(stage);

    // Subsequent pointerMove should NOT move the slider
    firePointerMove(stage, 100);
    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });
});
