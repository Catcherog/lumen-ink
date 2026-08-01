import { describe, expect, it } from 'vitest';
import { canExecutePlaceholderRemove, TOOL_CAPABILITIES } from '../modelCapabilities';

describe('tool capability contracts', () => {
  it('keeps placeholder remove non-executable until mask selection exists', () => {
    expect(canExecutePlaceholderRemove()).toBe(false);
    expect(TOOL_CAPABILITIES.remove.reason).toContain('蒙版');
  });

  it('declares export as local-only', () => {
    expect(TOOL_CAPABILITIES.export.executable).toBe(true);
    expect(TOOL_CAPABILITIES.export.localOnly).toBe(true);
  });
});
