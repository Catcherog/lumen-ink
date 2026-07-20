<!--
  模板用途：权限矩阵文件，明确 GPT、Trae、用户三方权限边界
  来源：改造方案第 2 节、AGENTS.md 第 2 节
-->

# 权限矩阵 — 光砚 Lumen Ink V2 (picture-edit)

## 1. 三方权限总览

下表汇总 GPT、Trae、用户三方在项目协作中的能力边界。图例：✅ 允许 / ❌ 禁止 / ⚠️ 需授权或最终裁决。

| 能力 | GPT | Trae | 用户 |
| --- | --- | --- | --- |
| 读取 GitHub 代码/任务/PR/提交 | ✅ | ✅ | ✅ |
| 修改 GitHub 内容 | ❌ | ✅ | ⚠️ |
| 创建 Git 分支 | ❌ | ✅ | ⚠️ |
| 执行 Git 提交 | ❌ | ✅ | ⚠️ |
| Push 到远程分支 | ❌ | ✅ | ⚠️ |
| 创建/更新 PR | ❌ | ✅ | ⚠️ |
| 合并 PR 到 main | ❌ | ⚠️ | ✅ |
| 读取本地文件 | ✅ | ✅ | ✅ |
| 修改本地文件 | ✅ | ✅ | ⚠️ |
| 执行命令（构建/测试/Lint） | ❌ | ✅ | ⚠️ |
| 维护任务状态（STATE.json） | ❌ | ✅ | ⚠️ |
| 自行验收任务 | ✅ | ❌ | ⚠️ |
| 创建下一项 active task | ✅ | ❌ | ⚠️ |
| 推进任务到 completed | ✅ | ❌ | ⚠️ |
| 商业目标决策 | ❌ | ❌ | ✅ |
| 预算决策 | ❌ | ❌ | ✅ |
| 账号权限管理 | ❌ | ❌ | ✅ |
| 生产发布 | ❌ | ⚠️ | ✅ |
| 不可逆决策（如破坏兼容性、数据迁移） | ❌ | ❌ | ✅ |

说明：
- GPT 可直接读取和修改本地项目文件，但 Git 提交（commit/push）由 Trae 负责，GPT 不得直接操作远程仓库。
- Trae 的"⚠️"表示需 GPT 验收通过或用户授权后方可执行（如合并 PR、生产发布）。
- 用户的"⚠️"表示可通过 Trae 代为执行或直接操作，但通常委托给 Trae。

## 2. GPT 权限边界详细说明

### 2.1 本地文件读写与 GitHub 只读权限

GPT 是项目的规划者和可读写本地的审查者。GPT 可：
- 读取本地项目文件（代码、配置、文档、任务文件等）。
- 修改本地项目文件（遇到难度大的问题可直接修改）。
- 读取 GitHub 中的代码、配置和文档。
- 读取任务文件（`docs/ai/tasks/`、`docs/lumen-v2/tasks/`）。
- 读取 PR、提交、分支状态。
- 读取已接受的架构决策（ADR）。

### 2.2 禁止行为

GPT 不得：
- 执行 Git 提交（commit/push）。
- 直接操作远程仓库（创建分支、push、创建 PR 等）。
- 直接维护任务状态（STATE.json 的写入由 Trae 落库）。
- 将审查建议直接落库到远程仓库。

### 2.3 分工边界

- GPT 可直接读取本地项目文件进行审计，遇到难度大的问题可直接修改本地文件。
- Git 提交（commit/push）仍由 Trae 负责，正常执行仍由 Trae 负责。
- GPT 修改的本地文件由 Trae 确认后提交。
- GPT 给出的任务说明、审查结论和技术债，可直接写入本地文件，由 Trae 确认后提交到远程仓库。

### 2.4 验收输出

GPT 审查结论只能为以下三种之一（定义见 `docs/ai/REVIEW_POLICY.md`）：

- `MVP_PASS`：验收标准已满足、无 P0 阻塞问题、当前任务可以合并。
- `MVP_PASS_WITH_DEBT`：验收标准已满足、无 P0 阻塞问题、存在 P1 技术债但不阻塞当前 MVP。
- `MVP_FAIL`：存在明确 P0 问题，当前任务不能通过验收，通常附带 `FIX_PACKET`。

GPT 在 `nextActor=gpt` 时执行正式验收或架构任务。

## 3. Trae 权限边界详细说明

### 3.1 仓库与本地权限

Trae 拥有 GitHub 读写权限和本地文件读写权限。Trae 可执行：
- 创建和管理 Git 分支。
- 执行 Git 提交、push 到远程分支。
- 创建或更新 PR。
- 修改项目代码、配置文件和文档。
- 运行构建、测试、Lint、类型检查等验证命令。
- 维护任务状态、实现记录和验证结果。

### 3.2 禁止行为

Trae 不得：
- 自行验收任务（验收由 GPT 负责）。
- 把任务移动到 `completed`。
- 创建下一项 active task。
- 把 GPT 输出视为绝对正确（GPT 输出是任务输入，GitHub 中的最新代码、已接受决策和用户明确决定具有更高优先级）。
- 在无明确任务时顺手重构或升级依赖。

### 3.3 状态流转权限

Trae 可把任务状态从以下状态推进：
- `ready_for_trae` → `awaiting_gpt_acceptance`（实施完成提交验收）。
- `ready_for_trae` → `blocked`（遇到无法自行解决的阻塞）。
- `changes_requested` → `awaiting_gpt_acceptance`（修复 P0 后重新提交）。
- `changes_requested` → `blocked`（修复过程中遇到阻塞）。

### 3.4 生产代码修改约束

- 生产代码修改必须与当前任务 ID 一一对应。
- 一个 PR 只对应一个任务 ID。
- 提交信息建议：`feat(lumen-v2): <TASK-ID> implementation`。
- PR 必须通过 `.github/workflows/lumen-v2-collab-check.yml`。
- 禁止 force-push 到受保护主分支。

## 4. 用户决策边界详细说明

用户是产品负责人和最终裁决者，负责商业目标、预算、账号权限、生产发布和不可逆决策。以下情况必须交由用户决定：

- GPT 任务说明与现有架构决策冲突。
- GPT 与 Trae 对需求范围理解不同。
- 需要修改已接受的架构决策。
- 任务执行需要明显扩大范围。
- 存在多个影响产品行为的合理方案。
- 为完成任务必须破坏兼容性或迁移数据。
- 安全、成本、交付速度之间存在重大取舍。

`nextActor=user` 时，任何 AI 不得替用户猜测并继续实施。

## 5. 任务状态流转权限矩阵

下表说明谁可以把任务状态从当前状态推进到目标状态。图例：✅ 允许 / ❌ 禁止 / ⚠️ 需授权或最终裁决。

| 当前状态 | 目标状态 | GPT | Trae | 用户 |
| --- | --- | --- | --- | --- |
| `ready_for_trae` | `awaiting_gpt_acceptance` | ❌ | ✅ | ⚠️ |
| `ready_for_trae` | `blocked` | ❌ | ✅ | ⚠️ |
| `changes_requested` | `awaiting_gpt_acceptance` | ❌ | ✅ | ⚠️ |
| `changes_requested` | `blocked` | ❌ | ✅ | ⚠️ |
| `awaiting_gpt_acceptance` | `ready_for_trae`（下一任务） | ✅ | ❌ | ⚠️ |
| `awaiting_gpt_acceptance` | `changes_requested` | ✅ | ❌ | ⚠️ |
| `awaiting_gpt_acceptance` | `awaiting_user_decision` | ✅ | ❌ | ⚠️ |
| `awaiting_user_decision` | 任意状态 | ❌ | ❌ | ✅ |
| `blocked` | 任意状态 | ❌ | ❌ | ✅ |

说明：
- GPT 的"✅"为推进决定权（通过 `MVP_PASS` / `MVP_FAIL` / 请求用户决策触发），实际 `STATE.json` 写入由 Trae 落库。
- Trae 的"✅"为实施完成后自行推进的执行权。
- `awaiting_user_decision` 与 `blocked` 状态的解除只能由用户决定。

## 6. 例外与边界情况

- **GPT 执行时机**：GPT 在 `nextActor=gpt` 时执行正式验收或架构任务，其他时机不得推进状态。
- **Trae 执行时机**：Trae 在 `nextActor=trae` 且状态为 `ready_for_trae` 或 `changes_requested` 时才能实施，其他状态不得擅自修改生产代码。
- **用户决策时机**：`nextActor=user` 时，任何 AI 不得替用户猜测并继续实施，必须等待用户明确决定。
- **安全与数据完整性**：即使不在当前任务范围内，发现安全或数据损坏风险时必须立即停止相关发布或合并，并清楚报告。安全和数据完整性问题不能因为"MVP 优先"而忽略。
- **冲突处理优先级**（见 `AGENTS.md`）：用户明确决定 > 已接受任务规格 > 已接受 ADR > 本地工作区或 GitHub 当前代码（本地有未 push 修改时以本地为准）> 模型建议。

## 7. 相关文件

- `AGENTS.md` — AI 协作合约与 Lumen V2 状态机
- `docs/ai/COLLABORATION-BLUEPRINT.md` — Trae 与 GPT 长期协作规范（第 2 节角色与权限）
- `docs/ai/REVIEW_POLICY.md` — 审查规则与 P0/P1/P2 分级
- `docs/ai/TRAE_COLLABORATION_GUIDE.md` — Trae 执行手册
- `docs/lumen-v2/state/STATE.json` — Lumen V2 详细任务状态
