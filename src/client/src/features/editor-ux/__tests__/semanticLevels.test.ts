import { describe, expect, it } from 'vitest';
import { normalizeSemanticLevel, semanticLevelLabel, SEMANTIC_LEVELS } from '../semanticLevels';

describe('semantic levels', () => {
  it('exposes exactly five supported values', () => {
    expect(SEMANTIC_LEVELS).toEqual([0, 25, 50, 75, 100]);
  });

  it('normalizes arbitrary values to the nearest supported value', () => {
    expect(normalizeSemanticLevel(12)).toBe(0);
    expect(normalizeSemanticLevel(13)).toBe(25);
    expect(normalizeSemanticLevel(62)).toBe(50);
    expect(normalizeSemanticLevel(88)).toBe(100);
  });

  it('returns stable Chinese semantic labels', () => {
    expect(semanticLevelLabel(0)).toBe('关闭');
    expect(semanticLevelLabel(25)).toBe('轻微');
    expect(semanticLevelLabel(50)).toBe('自然');
    expect(semanticLevelLabel(75)).toBe('明显');
    expect(semanticLevelLabel(100)).toBe('强烈');
  });
});
