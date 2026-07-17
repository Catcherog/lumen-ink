# 10｜变更日志

## 2026-07-17 - UI-001 R2 返工完成（awaiting_gpt_acceptance，第三轮）

- 触发：GPT 二轮验收结论 `MVP_FAIL`，第二轮 `FIX_PACKET` 仅保留 1 项 P0 `UI001-P0-01-R2`：`canExport = !!(resultImage || resultImageUrl || resultText)` 将纯文本结果计为可导出，但 `handleExport` 无 `resultText` 分支，纯文本结果下顶栏“导出”按钮启用却无行为，仍属首轮 `UI001-P0-01` 同类空入口回归；
- UI001-P0-01-R2 修复（最小方案）：`AppV2.tsx` 删除仅服务于 `canExport` 的 `hasResult` 中间变量，`canExport` 直接定义为 `!!(state.resultImage || state.resultImageUrl)`，与 `handleExport` 实际处理的两个分支 1:1 对齐；`EditorHeader.tsx` 同步 `canExport` JSDoc 注释；
- 可达性确认：`useEditor.ts` `SET_RESULT` reducer 中 `resultImage` / `resultImageUrl` / `resultText` 三个字段独立赋值，纯文本结果（`response.data.text` 存在、`imageData` / `imageUrl` 为 undefined）时 `resultImage=null` / `resultImageUrl=null` 状态可达；
- 4 种状态定向验证（EMPTY / 纯文本 / base64 图片 / 图片 URL）：`canExport` 与 `handleExport` 行为完全一致，禁用态下 `if (!canExport) return` 提前退出，启用态下分别走 `downloadImage` / `window.open` 真实路径；
- 8 条门禁独立重跑均 `EXIT_CODE=0`：client lint 0/0、client typecheck、client test 5 passed、server typecheck、server test 16 passed、root test 21 passed、build 通过、`check-lumen-collab.mjs` 通过；
- 状态由 `changes_requested / nextActor=trae` 推进至 `awaiting_gpt_acceptance / nextActor=gpt`；
- 范围约束遵守：仅修 `UI001-P0-01-R2`，未重新扩展已关闭的 `UI001-P0-02`；未提前实现 FLOW-001；未修改 Provider/API/Prompt/存储；未覆盖或提交工作区中与 UI-001 无关的既有修改；
- 决策日志追加 D-024。

## 2026-07-17 - UI-001 GPT 二轮验收驳回（MVP_FAIL）

- GPT 审查 commit `1f43d1f90844a1f572005f26e3faee05626ebed4`；
- `UI001-P0-02` 已关闭：`V2TaskId` 与 `RetouchTool` 解耦，单一高亮成立且不再调用 `setTool`；
- EMPTY 禁用态与图片结果的对比/导出静态路径成立，4 张目标截图复核通过；
- 独立重跑 8 条门禁均 `EXIT_CODE=0`：client lint/typecheck/5 tests、server typecheck/16 tests、root 21 tests/build、公开仓库扫描；
- P0 `UI001-P0-01-R2`：纯文本结果会令“导出”按钮启用，但 `handleExport` 没有文本分支，合法状态下仍为空入口；
- 状态改为 `changes_requested / nextActor=trae`，仅修这一项直接回归；FLOW-001 继续阻塞。

## 2026-07-17 - UI-001 P0 返工完成（awaiting_gpt_acceptance，第二轮）

- 触发：GPT 首轮验收结论 `MVP_FAIL`，`FIX_PACKET` 列出 2 项 P0：
  - `UI001-P0-01`：顶栏“对比/导出”按钮在 `AppV2.tsx` 未传入 `onCompare`/`onExport`；
  - `UI001-P0-02`：`TaskRail` 越界调用 `setTool('color'/'remove'/'repair'/'export')`；“项目/人物”共享 `face` 导致双高亮；
- UI001-P0-01 修复：`ResultViewer.tsx` 新增受控 `viewMode` props（兼容 Legacy）；`EditorHeader.tsx` 新增 `canCompare`/`canExport` 禁用态；`AppV2.tsx` 提升 `viewMode` 状态并连接 `handleCompare`/`handleExport` 真实能力（`setViewMode('compare')` / `downloadImage` / `window.open`）；
- UI001-P0-02 修复：`TaskRail.tsx` 引入 `export type V2TaskId = 'project' | 'subject' | 'color' | 'cleanup' | 'local' | 'export'`，与 `RetouchTool` 完全解耦；Props 改为 `activeTask?` / `onSelectTask?`；移除对 `useEditor` / `setTool` 的调用；单一高亮保证（`active === task.id`）；`AppV2.tsx` 移除 `setTool` 解构；
- 文档同步：D-020 修订为反映 `V2TaskId` 解耦事实；新增 D-022 记录 P0 返工方案；
- 基线命令重跑：lint 0/0、client typecheck、client test 5 passed、server typecheck、server test 16 passed、root test 21 passed、build 通过、`check-lumen-collab.mjs` 通过；
- 手工验证（CDP + 独立 Chrome 实例）：EMPTY 状态顶栏两按钮 `disabled=true`；点击 `人物`/`导出` 后 `navActive` 数组长度恒为 1；点击 TaskRail 不影响 `state.selectedTool`；
- 重新捕获 4 张原始分辨率截图，覆盖首轮版本：`legacy-1440x900.png`（55 KB）、`v2-empty-1440x900.png`（61 KB）、`v2-ready-1440x900.png`（194 KB）、`v2-ready-1280x800.png`（151 KB）；
- 状态由 `changes_requested / nextActor=trae` 推进至 `awaiting_gpt_acceptance / nextActor=gpt`；
- 范围约束遵守：仅修 2 项 P0 及直接回归，未提前实现 FLOW-001 范围内的 EditRecipe / 五档参数 / 单一生成 CTA；未修改 Provider/API/Prompt/存储实现；未覆盖工作区中与 UI-001 无关的既有修改。

## 2026-07-17 - UI-001 GPT 首轮验收驳回（MVP_FAIL）

- GPT 审查 commit `9dd28359d5c6386f4833fbcd01870eb617fcdadb`；
- 4 张视觉证据已复核，7 条基线命令及公开仓库安全扫描均通过；
- P0 `UI001-P0-01`：顶栏“对比/导出”未连接真实处理器；
- P0 `UI001-P0-02`：任务栏越界改变底层工具，且“项目/人物”双高亮，与 D-020/报告不一致；
- PR/CI 缺口降为非阻塞流程提醒，本轮关键验收以本地 commit、7 条命令与安全扫描为准；
- 新增 `reviews/UI-001-GPT-REVIEW.md` 与 FIX_PACKET；
- 状态改为 `changes_requested / nextActor=trae`，FLOW-001 继续阻塞。

## 2026-07-17 - UI-001 实施完成（awaiting_gpt_acceptance）

- Trae 在 `lumen/ui-001-trae` 分支完成 V2 工作台外壳实施；
- 新增 `VITE_EDITOR_V2` feature flag，Legacy 与 `AppV2` 并存；
- 新增 V2 组件：`AppV2.tsx`、`EditorHeader.tsx`、`TaskRail.tsx`、`ContextPanel.tsx`、`VersionStripPlaceholder.tsx`；
- 顶栏展示项目上下文，不展示 Provider/模型/API Key；
- 左栏任务栏固定文字标签；右侧 360px 上下文面板容器；底部版本区占位；
- 复用 `ResultViewer`、`ImageUploader`、`useEditor`、`ApiSettingsModal`、登录态；
- 未修改 Provider、API、Prompt 和生成结果逻辑；
- `ContextPanel.tsx` 顶部提示条标记 FLOW-001 临时兼容区；
- 验证全部通过：client lint 0/0、client test 5 passed、server test 16 passed、root build 通过；
- 截图证据：`legacy-1440x900.png`、`v2-empty-1440x900.png`、`v2-ready-1440x900.png`、`v2-ready-1280x800.png`；
- 状态推进至 `awaiting_gpt_acceptance / nextActor=gpt`；
- 决策日志追加 D-019、D-020。

## 2026-07-17 - BASE-001 验收通过（MVP_PASS_WITH_DEBT）

- GPT 远端只读复核结论 `MVP_PASS_WITH_DEBT`，BASE-001 工程基线修复正式通过验收；
- 4 项原 P0/P1 缺陷（EVIDENCE-BLOCK-01 / REPORT-BIND-01 / VERIFY-BLOCK-01 / ROLLBACK-01）全部修复；
- DF-RULES-01（Disputed）降为流程债务，不阻塞当前任务；
- 5 项 P2 / Process 债务登记到 `docs/ai/TECH_DEBT.md`：
  - DEBT-REPORT-01 / DEBT-REPORT-02：Trae 报告前部测试数与返工 commit SHA（Trae 已在落库时修复）
  - DEBT-STATE-01：GPT 报告描述与 STATE.json 现状差异（已在 SESSION-HANDOFF 记录）
  - DEBT-EVIDENCE-01：evidence 在非 clean 工作区执行、UTF-16/BOM（后续任务遵守 clean checkout + UTF-8）
  - DF-RULES-01：`docs/ai/` 三个权威文件未提交到远端分支（另建 docs-only 整理任务）
- Trae 落库动作：
  - 新 GPT review 覆盖旧 `MVP_FAIL` 版本
  - Trae 报告 DEBT-REPORT-01/02 已修复（第 1/3.3/5 节测试数统一为 21/16，返工 docs commit 补 SHA `b015531...`）
  - BASE-001.md 追加 9.5 Review History，任务从 `tasks/active/` 移至 `tasks/completed/`
  - UI-001.md 从 `tasks/backlog/` 激活至 `tasks/active/`
  - STATE.json：`currentTask=UI-001`、`status=ready_for_trae`、`nextActor=trae`、`lastAcceptedTask=BASE-001`、`blockedTasks` 移除 UI-001
  - PROJECT-MEMORY / DECISION-LOG / SESSION-HANDOFF / PROJECT_STATE / NEW-WINDOW-GPT 同步更新
  - DECISION-LOG 追加 D-018 决策
- 解除 UI-001 阻塞，进入 V2 外壳实施准备；
- 尚未修改光砚生产代码。

## 2026-07-16 - REPO-SEC-001 验收通过

- GPT 第二轮验收通过 REPO-SEC-001，解除合并阻断；
- 修复 SEC-BLOCK-01：`.env` 模板文件显式进入内容扫描；
- 修复 STATE-CONSISTENCY-01：全部状态文件统一；
- 修复 REPORT-CONSISTENCY-01：报告记录 commit SHA；
- 执行 Option A：`git rm --cached` 2 个 PRIVATE_REMOVE 文件 + `.gitignore` 排除 `/.trae/knowledge/`；
- 9 项返工验证全部通过；
- REPO-SEC-001 归档至 `tasks/completed/`；
- BASE-001 激活为 `ready_for_trae`；
- 尚未修改光砚生产代码。

## 2026-07-16 - 协作包 1.1

- 收录 `SCAN-001` 主仓扫描原文；
- GPT 验收 SCAN-001 为“通过，带后续约束”；
- 将实际技术栈、组件、调用链和构建状态写入项目记忆；
- 冻结单结果、feature flag、旧 history 迁移、Provider 配置和 P0 认证决策；
- 新增 `BASE-001`，修正“扫描后直接重构 UI”的风险；
- 重排实施顺序：BASE → UI → FLOW → STORAGE → VERSION → JOB → ROUTING → HARDEN；
- 更新技术契约和阶段验收门禁；
- 新增机器可读 `STATE.json`、Trae 回传模板和 GPT 验收模板；
- 尚未修改光砚生产代码。

## 2026-07-16 — 协作包 1.0

- 完成当前 UI、产品流程、功能和技术风险审计；
- 冻结 Pro 工作台主定位；
- 冻结默认隐藏模型、单一生成操作、5 档参数、版本链等原则；
- 输出 P0/P1/P2 PRD；
- 输出 UI 规格、技术契约、验收门禁和 Trae 实施计划；
- 创建跨窗口记忆和交接模板；
- 尚未修改光砚生产代码。

## 后续格式

```text
日期：
任务 ID：
版本/提交：
新增：
修改：
修复：
迁移：
测试：
已知问题：
```
