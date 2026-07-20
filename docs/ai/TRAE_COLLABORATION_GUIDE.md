<!--
  模板用途：Trae 执行手册摘要，供 Trae 在新窗口快速对齐 Lumen V2 协作规范。
  定位：本文件为 Lumen V2 执行摘要，聚焦 Lumen V2 特定的启动流程与落盘位置。
  通用执行规则（Preflight、完成包、Codex 协作、Git 规则）以 .trae/rules/_trae-execution.md 为准。
  完整协作规则以 docs/ai/COLLABORATION-RULES.md 为准。
  遇冲突以 COLLABORATION-RULES.md 和 AGENTS.md 为准。
-->

# Trae Collaboration Guide — 光砚 Lumen Ink V2 (picture-edit)

> **声明**：本文件为 Lumen V2 执行摘要，仅保留 Trae 在新窗口快速对齐 Lumen V2 协作规范所需的内容。通用执行规则（Preflight、完成包、Codex 协作、Git 规则）见 `.trae/rules/_trae-execution.md`；完整协作规则见 `docs/ai/COLLABORATION-RULES.md`。

## 新窗口启动流程（6 步）

每次开启新窗口或重新接手任务时，必须按以下顺序恢复上下文：

1. **读取入口文件**：`AGENTS.md` — 项目当前阶段、角色、必须读取的文件、当前任务位置、事实来源、基本执行规则。本项目 AGENTS.md 顶部包含「标准启动入口」段落，指明 `docs/ai/`（通用协作骨架）与 `docs/lumen-v2/`（V2 项目特定实现）的职责边界，并将 `COLLABORATION-RULES.md` 列为协作规则单一权威入口。
2. **读取项目当前状态**：`docs/ai/PROJECT_STATE.md` — 当前阶段、里程碑、进行中任务、已完成内容、下一优先级、已知风险、阻塞项。详细任务状态以 `docs/lumen-v2/state/STATE.json` 为准。
3. **读取审查规则**：`docs/ai/REVIEW_POLICY.md` — 当前阶段、P0/P1/P2 定义、阻塞合并规则、GPT 复审范围、停止条件、Lumen V2 状态机整合说明。
4. **读取协作规则权威入口**：`docs/ai/COLLABORATION-RULES.md` — 角色边界、任务交接协议、冲突解决流程、Git 规则、验证规则、技术债管理、实现原则、任务状态流转、GPT 审查结论处理、Trae 核心规则。
5. **读取当前任务**：当前 Lumen V2 任务位于 `docs/lumen-v2/tasks/active/<TASK-ID>.md`（由 `STATE.json.activeTaskPath` 指向）。确认 Objective / In Scope / Out of Scope / Acceptance Criteria / Implementation Constraints / 当前状态 / 已有实现记录 / 已有审查结果。
6. **检查 Git 状态**：
   ```bash
   git status
   git branch --show-current
   git log -1 --oneline
   ```
   确认分支、未提交修改、当前代码与任务包基线一致。不得在不了解 Git 状态的情况下直接修改文件。

详见 `AGENTS.md` 标准启动入口与 `COLLABORATION-RULES.md` 第 2 节文档定位声明、第 14 节相关文件索引。

## 通用执行规则（引用）

以下内容见 `.trae/rules/_trae-execution.md`，本文件不再重复：

- **默认职责**（10 条）：见 `_trae-execution.md` 第 1 节。
- **Preflight 快速执行原则**：见 `_trae-execution.md` 第 2 节。
- **EXECUTION_CONFLICT 输出格式**：见 `_trae-execution.md` 第 3 节（简化格式）与 `docs/ai/CONFLICT-RESOLUTION.md` 第 3 节（完整记录模板）。
- **默认执行流程**（9 步）：见 `_trae-execution.md` 第 4 节。
- **完成包格式**：见 `_trae-execution.md` 第 5 节。
- **Codex 升级规则与协作 Git 规则**：见 `_trae-execution.md` 第 6、7 节。
- **Git 规则**（分支命名、提交信息、PR 规则、禁止提交内容）：见 `docs/ai/COLLABORATION-RULES.md` 第 6 节。
- **实现原则**（最小满足、范围控制、不隐式改变产品行为、不覆盖用户未提交内容）：见 `docs/ai/COLLABORATION-RULES.md` 第 9 节。
- **验证规则**（只能报告实际执行的验证、无法执行时记录、推荐顺序）：见 `docs/ai/COLLABORATION-RULES.md` 第 7 节。
- **GPT 审查结论处理**（MVP_PASS / MVP_PASS_WITH_DEBT / MVP_FAIL）：见 `docs/ai/COLLABORATION-RULES.md` 第 11 节与 `docs/ai/REVIEW_POLICY.md`。

## Lumen V2 项目特定工作流

本项目使用 Lumen V2 协作契约（`docs/lumen-v2/`）作为任务流转与证据落盘的具体实现。

### Trae 完成任务后必须新增/更新
- `docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md`：Trae 实现报告。
- `docs/lumen-v2/evidence/<TASK-ID>/`：脱敏证据目录。
- 更新 `docs/lumen-v2/state/SESSION-HANDOFF.md`：本轮完成内容、下一任务、当前阻塞、新窗口启动摘要。
- 更新 `docs/lumen-v2/state/STATE.json`：`status` 改为 `awaiting_gpt_acceptance`，`nextActor` 改为 `gpt`。
- 同步更新 `docs/ai/PROJECT_STATE.md`。

### GPT 验收后必须新增/更新

GPT 可直接读取和修改本地项目文件，验收结论和状态文件由 GPT 直接写入本地，Trae 确认后提交到远程仓库：
- `docs/lumen-v2/reviews/<TASK-ID>-GPT-REVIEW.md`：GPT 验收报告（GPT 直接写入本地）。
- 更新 `STATE.json`：通过时归档任务并激活下一任务，`status` 改为 `ready_for_trae`，`nextActor` 改为 `trae`；驳回时 `status` 改为 `changes_requested`，`nextActor` 改为 `trae`。
- 更新 `PROJECT-MEMORY.md`、`DECISION-LOG.md`、`CHANGELOG.md`、`SESSION-HANDOFF.md`。
- 同步更新 `docs/ai/PROJECT_STATE.md` 与（若有 P1 技术债）`docs/ai/TECH_DEBT.md`。
- Git 提交（commit/push）由 Trae 负责，提交信息：`docs(lumen-v2): review <TASK-ID>`。

详见 `COLLABORATION-RULES.md` 第 10 节任务状态流转、第 14 节相关文件索引与 `AGENTS.md` 第 4 节每轮仓库落盘位置。
