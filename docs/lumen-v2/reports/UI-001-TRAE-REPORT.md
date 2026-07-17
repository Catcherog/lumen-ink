# UI-001 Trae 实施报告

## 任务元数据

- **任务 ID**: UI-001
- **任务名**: V2 工作台外壳
- **执行者**: Trae
- **实施日期**: 2026-07-17
- **状态**: awaiting_gpt_acceptance（第三轮，R2 返工后）
- **仓库**: https://github.com/Catcherog/lumen-ink.git
- **分支**: `lumen/ui-001-trae`
- **前置依赖**: BASE-001 已通过 GPT 验收（`MVP_PASS_WITH_DEBT`，2026-07-17）
- **阻塞关系**: UI-001 通过前禁止 FLOW-001 / STORAGE-001 / VERSION-001 / JOB-001
- **首轮审查报告**: `docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md`（`MVP_FAIL`，2 项 P0）
- **返工范围**: 仅修复 `FIX_PACKET` 列出的 2 项 P0 及直接回归，未提前实现 FLOW-001

## 1. 执行摘要

按 `docs/lumen-v2/tasks/active/UI-001.md` 规格，建立可回滚的 V2 工作台外壳：

- 新增 `VITE_EDITOR_V2` feature flag，Legacy 与 `AppV2` 并存；
- 顶栏展示项目上下文，不展示 Provider / 模型 / API Key；
- 左侧任务栏 72px，始终显示文字标签；
- 中央复用 `ResultViewer` 与 `ImageUploader`，支持 EMPTY / READY；
- 右侧建立 360px 上下文面板容器；
- 底部建立版本区结构占位；
- 1440×900 / 1280×800 截图验证无横向溢出；
- 未修改 Provider、API、Prompt 和生成结果逻辑。

## 2. Feature flag

### 配置

`.env.example` 新增：

```bash
# ===== Feature flags =====
# V2 工作台外壳开关（本地/Preview 可设为 true；Production 未设置时必须为 false）
VITE_EDITOR_V2=false
```

真实 `.env` 不提交。本地开发时可在 `src/client/.env.local` 中写入 `VITE_EDITOR_V2=true` 启用 V2。

### 入口切换

`src/client/src/main.tsx`：

```tsx
const enableV2 = import.meta.env.VITE_EDITOR_V2 === 'true';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {enableV2 ? <AppV2 /> : <App />}
  </StrictMode>,
);
```

### 回滚方式

- 删除或置空 `VITE_EDITOR_V2`，或设为 `false`，重启 client dev server 即回滚到 Legacy；
- 生产环境未设置该变量时，默认进入 Legacy，符合 D-010 决策。

## 3. 新增组件

| 文件 | 职责 |
|------|------|
| `src/client/src/AppV2.tsx` | V2 主布局，整合 header / rail / main / context panel / version strip，复用 `useEditor`、`ResultViewer`、`ApiSettingsModal`、登录态 |
| `src/client/src/components/v2/EditorHeader.tsx` | 顶栏：光砚标识、项目名、当前会话标签、对比/导出/设置入口、主题切换、退出登录 |
| `src/client/src/components/v2/TaskRail.tsx` | 左栏：项目 / 人物 / 色彩 / 清理 / 局部 / 导出，固定文字标签 + 图标 |
| `src/client/src/components/v2/ContextPanel.tsx` | 右侧面板容器：360px 宽，顶部显示 FLOW-001 临时兼容提示，内部复用 `ParamPanel` |
| `src/client/src/components/v2/VersionStripPlaceholder.tsx` | 底部版本区占位：显示“版本记录将在 VERSION-001 启用” |

## 4. 临时债务

按 UI-001 规格第 4 节，本轮不实现 EditRecipe 和单一 CTA：

- V2 右侧面板仍通过 `ParamPanel` 展示原有“应用/提交”按钮；
- `ContextPanel.tsx` 顶部以琥珀色提示条明确标注：
  > 此区域为 FLOW-001 临时兼容区：当前“应用/提交”按钮与参数面板将在配方模型完成后收敛为单一“生成预览”操作。
- 该债务将在 FLOW-001 中处理，不在 UI-001 顺手修复。

## 5. 验证结果

执行全部 baseline 命令，EXIT_CODE = 0：

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npm run test --prefix src/client` | 1 file, 5 passed |
| `npm run test --prefix src/server` | 2 files, 16 passed |
| `npm run build` | client `tsc -b && vite build` 通过；server `tsc` 通过 |

## 6. 证据文件

位于 `docs/lumen-v2/evidence/UI-001/`：

| 文件 | 说明 |
|------|------|
| `legacy-1440x900.png` | Legacy 界面，1440×900，验证 flag 关闭时不变 |
| `v2-empty-1440x900.png` | V2 未上传状态，1440×900，验证 EMPTY 布局 |
| `v2-ready-1440x900.png` | V2 已上传状态，1440×900，验证 READY 布局 |
| `v2-ready-1280x800.png` | V2 已上传状态，1280×800，验证较小分辨率可用 |

截图在本地 dev server 运行、登录成功后捕获；未包含真实客户照片或敏感信息。

## 7. 修改文件清单

### 生产代码

- `src/client/src/main.tsx` — 根据 `VITE_EDITOR_V2` 切换 `App` / `AppV2`
- `src/client/src/AppV2.tsx` — 新增 V2 主布局
- `src/client/src/components/v2/EditorHeader.tsx` — 新增
- `src/client/src/components/v2/TaskRail.tsx` — 新增
- `src/client/src/components/v2/ContextPanel.tsx` — 新增
- `src/client/src/components/v2/VersionStripPlaceholder.tsx` — 新增

### 配置

- `.env.example` — 新增 `VITE_EDITOR_V2=false`

### 文档与状态

- `docs/lumen-v2/reports/UI-001-TRAE-REPORT.md` — 本文件
- `docs/lumen-v2/evidence/UI-001/` — 截图证据
- `docs/lumen-v2/state/STATE.json` — 推进至 `awaiting_gpt_acceptance / nextActor=gpt`
- `docs/lumen-v2/state/SESSION-HANDOFF.md` — 更新本轮摘要
- `docs/lumen-v2/state/PROJECT-MEMORY.md` — 更新当前状态
- `docs/lumen-v2/state/DECISION-LOG.md` — 追加 UI-001 相关决策
- `docs/lumen-v2/state/CHANGELOG.md` — 追加 UI-001 实施条目
- `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` — 固定模板，无需替换占位符

## 8. 已知限制与回滚

- 任务栏使用独立的 V2 展示选择状态（`V2TaskId`），与底层 `RetouchTool` 解耦；UI-001 不通过标签切换底层工具，真实「任务 → 工具 / Recipe」映射在 FLOW-001 实现；
- 右侧面板仍为旧 `ParamPanel`，存在“应用/提交”双 CTA，已标记为 FLOW-001 临时债务；
- 版本区为纯占位，无真实版本数据；
- 回滚：将 `VITE_EDITOR_V2` 设为 `false` 或删除该变量，即可恢复 Legacy 界面。

## 9. 未涉及范围

按 UI-001 规格，本轮未修改：

- Provider 配置与 API 调用逻辑
- Prompt 构建逻辑
- 图像生成/编辑结果逻辑
- `docs/ai/` 目录（按 DF-RULES-01 债务约束，由独立 docs-only 任务处理）

## 10. P0 返工记录（2026-07-17，第二轮）

### 触发

GPT 首轮验收结论 `MVP_FAIL`，`docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md` 列出 2 项关键 P0：

- `UI001-P0-01`：顶栏“对比/导出”按钮在 `AppV2.tsx` 未传入 `onCompare`/`onExport`，渲染为空入口；
- `UI001-P0-02`：`TaskRail` 越界调用 `setTool('color'/'remove'/'repair'/'export')`；“项目/人物”共享 `face` 导致双高亮；与 D-020 占位声明矛盾。

`FIX_PACKET` 约束：仅修 P0 及直接回归，不实现 FLOW-001 的 EditRecipe、五档参数或单一生成 CTA，不修改 Provider/API/Prompt/存储实现。

### UI001-P0-01 修复

**思路**：将顶栏对比/导出入口接入 `ResultViewer` 真实能力，不可用状态用禁用态表达。

- `src/client/src/components/v2/EditorHeader.tsx`：新增 `canCompare` / `canExport` 可选 props（默认 `false`）；按钮根据状态切换 `disabled` / `aria-disabled` / `title`（"需要原图与生成结果才能对比" / "暂无可导出的结果"）；禁用态显示 `text-gray-300 dark:text-gray-600 cursor-not-allowed`。
- `src/client/src/components/ResultViewer.tsx`：新增可选 `viewMode` / `onViewModeChange` 受控 props；通过 `controlledViewMode !== undefined` 判定受控/非受控，与 Legacy `App.tsx` 行为完全兼容。
- `src/client/src/AppV2.tsx`：
  - 提升本地 `viewMode` 状态（`useState<ViewMode>('result')`），同时传给 `EditorHeader` 与 `ResultViewer`；
  - 计算 `canCompare = hasOriginal && !!(state.resultImage || state.resultImageUrl)`；`canExport = !!(state.resultImage || state.resultImageUrl || state.resultText)`；
  - `handleCompare`：满足条件时调用 `setViewMode('compare')`；
  - `handleExport`：`state.resultImage` 走 `downloadImage` 工具（与 `ResultViewer.handleDownload` 同源），`state.resultImageUrl` 走 `window.open`，无结果时直接 return。

**未做**：不调用 DOM 查询、伪事件、空回调或“即将支持”弹窗，符合 `FIX_PACKET` 约束。

### UI001-P0-02 修复

**思路**：引入独立的 V2 展示选择状态 `V2TaskId`，与 `RetouchTool` 完全解耦；保证任一时刻最多一个标签高亮。

- `src/client/src/components/v2/TaskRail.tsx`：
  - 新增 `export type V2TaskId = 'project' | 'subject' | 'color' | 'cleanup' | 'local' | 'export'`；
  - `TASKS` 常量定义六个独立 ID，每个 ID 唯一对应一个标签；
  - Props 从 `activeTool` / `onToolChange` 改为 `activeTask?` / `onSelectTask?`，不再接收 `RetouchTool`；
  - 内部 `useState<V2TaskId>('project')` 管理非受控态；受控/非受控兼容；
  - 高亮判定改为 `active === task.id`（任一时刻最多一个匹配）；
  - 完全移除对 `useEditor` / `setTool` 的调用。
- `src/client/src/AppV2.tsx`：移除从 `useEditor` 解构出的 `setTool`；`<TaskRail />` 不再传入任何 props（使用内部状态）。
- `src/client/src/components/v2/ContextPanel.tsx`：仍接收 `state.selectedTool`，但由 V2 `TaskRail` 的点击不再修改该值，ParamPanel 标题保持初始“修脸”不变。

### 文档同步

- `DECISION-LOG.md` D-020 修订为反映新事实：任务栏不再“映射到同一 `RetouchTool`”，而是引入独立 `V2TaskId` 展示层；真实工具路由仍由 FLOW-001 实现。
- 本报告第 2、3、8 节同步更新以反映 `V2TaskId` 解耦事实。

### 基线命令重跑

返工后全部 `EXIT_CODE = 0`：

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | exit 0 |
| `npm test --prefix src/client` | 5 passed |
| `npx tsc --noEmit -p src/server/tsconfig.json` | exit 0 |
| `npm test --prefix src/server` | 16 passed |
| `npm test` | 21 passed（5 client + 16 server） |
| `npm run build` | client build + server build 通过 |
| `node scripts/check-lumen-collab.mjs` | 通过 |

### 手工验证

通过 CDP（Chrome DevTools Protocol）连接独立 Chrome 实例注入 dev token 后验证：

- **P0-01 EMPTY 状态**：`document.querySelectorAll('header button')` 返回 `对比`（`disabled=true`、`title="需要原图与生成结果才能对比"`）、`导出`（`disabled=true`、`title="暂无可导出的结果"`）、`设置`（`disabled=false`）、主题切换、退出登录。
- **P0-02 单一高亮**：
  - 初始：`navActive = ['项目']`；
  - 点击 `人物` 后：`navActive = ['人物']`；
  - 点击 `导出` 后：`navActive = ['导出']`；
  - 任一时刻 `navActive` 数组长度恒为 1。
- **P0-02 不污染底层工具**：在 TaskRail 点击各标签后，`ParamPanel` 顶部标题保持初始“修脸”，证明 `state.selectedTool` 未被修改。

### 重新提交的证据

`docs/lumen-v2/evidence/UI-001/` 下 4 张原始分辨率截图已重新捕获（覆盖首轮版本）：

| 文件 | 大小 | 验证 |
|------|------|------|
| `legacy-1440x900.png` | 55 KB | Legacy 模式（`VITE_EDITOR_V2=false`） |
| `v2-empty-1440x900.png` | 61 KB | EMPTY 状态，顶栏两按钮 disabled |
| `v2-ready-1440x900.png` | 194 KB | READY 状态，已上传测试图 + “人物”单高亮 |
| `v2-ready-1280x800.png` | 151 KB | READY 状态，1280×800 |

截图使用脱敏测试图（`src/client/public/test-image.png`），不包含真实客户照片或敏感信息。

### 范围约束遵守

- ✅ 仅修复 2 项 P0，未触碰 P1/P2；
- ✅ 未提前实现 FLOW-001 的 EditRecipe / 五档参数 / 单一生成 CTA；
- ✅ 未修改 Provider、API、Prompt、生成结果或存储实现；
- ✅ 未覆盖或提交工作区中与 UI-001 无关的既有修改（按 `FIX_PACKET.constraints[3]`，本次 commit 仅包含 UI-001 P0 返工相关文件）。

## 11. R2 返工记录（2026-07-17，第三轮）

### 触发

GPT 二轮验收结论 `MVP_FAIL`，`docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md` 第二轮 FIX_PACKET 仅保留 1 项 P0：

- `UI001-P0-01-R2`：`canExport` 将 `resultText` 计为可导出（`hasResult = resultImage || resultImageUrl || resultText`，`canExport = hasResult`），但 `handleExport` 只处理 `resultImage` / `resultImageUrl`，无 `resultText` 分支。纯文本结果（由 `useEditor.ts:244` `text: response.data.text` 经 `SET_RESULT` 可达，`resultImage=null` / `resultImageUrl=null`）下顶栏“导出”按钮启用却无行为，仍属首轮 `UI001-P0-01` 的同类空入口回归。

`FIX_PACKET.constraints`：只修 `UI001-P0-01-R2` 及直接回归；不修改 Provider/API/Prompt/存储；不提前实施 FLOW-001；不覆盖或提交工作区中与 UI-001 无关的既有修改；不重新扩展已关闭的 `UI001-P0-02`。

### UI001-P0-01-R2 修复

**思路**：能力判定与 handler 支持的结果类型 1:1 对齐。采用 FIX_PACKET 推荐的最小方案——仅当存在 `resultImage` 或 `resultImageUrl` 时启用“导出”；不实现文本导出（避免越界扩展 UI-001 范围）。

**改动**：

- `src/client/src/AppV2.tsx`（L168-L173）：
  - 删除仅服务于 `canExport` 的 `hasResult` 中间变量（消除 lint unused 风险）；
  - `canExport` 直接定义为 `!!(state.resultImage || state.resultImageUrl)`，与 `handleExport` 实际处理的两个分支完全一致；
  - 在原 `hasResult` 位置补两行注释说明对齐原则，避免后续误把 `resultText` 重新加入判定。
- `src/client/src/components/v2/EditorHeader.tsx`（L21）：同步 `canExport` 的 JSDoc 注释，从“无可导出结果（图片或文本）时为 false”改为“无可导出图片结果（base64 或 URL）时为 false；纯文本结果不计入”，与代码事实一致。

**未做**：未新增文本导出分支、未触碰 `handleExport` 主体逻辑、未修改 `useEditor` 的 `SET_RESULT` reducer、未修改 `ResultViewer` 内部 `hasResult`（那是局部展示判定，与顶栏导出能力判定互不影响）。

### 4 种状态定向验证

依据 `useEditor.ts` 初始状态（L24-L26：`resultImage/resultImageUrl/resultText` 均为 `null`）与 `SET_RESULT` reducer（L58-L70：三个字段独立赋值），4 种合法结果状态可达，能力判定与 handler 行为 1:1 对齐：

| 状态 | resultImage | resultImageUrl | resultText | canExport | handleExport 行为 | 一致性 |
|------|-------------|----------------|------------|-----------|-------------------|--------|
| EMPTY | null | null | null | `false` | `if (!canExport) return` 提前退出 | ✓ 禁用 + 无行为 |
| 纯文本结果（GLM-4.6v 等） | null | null | `"..."` | `false` | `if (!canExport) return` 提前退出 | ✓ 禁用 + 无行为（修复点） |
| base64 图片结果 | `"data:..."` | null | 任意 | `true` | `downloadImage(resultImage, ...)` | ✓ 启用 + 真实下载 |
| 图片 URL 结果 | null | `"https://..."` | 任意 | `true` | `window.open(resultImageUrl, '_blank')` | ✓ 启用 + 真实新标签页 |

按钮渲染层 `EditorHeader.tsx`：`exportDisabled = !canExport`，禁用态 `disabled` / `aria-disabled` / `title="暂无可导出的结果"` / `cursor-not-allowed`，与 `canExport` 同步。纯文本结果下顶栏按钮显示为禁用态，不再出现可点击但无行为的空入口。

### 基线命令重跑（8 条门禁）

全部 `EXIT_CODE = 0`，与 GPT 二轮独立重跑结果一致：

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | exit 0 |
| `npm test --prefix src/client` | 1 file / 5 passed |
| `npx tsc --noEmit -p src/server/tsconfig.json` | exit 0 |
| `npm test --prefix src/server` | 2 files / 16 passed |
| `npm test` | 21 passed（5 client + 16 server） |
| `npm run build` | client `tsc -b && vite build` + server `tsc` 通过 |
| `node scripts/check-lumen-collab.mjs` | `Lumen collaboration state and basic public-repo safety checks passed.` |

### R2 范围约束遵守

- ✅ 仅修 `UI001-P0-01-R2`，未重新扩展已关闭的 `UI001-P0-02`；
- ✅ 未修改 Provider、API、Prompt、生成结果或存储实现；
- ✅ 未提前实现 FLOW-001 的 EditRecipe / 五档参数 / 单一生成 CTA；
- ✅ 未覆盖或提交工作区中与 UI-001 无关的既有修改（按 `FIX_PACKET.constraints[3]`，本次 commit 仅包含 `AppV2.tsx`、`EditorHeader.tsx` 与 UI-001 状态机推进相关文档）。

### R2 修改文件清单

- `src/client/src/AppV2.tsx` — `canExport` 与 handler 对齐，删除冗余 `hasResult`
- `src/client/src/components/v2/EditorHeader.tsx` — `canExport` JSDoc 注释同步
- `docs/lumen-v2/reports/UI-001-TRAE-REPORT.md` — 本节（第 11 节）
- `docs/lumen-v2/state/STATE.json` — 推进至 `awaiting_gpt_acceptance / nextActor=gpt`
- `docs/lumen-v2/state/SESSION-HANDOFF.md` — 更新本轮摘要
- `docs/lumen-v2/state/PROJECT-MEMORY.md` — 更新当前状态
- `docs/lumen-v2/state/DECISION-LOG.md` — 追加 D-024 决策
- `docs/lumen-v2/state/CHANGELOG.md` — 追加 R2 返工条目
- `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` — 固定模板，无需替换占位符
