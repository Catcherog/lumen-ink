# Trae Prompt｜BASE-001 工程基线修复

## 0. 必读文件

按顺序读取：

1. `00-PROJECT-MEMORY.md`
2. `11-SCAN-001-REVIEW.md`
3. `09-DECISION-LOG.md`
4. `07-ACCEPTANCE-PLAN.md`
5. `scans/SCAN-001-main-repo-report.md`

确认任务 ID 为 `BASE-001` 后再操作。

## 1. 任务目标

在不改变现有可见产品行为、API 契约和 Provider 输出的前提下：

1. 修复当前 client lint 的 2 个错误和 2 个警告；
2. 为 client、server 和根目录建立可执行的 test 命令；
3. 添加最小但真实的自动化测试；
4. 补齐 SCAN-001 没有逐行核对的面板事实；
5. 输出干净、可重复的工程基线。

## 2. 必须先补充扫描

逐行检查并在 `docs/lumen-v2/current-state-scan-addendum.md` 记录：

- `PromptInput.tsx`
- `ColorMatchingPanel.tsx`
- `LiquifyPanel.tsx`
- `CleanupPanel.tsx`
- `RemovePeoplePanel.tsx`
- client/server/root `package.json`
- ESLint 配置
- 是否已有测试相关依赖或配置

事实表至少包含：

- 参数字段、默认值和取值范围；
- 是否存在独立“应用/提交”按钮；
- Prompt 在哪里生成；
- 调用 `onSubmit` 的位置；
- 是否直接修改全局状态；
- 可复用组件和重复逻辑。

若实际文件名或结构不同，记录真实路径，不要猜测。

## 3. Lint 修复范围

已知问题：

- `App.tsx` effect 内直接 setState；
- `loadProviders` effect 依赖缺失；
- `ManualWorkflowDialog.tsx` render 中调用 `Date.now()`。

要求：

- 修复根因，不允许 eslint-disable、全局降级规则或忽略文件；
- 不改变 Provider 加载时机、登录行为和 Dialog 可见行为；
- 对 `Date.now()` 使用稳定初始化或事件时生成，不在 render 期间制造新值；
- lint 最终必须 0 error、0 warning。

## 4. 最小测试基线

优先使用与 Vite/TypeScript 兼容的轻量方案。不得引入端到端浏览器框架。

### Client 至少 2 个测试

建议覆盖：

- `validateImageFile`：合法 MIME/大小和非法文件；
- 一个纯函数或现有状态转换：上传时重置历史、错误格式化、Provider/模型选项映射等。

### Server 至少 2 个测试

建议覆盖：

- Provider operation type 判定；
- 一个不触发真实外部 API 的 Provider 配置、鉴权或输入校验纯逻辑。

约束：

- 不调用真实模型 API；
- 不读取真实 Key；
- 不依赖网络；
- 测试可在 CI 和 Windows 本地重复；
- 若需为测试导出纯函数，可做最小重构，但不得改变行为。

### 命令要求

- client `npm test`
- server `npm test`
- root `npm test` 统一执行两端
- 测试进程执行完自动退出，不默认 watch

## 5. 明确禁止

- 不创建 `AppV2`；
- 不改布局和视觉；
- 不新增数据库、对象存储或队列；
- 不改 `/api/edit`；
- 不改 Prompt 业务文案；
- 不隐藏 Provider；
- 不修改默认安全配置，本项留给 HARDEN-001；
- 不升级 React、Vite、Tailwind、Express 的主版本；
- 不顺手清理无关代码。

## 6. 验收命令

必须执行并回传完整结果：

```bash
npm run lint --prefix src/client
npx tsc --noEmit -p src/client/tsconfig.json
npm test --prefix src/client
npx tsc --noEmit -p src/server/tsconfig.json
npm test --prefix src/server
npm test
npm run build
```

若实际脚本结构不同，提供等价命令并解释。

## 7. 交付物

- 代码修改；
- `docs/lumen-v2/current-state-scan-addendum.md`；
- 测试文件；
- 根/client/server 测试脚本；
- 按 `templates/TRAE-RETURN-TEMPLATE.md` 输出报告；
- 更新 `SESSION-HANDOFF.md`；
- 不更新冻结产品决策。

## 8. 完成定义

全部满足才可写"待 GPT 验收"：

- lint 0/0；
- 所有 test 通过；
- 所有 typecheck 通过；
- root build 通过；
- 无可见行为变化；
- 补充扫描完整；
- 无真实密钥或客户数据进入提交。

---

## 9. Review History

### 9.1 首次实施 → awaiting_gpt_acceptance（2026-07-16, Trae）

- implementation commit: `a16734301b80891cf06b34e8d32a8ff5bc8f8032`
- 内容：lint 修复（App.tsx + ManualWorkflowDialog.tsx）、测试基础设施（vitest + client/server/root test 脚本）、5 client + 8 server 测试、提取 `getProviderOperationType` 到 `operationType.ts`、5 面板补充扫描。
- 报告：`docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md` 第 1-7 节。
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`。

### 9.2 GPT 验收 → MVP_FAIL（2026-07-16, GPT）

- 审查报告：`docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`
- 结论：`MVP_FAIL`
- 缺陷：
  - EVIDENCE-BLOCK-01 (P0)：`docs/lumen-v2/evidence/BASE-001/` 缺失，无法复核 lint/typecheck/test/build 执行证据。
  - REPORT-BIND-01 (P0)：Trae 报告未记录 implementation commit / review-target commit SHA。
  - VERIFY-BLOCK-01 (P0)：PR checks 未运行 BASE-001 规定的验收命令。
  - ROLLBACK-01 (P1)：Trae 报告无回滚说明。
  - DF-RULES-01 (Disputed)：GPT 称 `docs/ai/` 三个文件在当前分支不存在。
- 状态处理：`changes_requested / nextActor=trae`（中间状态，Trae 接手返工）。

### 9.3 Trae 返工 → awaiting_gpt_acceptance（2026-07-17, Trae）

- 返工内容（仅 docs/evidence，不修改 `src/` 生产代码）：
  1. 新建 `docs/lumen-v2/evidence/BASE-001/`：README.md（任务元数据 + 环境 + 脱敏声明）、commands.txt（7 条命令清单与退出码）、lint-results.txt、typecheck-results.txt、test-results.txt、build-results.txt（每条命令完整 stdout/stderr + EXIT_CODE）。
  2. 落库 GPT 审查报告到 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`。
  3. 更新 `BASE-001-TRAE-REPORT.md`：补 implementation commit / review-target commit / 返工 docs commit SHA（第 8 节返工记录、第 9 节回滚说明、第 10 节 Disputed Finding、第 11 节工作区状态声明、第 12 节完成定义复核）。
  4. 更新 `STATE.json` 为 `awaiting_gpt_acceptance / nextActor=gpt`，`latestGptReview` 指向新审查报告。
  5. 更新 `SESSION-HANDOFF.md`、`NEW-WINDOW-GPT.md`。
- 重新执行 7 条验收命令（review-target commit `a167343`，Windows + Node v22.22.1 + npm 10.9.4），全部 EXIT_CODE=0：
  - client lint: 0 errors / 0 warnings
  - client typecheck: 通过
  - client test: 5 passed (1 file)
  - server typecheck: 通过
  - server test: 16 passed (2 files)（更正原报告的 8 passed）
  - root test: 21 passed (3 files)
  - root build: client + server 均成功
- Disputed Finding DF-RULES-01 处理：`docs/ai/` 目录在本地工作区存在但未提交到远端 HEAD `a167343`（属仓库整理任务范围，不在本返工 commit 中提交）；请求 GPT 基于最新事实重新核实。
- 报告：`docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md` 第 8-12 节。
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`（等待 GPT 复核）。

### 9.4 待 GPT 复核项

1. EVIDENCE-BLOCK-01：evidence 目录与文件完整性、每条命令输出与 EXIT_CODE。
2. REPORT-BIND-01：报告任务元数据 commit SHA 绑定。
3. VERIFY-BLOCK-01：evidence 中 7 条命令退出码（CI 覆盖不在 Trae 权限内）。
4. ROLLBACK-01：报告第 9 节回滚说明。
5. DF-RULES-01：基于本地工作区事实（`docs/ai/` 存在但未提交）重新判定。

### 9.5 GPT 复核 → MVP_PASS_WITH_DEBT（2026-07-17, GPT）

- 审查报告：`docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`（已覆盖 9.2 节的 `MVP_FAIL` 版本）
- 审查方式：GitHub 远端只读复核
- 结论：`MVP_PASS_WITH_DEBT`（有条件通过）
- 返工缺陷复核结果：
  - EVIDENCE-BLOCK-01 (P0)：已修复
  - REPORT-BIND-01 (P0)：已修复
  - VERIFY-BLOCK-01 (P0)：已修复
  - ROLLBACK-01 (P1)：已修复
  - DF-RULES-01 (Disputed)：远端事实仍成立，降为流程债务
- 验收命令结果（全部 EXIT_CODE=0）：client lint 0/0、client typecheck、client 5 tests、server typecheck、server 16 tests、root 21 tests、root build
- 5 项 P2 / Process 债务清单：
  - DEBT-REPORT-01：Trae report 前部 13/8 与 evidence 21/16 不一致（Trae 已在落库时修复）
  - DEBT-REPORT-02：Trae report 返工 docs commit 字段缺 SHA（Trae 已在落库时修复）
  - DEBT-STATE-01：GPT 称 `latestGptReview` 仍指向 REPO-SEC-001，但仓库现状已指向 BASE-001（Trae 在 SESSION-HANDOFF 记录差异）
  - DEBT-EVIDENCE-01：evidence 在非 clean 工作区执行、UTF-16/BOM（已登记 TECH_DEBT.md，后续任务遵守 clean checkout + UTF-8）
  - DF-RULES-01：`docs/ai/` 三个权威文件未提交到远端分支（已登记 TECH_DEBT.md，另建 docs-only 整理任务）
- 状态处理：`BASE-001` 移至 `tasks/completed/`；`UI-001` 激活至 `tasks/active/`；`STATE.status=ready_for_trae`、`nextActor=trae`、`lastAcceptedTask=BASE-001`、`currentTask=UI-001`；从 `blockedTasks` 移除 UI-001。
- 任务归档：本文件由 `tasks/active/` 移至 `tasks/completed/BASE-001.md`。
