<!--
  模板用途：任务交接协议，标准化 GPT 与 Trae 之间的任务包与回传格式。
  来源改造方案章节：第 6 节、第 17 节。
  完整规范以 docs/ai/COLLABORATION-BLUEPRINT.md 为准；本文件聚焦任务包与回传的格式契约，遇冲突以 AGENTS.md 和 REVIEW_POLICY.md 为准。
-->

# 任务交接协议 — 光砚 Lumen Ink V2 (picture-edit)

本协议定义 GPT 与 Trae 之间任务包（TASK_PACKET / FIX_PACKET）与回传（Trae → GPT）的标准格式，用于在跨窗口协作中消除歧义、减少人工信息传递次数，并保证每个任务都可在 GitHub 中追溯。

本协议是 `docs/ai/COLLABORATION-BLUEPRINT.md`（改造方案）第 6 节、第 17 节的格式契约化落地，不替代完整协作规范。角色边界、状态机与 Git 规则以 `AGENTS.md` 和 `docs/ai/REVIEW_POLICY.md` 为准。

---

## 1. 协作循环概览

每个任务遵循以下标准协作循环（16 步），完整循环构成一个可审计的交付单元：

```text
1.  用户向 GPT 提出目标
2.  GPT 读取 GitHub 项目上下文
3.  GPT 生成 TASK_PACKET
4.  用户将 TASK_PACKET 一次性发送给 Trae
5.  Trae 检查任务与仓库是否一致
6.  Trae 将确认后的任务正式写入 GitHub
7.  Trae 创建分支并实施最小修改
8.  Trae 运行验证
9.  Trae 更新任务文件并创建 PR
10. 用户将 PR 编号告知 GPT
11. GPT 进行验收（可直接读取本地项目文件）
12. GPT 返回 MVP_PASS / MVP_PASS_WITH_DEBT / MVP_FAIL + FIX_PACKET
13. Trae 只处理 P0 修复（如驳回）
14. GPT 复核原 P0 及直接回归
15. 通过后合并
16. Trae 更新 PROJECT_STATE.md
```

第 4 步与第 10 步是仅有的人工信息传递环节；其余环节均由 GPT 或 Trae 在 GitHub 仓库内完成。

---

## 2. GPT → Trae 任务包格式（TASK_PACKET）

GPT 向 Trae 下发新任务时使用 `TASK_PACKET`。包体采用 YAML 格式，字段固定，便于 Trae 做一致性检查。

### 2.1 标准模板

```yaml
packet_type: TASK
task_id: TASK-XXX
stage: MVP  # 可选值：MVP / 稳定化 / 生产强化
title: 任务标题

objective: |
  任务要达成的用户结果，一句话描述。

in_scope:
  - 当前任务必须完成的内容 1
  - 当前任务必须完成的内容 2

out_of_scope:
  - 当前任务明确不处理的内容 1
  - 当前任务明确不处理的内容 2

acceptance_criteria:
  - 可客观验证的验收条件 1
  - 可客观验证的验收条件 2

implementation_constraints:
  - 不允许改变的架构或行为 1
  - 不允许改变的架构或行为 2
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `packet_type` | 是 | 固定为 `TASK`，标识包类型。 |
| `task_id` | 是 | 全局唯一任务编号，格式 `TASK-XXX`；Lumen V2 任务可沿用既有命名（如 `BASE-001`、`UI-001`）。 |
| `stage` | 是 | 任务所处阶段，决定审查口径（见 `REVIEW_POLICY.md`）。 |
| `title` | 是 | 任务标题，简短且可读。 |
| `objective` | 是 | 任务目标，聚焦用户结果，而非实现方式。 |
| `in_scope` | 是 | 当前任务必须完成的内容清单。 |
| `out_of_scope` | 是 | 当前任务明确不处理的内容清单，用于防止范围蔓延。 |
| `acceptance_criteria` | 是 | 可客观验证的验收条件，GPT 据此判定 MVP_PASS / FAIL。 |
| `implementation_constraints` | 是 | 不允许改变的架构或行为，约束 Trae 的实现自由度。 |

### 2.2 完整示例（登录任务）

```yaml
packet_type: TASK
task_id: TASK-014
stage: MVP
title: Implement email/password login

objective: |
  Allow an existing user to log in using email and password.

in_scope:
  - Login form
  - Existing authentication API integration
  - Authentication state persistence

out_of_scope:
  - Password reset
  - OAuth
  - MFA

acceptance_criteria:
  - Correct credentials successfully log in
  - Incorrect credentials show an error
  - Authentication survives page refresh

implementation_constraints:
  - Do not replace the current authentication library
  - Do not refactor unrelated routing code
```

---

## 3. GPT → Trae 修复包格式（FIX_PACKET）

GPT 验收返回 `MVP_FAIL` 时，必须附带 `FIX_PACKET`，明确列出阻塞问题及最小修复要求。Trae 只处理包中列出的 P0 问题及其直接回归，不主动处理 P1/P2。

### 3.1 标准模板

```yaml
packet_type: FIX
task_id: TASK-XXX
review_target:
  pull_request: <PR 编号>
  commit: <Commit SHA>

verdict: MVP_FAIL

blockers:
  - id: P0-01
    evidence: |
      客观证据，引用具体代码行、测试输出或行为描述。
    impact: |
      该问题对用户或系统的影响。
    violated_criterion: |
      该问题违反了哪条 acceptance_criteria。
    minimum_fix:
      - 最小修复要求 1
      - 最小修复要求 2
    verification:
      - 修复后必须通过的验证 1
      - 修复后必须通过的验证 2
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `packet_type` | 是 | 固定为 `FIX`。 |
| `task_id` | 是 | 对应原任务编号。 |
| `review_target` | 是 | GPT 审查的目标，包含 `pull_request` 与 `commit`。 |
| `verdict` | 是 | 固定为 `MVP_FAIL`；`MVP_PASS` / `MVP_PASS_WITH_DEBT` 不附带 FIX_PACKET。 |
| `blockers` | 是 | P0 阻塞问题列表，每项须含下列子字段。 |
| `blockers[].id` | 是 | 阻塞问题编号，如 `P0-01`。 |
| `blockers[].evidence` | 是 | 客观证据，不得是主观判断。 |
| `blockers[].impact` | 是 | 问题影响。 |
| `blockers[].violated_criterion` | 是 | 违反的验收条件，须能回溯到 TASK_PACKET。 |
| `blockers[].minimum_fix` | 是 | 最小修复要求，不包含优化建议。 |
| `blockers[].verification` | 是 | 修复后须通过的验证。 |

### 3.2 完整示例

```yaml
packet_type: FIX
task_id: TASK-014
review_target:
  pull_request: 38
  commit: b74c230

verdict: MVP_FAIL

blockers:
  - id: P0-01
    evidence: |
      Invalid credentials still persist auth state
    impact: |
      User may be incorrectly treated as logged in
    violated_criterion: |
      Incorrect credentials show an error
    minimum_fix:
      - Do not persist auth state on failed login
    verification:
      - Add invalid-password test
      - Run auth tests
```

---

## 4. Trae → GPT 回传格式

Trae 完成实现与验证后，向 GPT 提交结构化回传。回传以 Markdown 格式呈现，GPT 据此进行验收（可直接读取本地项目文件）。

### 4.1 标准模板

```markdown
任务：<TASK-ID>
状态：REVIEW
分支：<branch name>
Commit：<commit SHA>
PR：<PR 编号>

已完成：
- 已完成内容 1
- 已完成内容 2

验证：
- <验证命令 1>：<结果>
- <验证命令 2>：<结果>

已知限制：
- 已知但不阻塞当前 MVP 的问题 1
- 已知但不阻塞当前 MVP 的问题 2

下一步：
请让 GPT 按照 AGENTS.md 和 REVIEW_POLICY.md 审查 PR <编号>。
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| 任务 | 是 | 对应 TASK_PACKET 的 `task_id`。 |
| 状态 | 是 | 固定为 `REVIEW`，表示已提交 PR 等待验收。 |
| 分支 | 是 | 本次任务使用的 Git 分支名。 |
| Commit | 是 | 最新提交的 SHA。 |
| PR | 是 | GitHub PR 编号。 |
| 已完成 | 是 | 对应 `in_scope` 的实现清单。 |
| 验证 | 是 | 实际运行的命令与结果，不得声称未运行的验证（见改造方案第 9 节）。 |
| 已知限制 | 是 | 已知但不阻塞 MVP 的问题，P1/P2 应同步登记到 `TECH_DEBT.md`。 |
| 下一步 | 是 | 提示用户将 PR 编号告知 GPT 进行验收。 |

### 4.2 完整示例

```markdown
任务：TASK-014
状态：REVIEW
分支：feature/task-014-login
Commit：b74c230
PR：#38

已完成：
- 登录表单
- 登录 API 接入
- 登录状态持久化
- 受保护页面跳转

验证：
- npm run typecheck：通过
- npm test -- auth：通过，8 项测试
- npm run build：通过

已知限制：
- 未实现忘记密码
- 未实现登录限流

下一步：
请让 GPT 按照 AGENTS.md 和 REVIEW_POLICY.md 审查 PR #38。
```

用户只需把 PR 编号告知 GPT，无需复制代码文件。

---

## 5. 信息同步频率规则

为保证协作高效且可审计，信息同步遵循以下规则：

1. **一个任务一个完整循环**：禁止在当前任务循环中混入其他任务的内容。
2. **GPT → Trae**：每轮只传递一个完整的 `TASK_PACKET` 或 `FIX_PACKET`，不拆分、不堆叠。
3. **Trae -> GPT**：每轮回传任务编号、PR 编号和最新 commit，作为 GPT 验收的入口。
4. **不再由用户手工复制项目文件或代码**：所有代码、任务文件、验证结果均通过 GitHub 仓库流转。
5. **每轮人工信息传递应尽量控制为上述两个方向**：GPT → Trae（任务包/修复包）与 Trae → GPT（PR 编号与 commit）。

---

## 6. Trae 收到任务包后的处理流程

Trae 收到 `TASK_PACKET` 后，不得立即盲目执行，必须依次完成下列三步（见改造方案第 6 节）。

### 6.1 仓库一致性检查

逐项确认：

- `task_id` 是否与现有任务重复。
- GPT 引用的文件、模块和接口是否存在。
- GPT 对当前架构的理解是否正确。
- 任务是否与已接受 ADR 或 Lumen V2 冻结决策（`docs/lumen-v2/state/PROJECT-MEMORY.md` 的 D-001 ~ D-013）冲突。
- 验收条件是否可以客观验证。
- 任务范围是否明显大于一个合理的独立交付单元。
- 是否存在明显缺失但会导致无法执行的信息。

### 6.2 冲突处理

- **轻微措辞差异但目标明确**：根据仓库事实修正，并在任务文件中记录修正内容。
- **重大冲突**：不得自行选择方案。按 `.trae/rules/_trae-execution.md` 第 3 节输出 `EXECUTION_CONFLICT`（含 GPT Assumption / Repository Fact / Evidence Files / Impact / Recommended Adjustment），然后停止扩大修改范围，交由用户裁决。完整记录模板见 `docs/ai/CONFLICT-RESOLUTION.md` 第 3 节。Lumen V2 场景下可将任务状态推进至 `awaiting_user_decision`。

### 6.3 将任务包正式落库

确认任务可执行后，由 Trae 创建或更新任务文件：

```text
docs/lumen-v2/tasks/active/<TASK-ID>.md
```

> 注：本项目采用 Lumen V2 任务流转体系，任务文件位于 `docs/lumen-v2/tasks/active/`，由 `docs/lumen-v2/state/STATE.json` 的 `activeTaskPath` 指向。改造方案通用的 `docs/ai/tasks/` 路径在本项目中不用于 Lumen V2 任务落库。

任务文件结构见下一节。

---

## 7. 任务文件标准结构

`docs/lumen-v2/tasks/active/<TASK-ID>.md` 的标准模板如下：

```markdown
# <TASK-ID>: 任务标题

## Status
PLANNED / IN_PROGRESS / REVIEW / BLOCKED / DONE

## Stage
MVP

## Objective
本任务要实现的用户结果。

## Context
必要的背景信息。

## In Scope
- 当前任务必须完成的内容。

## Out of Scope
- 当前任务明确不处理的内容。

## Acceptance Criteria
- [ ] 可客观验证的验收条件。

## Implementation Constraints
- 不允许改变的架构或行为。

## Planned Approach
Trae 根据实际仓库形成的最小实现方案。

## Changed Files
完成后填写。

## Verification
完成后填写实际运行的命令和结果。

## Known Limitations
当前实现已知但不阻塞 MVP 的问题。

## Review History
记录 GPT 审查结果。

## Final Result
最终状态和相关 PR。
```

状态流转（见改造方案第 16 节）：

```text
PLANNED → IN_PROGRESS → REVIEW → DONE
```

特殊状态：`BLOCKED`、`CANCELLED`。Lumen V2 场景下还包含 `ready_for_trae`、`awaiting_gpt_acceptance`、`changes_requested`、`awaiting_user_decision`、`complete` 等状态（见 `AGENTS.md` 的 Lumen V2 状态机）。不得在代码尚未验证或尚未提交 PR 时标记为 `DONE`。

---

## 8. 异常情况处理

### 8.1 任务范围不断扩大

如果执行中发现需要增加大量额外功能，不应继续扩展当前任务。应：

1. 完成能够独立交付的当前部分。
2. 记录新增需求。
3. 建议拆分新的 TASK。
4. 让 GPT 重新定义范围或由用户裁决。

### 8.2 GPT 反复提出新细节

Trae 应检查新意见是否属于以下四类：

- 新发现的真实 P0。
- 原 P0 修复导致的直接回归。
- 与当前任务无关的全仓库问题。
- 代码偏好或优化建议。

只有前两类可以继续阻塞当前任务；后两类应记录为 P1/P2 或忽略，不在当前任务中处理。

### 8.3 任务包基于旧代码

如果 GPT 引用的 branch、commit 或文件状态已过期：

- 不要根据旧状态修改。
- 明确指出最新 commit。
- 请求 GPT 基于最新 PR 重新读取。
- 必要时记录审查基线。

---

## 附：协议维护

- 本协议格式契约由 GPT 与 Trae 共同遵守，任何一方不得单方面修改字段定义。
- 如需扩展字段（如新增 `risks`、`dependencies`），应通过 ADR 记录决策，并同步更新本文件与 `COLLABORATION-BLUEPRINT.md`。
- 本文件与 `docs/ai/COLLABORATION-BLUEPRINT.md`、`docs/ai/REVIEW_POLICY.md`、`docs/ai/TRAE_COLLABORATION_GUIDE.md` 共同构成协作规范体系，遇冲突以 `AGENTS.md` 为最终裁决依据。
