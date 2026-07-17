import { describe, it, expect } from 'vitest';
import {
  legacyValueToTier,
  tierToLegacyValue,
  defaultRecipe,
  defaultRecipeBook,
  canSubmitRecipe,
  compilePrompt,
} from './recipe';
import type { V2TaskId } from '../../../shared/types';
import { V2_TASK_TOOL_MAP, V2_TASK_EDITABLE, TIER_ORDER } from '../../../shared/types';

// ===== legacyValueToTier =====

describe('legacyValueToTier', () => {
  it('maps 0 to off', () => {
    expect(legacyValueToTier(0)).toBe('off');
  });

  it('maps negative values to off (defensive)', () => {
    expect(legacyValueToTier(-5)).toBe('off');
  });

  it('maps 1-29 to light', () => {
    expect(legacyValueToTier(1)).toBe('light');
    expect(legacyValueToTier(29)).toBe('light');
  });

  it('maps 30-59 to natural (30 is inclusive)', () => {
    expect(legacyValueToTier(30)).toBe('natural');
    expect(legacyValueToTier(59)).toBe('natural');
  });

  it('maps 60-84 to obvious (60 is inclusive)', () => {
    expect(legacyValueToTier(60)).toBe('obvious');
    expect(legacyValueToTier(84)).toBe('obvious');
  });

  it('maps 85-100 to strong (85 is inclusive)', () => {
    expect(legacyValueToTier(85)).toBe('strong');
    expect(legacyValueToTier(100)).toBe('strong');
    expect(legacyValueToTier(150)).toBe('strong');
  });
});

// ===== tierToLegacyValue =====

describe('tierToLegacyValue', () => {
  it('returns 0 for off', () => {
    expect(tierToLegacyValue('off')).toBe(0);
  });

  it('returns 20 for light', () => {
    expect(tierToLegacyValue('light')).toBe(20);
  });

  it('returns 40 for natural', () => {
    expect(tierToLegacyValue('natural')).toBe(40);
  });

  it('returns 70 for obvious', () => {
    expect(tierToLegacyValue('obvious')).toBe(70);
  });

  it('returns 90 for strong', () => {
    expect(tierToLegacyValue('strong')).toBe(90);
  });

  it('is total: every Tier has a mapping', () => {
    for (const tier of TIER_ORDER) {
      expect(typeof tierToLegacyValue(tier)).toBe('number');
    }
  });
});

// ===== legacyValueToTier ∘ tierToLegacyValue round-trip =====

describe('legacy/tier round-trip stability', () => {
  it('tierToLegacyValue(tier) maps back to the same tier via legacyValueToTier', () => {
    for (const tier of TIER_ORDER) {
      const legacy = tierToLegacyValue(tier);
      expect(legacyValueToTier(legacy)).toBe(tier);
    }
  });
});

// ===== defaultRecipe =====

describe('defaultRecipe', () => {
  it('returns schemaVersion=1', () => {
    expect(defaultRecipe('subject').schemaVersion).toBe(1);
  });

  it('all protections default to true', () => {
    const r = defaultRecipe('subject');
    expect(r.protections.identity).toBe(true);
    expect(r.protections.composition).toBe(true);
    expect(r.protections.skinTexture).toBe(true);
    expect(r.protections.clothing).toBe(true);
    expect(r.protections.background).toBe(true);
  });

  it('all portrait params default to natural or lighter (D-005)', () => {
    const r = defaultRecipe('subject');
    for (const key of Object.keys(r.portrait) as Array<keyof typeof r.portrait>) {
      const tier = r.portrait[key];
      // 不超过"自然"档：off / light / natural
      expect(['off', 'light', 'natural']).toContain(tier);
    }
  });

  it('auxiliary defaults are empty/zero', () => {
    const r = defaultRecipe('subject');
    expect(r.auxiliary.description).toBe('');
    expect(r.auxiliary.referenceImageCount).toBe(0);
    expect(r.auxiliary.regions).toEqual([]);
    expect(r.auxiliary.outputFormat).toBe('jpeg');
    expect(r.auxiliary.outputQuality).toBe(90);
  });

  it('tool matches V2_TASK_TOOL_MAP for each task', () => {
    const tasks: V2TaskId[] = ['project', 'subject', 'color', 'cleanup', 'local', 'export'];
    for (const task of tasks) {
      const r = defaultRecipe(task);
      expect(r.tool).toBe(V2_TASK_TOOL_MAP[task]);
      expect(r.taskId).toBe(task);
    }
  });

  it('project task has null tool', () => {
    expect(defaultRecipe('project').tool).toBeNull();
  });
});

// ===== defaultRecipeBook =====

describe('defaultRecipeBook', () => {
  it('contains entries for all six V2TaskIds', () => {
    const book = defaultRecipeBook();
    expect(Object.keys(book).sort()).toEqual(
      ['project', 'subject', 'color', 'cleanup', 'local', 'export'].sort(),
    );
  });

  it('each entry has matching taskId', () => {
    const book = defaultRecipeBook();
    for (const task of Object.keys(book) as V2TaskId[]) {
      expect(book[task].taskId).toBe(task);
    }
  });
});

// ===== canSubmitRecipe =====

describe('canSubmitRecipe', () => {
  it('returns false for project task even with image', () => {
    expect(canSubmitRecipe(defaultRecipe('project'), true, false)).toBe(false);
  });

  it('returns false for subject task without image', () => {
    expect(canSubmitRecipe(defaultRecipe('subject'), false, false)).toBe(false);
  });

  it('returns false for subject task while loading', () => {
    expect(canSubmitRecipe(defaultRecipe('subject'), true, true)).toBe(false);
  });

  it('returns true for subject task with image and not loading', () => {
    expect(canSubmitRecipe(defaultRecipe('subject'), true, false)).toBe(true);
  });

  it('returns true for all non-project tasks with image and not loading', () => {
    const editableTasks: V2TaskId[] = ['subject', 'color', 'cleanup', 'local', 'export'];
    for (const task of editableTasks) {
      expect(canSubmitRecipe(defaultRecipe(task), true, false)).toBe(true);
    }
  });

  it('respects V2_TASK_EDITABLE for every task', () => {
    const tasks: V2TaskId[] = ['project', 'subject', 'color', 'cleanup', 'local', 'export'];
    for (const task of tasks) {
      expect(canSubmitRecipe(defaultRecipe(task), true, false)).toBe(V2_TASK_EDITABLE[task]);
    }
  });
});

// ===== compilePrompt v1 =====

describe('compilePrompt v1', () => {
  it('returns version=1', () => {
    const compiled = compilePrompt(defaultRecipe('subject'));
    expect(compiled.version).toBe(1);
  });

  it('recipe is echoed back unchanged', () => {
    const recipe = defaultRecipe('subject');
    const compiled = compilePrompt(recipe);
    expect(compiled.recipe).toBe(recipe);
  });

  it('starts with explicit version marker "# lumen-prompt v1"', () => {
    const compiled = compilePrompt(defaultRecipe('subject'));
    expect(compiled.prompt.startsWith('# lumen-prompt v1\n')).toBe(true);
  });

  it('second line declares task and tool', () => {
    const compiled = compilePrompt(defaultRecipe('subject'));
    const lines = compiled.prompt.split('\n');
    expect(lines[1]).toBe('# task=subject tool=face');
  });

  it('project task declares tool=none', () => {
    const compiled = compilePrompt(defaultRecipe('project'));
    const lines = compiled.prompt.split('\n');
    expect(lines[1]).toBe('# task=project tool=none');
  });

  it('includes identity anchor', () => {
    const compiled = compilePrompt(defaultRecipe('subject'));
    expect(compiled.prompt).toContain('【身份锚定】');
  });

  it('includes style and quality anchors in 限制', () => {
    const compiled = compilePrompt(defaultRecipe('subject'));
    expect(compiled.prompt).toContain('【限制】');
    expect(compiled.prompt).toContain('85mm f/1.4');
    expect(compiled.prompt).toContain('无畸变');
  });

  describe('protection items appear in output', () => {
    it('all five protection labels appear when all enabled (default)', () => {
      const compiled = compilePrompt(defaultRecipe('subject'));
      expect(compiled.prompt).toContain('保留身份');
      expect(compiled.prompt).toContain('保留构图');
      expect(compiled.prompt).toContain('保留皮肤纹理');
      expect(compiled.prompt).toContain('保留服装');
      expect(compiled.prompt).toContain('保留背景');
    });

    it('disabled protections appear as "不要求保留 X"', () => {
      const recipe = defaultRecipe('subject');
      recipe.protections.identity = false;
      recipe.protections.background = false;
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('不要求保留身份');
      expect(compiled.prompt).toContain('不要求保留背景');
      // Still enabled ones remain as 保留
      expect(compiled.prompt).toContain('保留构图');
      expect(compiled.prompt).toContain('保留皮肤纹理');
      expect(compiled.prompt).toContain('保留服装');
    });

    it('all-disabled protections all appear in output', () => {
      const recipe = defaultRecipe('subject');
      recipe.protections.identity = false;
      recipe.protections.composition = false;
      recipe.protections.skinTexture = false;
      recipe.protections.clothing = false;
      recipe.protections.background = false;
      const compiled = compilePrompt(recipe);
      // 五项都必须以 "不要求保留 X" 形式出现在 【保护】 段
      const protectionLine = compiled.prompt
        .split('\n')
        .find((l) => l.startsWith('【保护】'));
      expect(protectionLine).toBeDefined();
      expect(protectionLine).toContain('不要求保留身份');
      expect(protectionLine).toContain('不要求保留构图');
      expect(protectionLine).toContain('不要求保留皮肤纹理');
      expect(protectionLine).toContain('不要求保留服装');
      expect(protectionLine).toContain('不要求保留背景');
      // 反向断言：保护段中 affirmative "保留 X" 短语计数为 0
      // （用 split + filter 避免子串匹配把 "不要求保留身份" 误算）
      const affirmativeMatches = protectionLine!.match(/(?<!不要求)保留身份/g) ?? [];
      expect(affirmativeMatches.length).toBe(0);
    });
  });

  describe('portrait tiers appear in output', () => {
    it('all six portrait params appear in 修改 segment with off tier as "不调整 X"', () => {
      const recipe = defaultRecipe('subject');
      recipe.portrait.skinBrightness = 'off';
      recipe.portrait.smoothing = 'off';
      recipe.portrait.faceSlim = 'off';
      recipe.portrait.eyeEnlarge = 'off';
      recipe.portrait.blemish = 'off';
      recipe.portrait.sculptLight = 'off';
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('不调整肤色提亮');
      expect(compiled.prompt).toContain('不调整磨皮');
      expect(compiled.prompt).toContain('不调整瘦脸');
      expect(compiled.prompt).toContain('不调整大眼');
      expect(compiled.prompt).toContain('不调整去瑕疵');
      expect(compiled.prompt).toContain('不调整立体光影');
    });

    it('strong tier produces phrase for each param', () => {
      const recipe = defaultRecipe('subject');
      recipe.portrait.skinBrightness = 'strong';
      recipe.portrait.smoothing = 'strong';
      recipe.portrait.faceSlim = 'strong';
      recipe.portrait.eyeEnlarge = 'strong';
      recipe.portrait.blemish = 'strong';
      recipe.portrait.sculptLight = 'strong';
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('肤色提亮一档半');
      expect(compiled.prompt).toContain('较强磨皮');
      expect(compiled.prompt).toContain('液化瘦脸一档半');
      expect(compiled.prompt).toContain('显著放大双眼');
      expect(compiled.prompt).toContain('彻底清理瑕疵');
      expect(compiled.prompt).toContain('强烈增强面部立体光影');
    });

    it('default recipe (natural/light mix) produces natural-tier phrases', () => {
      const compiled = compilePrompt(defaultRecipe('subject'));
      expect(compiled.prompt).toContain('肤色提亮半档');
      expect(compiled.prompt).toContain('Portraiture级别中度磨皮');
    });
  });

  describe('supplementary description', () => {
    it('does not emit 补充要求 segment when description is empty', () => {
      const compiled = compilePrompt(defaultRecipe('subject'));
      expect(compiled.prompt).not.toContain('【补充要求】');
    });

    it('emits 补充要求 segment with trimmed description when provided', () => {
      const recipe = defaultRecipe('subject');
      recipe.auxiliary.description = '   保留真实肤色，不要塑料感   ';
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('【补充要求】保留真实肤色，不要塑料感。');
    });

    it('does not emit 补充要求 when description is only whitespace', () => {
      const recipe = defaultRecipe('subject');
      recipe.auxiliary.description = '   \n\t  ';
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).not.toContain('【补充要求】');
    });
  });

  describe('reference images', () => {
    it('does not emit 参考图 segment when referenceImageCount=0', () => {
      const compiled = compilePrompt(defaultRecipe('color'));
      expect(compiled.prompt).not.toContain('【参考图】');
    });

    it('emits 参考图 segment with count when >0', () => {
      const recipe = defaultRecipe('color');
      recipe.auxiliary.referenceImageCount = 2;
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('【参考图】参考 2 张参考图进行创作。');
    });
  });

  describe('regions', () => {
    it('does not emit 区域 segment when regions is empty', () => {
      const compiled = compilePrompt(defaultRecipe('cleanup'));
      expect(compiled.prompt).not.toContain('【区域】');
    });

    it('emits 区域 segment with coordinates when regions provided', () => {
      const recipe = defaultRecipe('cleanup');
      recipe.auxiliary.regions = [
        { x: 10, y: 20, width: 100, height: 80, label: '路人A' },
        { x: 200, y: 50, width: 60, height: 60 },
      ];
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('【区域】仅修改以下区域');
      expect(compiled.prompt).toContain('区域1: [x=10, y=20, w=100, h=80, label=路人A]');
      expect(compiled.prompt).toContain('区域2: [x=200, y=50, w=60, h=60]');
    });
  });

  describe('task-specific modify phrases', () => {
    it('color task appends color hint to 修改 segment', () => {
      const compiled = compilePrompt(defaultRecipe('color'));
      expect(compiled.prompt).toContain('整体色调与光影按补充要求调整');
    });

    it('cleanup task appends cleanup hint to 修改 segment', () => {
      const compiled = compilePrompt(defaultRecipe('cleanup'));
      expect(compiled.prompt).toContain('清理画面杂物/瑕疵/路人/水印');
    });

    it('local task appends liquify hint to 修改 segment', () => {
      const compiled = compilePrompt(defaultRecipe('local'));
      expect(compiled.prompt).toContain('局部液化塑形');
    });

    it('export task appends format/quality phrase to 修改 segment', () => {
      const recipe = defaultRecipe('export');
      recipe.auxiliary.outputFormat = 'png';
      recipe.auxiliary.outputQuality = 95;
      const compiled = compilePrompt(recipe);
      expect(compiled.prompt).toContain('导出优化：格式PNG，质量95%');
    });

    it('subject task does not append extra task hint', () => {
      const compiled = compilePrompt(defaultRecipe('subject'));
      // subject 的 TASK_MODIFY_HINT 为空，不应出现其他任务的专属短语
      expect(compiled.prompt).not.toContain('整体色调与光影按补充要求调整');
      expect(compiled.prompt).not.toContain('清理画面杂物');
      expect(compiled.prompt).not.toContain('局部液化塑形');
      expect(compiled.prompt).not.toContain('导出优化');
    });
  });

  describe('determinism', () => {
    it('same recipe produces identical output across calls', () => {
      const recipe = defaultRecipe('subject');
      const a = compilePrompt(recipe);
      const b = compilePrompt({ ...recipe, portrait: { ...recipe.portrait } });
      expect(a.prompt).toBe(b.prompt);
    });
  });

  describe('end-to-end snapshot for default subject recipe', () => {
    it('matches expected structured output', () => {
      const compiled = compilePrompt(defaultRecipe('subject'));
      const lines = compiled.prompt.split('\n');
      // 至少包含：版本、task、身份、保护、修改、限制六段（默认无补充/参考图/区域）
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(lines[0]).toBe('# lumen-prompt v1');
      expect(lines[1]).toBe('# task=subject tool=face');
      expect(lines.find((l) => l.startsWith('【身份锚定】'))).toBeDefined();
      expect(lines.find((l) => l.startsWith('【保护】'))).toBeDefined();
      expect(lines.find((l) => l.startsWith('【修改】'))).toBeDefined();
      expect(lines.find((l) => l.startsWith('【限制】'))).toBeDefined();
    });
  });
});
