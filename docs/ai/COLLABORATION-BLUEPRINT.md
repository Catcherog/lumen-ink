<!--
权威来源说明：
本文件是 Trae AI 与 GPT 长期协作机制的协作蓝图权威来源。
原始文件：根目录 `改造方案.txt`（已于 2026-07-16 迁移至此，原文件已删除）
迁移原因：根目录仅允许 README.md、构建工具配置和 AGENTS.md（见 .trae/rules/_core.md）
后续如需修改协作规范，请直接编辑本文件，不要在根目录重建 .txt 版本。
-->

# Trae 与 GPT 长期协作规范

## 1. 协作目标

本项目采用以下协作分工：

* GPT负责需求分析、方案设计、任务拆解、验收标准和代码审查。
* Trae负责读取和修改项目文件、执行命令、运行测试、维护Git分支、提交代码、创建或更新PR，以及维护项目文档。
* GitHub仓库是项目状态、需求、决策和实现结果的唯一事实来源。
* 聊天记录、模型记忆和临时口头说明只作为操作输入，不作为长期项目事实。

整个机制的目标是：

1. 即使GPT和Trae不断开启新窗口，仍然能够恢复完整项目上下文。
2. 避免由用户在GPT和Trae之间反复复制代码文件。
3. 将每个任务控制在明确范围内，优先完成MVP。
4. 防止代码审查因非关键细节无限延长。
5. 所有任务、决策、验证结果和技术债都能够在GitHub中追溯。

---

# 2. 角色与权限

## 2.1 GPT的角色

GPT是项目的规划者和可读写本地的审查者。

GPT负责：

* 理解用户目标。
* 分析当前仓库状态。
* 设计任务范围。
* 定义验收标准。
* 指出实现约束。
* 阅读GitHub中的代码、任务文件、提交和PR。
* 根据MVP审查规则进行验收。
* 区分阻塞问题和非阻塞技术债。
* 输出标准化的任务包或修复包。

GPT不能：

* 修改GitHub内容。
* 修改本地文件。
* 执行Git提交。
* 直接维护任务状态。
* 将审查建议直接落库。

因此，GPT给出的任务说明、审查结论和技术债，GPT可直接写入本地文件，Git提交（commit/push）由Trae负责。

## 2.2 Trae的角色

Trae是项目的执行者和仓库状态维护者。

Trae负责：

* 读取仓库中的长期项目上下文。
* 将GPT提供的任务包转化为正式任务文件。
* 创建和管理Git分支。
* 修改项目代码和配置文件。
* 运行构建、测试、Lint、类型检查和其他验证命令。
* 创建commit、push分支以及创建或更新PR。
* 更新任务状态、实现记录和验证结果。
* 维护项目当前状态、架构决策和技术债。
* 修复GPT确认的MVP阻塞问题。
* 在实现内容与现有仓库事实冲突时进行识别和记录。

Trae不得把GPT输出视为绝对正确。GPT输出是任务输入，GitHub中的最新代码、已接受决策和用户明确决定具有更高优先级。

## 2.3 用户的角色

用户是产品负责人和最终裁决者。

以下情况必须交由用户决定：

* GPT任务说明与现有架构决策冲突。
* GPT与Trae对需求范围理解不同。
* 需要修改已接受的架构决策。
* 任务执行需要明显扩大范围。
* 存在多个影响产品行为的合理方案。
* 为完成任务必须破坏兼容性或迁移数据。
* 安全、成本、交付速度之间存在重大取舍。

---

# 3. 唯一事实来源

## 3.1 GitHub是唯一事实来源

以下内容只有在进入GitHub后，才视为正式项目状态：

* 产品当前阶段。
* 已确认需求。
* 当前任务。
* 验收标准。
* 架构决策。
* 实现情况。
* 测试结果。
* 技术债。
* 审查结论。
* 分支和PR状态。

以下内容不是长期事实来源：

* GPT历史对话。
* Trae历史对话。
* 模型记忆。
* 用户粘贴但尚未落库的内容。
* 未提交的临时说明。
* 未经验证的模型判断。

当聊天内容和仓库内容冲突时，按以下优先级处理：

1. 用户最新明确决定。
2. 已接受的任务规格。
3. 已接受的架构决策。
4. GitHub当前代码和配置。
5. 模型建议。

---

# 4. 建议的仓库结构

```text
AGENTS.md

docs/ai/
├── PROJECT_STATE.md
├── REVIEW_POLICY.md
├── TECH_DEBT.md
├── TRAE_COLLABORATION_GUIDE.md
├── decisions/
│   ├── ADR-001.md
│   ├── ADR-002.md
│   └── ...
└── tasks/
    ├── TASK-001.md
    ├── TASK-002.md
    └── ...
```

如项目已经存在类似目录，应优先复用，不要为了形式重复建立多套文档。

---

# 5. 每次新窗口的启动流程

Trae每次开启新窗口或重新接手任务时，必须按照以下顺序恢复上下文。

## 第一步：读取入口文件

首先读取：

```text
AGENTS.md
```

该文件应说明：

* 项目当前阶段。
* GPT与Trae的角色。
* 必须读取的项目文件。
* 当前任务位置。
* 项目事实来源。
* 基本执行规则。

## 第二步：读取项目当前状态

读取：

```text
docs/ai/PROJECT_STATE.md
```

重点确认：

* 当前产品阶段。
* 当前版本或里程碑。
* 已完成内容。
* 正在进行的任务。
* 下一优先级。
* 已知风险。
* 当前阻塞项。

## 第三步：读取审查规则

读取：

```text
docs/ai/REVIEW_POLICY.md
```

重点确认：

* 当前是MVP、稳定化还是生产强化阶段。
* 哪些问题属于P0、P1、P2。
* 哪些问题可以阻塞合并。
* GPT复审范围。
* 当前任务的停止条件。

## 第四步：读取相关决策

读取：

```text
docs/ai/decisions/
```

只读取和当前任务相关的ADR，不需要每次读取所有决策。

## 第五步：读取当前任务

读取：

```text
docs/ai/tasks/TASK-xxx.md
```

确认：

* Objective。
* In Scope。
* Out of Scope。
* Acceptance Criteria。
* Implementation Constraints。
* 当前状态。
* 已有实现记录。
* 已有审查结果。

## 第六步：检查Git状态

开始修改之前至少检查：

```bash
git status
git branch --show-current
git log -1 --oneline
```

并确认：

* 当前分支是否正确。
* 是否存在未提交修改。
* 是否有用户文件或其他任务残留。
* 当前代码是否与任务包中的基线一致。

不得在不了解当前Git状态的情况下直接修改文件。

---

# 6. GPT任务包的处理方式

GPT会向Trae提供标准化任务包。任务包可能使用YAML、Markdown或结构化文本。

典型格式如下：

```yaml
packet_type: TASK
task_id: TASK-014
stage: MVP
title: Implement email/password login

objective:
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

收到任务包后，Trae不得立即盲目执行，必须先完成以下检查。

## 6.1 仓库一致性检查

确认：

* `task_id`是否与现有任务重复。
* GPT引用的文件、模块和接口是否存在。
* GPT对当前架构的理解是否正确。
* 任务是否与已接受ADR冲突。
* 验收条件是否可以客观验证。
* 任务范围是否明显大于一个合理的独立交付单元。
* 是否存在明显缺失但会导致无法执行的信息。

## 6.2 冲突处理

如果GPT任务包与仓库存在轻微措辞差异，但目标明确，可以根据仓库事实进行修正，并在任务文件中记录修正。

如果存在重大冲突，不得自行选择方案。应记录：

```markdown
## Execution Conflict

### GPT Instruction
原始任务要求。

### Repository Evidence
仓库中发现的实际情况。

### Impact
为什么不能直接执行。

### Decision Required
需要用户决定的问题。
```

然后停止扩大修改范围。

## 6.3 将任务包正式落库

确认任务可执行后，由Trae创建或更新：

```text
docs/ai/tasks/TASK-xxx.md
```

建议任务文件结构如下：

```markdown
# TASK-014: 任务标题

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
Trae根据实际仓库形成的最小实现方案。

## Changed Files
完成后填写。

## Verification
完成后填写实际运行的命令和结果。

## Known Limitations
当前实现已知但不阻塞MVP的问题。

## Review History
记录GPT审查结果。

## Final Result
最终状态和相关PR。
```

---

# 7. 实现原则

## 7.1 最小满足原则

Trae应优先选择能够满足验收标准的最小实现。

不得因为以下理由自行扩大任务：

* 代码可以更优雅。
* 可以顺便重构。
* 未来可能需要。
* 可以增加更多功能。
* 可以统一整个项目的写法。
* 当前模块看起来不够完美。

除非不处理相关问题就无法满足验收标准，否则应避免：

* 大范围重命名。
* 大范围目录迁移。
* 更换框架或核心库。
* 重写已有模块。
* 修改无关页面。
* 重构无关公共组件。
* 添加没有被任务要求的配置系统。
* 为假设中的未来场景设计复杂抽象。

## 7.2 范围控制

每次修改前应明确回答：

1. 该修改对应哪条验收标准？
2. 不修改它会导致什么具体失败？
3. 它是否属于当前任务范围？
4. 它是否会影响无关模块？

如果无法回答，应暂停该修改。

## 7.3 不得隐式改变产品行为

以下改变必须明确记录，必要时请求用户决定：

* API请求或响应格式改变。
* 数据库结构改变。
* 用户流程改变。
* 默认配置改变。
* 权限规则改变。
* 错误处理语义改变。
* 数据兼容性改变。
* 部署要求改变。
* 外部依赖增加。
* 运行成本明显增加。

## 7.4 不覆盖用户未提交内容

发现工作区存在不属于当前任务的未提交修改时：

* 不得直接覆盖。
* 不得擅自丢弃。
* 不得执行破坏性reset。
* 不得把无关修改混入当前commit。

应先识别修改来源，并隔离当前任务。

---

# 8. Git工作方式

## 8.1 分支

每个独立任务应使用独立分支，例如：

```text
feature/task-014-login
fix/task-014-auth-error
```

除非用户明确允许，不应直接在主分支修改。

## 8.2 提交原则

提交应具备：

* 单一目的。
* 可理解的提交信息。
* 不包含无关文件。
* 不包含密钥和本地配置。
* 不包含无必要的大型生成文件。
* 尽量保持可回滚。

建议格式：

```text
TASK-014: implement email password login
```

必要时在提交正文中记录：

```text
- Added login form and API integration
- Persisted authentication state
- Added invalid-credential handling
- Verified build and auth tests
```

## 8.3 禁止提交的内容

需要结合项目实际`.gitignore`处理，通常包括：

* `.env`
* API密钥
* 私钥
* Token
* 本地数据库
* 临时日志
* 编辑器缓存
* 用户个人配置
* 构建缓存
* 未要求提交的大型产物

提交前应检查：

```bash
git status
git diff --staged
```

## 8.4 Push和PR

任务实现并验证后：

1. 更新任务文件。
2. 提交代码。
3. Push到远程分支。
4. 创建或更新PR。
5. 在PR说明中引用任务ID。
6. 写明测试结果和已知限制。

PR说明建议包含：

```markdown
## Task
TASK-014

## Objective
本次修改解决的问题。

## Changes
主要修改内容。

## Verification
实际执行的命令和结果。

## Known Debt
不阻塞当前MVP的问题。

## Out of Scope
明确未实现的内容。
```

---

# 9. 验证规则

## 9.1 只能报告实际执行的验证

Trae不得声称：

* “测试通过”
* “构建正常”
* “没有问题”
* “应该可以工作”

除非相关命令实际运行并获得结果。

验证记录应包含：

```markdown
## Verification

### Command
`npm test`

### Result
PASS

### Evidence
42 tests passed, 0 failed.
```

## 9.2 无法执行验证时

如果因为环境、权限、依赖或外部服务导致无法验证，必须明确写出：

```markdown
### Not Executed
`npm run e2e`

### Reason
本地环境没有测试账号，且测试服务不可访问。

### Alternative Verification
完成了类型检查和相关单元测试。

### Remaining Risk
真实登录服务的端到端流程尚未验证。
```

不得用替代验证冒充完整验证。

## 9.3 推荐验证顺序

根据项目实际情况，通常依次执行：

1. 格式检查。
2. Lint。
3. 类型检查。
4. 相关单元测试。
5. 相关集成测试。
6. 构建。
7. 必要的手工流程验证。

不要为了一个小任务默认运行耗时极高且无关的全量测试，除非项目规则或风险要求。

---

# 10. GPT审查结论的处理

GPT审查结果分为：

* `MVP_PASS`
* `MVP_PASS_WITH_DEBT`
* `MVP_FAIL`

## 10.1 MVP_PASS

含义：

* 验收标准已经满足。
* 没有P0阻塞问题。
* 当前任务可以合并。

Trae应：

1. 将审查结论记录到任务文件。
2. 确认CI状态。
3. 按项目流程合并或等待用户合并。
4. 更新`PROJECT_STATE.md`。
5. 将任务状态改为`DONE`。

## 10.2 MVP_PASS_WITH_DEBT

含义：

* 验收标准已经满足。
* 没有P0阻塞问题。
* 存在P1技术债，但不阻塞当前MVP。

Trae应：

1. 将审查结论记录到任务文件。
2. 把有效技术债写入`TECH_DEBT.md`。
3. 不在当前任务中顺手修复技术债。
4. 按正常流程完成当前任务。

## 10.3 MVP_FAIL

含义：

* 存在明确P0问题。
* 当前任务不能通过验收。

GPT通常会提供`FIX_PACKET`。

Trae只修复明确列出的P0问题及其直接回归，不主动处理P1和P2。

---

# 11. GPT修复包的处理

典型修复包：

```yaml
packet_type: FIX
task_id: TASK-014
review_target:
  pull_request: 38
  commit: b74c230

verdict: MVP_FAIL

blockers:
  - id: P0-01
    evidence: Invalid credentials still persist auth state
    impact: User may be incorrectly treated as logged in
    violated_criterion: Incorrect credentials show an error
    minimum_fix:
      - Do not persist auth state on failed login
    verification:
      - Add invalid-password test
      - Run auth tests
```

Trae收到修复包后：

1. 确认GPT审查的commit是否仍然是当前版本。
2. 检查证据是否成立。
3. 将审查结果追加到任务文件。
4. 只处理列出的P0。
5. 运行指定验证以及必要的直接回归验证。
6. 更新同一个PR。
7. 更新任务验证记录。
8. 提交新的commit并push。

如果GPT证据与实际代码不符，应记录：

```markdown
## Disputed Finding

### Finding
P0-01

### GPT Evidence
GPT引用的证据。

### Repository Evidence
当前代码中的实际情况。

### Assessment
该问题不存在、已经修复，或者审查基于旧commit。

### Requested Action
请基于最新commit重新审查。
```

不得为了迎合审查结论而修改本来正确的代码。

---

# 12. P0、P1和P2分类

## 12.1 P0：阻塞问题

通常包括：

* 核心验收条件没有实现。
* 核心用户流程无法运行。
* 构建失败。
* 关键测试失败。
* 数据丢失或损坏。
* 明确安全漏洞。
* 权限绕过。
* 修改引入严重回归。
* 实现与任务要求直接矛盾。

P0必须在当前任务中解决。

## 12.2 P1：重要技术债

通常包括：

* 边界条件覆盖不足。
* 可维护性明显较差。
* 错误处理不完整。
* 缺少部分测试。
* 非核心性能问题。
* 内部MVP可以接受，但公开发布前应处理的问题。

P1应记录到`TECH_DEBT.md`，通常不阻塞MVP。

## 12.3 P2：优化建议

通常包括：

* 命名偏好。
* 代码风格偏好。
* 非必要抽象。
* 文件组织建议。
* UI微调。
* 推测性扩展设计。
* 与当前任务无关的重构。

P2不应阻塞当前任务，也不应由Trae默认执行。

---

# 13. 技术债管理

技术债建议统一维护在：

```text
docs/ai/TECH_DEBT.md
```

格式：

```markdown
## DEBT-021: 登录接口缺少限流

- Status: OPEN
- Severity: P1
- Introduced By: TASK-014
- Context: 当前为内部MVP。
- Risk: 公开发布后可能遭受暴力尝试。
- Reason Deferred: 当前阶段优先验证核心登录流程。
- Resolve Before: Public Beta
- Related Files:
  - src/auth/login.ts
```

Trae需要避免以下问题：

* 同一个技术债重复记录。
* 没有风险说明的模糊债务。
* 没有处理阶段的永久待办。
* 将纯代码风格偏好升级为重要债务。
* 在当前任务中无边界地顺手清债。

---

# 14. 项目状态维护

每个任务完成或状态发生重要变化时，Trae应更新：

```text
docs/ai/PROJECT_STATE.md
```

建议包含：

```markdown
# Project State

## Current Stage
MVP

## Current Milestone
完成核心用户闭环。

## In Progress
- TASK-015: ...

## Recently Completed
- TASK-014: 用户登录MVP，PR #38。

## Next Priorities
1. ...
2. ...

## Active Blockers
- 无。

## Known Risks
- ...

## Last Updated
2026-07-16
```

该文件只记录当前状态，不应变成完整历史日志。

详细历史应放在任务、PR和Git提交中。

---

# 15. 架构决策维护

当任务产生长期架构影响时，Trae应创建ADR。

例如：

```text
docs/ai/decisions/ADR-007.md
```

格式：

```markdown
# ADR-007: MVP阶段使用同步任务处理

## Status
Accepted

## Context
当前请求量较低，引入消息队列会增加部署复杂度。

## Decision
MVP阶段使用同步处理。

## Consequences
高负载时可能发生请求阻塞。

## Revisit When
单实例处理能力成为实际瓶颈时。

## Related Tasks
- TASK-020
```

不得把普通实现细节全部写成ADR。只有长期、跨任务、难以轻易逆转的决定才需要记录。

---

# 16. 任务状态流转

建议状态：

```text
PLANNED
   ↓
IN_PROGRESS
   ↓
REVIEW
   ↓
DONE
```

特殊状态：

```text
BLOCKED
CANCELLED
```

状态含义：

* `PLANNED`：任务已定义，尚未开始。
* `IN_PROGRESS`：正在修改和验证。
* `REVIEW`：已提交PR，等待GPT或用户验收。
* `BLOCKED`：存在无法由Trae自行解决的问题。
* `DONE`：已通过验收并完成合并。
* `CANCELLED`：用户明确取消。

不得在代码尚未验证或尚未提交PR时标记为`DONE`。

---

# 17. 完成任务后的标准回报

Trae完成任务后，应向用户提供简洁、结构化的结果。

建议格式：

```text
任务：TASK-014
状态：REVIEW
分支：feature/task-014-login
Commit：b74c230
PR：#38

已完成：
- 登录表单
- 登录API接入
- 登录状态持久化
- 受保护页面跳转

验证：
- npm run typecheck：通过
- npm test -- auth：通过，8项测试
- npm run build：通过

已知限制：
- 未实现忘记密码
- 未实现登录限流

下一步：
请让GPT按照AGENTS.md和REVIEW_POLICY.md审查PR #38。
```

用户只需把PR编号告知GPT，无需复制代码文件。

---

# 18. 异常情况处理

## 18.1 任务范围不断扩大

如果执行中发现需要增加大量额外功能，不应继续扩展当前任务。

应：

1. 完成能够独立交付的当前部分。
2. 记录新增需求。
3. 建议拆分新的TASK。
4. 让GPT重新定义范围或由用户裁决。

## 18.2 GPT要求大范围重构

如果重构不是验收条件的必要前提：

* 不作为P0处理。
* 记录为P1或P2。
* 不在当前MVP任务中执行。

## 18.3 GPT反复提出新细节

Trae应检查新意见是否属于：

* 新发现的真实P0。
* 原P0修复导致的直接回归。
* 与当前任务无关的全仓库问题。
* 代码偏好或优化建议。

只有前两类可以继续阻塞当前任务。

## 18.4 任务包基于旧代码

如果GPT引用的branch、commit或文件状态已过期：

* 不要根据旧状态修改。
* 明确指出最新commit。
* 请求GPT基于最新PR重新读取。
* 必要时记录审查基线。

## 18.5 测试失败但与当前任务无关

应先验证失败是否由当前修改引起。

如果是已有失败：

* 记录失败证据。
* 说明当前分支和基线分支均失败。
* 不擅自修复无关问题。
* 根据项目规则判断是否阻塞。

如果是当前修改引起，必须修复。

## 18.6 发现安全或数据损坏风险

即使不在原任务范围内，也必须立即停止相关发布或合并，并清楚报告。

安全和数据完整性问题不能因为“MVP优先”而忽略。

---

# 19. Trae必须遵守的核心规则

1. 每次新窗口先读取`AGENTS.md`及其引用文件。
2. GitHub是唯一长期事实来源。
3. GPT负责规划和验收，Trae负责执行和落库。
4. GPT输出不能自动覆盖仓库中的已接受事实。
5. 只实现当前任务的`In Scope`。
6. 不主动实现`Out of Scope`。
7. 优先采用满足验收条件的最小修改。
8. 不进行与当前任务无关的大范围重构。
9. 不声称运行过未实际运行的测试。
10. 测试无法执行时必须记录原因和剩余风险。
11. 每项修改都应能够对应当前任务或明确阻塞问题。
12. GPT给出`MVP_FAIL`时，只修复P0和直接回归。
13. P1和P2默认记录，不在当前任务中顺手处理。
14. 发现指令与仓库冲突时，不盲目执行。
15. 重大产品或架构取舍必须由用户裁决。
16. 不覆盖、不删除、不混入用户或其他任务的未提交修改。
17. 提交前检查diff、敏感信息和无关文件。
18. 完成后更新任务、验证记录、项目状态和相关技术债。
19. 每个任务必须形成可审计的分支、commit或PR记录。
20. 验收通过后及时结束任务，不进行无限细节优化。

---

# 20. 标准协作循环

整个项目按照以下循环执行：

```text
1. 用户向GPT提出目标
2. GPT读取GitHub项目上下文
3. GPT生成TASK_PACKET
4. 用户将TASK_PACKET一次性发送给Trae
5. Trae检查任务与仓库是否一致
6. Trae将确认后的任务正式写入GitHub
7. Trae创建分支并实施最小修改
8. Trae运行验证
9. Trae更新任务文件并创建PR
10. 用户将PR编号告知GPT
11. GPT进行验收（可直接读取本地项目文件）
12. GPT返回：
    - MVP_PASS
    - MVP_PASS_WITH_DEBT
    - MVP_FAIL和FIX_PACKET
13. Trae只处理P0修复
14. GPT复核原P0及直接回归
15. 通过后合并
16. Trae更新PROJECT_STATE.md
```

每个任务的人工信息传递应尽量控制为：

```text
GPT → Trae：一个完整任务包或修复包
Trae → GPT：任务编号、PR编号和最新commit
```

不再由用户手工复制项目文件或代码。

---

# 21. 当前阶段的首要原则

当前项目优先完成MVP。

MVP阶段的目标是：

* 核心用户流程可以运行。
* 关键数据正确。
* 没有明确安全漏洞。
* 没有严重回归。
* 构建和关键测试通过。
* 验收条件得到满足。

MVP阶段不追求：

* 完美架构。
* 完整扩展性。
* 全量自动化测试。
* 所有边界条件一次解决。
* 全项目代码风格统一。
* 非核心UI细节。
* 为未来假设需求提前重构。

当验收条件满足且不存在P0问题时，应结束当前任务。其他改进应进入技术债或后续任务，而不是继续无限修改。
