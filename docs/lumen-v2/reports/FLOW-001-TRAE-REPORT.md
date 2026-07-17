# FLOW-001 Trae 实施报告

## 任务元数据

- **任务 ID**: FLOW-001
- **任务名**: 配方模型与单一生成操作
- **执行者**: Trae
- **实施日期**: 2026-07-17
- **状态**: awaiting_gpt_acceptance（首轮，端到端扩大执行包）
- **仓库**: https://github.com/Catcherog/lumen-ink.git
- **分支**: `lumen/flow-001-trae`
- **前置依赖**: UI-001 已通过 GPT 第三轮验收（`MVP_PASS`，2026-07-17）
- **验收策略**: 变更风险驱动 — 只审 FLOW-001 diff、关键行为与统一 8 条门禁；未变更的 UI-001 视觉证据不重跑
- **执行包**: 同一任务 ID 下的端到端闭环，不拆成 UI/类型/编译器小批次

## 1. 执行摘要

按 `docs/lumen-v2/tasks/active/FLOW-001.md` 规格与 UI-001 第三轮验收交接指令，在同一任务 ID、同一分支、同一 PR 内完成端到端闭环：

- 定义共享 `EditRecipe`（schemaVersion=1）：五档语义化参数、5 项保护项、补充要求、参考图、区域、导出格式；
- 实现纯函数 Prompt 编译器 v1（version=1）：输出首行 `# lumen-prompt v1` 显式版本标记，所有保护项与补充要求进入编译结果；
- 落地 V2 任务到 Recipe/工具的真实映射：`V2_TASK_TOOL_MAP` 提供 1:1 映射，`project` 任务 `tool=null` 不发起编辑；
- 收敛 V2 右栏：删除旧 `ParamPanel` / `PromptInput` / "应用" / "提交" 入口，只保留一个真实"生成预览"主 CTA；
- 完整 Prompt 默认折叠只读（`CompiledPromptPreview`）；
- 现有同步 `/api/edit` 通过 `submitEdit` 消费编译后的请求，保持 Provider 输出兼容；
- 自动化测试：76 client tests + 16 server tests = 92 tests passed，覆盖 Recipe 默认值、旧值映射、round-trip 稳定性、编译器 v1 输出、单 CTA、无隐藏提交入口、project 任务禁用、loading 状态、任务切换等关键行为。

未实施 STORAGE/JOB/VERSION：未引入数据库、异步 Job、不可变版本持久化或伪进度。

## 2. EditRecipe 与五档参数

### 2.1 类型定义（`src/shared/types.ts`）

```typescript
export type Tier = 'off' | 'light' | 'natural' | 'obvious' | 'strong';
export const TIER_ORDER: readonly Tier[] = ['off', 'light', 'natural', 'obvious', 'strong'] as const;

export interface PortraitParams {
  skinBrightness: Tier;
  smoothing: Tier;
  faceSlim: Tier;
  eyeEnlarge: Tier;
  blemish: Tier;
  sculptLight: Tier;
}

export interface ProtectionItems {
  identity: boolean;
  composition: boolean;
  skinTexture: boolean;
  clothing: boolean;
  background: boolean;
}

export interface EditRecipe {
  schemaVersion: 1;
  taskId: V2TaskId;
  tool: RetouchTool | null;
  portrait: PortraitParams;
  protections: ProtectionItems;
  auxiliary: {
    description: string;
    referenceImageCount: number;
    regions: Region[];
    outputFormat: 'jpeg' | 'png' | 'webp';
    outputQuality: number;
  };
}
```

### 2.2 V2TaskId 与 RetouchTool 解耦映射（D-020 / D-026 落地）

```typescript
export const V2_TASK_TOOL_MAP: Record<V2TaskId, RetouchTool | null> = {
  project: null,        // 项目元信息，不发起编辑
  subject: 'face',
  color: 'color',
  cleanup: 'repair',
  local: 'liquify',
  export: 'export',
};

export const V2_TASK_EDITABLE: Record<V2TaskId, boolean> = {
  project: false,
  subject: true,
  color: true,
  cleanup: true,
  local: true,
  export: true,
};
```

### 2.3 旧值映射（`src/client/src/utils/recipe.ts`）

```typescript
// 0 → off；1-29 → light；30-59 → natural；60-84 → obvious；85-100 → strong
export function legacyValueToTier(value: number): Tier;

// off → 0；light → 20；natural → 40；obvious → 70；strong → 90
export function tierToLegacyValue(tier: Tier): number;
```

`legacyValueToTier ∘ tierToLegacyValue` round-trip 稳定性已由测试覆盖（5 档全部回归同一档位）。

### 2.4 默认 Recipe

- 所有保护项默认开启（FLOW-001 任务规格要求）。
- 人像参数默认不超过"自然"档（D-005 决策）。
- `subject` / `local` 任务启用 natural/light 混合人像参数；`color` / `cleanup` / `export` / `project` 任务人像参数全 off，避免编译器输出与任务无关的"肤色提亮"等修改项。
- `auxiliary` 默认空：description 空、无参考图、无区域、jpeg/90%。

## 3. Prompt 编译器 v1

### 3.1 接口

```typescript
export interface CompiledPrompt {
  version: 1;
  prompt: string;
  recipe: EditRecipe;
}

export function compilePrompt(recipe: EditRecipe): CompiledPrompt;
```

### 3.2 输出结构

首行 `# lumen-prompt v1`，次行 `# task=<taskId> tool=<tool|none>`，随后依次：

1. **【身份锚定】**：始终输出，含面部骨骼、五官比例、辨识度保留要求。
2. **【保护】**：五项保护全部出现，开启时为"保留 X"，关闭时为"不要求保留 X"。
3. **【修改】**：六个 portrait 参数全部出现，off 时为"不调整 X"，其他档位为对应中文短语（如"肤色提亮半档"、"Portraiture级别中度磨皮"、"液化瘦脸一档半"等）。非 subject 任务追加任务专属短语（export 任务用 outputFormat/Quality 生成）。
4. **【补充要求】**：仅当 description 非空（trim 后）时输出，结尾加句号。
5. **【参考图】**：仅当 referenceImageCount > 0 时输出。
6. **【区域】**：仅当 regions.length > 0 时输出"仅修改以下区域"子句，含坐标与可选 label。
7. **【限制】**：始终输出风格锚定（85mm f/1.4、柔光箱、Portra 400）、质量锚定（无畸变、无水印、无文字）、禁项（不网红脸、不塑料皮、不假白、不过度磨皮、不柔焦糊脸、不改五官比例）。

### 3.3 纯函数特性

- 无副作用、无 IO、无随机性；同一 Recipe 输入恒定输出。
- `compilePrompt(recipe).recipe === recipe`（引用回传，便于消费方追溯）。
- 所有标签与短语在 `TIER_PHRASES` / `TASK_MODIFY_HINT` 常量表维护，便于版本化演进。

## 4. V2 右栏收敛（单 CTA）

### 4.1 删除项

`ContextPanel.tsx` 重写后删除：

- 旧 `ParamPanel`（"应用"按钮 + 工具参数滑块）；
- 旧 `PromptInput`（"提交"按钮 + 自由文本独立提交）；
- UI-001 临时债务提示条（琥珀色"FLOW-001 临时兼容区"提示）；
- `dispatch` prop（lint unused，移除）。

### 4.2 新增项

- `RecipePanel`：根据 `recipe.taskId` 分派到对应任务面板（`PortraitPanel` / `ColorPanel` / `CleanupPanel` / `LocalPanel` / `ExportPanel` / `ProjectPanel`）。
- `CompiledPromptPreview`：折叠只读 textarea，默认折叠，点击展开后显示编译后 Prompt body；标题栏显示 `v1` 版本号。
- 单一"生成预览"主 CTA：`data-cta="generate-preview"`，`aria-label` 动态切换（loading 时为"生成中"，否则"生成预览"）；禁用态显示对应提示（"当前任务不发起编辑"或"请先上传图片"）。

### 4.3 提交边界（`canSubmit`）

```typescript
const canSubmit = editable && hasCurrentImage && !state.isLoading;
```

- `editable = V2_TASK_EDITABLE[recipe.taskId]`：project 任务为 false。
- `hasCurrentImage = !!(state.currentImage || state.currentImageUrl)`。
- `state.isLoading`：防止重复提交。

无任何隐藏的独立模型调用入口（已由测试覆盖：`queryAllByRole('button', { name: /应用/ })` 与 `queryAllByRole('button', { name: /^提交$/ })` 均返回空数组）。

## 5. `/api/edit` 接线

### 5.1 闭环（`AppV2.tsx`）

```typescript
const [activeTask, setActiveTask] = useState<V2TaskId>('project');
const [recipeBook, setRecipeBook] = useState<Record<V2TaskId, EditRecipe>>(() => defaultRecipeBook());
const currentRecipe = recipeBook[activeTask];
const compiled = useMemo(() => compilePrompt(currentRecipe), [currentRecipe]);

const handleGeneratePreview = useCallback(() => {
  const result = compilePrompt(currentRecipe);
  submitEdit(result.prompt, {
    tool: currentRecipe.tool ?? undefined,
    params: { recipe: currentRecipe, compiledVersion: result.version },
    regions: currentRecipe.auxiliary.regions.length > 0 ? currentRecipe.auxiliary.regions : undefined,
  });
}, [currentRecipe, submitEdit]);
```

- CTA 触发 `handleGeneratePreview` → `compilePrompt` → `submitEdit`，不绕过 Recipe 直接调 `/api/edit`。
- `submitEdit` 签名与现有 `useEditor` 调用链未修改，保持 Provider 输出兼容。
- `recipeBook` 模式：每个 V2TaskId 独立 Recipe，切换任务互不干扰。

### 5.2 受控 TaskRail

`TaskRail.tsx` 改为受控组件：

```typescript
interface TaskRailProps {
  activeTask?: V2TaskId;
  onSelectTask?: (task: V2TaskId) => void;
}
```

受控/非受控兼容：未传 `activeTask` 时退化为内部 `useState`（向后兼容 UI-001 验收口径）。

## 6. 自动化测试

### 6.1 测试矩阵

| 文件 | 覆盖范围 | 用例数 |
|------|---------|--------|
| `src/client/src/utils/recipe.test.ts` | `legacyValueToTier`、`tierToLegacyValue`、round-trip 稳定性、`defaultRecipe`（schemaVersion/protections/portrait/auxiliary/tool 映射）、`defaultRecipeBook`（六任务全覆盖）、`canSubmitRecipe`（project 禁用 / 无图禁用 / loading 禁用 / 可编辑任务启用）、`compilePrompt v1`（版本标记、身份锚定、保护项全分支、portrait 全档位短语、补充要求 trim、参考图、区域、任务专属短语） | 59 |
| `src/client/src/components/v2/ContextPanel.test.tsx` | 单 CTA 与无隐藏提交入口（3）、project 任务禁用（3）、subject + 图片启用（3）、subject + 无图片禁用（2）、loading 状态（2）、编译 Prompt 折叠/展开与版本号（2）、任务切换（2） | 17 |
| 既有 client 测试 | UI-001 / useEditor / 现有工具函数 | 0 回归 |
| 既有 server 测试 | Provider / API 路由 | 0 回归 |

合计：**76 client tests + 16 server tests = 92 tests passed**（UI-001 时为 21 tests，本轮新增 71 tests，无既有测试回归）。

### 6.2 关键行为测试样例

```typescript
// 单 CTA 唯一性
it('渲染且仅渲染一个"生成预览"主 CTA', () => {
  renderPanel({ recipe: defaultRecipe('subject'), state: { currentImage: 'fake-base64-data' } });
  const ctas = screen.getAllByRole('button', { name: '生成预览' });
  expect(ctas).toHaveLength(1);
});

// 无隐藏提交入口
it('不渲染旧"应用"或"提交"按钮', () => {
  renderPanel({ recipe: defaultRecipe('subject'), state: { currentImage: 'fake-base64-data' } });
  expect(screen.queryAllByRole('button', { name: /应用/ })).toHaveLength(0);
  expect(screen.queryAllByRole('button', { name: /^提交$/ })).toHaveLength(0);
});

// 保护项全分支（关闭时为"不要求保留 X"）
it('all-disabled protections all appear in output', () => {
  const recipe = defaultRecipe('subject');
  recipe.protections = { identity: false, composition: false, skinTexture: false, clothing: false, background: false };
  const compiled = compilePrompt(recipe);
  const protectionLine = compiled.prompt.split('\n').find((l) => l.startsWith('【保护】'));
  expect(protectionLine).toContain('不要求保留身份');
  // ... 五项都必须以 "不要求保留 X" 形式出现
  const affirmativeMatches = protectionLine!.match(/(?<!不要求)保留身份/g) ?? [];
  expect(affirmativeMatches.length).toBe(0);
});

// round-trip 稳定性
it('tierToLegacyValue(tier) maps back to the same tier via legacyValueToTier', () => {
  for (const tier of TIER_ORDER) {
    const legacy = tierToLegacyValue(tier);
    expect(legacyValueToTier(legacy)).toBe(tier);
  }
});
```

## 7. 验证结果（8 条门禁）

全部 `EXIT_CODE = 0`：

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | exit 0 |
| `npm test --prefix src/client` | 3 files / 76 passed |
| `npx tsc --noEmit -p src/server/tsconfig.json` | exit 0 |
| `npm test --prefix src/server` | 2 files / 16 passed |
| `npm test` | 5 files / 92 passed（76 client + 16 server） |
| `npm run build` | client `tsc -b && vite build` + server `tsc` 通过 |
| `node scripts/check-lumen-collab.mjs` | `Lumen collaboration state and basic public-repo safety checks passed.` |

## 8. 证据文件

位于 `docs/lumen-v2/evidence/FLOW-001/`：

| 文件 | 说明 |
|------|------|
| `gate-lint.txt` | client lint 输出（0 errors / 0 warnings） |
| `gate-typecheck-client.txt` | client typecheck 输出（exit 0） |
| `gate-test-client.txt` | client test 输出（3 files / 76 passed） |
| `gate-typecheck-server.txt` | server typecheck 输出（exit 0） |
| `gate-test-server.txt` | server test 输出（2 files / 16 passed） |
| `gate-test-root.txt` | root test 输出（5 files / 92 passed） |
| `gate-build.txt` | build 输出（client + server 通过） |
| `gate-security-scan.txt` | `check-lumen-collab.mjs` 输出 |

证据文件均为本地 clean 工作区执行、UTF-8 无 BOM；不含真实客户照片、API Key 或未脱敏 Prompt。

按变更风险驱动验收约定，本轮未重复捕获 UI-001 视觉证据（已冻结）。

## 9. 修改文件清单

### 9.1 生产代码（FLOW-001 直接相关）

**新增**：

- `src/client/src/utils/recipe.ts` — 纯函数模块（legacyValueToTier / tierToLegacyValue / defaultRecipe / defaultRecipeBook / canSubmitRecipe / compilePrompt v1）
- `src/client/src/utils/recipe.test.ts` — 编译器与映射单元测试（59 用例）
- `src/client/src/components/v2/recipe/TierSelect.tsx` — 五档单选 chip 组件
- `src/client/src/components/v2/recipe/ProtectionsPanel.tsx` — 5 个保护项开关
- `src/client/src/components/v2/recipe/PortraitPanel.tsx` — 人物任务面板（6 个五档参数 + 补充要求 + 保护项）
- `src/client/src/components/v2/recipe/LocalPanel.tsx` — 局部任务面板（复用人像五档参数，文案侧重液化塑形）
- `src/client/src/components/v2/recipe/ColorPanel.tsx` — 色彩任务面板（不编辑人像参数，主要输入为补充要求）
- `src/client/src/components/v2/recipe/CleanupPanel.tsx` — 清理任务面板（主要输入为清理目标描述）
- `src/client/src/components/v2/recipe/ExportPanel.tsx` — 导出任务面板（jpeg/png/webp 格式 + 50-100% 质量）
- `src/client/src/components/v2/recipe/ProjectPanel.tsx` — 项目任务面板（不发起编辑，仅展示元信息提示）
- `src/client/src/components/v2/recipe/RecipePanel.tsx` — Recipe 面板调度器（根据 taskId 分派）
- `src/client/src/components/v2/recipe/CompiledPromptPreview.tsx` — 折叠只读编译 Prompt 预览（含 `data-testid="compiled-prompt-body"`）
- `src/client/src/components/v2/ContextPanel.test.tsx` — ContextPanel 组件渲染测试（17 用例）
- `src/client/src/test-setup.ts` — Vitest 测试 setup（`@testing-library/jest-dom/vitest`）

**修改**：

- `src/shared/types.ts` — 新增 FLOW-001 类型定义（Tier / TIER_ORDER / TIER_LABELS / V2TaskId / V2_TASK_TOOL_MAP / V2_TASK_EDITABLE / V2_TASK_META / ProtectionItems / PortraitParams / PORTRAIT_PARAM_LABELS / PROTECTION_LABELS / EditRecipe / CompiledPrompt）
- `src/client/src/AppV2.tsx` — 提升 `activeTask` + `recipeBook` 状态；`compiled = useMemo(() => compilePrompt(currentRecipe), [currentRecipe])`；`handleGeneratePreview` 闭环；移除旧 `setTool` / `viewMode` 之外的 UI-001 临时债务提示
- `src/client/src/components/v2/ContextPanel.tsx` — 完全重写：删除旧 ParamPanel / PromptInput / dispatch prop；新增 RecipePanel + CompiledPromptPreview + 单一 CTA；`canSubmit = editable && hasCurrentImage && !state.isLoading`
- `src/client/src/components/v2/TaskRail.tsx` — 改为受控组件（接收 `activeTask` + `onSelectTask`）
- `src/client/vite.config.ts` — 新增 Vitest 配置（jsdom + globals + setupFiles）
- `src/client/package.json` — 新增 devDependencies：`@testing-library/react@^16`、`@testing-library/jest-dom@^6`、`@testing-library/user-event@^14`、`jsdom@^25`
- `src/client/package-lock.json` — 同步依赖锁定

### 9.2 任务与状态文件

- `docs/lumen-v2/tasks/active/FLOW-001.md` — 从 `tasks/backlog/` 激活（UI-001 验收时已由 GPT 落地，本轮 Trae 一并 commit）
- `docs/lumen-v2/tasks/completed/UI-001.md` — 从 `tasks/active/` 归档（UI-001 验收时已由 GPT 落地，本轮 Trae 一并 commit）
- `docs/lumen-v2/reports/FLOW-001-TRAE-REPORT.md` — 本文件
- `docs/lumen-v2/evidence/FLOW-001/` — 8 条门禁脱敏证据
- `docs/lumen-v2/state/STATE.json` — 推进至 `awaiting_gpt_acceptance / nextActor=gpt`
- `docs/lumen-v2/state/PROJECT-MEMORY.md` — 更新当前状态（FLOW-001 完成、awaiting_gpt_acceptance）
- `docs/lumen-v2/state/DECISION-LOG.md` — 追加 D-026 决策
- `docs/lumen-v2/state/CHANGELOG.md` — 追加 FLOW-001 实施条目
- `docs/lumen-v2/state/SESSION-HANDOFF.md` — 更新本轮摘要
- `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` — 固定模板，无需替换占位符

### 9.3 GPT 验收文档（按契约由 Trae 一并 commit）

- `docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md` — UI-001 第三轮验收结论 `MVP_PASS`（GPT 已写入本地，本轮 Trae commit/push）

## 10. 范围约束遵守

- ✅ 一次性完成 EditRecipe、五档参数、Prompt 编译器 v1、单一 CTA、`/api/edit` 接线、自动化测试、证据及状态回传，未拆成 UI/类型/编译器小批次；
- ✅ 未实施数据库、持久化、异步 Job、不可变版本或伪进度；
- ✅ 保持 Provider 输出兼容：`submitEdit` 签名与 `useEditor` 调用链未修改，`/api/edit` 路由与 Provider 适配层未修改；
- ✅ 完整 Prompt 默认折叠只读（`CompiledPromptPreview` 默认折叠，`data-testid="compiled-prompt-body"` 在点击展开后才挂载）；
- ✅ 旧值 0-100 与五档双向映射（`legacyValueToTier` / `tierToLegacyValue`），round-trip 稳定性已由测试覆盖；
- ✅ 5 项保护项默认开启，且全部进入编译 Prompt（开启为"保留 X"，关闭为"不要求保留 X"）；
- ✅ 未覆盖或提交工作区中与 FLOW-001 无关的既有修改（仅 add FLOW-001 直接相关文件 + GPT 验收文档 + 任务/状态文件）。

## 11. 已知限制与未涉及范围

### 11.1 未涉及范围（按 FLOW-001 规格约束）

- 数据库、IndexedDB 持久化、Vercel Blob Storage（STORAGE-001 范围）；
- 异步 Job、jobId、真实阶段、取消/重试/断线恢复（JOB-001 范围）；
- 不可变版本链、版本对比、版本采用（VERSION-001 范围）；
- 智能模型路由、fallbackChain（ROUTING-001 范围）；
- Provider 配置迁离 `/tmp`、CORS allowlist、登录限流（HARDEN-001 范围）。

### 11.2 已知限制

- `recipeBook` 仅存于 React state，刷新页面会丢失（STORAGE-001 / VERSION-001 范围）；
- `/api/edit` 仍为同步长请求，受 Vercel 90s maxDuration 约束（JOB-001 范围）；
- 编译器 v1 输出为中文自然语言 Prompt，依赖 Provider 模型对中文的理解能力；未引入结构化 JSON 输出（v2 演进方向）；
- `regions` UI 仅存储数据，未实现可视化框选交互（后续任务范围）；
- `referenceImageCount` 仅记录数量，参考图实际数据存于 `useEditor.state.referenceImages`（已通过现有 `submitEdit` 路径传递）。

## 12. 回滚方式

- 代码层：将 `VITE_EDITOR_V2` 设为 `false` 或删除该变量，重启 client dev server 即回滚到 Legacy；
- Git 层：`git revert` 本次 commit 即可恢复到 UI-001 验收通过后的状态（commit `050c321`）；
- 状态层：将 `STATE.json` 回退到 `status=ready_for_trae / nextActor=trae`，`latestTraeReport` 回退到 `UI-001-TRAE-REPORT.md`。

## 13. 风险与建议

### 13.1 风险

- **R-01（中）**：编译器 v1 输出为自然语言，Provider 模型对中文短语的理解差异可能导致同一 Recipe 在不同 Provider 上产生不一致结果。后续可在 v2 引入结构化 JSON 输出或 Provider-specific 适配层。
- **R-02（低）**：`recipeBook` 仅存于内存，刷新丢失。在 STORAGE-001 / VERSION-001 落地前，用户需接受刷新重置为默认 Recipe。
- **R-03（低）**：`ContextPanel.test.tsx` 使用 `fake-base64-data` 字符串模拟图片存在，未覆盖真实 base64 解码路径；该路径由 `useEditor` 与 `ResultViewer` 既有逻辑保证，不属于 FLOW-001 范围。

### 13.2 建议

- GPT 下一轮按变更风险驱动验收：只审 FLOW-001 diff、关键行为测试（单 CTA、无隐藏提交入口、保护项全分支、round-trip 稳定性）与统一 8 条门禁；未变更的 UI-001 视觉证据不重跑。
- 若 GPT 验收通过，建议激活 STORAGE-001 进入技术选型阶段。
- 若 GPT 驳回，按 FIX_PACKET 仅修指定 P0/P1 及直接回归，不主动处理 P2。
