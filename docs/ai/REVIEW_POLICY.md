<!--
  模板用途：审查规则文件，定义审查阶段、问题分级与停止条件。
  来源改造方案章节：第 10 节、第 12 节、第 21 节。
-->

# Review Policy — 光砚 Lumen Ink V2 (picture-edit)

## 阶段定义

本项目的审查规则按阶段区分（见改造方案第 12 节、第 21 节）：

- **MVP 阶段**：优先完成核心用户流程可运行、关键数据正确、无明确安全漏洞、无严重回归、构建和关键测试通过、验收条件满足。不追求完美架构、完整扩展性、全量自动化测试或所有边界条件一次解决。
- **稳定化阶段**：在 MVP 通过后，补齐边界条件、错误处理、关键测试覆盖，处理 MVP 阶段登记的 P1 技术债。
- **生产强化阶段**：面向公开发布，处理性能、安全加固、可观测性、容量规划等。

当前阶段：工程基线阶段（engineering-baseline）。当前目标是让 lint / typecheck / test / build 全部可执行且通过，为 UI 改造与 P0 实施奠基。该阶段对应 Lumen V2 的 BASE-001 任务，验收口径与 MVP 阶段一致：基线未恢复前禁止产品改版。

## P0 阻塞问题定义

P0 必须在当前任务中解决。通常包括：

- 核心验收条件没有实现。
- 核心用户流程无法运行。
- 构建失败。
- 关键测试失败。
- 数据丢失或损坏。
- 明确安全漏洞。
- 权限绕过。
- 修改引入严重回归。
- 实现与任务要求直接矛盾。

## P1 重要技术债定义

P1 应记录到 `TECH_DEBT.md`，通常不阻塞 MVP。通常包括：

- 边界条件覆盖不足。
- 可维护性明显较差。
- 错误处理不完整。
- 缺少部分测试。
- 非核心性能问题。
- 内部 MVP 可以接受，但公开发布前应处理的问题。

## P2 优化建议定义

P2 不应阻塞当前任务，也不应由 Trae 默认执行。通常包括：

- 命名偏好。
- 代码风格偏好。
- 非必要抽象。
- 文件组织建议。
- UI 微调。
- 推测性扩展设计。
- 与当前任务无关的重构。

## 阻塞合并规则

- **P0**：必须解决才能合并。
- **P1**：记录到 `docs/ai/TECH_DEBT.md`，不阻塞当前 MVP 合并。
- **P2**：不阻塞合并，Trae 不默认执行。

## GPT 复审范围

GPT 进行验收（可直接读取本地项目文件），遇到难度大的问题可直接修改本地文件。Git 提交仍由 Trae 负责。GPT 审查结论只能为以下三种之一：

- `MVP_PASS`：验收标准已满足、无 P0 阻塞问题、当前任务可以合并。
- `MVP_PASS_WITH_DEBT`：验收标准已满足、无 P0 阻塞问题、存在 P1 技术债但不阻塞当前 MVP。
- `MVP_FAIL`：存在明确 P0 问题，当前任务不能通过验收。GPT 通常会附带 `FIX_PACKET`。

## 当前任务停止条件

当满足以下两个条件时，应结束当前任务：

1. 验收条件已满足。
2. 不存在 P0 问题。

其他改进应进入技术债或后续任务，而不是继续无限修改。

## 项目特定补充规则

本项目同时运行 Lumen V2 状态机（定义于 `AGENTS.md` 第 3 节与 `docs/lumen-v2/`）。改造方案 P0 / P1 / P2 分级与 Lumen V2 状态机并存，二者通过以下方式整合：

### Lumen V2 状态机

允许状态：

- `ready_for_trae`
- `awaiting_gpt_acceptance`
- `changes_requested`
- `awaiting_user_decision`
- `blocked`
- `complete`

标准流转：

```text
ready_for_trae
  → Trae 实施
awaiting_gpt_acceptance
  → GPT 验收通过 → 下一任务 ready_for_trae（状态推进至 complete）
  → GPT 驳回 → changes_requested
  → 需要用户决策 → awaiting_user_decision
awaiting_user_decision / blocked
  → 用户决策或解除阻塞后回到对应状态
```

### 执行者判定

Lumen V2 的 `STATE.json.nextActor` 字段（取值 `trae` / `gpt` / `user`）决定当前执行者：

- `nextActor=trae`：Trae 可开始或继续实施。
- `nextActor=gpt`：等待 GPT 验收或架构任务，Trae 不得自行推进。
- `nextActor=user`：等待用户决策，任何 AI 不得替用户猜测并继续实施。

### 与改造方案验收结论的对应

GPT 验收输出 `MVP_PASS` / `MVP_PASS_WITH_DEBT` / `MVP_FAIL` 时，对应 Lumen V2 状态从 `awaiting_gpt_acceptance` 推进：

- `MVP_PASS` → 任务归档至 `tasks/completed/`，从 `tasks/backlog/` 激活下一任务，新任务进入 `ready_for_trae`，原任务进入 `complete`。
- `MVP_PASS_WITH_DEBT` → 同上，但 P1 技术债同步写入 `docs/ai/TECH_DEBT.md`，不在当前任务中顺手修复。
- `MVP_FAIL` → 状态推进至 `changes_requested`，Trae 只修复 GPT 在 `FIX_PACKET` 中列出的 P0 问题及其直接回归，不主动处理 P1 和 P2。

### 优先级声明

Lumen V2 状态机是任务流转的唯一来源；改造方案 P0 / P1 / P2 分级是审查结论分级的唯一依据。两者不冲突：状态机回答「现在该谁做什么」，分级回答「这个问题能否阻塞合并」。冲突时按 `AGENTS.md` 的事实来源优先级处理。
