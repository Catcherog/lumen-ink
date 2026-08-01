export const SEMANTIC_LEVELS = [0, 25, 50, 75, 100] as const;

export type SemanticLevel = (typeof SEMANTIC_LEVELS)[number];

const LEVEL_LABELS: Record<SemanticLevel, string> = {
  0: '关闭',
  25: '轻微',
  50: '自然',
  75: '明显',
  100: '强烈',
};

export function normalizeSemanticLevel(value: number): SemanticLevel {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return SEMANTIC_LEVELS.reduce((nearest, candidate) =>
    Math.abs(candidate - finiteValue) < Math.abs(nearest - finiteValue) ? candidate : nearest,
  );
}

export function semanticLevelLabel(value: number): string {
  return LEVEL_LABELS[normalizeSemanticLevel(value)];
}
