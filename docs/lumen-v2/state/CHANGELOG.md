# 10｜变更日志

## 2026-07-18 - STORAGE-001 GPT 验收通过并激活 PERSIST-001

- 审查 commit：`abcc103394f86b87ae37af1bd6172f984e9d46e6`；结论：`MVP_PASS_WITH_DEBT`。
- 冻结候选 A：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage；GitHub 运行时存储禁令、CloudBase Workflow 60 秒边界、CloudRun/R2 未来选项同步冻结。
- GPT 使用官方主源核对 Vercel/CloudBase 时效事实，独立重跑 CloudBase mock 合约：1 file / 6 tests passed。
- P1 `DEBT-STORAGE-01`：PoC 简化契约低于 PERSIST 恢复模型；D-040 授权 PERSIST Tasks 1—3 在同一扩大包内完成一次契约收敛，覆盖事务上下文、幂等、lease 所有权、两 worker 接管和 stale worker 拒写。
- STORAGE-001 归档；PERSIST-001 激活为 `ready_for_trae / nextActor=trae`；中间不做普通阶段交接，最后统一证据回传。
- GPT 未 commit/push；工作区既有无关修改继续隔离，由 Trae 精确提交本轮控制面文件后创建 `lumen/persist-001-trae`。

## 2026-07-18 - STORAGE-001 修订完成（awaiting_gpt_acceptance，候选 A CloudBase）

- 触发：用户重新打开 STORAGE-001 局部选型修订，明确决策方向：首选架构为 Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage；当前不注册 Cloudflare、不升级 Vercel Pro；GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储；当前仍只允许执行 STORAGE-001 修订，禁止启动 PERSIST-001；不得自行写入 `decision: frozen`，修订完成后交回 GPT 验收冻结。
- 分支：`lumen/storage-001-trae`（沿用，基于 `lumen/flow-001-trae`）。
- 提交：
  - `37c381d` `docs(lumen-v2): accept FLOW-001 and start internal fast track`
  - `d59abbd` `docs(lumen-v2): STORAGE-001 compare two complete stacks`
  - `13342b0` `feat(lumen-v2): STORAGE-001 persistence contract PoC`
  - `d85bae2` `feat(lumen-v2): STORAGE-001 decision and PoC`（原 Task 3 状态推进 + 8 门禁证据）
  - 待提交 `docs(lumen-v2): revise STORAGE-001 for CloudBase`（修订：新增候选 A + CloudBase mock PoC + 事实修正 + 状态推进）
- 修订内容：
  - 一、修正过时事实：删除「Vercel Blob 仅公开 URL」「Vercel Pro 是 80—100s 任务必需」「Vercel Postgres 包含在 Pro」「Workflow Beta 免费」「待提交」5 项过时结论。
  - 二、新增首选候选 A：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage；能力映射覆盖 9 个冻结接口。
  - 三、明确边界：GitHub / CloudBase / 生产路径 / 接口冻结 4 类边界。
  - 四、PoC 与测试：新建 `src/server/infrastructure/persistence/cloudbase-mock.ts` + `src/server/domain/cloudbase-mock.contract.test.ts`，6 用例覆盖 CRUD/字段映射、UoW 回滚、私有签名 URL、级联删除、Job lease 过期重试、幂等键防重；不接入生产路径。
  - 五、决策材料：重算 100 分矩阵 A=83 / B=78 / C=82；成本按阶段表达（PoC $0 / 内部稳定版参考 19.9 元/月 / 商业用途未冻结）；不再使用「固定 $20—25/月」结论。
- 8 条门禁：client 104 / server 28（含 6 新 mock 测试）/ root 132 tests passed，lint/typecheck/build/安全扫描全绿；证据文件 `docs/lumen-v2/evidence/STORAGE-001/gate-*.txt` 已就地更新。
- 状态推进：`STATE.json` 由 `awaiting_user_decision / nextActor=user` → `awaiting_gpt_acceptance / nextActor=gpt`；`SESSION-HANDOFF.md` / `PROJECT-MEMORY.md` / `DECISION-LOG.md`（新增 D-037 / D-038 / D-039）/ 本日志 / `STORAGE-001-TRAE-REPORT.md` / `docs/ai/PROJECT_STATE.md` 同步更新；PERSIST-001 继续阻塞。
- 冻结状态：**未冻结**。本文件不写 `decision: frozen`。GPT 验收通过后由 GPT 写入冻结并更新 STATE.json 激活 PERSIST-001。
- 下一步：GPT 验收 → 写入 `decision: frozen` → STATE.json 推进至 `PERSIST-001 / ready_for_trae / nextActor=trae` → 解除 PERSIST-001 阻塞。

## 2026-07-18 - STORAGE-001 Trae 实施完成（awaiting_user_decision）

- 触发：FLOW-001 第三轮验收通过后激活 STORAGE-001（`ready_for_trae / nextActor=trae`）；用户授权连续执行 INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 0—3，禁止启动 PERSIST-001。
- 分支：`lumen/storage-001-trae`（基于 `lumen/flow-001-trae`）。
- 提交：
  - `37c381d` `docs(lumen-v2): accept FLOW-001 and start internal fast track`（Task 0 控制面，17 文件 +2170/-81）
  - `d59abbd` `docs(lumen-v2): STORAGE-001 compare two complete stacks`（Task 1，2 文件 +549）
  - `13342b0` `feat(lumen-v2): STORAGE-001 persistence contract PoC`（Task 2，7 文件 +937）
  - 待提交 `feat(lumen-v2): STORAGE-001 decision and PoC`（Task 3，报告 + 状态推进 + 8 门禁证据）
- 范围：仅执行 STORAGE-001；严格保留工作区无关修改（精确 `git add <path>`）；非必要 S2/S3 不登记新项；未启动 PERSIST-001；未写 `decision: frozen`。
- 两方案对比：Vercel+R2+Workflow（84/100）vs Supabase all-in-one（82/100）；Vercel Blob 因不满足「私有对象/签名 URL」硬条件被拒绝（详见 `docs/lumen-v2/storage-options.md` §1）。
- 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`（官方 URL + 访问日期 2026-07-18）。
- 推荐方案：Vercel + Cloudflare R2 + Vercel Workflow（保留 Node.js/Express/Sharp 栈；Vercel Workflow 是唯一 durable execution；Edge Function 不支持 sharp）。
- 稳定接口契约：`src/server/domain/persistence.ts` 冻结 9 个接口；PERSIST-001 必须消费不变（详见 D-036）。
- 本地 PoC：`src/server/infrastructure/persistence/local.ts` + `src/server/infrastructure/executor/local.ts`，证明适配器重建恢复 + 级联删除 + UoW 回滚 + ObjectStore 缺失键行为。
- 合约测试：`src/server/domain/persistence.contract.test.ts` 3 用例全部通过（TDD：先红后绿）。
- 8 条门禁：client 104 / server 19（含 3 个新合约测试）/ root 123 tests passed；lint/typecheck/build/安全扫描全绿；证据文件 `docs/lumen-v2/evidence/STORAGE-001/gate-*.txt`。
- 账号门槛：`account_gate: user`、`decision_authority: user`；待用户决策 5 项（Cloudflare 账号 + Vercel Pro 升级 + 月度预算 + Vercel Workflow Beta 风险 + 不可逆迁移审批）。
- 决策日志：追加 D-035（推荐候选 1，提议待用户冻结）+ D-036（接口契约冻结）。
- 状态推进：`STATE.json` → `awaiting_user_decision / nextActor=user`；`SESSION-HANDOFF.md` / `PROJECT-MEMORY.md` / `DECISION-LOG.md` / 本日志同步更新；`latestTraeReport` 指向 `STORAGE-001-TRAE-REPORT.md`；PERSIST-001 继续阻塞。
- 下一步：用户决策账号与预算 → GPT 写入 `decision: frozen` 到 `storage-options.md` → STATE.json 推进至 `PERSIST-001 / ready_for_trae / nextActor=trae` → 解除 PERSIST-001 阻塞。

## 2026-07-18 - FLOW-001 GPT 第三轮验收通过（MVP_PASS）

- GPT 复核并确认本地/远端 commit `7fca3f5` 一致，`7601274` 已一并推送；
- P0-01-R2 已关闭：URL-only SET_RESULT 清空旧 base64，真实复现与四类结果状态测试通过；
- P0-02-VERIFY-R2 已关闭：真实 file input 添加、Prompt/history/request payload 数量一致性测试通过；首轮 19/18 计数已纠正；
- GPT 独立重跑 8 条门禁全部 `EXIT_CODE=0`：client 104、server 16、root 120，lint/typecheck/build/安全扫描通过；
- 无新增 P0/P1；FLOW-001 结论 `MVP_PASS` 并归档；
- 激活 STORAGE-001 为 `ready_for_trae / nextActor=trae`；PERSIST-001 继续阻塞，未经方案冻结不得实施。

## 2026-07-18 - FLOW-001 P0 R2 返工完成（awaiting_gpt_acceptance）

- 触发：GPT 第二轮验收 `MVP_FAIL`，附最小 FIX_PACKET（P0-01-R2 SET_RESULT 状态不变量 + P0-02-VERIFY-R2 真实添加/payload 回归 + 19/18 计数纠正）；状态 `changes_requested / nextActor=trae`；
- 返工范围：严格按第二轮 FIX_PACKET，仅最小修改 `useEditor.SET_RESULT` reducer；未启动 STORAGE/JOB/VERSION/ROUTING，未修改 `/api/edit` 协议、Provider 实现、存储协议；
- P0-01-R2 修复（`src/client/src/hooks/useEditor.ts`）：`SET_RESULT` 分支重写为三种结果显式分支（base64 / URL-only / text-only）；URL-only 时清空旧 base64，`currentImageUrl` = 新 URL；text-only 保留既有 canvas 供 chat 模型继续编辑。不变量：当前画布输入始终与最近一次结果的实际数据源一致；`submitEdit` 的 `image: state.currentImage || undefined` 自然不发任何 base64；
- P0-02-VERIFY-R2 修复（测试）：新建 `src/client/src/hooks/useEditor.test.ts`（9 用例）覆盖 P0-01-R2 真实复现（上传 → URL-only SET_RESULT → currentImage=null → submitEdit 不含旧 base64）+ SET_RESULT 四分支无输入源错位 + P0-02-VERIFY-R2 payload 一致性（N=2/0/3 三种场景，断言编译 Prompt 含"参考 N 张"、history `params.recipe.auxiliary.referenceImageCount=N`、实际 `referenceImages` payload 长度=N）；`src/client/src/components/v2/ContextPanel.test.tsx` 新增 1 用例覆盖真实添加流程（mock `fileToBase64` + `fireEvent.change(fileInput)`，断言 `onReferenceImagesChange` 与 `onRecipeChange` 同步调用，recipe 计数 = 1）；
- 19/18 计数纠正：首轮报告 §14.4 声称"新增 19 用例"实际为 18 用例；R2 新增 10 用例，累计 P0 相关回归 28 用例（首轮 18 + R2 10）；R2 真实补齐的"有效添加 + 有效 payload"测试为 10 用例，超过 FIX_PACKET 要求的最小 2 用例；
- 8 条门禁重跑全绿：client 104 tests（首轮 94 + R2 新增 10）、server 16 tests、root 120 tests、lint/typecheck/build/安全扫描通过；证据文件就地更新到 `docs/lumen-v2/evidence/FLOW-001/gate-*.txt`；
- 状态推进：`STATE.json` → `awaiting_gpt_acceptance / nextActor=gpt`；`SESSION-HANDOFF.md` / `PROJECT-MEMORY.md` / `DECISION-LOG.md`（新增 D-032）/ `FLOW-001.md` Review History / 本日志同步更新；
- 待 GPT 验收：按变更风险驱动，聚焦 R2 修复 diff、真实复现路径、payload 三层一致性、19/18 计数纠正与 8 条门禁结果；未变更的首轮文件与 UI-001 视觉证据不重审；
- 本轮 R2 commit 与本地 `7601274` 回填 commit 一并 push 到 `lumen/flow-001-trae` 分支。

## 2026-07-18 - FLOW-001 GPT 第二轮验收驳回（MVP_FAIL）

- GPT 复核远端返工 commit `4e774ed`；本地 `7601274` 仅回填交接 hash，尚未 push；
- 独立重跑 8 条门禁全部 `EXIT_CODE=0`：client 94 tests、server 16 tests、root 110 tests，lint/typecheck/build/安全扫描通过；
- P0 `FLOW001-P0-01-R2`：真实 URL-only 响应状态为旧 base64 与新 URL 并存，现 `!!state.currentImage` 判定与防御检查仍会提交旧 base64；新增测试构造错了状态，未关闭原 P0；
- P0 `FLOW001-P0-02-VERIFY-R2`：参考图生产接线方向正确，但承诺 19 条回归实际为 18 条，未覆盖真实添加和 `submitEdit`/`/api/edit` payload；
- review 文件追加第二轮 FIX_PACKET；状态回退为 `changes_requested / nextActor=trae`；STORAGE-001 / PERSIST-001 继续阻塞。

## 2026-07-18 - FLOW-001 P0 返工完成（awaiting_gpt_acceptance）

- 触发：GPT 首轮验收 `MVP_FAIL`，附最小 FIX_PACKET（P0-01 URL-only 旧 base64 + P0-02 参考图入口缺失）；状态 `changes_requested / nextActor=trae`；
- 返工范围：严格按 FIX_PACKET，未启动 STORAGE/JOB/VERSION，未修改 `/api/edit` 协议、Provider 实现、`useEditor` reducer；
- P0-01 修复（`ContextPanel.tsx` + `AppV2.tsx`）：`canSubmit` 仅要求 `state.currentImage`，与 `submitEdit` 实际输入 1:1 对齐；新增 `hasUrlOnlyResult` 检测与琥珀色"当前结果为 URL，无法继续编辑，请下载后重新上传"提示；`handleGeneratePreview` 加防御性检查 `if (!state.currentImage) { dispatch SET_ERROR; return; }`；
- P0-02 修复（`ContextPanel.tsx` + `AppV2.tsx`）：恢复 V2 唯一参考图入口（复用 Legacy `ReferenceImages` 组件，可编辑任务均显示，`data-testid="reference-images-section"`）；`handleReferenceImagesChange` 同步 `state.referenceImages` 与 `recipe.auxiliary.referenceImageCount`；`AppV2` 解构 `setReferenceImages`；`handleGeneratePreview` 显式传 `referenceImages: state.referenceImages.length > 0 ? state.referenceImages : undefined`；三层数据一致：state ↔ recipe 计数 ↔ 编译 Prompt【参考图】段 ↔ submitEdit payload；
- 回归测试（`ContextPanel.test.tsx`）：新增 19 用例（6 P0-01 + 11 P0-02 + 2 端到端一致性），覆盖 URL-only 禁用/提示/不触发 onSubmit、base64 优先、参考图入口渲染/计数同步/删除回调/编译 Prompt 含【参考图】段、Recipe/Prompt/payload 三层一致；
- 8 条门禁重跑全绿：client 94 tests（首轮 76 + P0 新增 18）、server 16 tests、root 110 tests、lint/typecheck/build/安全扫描通过；证据文件就地更新到 `docs/lumen-v2/evidence/FLOW-001/gate-*.txt`；
- 状态推进：`STATE.json` → `awaiting_gpt_acceptance / nextActor=gpt`；`SESSION-HANDOFF.md` / `PROJECT-MEMORY.md` / `DECISION-LOG.md`（新增 D-030）/ 本日志同步更新；
- 待 GPT 验收：按变更风险驱动，聚焦 P0 修复 diff、三层数据一致性、19 个回归用例与 8 条门禁结果；未变更的首轮文件与 UI-001 视觉证据不重审。

## 2026-07-18 - 用户确认 PERSIST-001 合并执行方案

- 用户确认 STORAGE-001 继续作为独立选型、PoC 与冻结门禁；
- 原 VERSION-001 与 JOB-001 合并为 `PERSIST-001`，降低任务切换与重复接线成本；
- 新增 `specs/09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md`、`plans/PERSIST-001-IMPLEMENTATION-PLAN.md` 与 `tasks/backlog/PERSIST-001.md`；
- VERSION-001 / JOB-001 标记为 superseded，仅保留审计；
- `STATE.json.blockedTasks` 同步为 STORAGE-001 / PERSIST-001；FLOW-001 仍为 `changes_requested / nextActor=trae`，未提前激活后续任务。

## 2026-07-18 - FLOW-001 GPT 首轮验收驳回（MVP_FAIL）

- GPT 审查 commit `2574abf`，按风险驱动方式复核 FLOW-001 diff 与关键数据流；
- 8 条门禁独立重跑全部 `EXIT_CODE=0`：client 76 tests、server 16 tests、root 92 tests、lint/typecheck/build/安全扫描通过；
- P0 `FLOW001-P0-01`：URL-only 新结果显示后，下一次生成仍提交旧 `currentImage` base64；
- P0 `FLOW001-P0-02`：V2 移除参考图入口，Recipe 的 `referenceImageCount` 与实际 payload 在真实 UI 中不可达；
- 新增 `reviews/FLOW-001-GPT-REVIEW.md` 与最小 FIX_PACKET；
- 状态改为 `changes_requested / nextActor=trae`，STORAGE-001 继续阻塞。

## 2026-07-17 - FLOW-001 实施完成（awaiting_gpt_acceptance，端到端扩大执行包）

- 触发：UI-001 第三轮 GPT 验收 `MVP_PASS`，FLOW-001 激活为 `ready_for_trae / nextActor=trae`；GPT 指令要求一次完成 EditRecipe、五档参数、Prompt 编译器 v1、单 CTA、`/api/edit` 接线、自动化测试、证据与状态回传，不得拆成 UI/类型/编译器小批次；
- 实施范围（全部在同一任务 ID / 同一分支 `lumen/flow-001-trae` / 同一 PR 内完成）：
  - 类型层（`src/shared/types.ts`）：新增 Tier / TIER_ORDER / TIER_LABELS / V2TaskId / V2_TASK_TOOL_MAP（1:1 映射，project=null）/ V2_TASK_EDITABLE / V2_TASK_META / ProtectionItems / PortraitParams / PORTRAIT_PARAM_LABELS / PROTECTION_LABELS / EditRecipe（schemaVersion=1）/ CompiledPrompt（version=1）；
  - 纯函数模块（`src/client/src/utils/recipe.ts`）：legacyValueToTier（0→off / 1-29→light / 30-59→natural / 60-84→obvious / 85-100→strong）、tierToLegacyValue（off→0 / light→20 / natural→40 / obvious→70 / strong→90）、defaultRecipe（subject/local 启用 natural/light 人像参数，其他任务全 off）、defaultRecipeBook（六任务独立 Recipe）、canSubmitRecipe（project 禁用 / 无图禁用 / loading 禁用）、compilePrompt v1（首行 `# lumen-prompt v1`，次行 `# task=X tool=Y`，含身份锚定/保护/修改/补充要求/参考图/区域/限制七段）；
  - V2 右栏收敛（`src/client/src/components/v2/ContextPanel.tsx` 完全重写）：删除旧 ParamPanel / PromptInput / "应用" / "提交" 入口与 UI-001 临时债务提示条；新增 RecipePanel 调度器、CompiledPromptPreview（默认折叠只读）、单一"生成预览"主 CTA（`data-cta="generate-preview"`，`aria-label` 动态切换"生成中"/"生成预览"）；`canSubmit = editable && hasCurrentImage && !state.isLoading`；移除 `dispatch` prop（lint unused）；
  - 任务面板（`src/client/src/components/v2/recipe/`）：TierSelect（五档单选 chip）、ProtectionsPanel（5 项开关）、PortraitPanel（人物，6 五档参数）、LocalPanel（局部，复用人像参数）、ColorPanel（色彩，仅补充要求）、CleanupPanel（清理，仅目标描述）、ExportPanel（导出，jpeg/png/webp + 50-100% 质量）、ProjectPanel（项目，不发起编辑）、RecipePanel（taskId 分派）、CompiledPromptPreview（折叠只读）；
  - AppV2 接线（`src/client/src/AppV2.tsx`）：提升 `activeTask` + `recipeBook` 状态；`compiled = useMemo(() => compilePrompt(currentRecipe), [currentRecipe])`；`handleGeneratePreview` 闭环（compilePrompt → submitEdit，附 `params.recipe` 与 `params.compiledVersion`）；
  - TaskRail 改为受控组件（`activeTask` + `onSelectTask`，向后兼容非受控）；
  - 测试配置：`vite.config.ts` 新增 Vitest（jsdom + globals + setupFiles）；`test-setup.ts` 引入 `@testing-library/jest-dom/vitest`；`package.json` 新增 `@testing-library/react@^16` / `@testing-library/jest-dom@^6` / `@testing-library/user-event@^14` / `jsdom@^25`；
- 自动化测试：76 client tests（含 59 recipe.test.ts + 17 ContextPanel.test.tsx，覆盖 legacy/tier round-trip、defaultRecipe、canSubmitRecipe、compilePrompt v1 全分支、单 CTA、无隐藏提交入口、project 禁用、loading 状态、任务切换）+ 16 server tests = 92 tests passed，无既有测试回归；
- 8 条门禁独立重跑全部 `EXIT_CODE=0`：client lint 0/0、client typecheck、client 76 tests、server typecheck、server 16 tests、root 92 tests、build 通过、`check-lumen-collab.mjs` 通过；
- 范围约束遵守：未实施数据库 / 持久化 / 异步 Job / 不可变版本 / 伪进度；未修改 Provider/API/存储实现；保持 `submitEdit` 签名与 `useEditor` 调用链兼容；完整 Prompt 默认折叠只读；未覆盖或提交工作区中与 FLOW-001 无关的既有修改；
- 状态由 `ready_for_trae / nextActor=trae` 推进至 `awaiting_gpt_acceptance / nextActor=gpt`；
- 证据目录：`docs/lumen-v2/evidence/FLOW-001/`（8 条门禁脱敏输出，UTF-8 无 BOM）；
- 按变更风险驱动验收约定，本轮未重复捕获 UI-001 视觉证据（已冻结）；
- GPT 验收文档 `docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md` 按契约由 Trae 一并 commit/push；
- 决策日志追加 D-026（V2_TASK_TOOL_MAP 1:1 映射）与 D-027（编译器 v1 自然语言输出）。

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

## 2026-07-17 - UI-001 第三轮验收通过（MVP_PASS）

- GPT 复核 commit `050c321`，确认 `canExport` 与 `handleExport` 支持类型 1:1 对齐，纯文本结果不再出现可点击空入口；
- R2 未回改已关闭的任务栏 P0，未提前实施 FLOW-001；
- 本轮独立重跑 8 条门禁全部 `EXIT_CODE=0`（client 5 tests、server 16 tests、root 21 tests）；
- UI-001 归档，FLOW-001 激活为 `ready_for_trae / nextActor=trae`；
- FLOW-001 扩大为同一任务 ID 下的端到端执行包，后续采用变更风险驱动验收以减少无效往返。

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
