import type {
  Tier,
  PortraitParams,
  ProtectionItems,
  EditRecipe,
  CompiledPrompt,
  V2TaskId,
  Region,
} from '../../../shared/types';
import {
  V2_TASK_TOOL_MAP,
  V2_TASK_EDITABLE,
  PORTRAIT_PARAM_LABELS,
  PROTECTION_LABELS,
} from '../../../shared/types';

/**
 * 旧值（0-100 数值）→ 五档 Tier 映射（D-005 决策）。
 *
 * - 0       → off
 * - 1-29    → light
 * - 30-59   → natural
 * - 60-84   → obvious
 * - 85-100  → strong
 *
 * 边界值：
 * - 30 进入 natural（含），29 留在 light。
 * - 60 进入 obvious（含），59 留在 natural。
 * - 85 进入 strong（含），84 留在 obvious。
 */
export function legacyValueToTier(value: number): Tier {
  if (value <= 0) return 'off';
  if (value < 30) return 'light';
  if (value < 60) return 'natural';
  if (value < 85) return 'obvious';
  return 'strong';
}

/**
 * 五档 Tier → 旧值（0-100 数值）映射。
 *
 * 用于回写旧 history 显示与 Legacy 兼容。档位中点近似值：
 * - off     → 0
 * - light   → 20
 * - natural → 40
 * - obvious → 70
 * - strong  → 90
 */
export function tierToLegacyValue(tier: Tier): number {
  switch (tier) {
    case 'off':
      return 0;
    case 'light':
      return 20;
    case 'natural':
      return 40;
    case 'obvious':
      return 70;
    case 'strong':
      return 90;
  }
}

/**
 * 默认 Recipe。
 *
 * 默认所有人像参数不超过"自然"档（D-005 决策）。
 * 所有保护项默认开启（FLOW-001 任务规格）。
 * auxiliary 为空（description 空、无参考图、无区域、jpeg/90%）。
 *
 * 任务差异：
 * - `subject` / `local`：人像参数启用（natural/light 混合）。
 * - `color` / `cleanup` / `export` / `project`：人像参数全部 off，
 *   避免编译器输出与任务无关的"肤色提亮"等修改项。
 */
export function defaultRecipe(taskId: V2TaskId = 'subject'): EditRecipe {
  const isPortraitTask = taskId === 'subject' || taskId === 'local';
  const portrait: PortraitParams = isPortraitTask
    ? {
        skinBrightness: 'natural',
        smoothing: 'natural',
        faceSlim: 'light',
        eyeEnlarge: 'light',
        blemish: 'natural',
        sculptLight: 'light',
      }
    : {
        skinBrightness: 'off',
        smoothing: 'off',
        faceSlim: 'off',
        eyeEnlarge: 'off',
        blemish: 'off',
        sculptLight: 'off',
      };

  return {
    schemaVersion: 1,
    taskId,
    tool: V2_TASK_TOOL_MAP[taskId],
    portrait,
    protections: {
      identity: true,
      composition: true,
      skinTexture: true,
      clothing: true,
      background: true,
    },
    auxiliary: {
      description: '',
      referenceImageCount: 0,
      regions: [],
      outputFormat: 'jpeg',
      outputQuality: 90,
    },
  };
}

/**
 * 生成全部六个 V2TaskId 的默认 RecipeBook。
 * 用于 AppV2 持久化每个任务的配方状态，切换任务时互不干扰。
 */
export function defaultRecipeBook(): Record<V2TaskId, EditRecipe> {
  return {
    project: defaultRecipe('project'),
    subject: defaultRecipe('subject'),
    color: defaultRecipe('color'),
    cleanup: defaultRecipe('cleanup'),
    local: defaultRecipe('local'),
    export: defaultRecipe('export'),
  };
}

/**
 * 单一可提交判定（pure function）。
 *
 * - `project` 任务永不发起编辑。
 * - 没有原图时不允许提交。
 * - 加载中不允许重复提交。
 */
export function canSubmitRecipe(
  recipe: EditRecipe,
  hasCurrentImage: boolean,
  isLoading: boolean,
): boolean {
  if (!V2_TASK_EDITABLE[recipe.taskId]) return false;
  if (!hasCurrentImage) return false;
  if (isLoading) return false;
  return true;
}

// ===== Prompt 编译器 v1 =====

const IDENTITY_ANCHOR =
  '参考图中的同一人，严格保留其面部骨骼结构、眼型、鼻型、唇形、下颌线，仅作为身份识别参考，不复制背景服装姿势';
const STYLE_ANCHOR =
  '85mm f/1.4人像镜头，柔光箱45度主光，反光板补光，眼神光保留，柯达Portra 400胶片模拟，自然肤色还原';
const QUALITY_ANCHOR = '五官端正，手指正确，无畸变，无水印，无文字';

/** 每个 portrait 参数在每档下的中文短语（off 档返回空字符串，由编译器统一改为"不调整 X"）。 */
const TIER_PHRASES: Record<keyof PortraitParams, Record<Tier, string>> = {
  skinBrightness: {
    off: '',
    light: '肤色轻微提亮，D&B中性灰微调',
    natural: '肤色提亮半档，曲线中间调上提',
    obvious: '肤色明显提亮一档，色相统一',
    strong: '肤色提亮一档半，明度层级丰富',
  },
  smoothing: {
    off: '',
    light: '低频磨皮，保留高频纹理与毛孔',
    natural: 'Portraiture级别中度磨皮，均匀肤色保留真实纹理',
    obvious: '中度磨皮并均匀肤色，保留皮肤纹理',
    strong: '较强磨皮同时尽量保留毛孔细节',
  },
  faceSlim: {
    off: '',
    light: '液化轻微推下颌线，保持骨骼辨识度',
    natural: '液化适度收紧下颌线，脸型更精致',
    obvious: '液化瘦脸一档，轮廓更精致',
    strong: '液化瘦脸一档半',
  },
  eyeEnlarge: {
    off: '',
    light: '眼神光增强，眼白微提',
    natural: '自然放大双眼，瞳孔细节保留',
    obvious: '明显放大双眼，虹膜清晰',
    strong: '显著放大双眼',
  },
  blemish: {
    off: '',
    light: '去除少量明显瑕疵，污点修复',
    natural: '去除痘印与暗沉，频率分离修复',
    obvious: '去除多数面部瑕疵',
    strong: '彻底清理瑕疵',
  },
  sculptLight: {
    off: '',
    light: '保留并轻微强化面部立体光影，中性灰微调',
    natural: '增强面部立体光影，明暗对比适中',
    obvious: '明显增强面部立体光影',
    strong: '强烈增强面部立体光影',
  },
};

/** 各非 project 任务在【修改】段的固定补充短语。 */
const TASK_MODIFY_HINT: Record<Exclude<V2TaskId, 'project'>, string> = {
  subject: '',
  color: '整体色调与光影按补充要求调整',
  cleanup: '清理画面杂物/瑕疵/路人/水印，保持自然',
  local: '局部液化塑形（按补充要求）',
  export: '', // export 任务的修改短语由 outputFormat/Quality 动态生成
};

/**
 * Prompt 编译器 v1：纯函数，将 EditRecipe 编译为带显式版本的 Prompt 字符串。
 *
 * 输出规则（对应 FLOW-001 任务规格第 2 项"所有保护项与补充要求必须进入编译结果"）：
 *
 * 1. 显式版本标记：首行 `# lumen-prompt v1`，次行 `# task=<taskId> tool=<tool|none>`。
 * 2. 【身份锚定】始终输出。
 * 3. 【保护】所有五项保护必须出现：开启时为"保留 X"，关闭时为"不要求保留 X"。
 * 4. 【修改】所有六个 portrait 参数必须出现：off 时为"不调整 X"，其他档位为对应中文短语。
 *    非 subject 任务的【修改】段额外追加任务专属短语（export 任务用 outputFormat/Quality 生成）。
 * 5. 【补充要求】仅当 auxiliary.description 非空时输出。
 * 6. 【参考图】仅当 referenceImageCount > 0 时输出。
 * 7. 【区域】仅当 regions.length > 0 时输出"仅修改以下区域"子句。
 * 8. 【限制】始终输出风格、质量与禁项锚定。
 */
export function compilePrompt(recipe: EditRecipe): CompiledPrompt {
  const lines: string[] = [];
  lines.push('# lumen-prompt v1');
  lines.push(`# task=${recipe.taskId} tool=${recipe.tool ?? 'none'}`);

  // 身份锚定（始终）
  lines.push(`【身份锚定】${IDENTITY_ANCHOR}。`);

  // 保护项（全部出现）
  const protectionEntries = (Object.keys(PROTECTION_LABELS) as Array<keyof ProtectionItems>).map(
    (key) => {
      const label = PROTECTION_LABELS[key];
      return recipe.protections[key] ? `保留${label}` : `不要求保留${label}`;
    },
  );
  lines.push(`【保护】${protectionEntries.join('；')}。`);

  // 修改项（所有 portrait 参数 + 任务专属短语）
  const modifyParts: string[] = [];
  for (const key of Object.keys(TIER_PHRASES) as Array<keyof PortraitParams>) {
    const tier = recipe.portrait[key];
    const phrase = TIER_PHRASES[key][tier];
    if (tier === 'off' || !phrase) {
      modifyParts.push(`不调整${PORTRAIT_PARAM_LABELS[key]}`);
    } else {
      modifyParts.push(phrase);
    }
  }

  if (recipe.taskId === 'export') {
    modifyParts.push(
      `导出优化：格式${recipe.auxiliary.outputFormat.toUpperCase()}，质量${recipe.auxiliary.outputQuality}%，锐化输出`,
    );
  } else if (recipe.taskId !== 'project') {
    const hint = TASK_MODIFY_HINT[recipe.taskId];
    if (hint) {
      modifyParts.push(hint);
    }
  }
  lines.push(`【修改】${modifyParts.join('，')}。`);

  // 补充要求
  const desc = recipe.auxiliary.description.trim();
  if (desc) {
    lines.push(`【补充要求】${desc}。`);
  }

  // 参考图
  if (recipe.auxiliary.referenceImageCount > 0) {
    lines.push(`【参考图】参考 ${recipe.auxiliary.referenceImageCount} 张参考图进行创作。`);
  }

  // 区域
  if (recipe.auxiliary.regions.length > 0) {
    const regionDesc = recipe.auxiliary.regions
      .map(
        (r: Region, i: number) =>
          `区域${i + 1}: [x=${r.x}, y=${r.y}, w=${r.width}, h=${r.height}${r.label ? `, label=${r.label}` : ''}]`,
      )
      .join('; ');
    lines.push(`【区域】仅修改以下区域，保持其他部分不变：${regionDesc}。`);
  }

  // 限制
  lines.push(
    `【限制】${STYLE_ANCHOR}。不要网红脸，不要塑料皮，不要假白，不要过度磨皮，不要柔焦糊脸，不要改变五官比例。${QUALITY_ANCHOR}。`,
  );

  return {
    version: 1,
    prompt: lines.join('\n'),
    recipe,
  };
}
