import { describe, expect, it, vi } from 'vitest';
import { clampExportQuality, EXPORT_MIME_TYPES, makeExportFilename } from '../localExport';

describe('local export pure contracts', () => {
  it('maps formats to browser encoding MIME types', () => {
    expect(EXPORT_MIME_TYPES).toEqual({
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    });
  });

  it('clamps quality to the supported 0.5-1 range', () => {
    expect(clampExportQuality(20)).toBe(0.5);
    expect(clampExportQuality(90)).toBe(0.9);
    expect(clampExportQuality(120)).toBe(1);
  });

  it('generates deterministic extensions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T03:04:05.000Z'));
    expect(makeExportFilename('jpeg', 'test')).toBe('test-2026-08-01T03-04-05.jpg');
    expect(makeExportFilename('png', 'test')).toBe('test-2026-08-01T03-04-05.png');
    vi.useRealTimers();
  });
});
