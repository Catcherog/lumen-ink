# 10｜变更日志

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
