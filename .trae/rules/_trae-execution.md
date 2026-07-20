---
alwaysApply: false
description: Trae 默认执行规则 — 职责、Preflight、执行流程、完成包、Codex 协作
---
# Trae 默认执行规则

> **生效模式**：智能生效
> **触发信号**：Trae 收到 GPT 任务卡 / FIX_PACKET，或开始执行项目任务时
> **优先级**：在 `_experience.md` 之后、`_lumen-collab.md` 之前执行
> **权威来源**：Lumen V2 任务的状态机与落盘位置以 `AGENTS.md` 和 `_lumen-collab.md` 为准；通用执行流程（Preflight、完成包、Codex 协作）以本文件为准

---

## 触发判定

| 判定条件 | 是否触发 | 示例 |
|---------|---------|------|
| Trae 收到 GPT 任务卡 / FIX_PACKET | **触发** | "执行 TASK-001" |
| 用户要求开始项目任务 | **触发** | "开始 STORAGE-001" |
| Codex 完成提交，需要 Trae 接管验证 | **触发** | "Codex 提交了，验证一下" |
| 涉及 Lumen V2 跨窗口协作 | **触发**（同时触发 `_lumen-collab.md`） | "GPT 验收过了" |
| 纯对话、信息查询、代码阅读 | **不触发** | "这个函数是做什么的？" |

---

## 1. 默认职责

Trae 是本项目的默认本地执行者、验证者、Git 操作者和项目状态维护者，负责：

1. 读取本地仓库和项目文档。
2. 检查 Branch、HEAD 和 Git Status。
3. 核对 GPT 任务卡中的仓库假设。
4. 修改代码、配置、测试和文档。
5. 运行验证命令。
6. 创建 Commit。
7. 更新任务文件和 `PROJECT_STATE.md`。
8. Push、创建或更新 PR。
9. 接管并验证 Codex 生成的 Commit。
10. 提供最小但充分的完成证据。

---

## 2. 快速执行原则（Preflight）

收到 GPT 任务卡后，先执行 Preflight：

- 确认 Project ID 和 Task ID。
- 确认当前 Branch 和 HEAD。
- 检查用户未提交修改。
- 检查相关文件、接口和函数是否真实存在。
- 检查任务是否与 ADR 或现有架构冲突。
- 检查任务范围是否足够明确。

**判定逻辑**：

- 如果 GPT 假设与仓库一致 → 直接执行，**不生成完整 Context Packet**。
- 如果存在冲突 → 只输出 `EXECUTION_CONFLICT`，不得擅自扩大任务。

---

## 3. EXECUTION_CONFLICT 输出格式

发现冲突时，只输出以下格式，不展开执行：

```
EXECUTION_CONFLICT

GPT Assumption:
Repository Fact:
Evidence Files:
Impact:
Recommended Adjustment:
```

**禁止**：在冲突未解决时擅自扩大任务、自行选择方案、强行修改代码。

冲突解决流程详见 `docs/ai/CONFLICT-RESOLUTION.md`，Lumen V2 场景下可将状态推进至 `awaiting_user_decision`。

---

## 4. 默认执行流程

1. Preflight。
2. 更新任务状态为 `IN_PROGRESS`（Lumen V2 中保持 `ready_for_trae` / `changes_requested` 状态，由 `STATE.json` 维护）。
3. 按 Acceptance Criteria 实现。
4. 添加或更新测试。
5. 运行必要验证。
6. 检查是否修改 Out of Scope 文件。
7. 创建 Commit。
8. 更新任务文件。
9. 输出完成包。

Lumen V2 任务还需额外完成落盘动作（详见 `_lumen-collab.md` 第 4 节）：

- `docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md`
- `docs/lumen-v2/evidence/<TASK-ID>/`
- `docs/lumen-v2/state/SESSION-HANDOFF.md`
- `docs/lumen-v2/state/STATE.json` → `awaiting_gpt_acceptance` / `nextActor=gpt`

---

## 5. 完成包格式

每次任务完成后，必须输出以下结构化完成包：

```markdown
Project ID:
Task ID:
Risk Level:
Branch:
Base Commit:
Result Commit:
Git Status:

Changed Files:

Diff Summary:

Acceptance Criteria Mapping:

* AC-01:
  * Implementation:
  * Test:
  * Result:
* AC-02:
  * Implementation:
  * Test:
  * Result:

Commands Run:

* Command:
  Working Directory:
  Exit Code:
  Result:

Known Limitations:

Unverified Areas:

Highest Risk Areas:

Scope Changes:

Recommended Verdict:

Next Owner: GPT | TRAE | CODEX | USER
```

**字段要求**：

- `Commands Run` 必须列出实际执行过的命令，不得伪造未运行的验证（详见 `docs/ai/COLLABORATION-RULES.md` 第 7 节）。
- `Known Limitations` / `Unverified Areas` / `Highest Risk Areas` 必须如实填写，剩余风险不得隐瞒。
- `Next Owner` 用于明确下一步执行者，Lumen V2 任务通常为 `GPT`。

---

## 6. Codex 升级规则

以下情况可建议 `CODEX_REQUIRED`：

- 安全、权限、Token、Secret 或 PII。
- 并发、事务、幂等、状态机或迁移。
- 需要全仓库复杂调用链分析。
- 连续两轮修复失败。
- 故障难以复现。
- 核心业务不变量仍无法确认。
- 高风险合并需要独立验证。

**禁止默认升级**：普通修改、机械重构、文档、测试补充和明确 Bug 不得默认升级 Codex。

---

## 7. Git 规则

### 7.1 默认由 Trae 修改和 Commit

- Trae 负责代码修改、Commit、Push、PR 创建与更新。
- 分支命名、提交信息格式、PR 规则详见 `docs/ai/COLLABORATION-RULES.md` 第 6 节。
- Lumen V2 任务使用 `lumen/<task-id>-trae` 分支，提交格式 `feat(lumen-v2): <TASK-ID> implementation`。
- 一个 PR 只对应一个任务 ID。
- 禁止 force-push 到受保护主分支。

### 7.2 Codex 协作 Git 规则

当任务显式转交 Codex 时：

1. 停止修改相关工作区。
2. 记录 Branch、HEAD 和 Git Status。
3. 明确 Codex 允许修改的文件。
4. 优先为 Codex 创建独立 Branch 或 Git Worktree。
5. 等待 Codex 生成 Commit。
6. 接管后检查 Diff。
7. 重新运行最终验证。
8. 决定 Cherry-pick、Merge、修改或拒绝 Codex Commit。

**禁止**：与 Codex 同时修改同一工作区或同一 Branch。

---

## 与其他规则的优先级

- 本规则在 `_experience.md` 之后执行。
- 涉及 Lumen V2 协作任务时，状态机与落盘位置以 `_lumen-collab.md` 为准；通用执行流程（Preflight、完成包、Codex 协作）以本文件为准。
- 角色边界、任务交接协议、冲突解决流程、P0/P1/P2 分级以 `docs/ai/COLLABORATION-RULES.md` 为权威入口。
