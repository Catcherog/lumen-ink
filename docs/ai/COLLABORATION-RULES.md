<!--
  模板用途：协作规则单一权威入口，整合角色边界、权限矩阵、任务交接协议、冲突解决流程、
            Git 规则、验证规则、技术债管理、实现原则、任务状态流转、GPT 审查结论处理、
            P0/P1/P2 分级、Trae 核心规则。
  来源：改造方案全文章节索引（COLLABORATION-BLUEPRINT.md 第 1-21 节、AGENTS.md、
        REVIEW_POLICY.md、PERMISSION-MATRIX.md、TASK-HANDOFF-PROTOCOL.md、
        CONFLICT-RESOLUTION.md、TECH_DEBT.md）。
  章节索引：
    1. 文档头（本注释）
    2. 文档定位声明
    3. 角色边界（← 改造方案第 2 节）
    4. 任务交接协议（→ TASK-HANDOFF-PROTOCOL.md）
    5. 冲突解决流程（→ CONFLICT-RESOLUTION.md）
    6. Git 规则（← 改造方案第 8 节、AGENTS.md 第 5 节）
    7. 验证规则（← 改造方案第 9 节）
    8. 技术债管理（→ TECH_DEBT.md）
    9. 实现原则（← 改造方案第 7 节）
    10. 任务状态流转（← 改造方案第 16 节、Lumen V2 状态机）
    11. GPT 审查结论处理（← 改造方案第 10 节）
    12. P0/P1/P2 分级（→ REVIEW_POLICY.md）
    13. Trae 核心规则（← 改造方案第 19 节）
    14. 相关文件索引
-->

# 协作规则 — 光砚 Lumen Ink V2 (picture-edit)

## 1. 文档头

本文件是 GPT 与 Trae 长期协作规则的单一权威入口，整合角色边界、权限矩阵、任务交接协议、冲突解决流程、Git 规则、验证规则、技术债管理、实现原则、任务状态流转、GPT 审查结论处理、P0/P1/P2 分级与 Trae 核心规则。

**来源**：改造方案全文章节索引（详见 `docs/ai/COLLABORATION-BLUEPRINT.md`，原始文件 `改造方案.txt` 已于 2026-07-16 迁移）、`AGENTS.md`、`docs/ai/REVIEW_POLICY.md`、`docs/ai/PERMISSION-MATRIX.md`、`docs/ai/TASK-HANDOFF-PROTOCOL.md`、`docs/ai/CONFLICT-RESOLUTION.md`、`docs/ai/TECH_DEBT.md`。

---

## 2. 文档定位声明

### 2.1 单一权威入口

本文件是 GPT 与 Trae 长期协作规则的**单一权威入口**。其他文件（如 `TRAE_COLLABORATION_GUIDE.md`、`COLLABORATION-BLUEPRINT.md`）为执行摘要或背景资料，遇冲突以本文件为准。

### 2.2 与 AGENTS.md 的关系

- `AGENTS.md` 是项目入口，定义「新窗口启动读取顺序」「事实来源声明」「Lumen V2 契约（状态机、Git 规则、公开仓库安全边界、禁止行为）」。
- 本文件是协作规则的详细说明，对角色边界、任务交接、冲突解决、验证规则、技术债管理等内容进行展开。
- 两者冲突时，`AGENTS.md` 中的事实来源优先级声明为最终裁决依据。

### 2.3 docs/ai/ 与 docs/lumen-v2/ 的职责边界

| 目录 | 职责 | 内容 |
|------|------|------|
| `docs/ai/` | 通用协作骨架 | 角色、权限、P0/P1/P2、Git 原则、验证规则、技术债、协作规则入口 |
| `docs/lumen-v2/` | V2 项目特定实现 | 任务流转、状态机、规格、证据、决策日志、会话交接 |

### 2.4 引用约定

本文件对其他文件的引用遵循以下约定：

- 「详见 `XXX.md` 第 N 节」：指向其他文件的具体章节，本文件仅提供概览。
- 「整合自改造方案第 N 节」：内容来自 `COLLABORATION-BLUEPRINT.md` 对应章节，本文件为权威版本。
- 遇本文件与被引用文件冲突，以本文件为准；遇本文件与 `AGENTS.md` 冲突，以 `AGENTS.md` 事实来源优先级为准。

---

## 3. 角色边界

> 整合自改造方案第 2 节（`COLLABORATION-BLUEPRINT.md` 第 2 节）、`AGENTS.md` 第 2 节。详细权限矩阵详见 `PERMISSION-MATRIX.md`。

### 3.1 GPT：规划者和可读写本地的审查者

**职责**：

- 理解用户目标。
- 分析当前仓库状态。
- 设计任务范围，定义验收标准。
- 指出实现约束。
- 读取本地项目文件和 GitHub 中的代码、任务文件、提交和 PR。
- 根据 MVP 审查规则进行验收。
- 区分阻塞问题和非阻塞技术债。
- 输出标准化的任务包（`TASK_PACKET`）或修复包（`FIX_PACKET`）。
- 遇到难度大的问题，可直接修改本地文件。
- 只在 `nextActor=gpt` 时执行正式验收或架构任务。

**禁止行为**：

- 执行 Git 提交（commit/push）。
- 直接维护任务状态（STATE.json 的写入由 Trae 落库）。
- 将审查建议直接落库到远程仓库。
- 在证据不足时放行验收。

**分工边界**：GPT 可直接读取本地项目文件进行审计，遇到难度大的问题可直接修改本地文件。Git 提交（commit/push）仍由 Trae 负责，正常执行仍由 Trae 负责。GPT 修改的本地文件由 Trae 确认后提交。

### 3.2 Trae：执行者和仓库状态维护者

**职责**：

- 读取仓库中的长期项目上下文。
- 将 GPT 提供的任务包转化为正式任务文件。
- 创建和管理 Git 分支。
- 修改项目代码和配置文件。
- 运行构建、测试、Lint、类型检查和其他验证命令。
- 创建 commit、push 分支以及创建或更新 PR。
- 更新任务状态、实现记录和验证结果。
- 维护项目当前状态、架构决策和技术债。
- 修复 GPT 确认的 MVP 阻塞问题。
- 在实现内容与现有仓库事实冲突时进行识别和记录。
- 可以把状态从 `ready_for_trae` 或 `changes_requested` 改为 `awaiting_gpt_acceptance` 或 `blocked`。

**禁止行为**：

- 自行验收任务（验收由 GPT 负责）。
- 把任务移动到 `completed`。
- 创建下一项 active task。
- 把 GPT 输出视为绝对正确（GPT 输出是任务输入，本地工作区或 GitHub 中的最新代码、已接受决策和用户明确决定具有更高优先级）。
- 在无明确任务时顺手重构或升级依赖。
- 同时执行多个任务 ID。
- 用伪造百分比或随机定时器冒充真实任务进度。
- 把旧 history 改名为 Version 冒充持久化。
- 用聊天记忆覆盖仓库事实。

**生产代码修改约束**：生产代码修改必须与当前任务 ID 一一对应；一个 PR 只对应一个任务 ID。

### 3.3 用户：产品负责人和最终裁决者

**职责**：负责商业目标、预算、账号权限、生产发布和不可逆决策。

**必须交由用户决定的情况**：

- GPT 任务说明与现有架构决策冲突。
- GPT 与 Trae 对需求范围理解不同。
- 需要修改已接受的架构决策。
- 任务执行需要明显扩大范围。
- 存在多个影响产品行为的合理方案。
- 为完成任务必须破坏兼容性或迁移数据。
- 安全、成本、交付速度之间存在重大取舍。

`nextActor=user` 时，任何 AI 不得替用户猜测并继续实施，必须等待用户明确决定。

### 3.4 详细权限矩阵

三方能力边界、状态流转权限矩阵与例外情况详见 `docs/ai/PERMISSION-MATRIX.md`。

---

## 4. 任务交接协议

> 引用 `docs/ai/TASK-HANDOFF-PROTOCOL.md`。本节为概览，详细格式契约以该文件为准。

### 4.1 协作循环 16 步概览

每个任务遵循以下标准协作循环，完整循环构成一个可审计的交付单元：

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

### 4.2 TASK_PACKET 与 FIX_PACKET 格式

- **TASK_PACKET**：GPT 向 Trae 下发新任务时使用，YAML 格式，字段固定（`packet_type` / `task_id` / `stage` / `title` / `objective` / `in_scope` / `out_of_scope` / `acceptance_criteria` / `implementation_constraints`）。详细模板与示例见 `TASK-HANDOFF-PROTOCOL.md` 第 2 节。
- **FIX_PACKET**：GPT 验收返回 `MVP_FAIL` 时附带，明确列出 P0 阻塞问题及最小修复要求。详细模板与示例见 `TASK-HANDOFF-PROTOCOL.md` 第 3 节。

### 4.3 Trae → GPT 回传格式

Trae 完成实现与验证后，向 GPT 提交结构化回传（Markdown 格式），包含：任务 / 状态 / 分支 / Commit / PR / 已完成 / 验证 / 已知限制 / 下一步。详细模板与示例见 `TASK-HANDOFF-PROTOCOL.md` 第 4 节。

### 4.4 信息同步频率规则

1. 一个任务一个完整循环：禁止在当前任务循环中混入其他任务的内容。
2. GPT → Trae：每轮只传递一个完整的 `TASK_PACKET` 或 `FIX_PACKET`，不拆分、不堆叠。
3. Trae -> GPT：每轮回传任务编号、PR 编号和最新 commit，作为 GPT 验收的入口。
4. 不再由用户手工复制项目文件或代码：所有代码、任务文件、验证结果均通过 GitHub 仓库流转。
5. 每轮人工信息传递应尽量控制为上述两个方向。

### 4.5 Trae 收到任务包后的处理流程

Trae 收到 `TASK_PACKET` 后不得立即盲目执行，必须依次完成：仓库一致性检查 → 冲突处理 → 将任务包正式落库（`docs/lumen-v2/tasks/active/<TASK-ID>.md`）。详细流程见 `TASK-HANDOFF-PROTOCOL.md` 第 6 节。

### 4.6 窗口启动机制（固定模板，无需替换占位符）

GPT 和 Trae 均可直接读取本地项目文件，窗口交接通过更新本地控制文件 + 固定模板启动完成。**不再需要 ZIP 交接包或占位符替换**。

**原则**：AI 自行读取本地文件恢复上下文，最小化 token 消耗，用户只需告知开启哪种窗口。

1. **GPT 窗口启动**：用户将 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 中的固定模板内容复制给 GPT 即可。模板告知 GPT 读取 `AGENTS.md` 和项目状态文件恢复上下文，无需替换任何占位符。
2. **Trae 窗口启动**：用户告知 Trae「开始 Lumen V2 任务」即可，Trae 自动读取 `.trae/rules/` 和 `AGENTS.md` 恢复上下文。
3. **Trae 完成任务后的强制动作**：Trae 完成任务实施并将 STATE.json 推进为 `awaiting_gpt_acceptance` 后，只需更新 `docs/lumen-v2/state/SESSION-HANDOFF.md` 和 `STATE.json`，然后告知用户「请开启 GPT 窗口进行验收」。

**目的**：消除占位符替换和 ZIP 交接包操作，任何时间点新开窗口都能通过读取本地文件无缝衔接。

详细协议（含异常情况处理、任务文件标准结构）见 `docs/ai/TASK-HANDOFF-PROTOCOL.md`。

---

## 5. 冲突解决流程

> 引用 `docs/ai/CONFLICT-RESOLUTION.md`。本节为概览，详细流程以该文件为准。

### 5.1 事实来源优先级

当任何来源的信息发生冲突时，按以下优先级从高到低处理：

1. **用户最新明确决定**：用户在当前会话或决策记录中明确表达的方向。
2. **已接受的任务规格**：当前任务文件中已确认的 Objective / In Scope / Out of Scope / Acceptance Criteria。
3. **已接受的架构决策（ADR）**：`docs/ai/decisions/` 下的 ADR 与 `docs/lumen-v2/state/DECISION-LOG.md`、`PROJECT-MEMORY.md` 的「冻结产品方向」章节。
4. **本地工作区或 GitHub 当前代码和配置**：本地工作区当前状态（若有未 push 的修改以本地为准）或仓库当前 HEAD 的实际代码与配置文件状态。
5. **模型建议（GPT 或 Trae）**：模型在对话中给出的建议、解释或推断。

本地工作区与 GitHub 仓库同为长期事实来源，本地工作区有未 push 的修改时以本地工作区为准。聊天记录、模型记忆、临时说明、口头沟通均不作为项目事实。

### 5.2 冲突分级

| 级别 | 定义 | 处理方式 |
|------|------|---------|
| 轻微措辞差异 | GPT 任务包与仓库存在轻微措辞差异，但目标明确，不影响架构理解、文件引用或验收条件可验证性 | Trae 根据仓库事实修正，在任务文件 `Review History` 章节记录修正内容，继续执行 |
| 重大冲突 | 架构理解错误、引用文件不存在、与已接受 ADR 冲突、验收条件无法客观验证、任务范围明显过大 | 不得自行选择方案；记录 Execution Conflict；停止扩大修改范围；状态推进至 `awaiting_user_decision`；交由用户裁决 |
| GPT 审查争议 | GPT 审查证据与当前代码不符（commit 已过时、代码已修复、问题不存在） | 确认审查 commit 是否为当前版本；检查证据是否成立；记录 Disputed Finding；请求 GPT 基于最新 commit 重新审查；不得为迎合审查结论修改正确代码 |

### 5.3 异常情况处理概览

`CONFLICT-RESOLUTION.md` 第 5 节定义了以下异常情况的处理流程：

- 任务范围不断扩大。
- GPT 要求大范围重构。
- GPT 反复提出新细节。
- 任务包基于旧代码。
- 测试失败但与当前任务无关。
- 发现安全或数据损坏风险（立即阻塞，无论当前状态如何）。

### 5.4 Lumen V2 状态机整合

| 冲突类型 | 状态推进 | nextActor |
|---------|---------|-----------|
| 轻微措辞差异 | 不变 | 不变 |
| 重大冲突 | `awaiting_user_decision` | `user` |
| GPT 审查争议 | 保持 `awaiting_gpt_acceptance` | `gpt` |
| 安全或数据损坏风险 | `blocked` | `user` |

详细流程（含 Execution Conflict / Disputed Finding 标准模板、状态回退路径、记录落盘位置）见 `docs/ai/CONFLICT-RESOLUTION.md`。

---

## 6. Git 规则

> 整合自改造方案第 8 节（`COLLABORATION-BLUEPRINT.md` 第 8 节）、`AGENTS.md` 第 5 节。

### 6.1 分支命名

本项目遵循 Lumen V2 的分支命名约定：

- Trae 实施分支：`lumen/<task-id>-trae`
- GPT 审查分支：`lumen/<task-id>-gpt-review`

除非用户明确允许，不应直接在主分支修改。一个 PR 只对应一个任务 ID，禁止在单个 PR 中混合多个任务的代码修改。

### 6.2 提交信息格式

Lumen V2 提交信息格式：

- Trae 提交：`feat(lumen-v2): <TASK-ID> implementation`
- GPT 文档提交：`docs(lumen-v2): review <TASK-ID>`

提交前应检查 `git status` 与 `git diff --staged`。

### 6.3 提交原则

提交应具备：

- 单一目的。
- 可理解的提交信息。
- 不包含无关文件。
- 不包含密钥和本地配置。
- 不包含无必要的大型生成文件。
- 尽量保持可回滚。

### 6.4 PR 规则

- 一个 PR 只对应一个任务 ID。
- PR 必须通过 `.github/workflows/lumen-v2-collab-check.yml`。
- 禁止 force-push 到受保护主分支。
- PR 说明建议包含：Task / Objective / Changes / Verification / Known Debt / Out of Scope。

### 6.5 禁止提交的内容

结合项目 `.gitignore` 与 Lumen V2 公开仓库安全边界（`AGENTS.md` 第 6 节），禁止提交：

- `.env`、API Key、JWT Secret、密码、私钥、Provider 完整配置；
- 真实客户照片、联系方式、订单、聊天记录或未脱敏 Prompt；
- 模型权重、训练数据、生产数据库导出；
- 含密钥的终端截图、网络请求或日志；
- 可用于还原凭据的加密文件与派生材料；
- 本地数据库、临时日志、编辑器缓存、用户个人配置、构建缓存、未要求提交的大型产物。

证据必须使用授权测试图、合成图或充分脱敏截图。公开前执行 `node scripts/check-lumen-collab.mjs`，但自动扫描不能替代人工检查。详细规则见 `AGENTS.md` 第 6 节「公开仓库安全边界」与 `docs/lumen-v2/SECURITY-PUBLIC-REPO.md`。

---

## 7. 验证规则

> 整合自改造方案第 9 节（`COLLABORATION-BLUEPRINT.md` 第 9 节）。

### 7.1 只能报告实际执行的验证

Trae 不得声称「测试通过」「构建正常」「没有问题」「应该可以工作」，除非相关命令实际运行并获得结果。

验证记录应包含：

```markdown
### Command
`npm test`

### Result
PASS

### Evidence
42 tests passed, 0 failed.
```

### 7.2 无法执行验证时的记录要求

如果因环境、权限、依赖或外部服务导致无法验证，必须明确写出：

- **Not Executed**：未执行的验证命令。
- **Reason**：无法执行的原因。
- **Alternative Verification**：已完成的替代验证。
- **Remaining Risk**：剩余风险。

不得用替代验证冒充完整验证。

### 7.3 推荐验证顺序

1. 格式检查。
2. Lint。
3. 类型检查。
4. 相关单元测试。
5. 相关集成测试。
6. 构建。
7. 必要的手工流程验证。

不要为了一个小任务默认运行耗时极高且无关的全量测试，除非项目规则或风险要求。

---

## 8. 技术债管理

> 引用 `docs/ai/TECH_DEBT.md`。本节为概览，详细登记表以该文件为准。

### 8.1 技术债登记位置

技术债统一维护在 `docs/ai/TECH_DEBT.md`。

### 8.2 格式规范

每条技术债使用以下结构登记：

```markdown
## DEBT-xxx: 简短标题

- Status: OPEN / IN_PROGRESS / RESOLVED
- Severity: P1 / P2  <!-- P0 不应进入技术债，应在当前任务解决 -->
- Introduced By: TASK-xxx  <!-- 或具体来源 -->
- Context: 简要背景。
- Risk: 不处理的潜在影响。
- Reason Deferred: 为何延后处理。
- Resolve Before: MVP / Public Beta / 其他里程碑。
- Related Files:
  - 路径/到/相关文件
```

### 8.3 Trae 需避免的问题

- 同一个技术债重复记录。
- 没有风险说明的模糊债务。
- 没有处理阶段的永久待办。
- 将纯代码风格偏好升级为重要债务。
- 在当前任务中无边界地顺手清债。

### 8.4 与 Lumen V2 任务的区分

Lumen V2 的已知限制（同步请求接近平台上限、持久化缺失、Vercel `/tmp` 配置丢失、默认密码/JWT、UI 暴露模型等）已作为任务 ID 在 `docs/lumen-v2/tasks/backlog/` 中跟踪，不在 `TECH_DEBT.md` 重复登记。当某个 Lumen V2 任务验收为 `MVP_PASS_WITH_DEBT` 时，GPT 指出的 P1 技术债应追加到 `TECH_DEBT.md`，并标注 `Introduced By` 为对应任务 ID。

详细登记表见 `docs/ai/TECH_DEBT.md`。

---

## 9. 实现原则

> 整合自改造方案第 7 节（`COLLABORATION-BLUEPRINT.md` 第 7 节）。

### 9.1 最小满足原则

优先选择能够满足验收标准的最小实现。不得因「代码可以更优雅」「可以顺便重构」「未来可能需要」「可以增加更多功能」「可以统一整个项目的写法」「当前模块看起来不够完美」等理由自行扩大任务。

除非不处理相关问题就无法满足验收标准，否则应避免：大范围重命名、大范围目录迁移、更换框架或核心库、重写已有模块、修改无关页面、重构无关公共组件、添加没有被任务要求的配置系统、为假设中的未来场景设计复杂抽象。

### 9.2 范围控制

每次修改前应明确回答以下 4 个问题：

1. 该修改对应哪条验收标准？
2. 不修改它会导致什么具体失败？
3. 它是否属于当前任务范围？
4. 它是否会影响无关模块？

无法回答时暂停该修改。

### 9.3 不得隐式改变产品行为

以下 10 类改变必须明确记录，必要时请求用户决定：

1. API 请求或响应格式改变。
2. 数据库结构改变。
3. 用户流程改变。
4. 默认配置改变。
5. 权限规则改变。
6. 错误处理语义改变。
7. 数据兼容性改变。
8. 部署要求改变。
9. 外部依赖增加。
10. 运行成本明显增加。

### 9.4 不覆盖用户未提交内容

发现工作区存在不属于当前任务的未提交修改时：

- 不得直接覆盖。
- 不得擅自丢弃。
- 不得执行破坏性 reset。
- 不得把无关修改混入当前 commit。

应先识别修改来源，并隔离当前任务。

---

## 10. 任务状态流转

> 整合自改造方案第 16 节（`COLLABORATION-BLUEPRINT.md` 第 16 节）、`AGENTS.md` 第 3 节 Lumen V2 状态机、`REVIEW_POLICY.md` 项目特定补充规则。

### 10.1 Lumen V2 状态机

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
  → GPT 验收通过 → 下一任务 ready_for_trae（原任务进入 complete）
  → GPT 驳回 → changes_requested
  → 需要用户决策 → awaiting_user_decision
awaiting_user_decision / blocked
  → 用户决策或解除阻塞后回到对应状态
```

### 10.2 nextActor 字段判定

Lumen V2 的 `STATE.json.nextActor` 字段（取值 `trae` / `gpt` / `user`）决定当前执行者：

- `nextActor=trae`：Trae 可开始或继续实施。
- `nextActor=gpt`：等待 GPT 验收或架构任务，Trae 不得自行推进。
- `nextActor=user`：等待用户决策，任何 AI 不得替用户猜测并继续实施。

### 10.3 与改造方案 PLANNED/IN_PROGRESS/REVIEW/DONE 的对应

改造方案通用状态流转为 `PLANNED → IN_PROGRESS → REVIEW → DONE`（特殊状态 `BLOCKED`、`CANCELLED`）。本项目采用 Lumen V2 状态机作为任务流转的唯一来源，两者对应关系如下：

| 改造方案状态 | Lumen V2 状态 | 说明 |
|-------------|--------------|------|
| PLANNED | `ready_for_trae`（任务已落库，待 Trae 实施） | 任务已定义，尚未开始 |
| IN_PROGRESS | `ready_for_trae` / `changes_requested`（Trae 实施中） | 正在修改和验证 |
| REVIEW | `awaiting_gpt_acceptance` | 已提交 PR，等待 GPT 或用户验收 |
| BLOCKED | `blocked` / `awaiting_user_decision` | 存在无法由 Trae 自行解决的问题 |
| DONE | `complete` | 已通过验收并完成合并 |
| CANCELLED | 由用户明确取消 | 用户明确取消 |

不得在代码尚未验证或尚未提交 PR 时标记为 `DONE` / `complete`。

### 10.4 状态流转权限

谁可以把任务状态从当前状态推进到目标状态，详见 `docs/ai/PERMISSION-MATRIX.md` 第 5 节「任务状态流转权限矩阵」。核心原则：

- Trae 可推进：`ready_for_trae` → `awaiting_gpt_acceptance` / `blocked`；`changes_requested` → `awaiting_gpt_acceptance` / `blocked`。
- GPT 可推进：`awaiting_gpt_acceptance` → `ready_for_trae`（下一任务）/ `changes_requested` / `awaiting_user_decision`。
- `awaiting_user_decision` 与 `blocked` 状态的解除只能由用户决定。

---

## 11. GPT 审查结论处理

> 整合自改造方案第 10 节（`COLLABORATION-BLUEPRINT.md` 第 10 节）。

GPT 审查结论只能为以下三种之一（定义见 `docs/ai/REVIEW_POLICY.md`）：

### 11.1 MVP_PASS

**含义**：验收标准已满足、无 P0 阻塞问题、当前任务可以合并。

**Trae 应**：

1. 将审查结论记录到任务文件。
2. 确认 CI 状态。
3. 按项目流程合并或等待用户合并。
4. 更新 `PROJECT_STATE.md`。
5. 将任务状态改为 `DONE`（Lumen V2 中对应 `complete`）。

### 11.2 MVP_PASS_WITH_DEBT

**含义**：验收标准已满足、无 P0 阻塞问题、存在 P1 技术债但不阻塞当前 MVP。

**Trae 应**：

1. 将审查结论记录到任务文件。
2. 把有效技术债写入 `docs/ai/TECH_DEBT.md`。
3. 不在当前任务中顺手修复技术债。
4. 按正常流程完成当前任务。

### 11.3 MVP_FAIL

**含义**：存在明确 P0 问题，当前任务不能通过验收。GPT 通常会提供 `FIX_PACKET`。

**Trae 应**：

- 只修复明确列出的 P0 问题及其直接回归，不主动处理 P1 和 P2。
- Lumen V2 状态推进至 `changes_requested`。

若 GPT 证据与实际代码不符，应记录 Disputed Finding（模板见 `CONFLICT-RESOLUTION.md` 第 4 节），请求 GPT 基于最新 commit 重新审查。不得为了迎合审查结论而修改本来正确的代码。

---

## 12. P0/P1/P2 分级

> 引用 `docs/ai/REVIEW_POLICY.md`。本节为概览，详细定义以该文件为准。

### 12.1 P0：阻塞问题

必须在当前任务中解决。通常包括：

- 核心验收条件没有实现。
- 核心用户流程无法运行。
- 构建失败。
- 关键测试失败。
- 数据丢失或损坏。
- 明确安全漏洞。
- 权限绕过。
- 修改引入严重回归。
- 实现与任务要求直接矛盾。

### 12.2 P1：重要技术债

应记录到 `docs/ai/TECH_DEBT.md`，通常不阻塞 MVP。通常包括：

- 边界条件覆盖不足。
- 可维护性明显较差。
- 错误处理不完整。
- 缺少部分测试。
- 非核心性能问题。
- 内部 MVP 可以接受，但公开发布前应处理的问题。

### 12.3 P2：优化建议

不应阻塞当前任务，也不应由 Trae 默认执行。通常包括：

- 命名偏好。
- 代码风格偏好。
- 非必要抽象。
- 文件组织建议。
- UI 微调。
- 推测性扩展设计。
- 与当前任务无关的重构。

### 12.4 阻塞合并规则

- **P0**：必须解决才能合并。
- **P1**：记录到 `docs/ai/TECH_DEBT.md`，不阻塞当前 MVP 合并。
- **P2**：不阻塞合并，Trae 不默认执行。

详细定义与当前阶段口径见 `docs/ai/REVIEW_POLICY.md`。

---

## 13. Trae 核心规则

> 整合自改造方案第 19 节（`COLLABORATION-BLUEPRINT.md` 第 19 节）。
> 通用执行流程（Preflight、完成包、Codex 协作）详见 `.trae/rules/_trae-execution.md`，本节为高层原则。

Trae 必须遵守以下 20 条核心规则：

1. 每次新窗口先读取 `AGENTS.md` 及其引用文件。
2. 本地工作区与 GitHub 仓库同为长期事实来源（本地有未 push 修改时以本地为准）。
3. GPT 负责规划和验收，Trae 负责执行和落库。
4. GPT 输出不能自动覆盖仓库中的已接受事实。
5. 只实现当前任务的 `In Scope`。
6. 不主动实现 `Out of Scope`。
7. 优先采用满足验收条件的最小修改。
8. 不进行与当前任务无关的大范围重构。
9. 不声称运行过未实际运行的测试。
10. 测试无法执行时必须记录原因和剩余风险。
11. 每项修改都应能够对应当前任务或明确阻塞问题。
12. GPT 给出 `MVP_FAIL` 时，只修复 P0 和直接回归。
13. P1 和 P2 默认记录，不在当前任务中顺手处理。
14. 发现指令与仓库冲突时，不盲目执行。
15. 重大产品或架构取舍必须由用户裁决。
16. 不覆盖、不删除、不混入用户或其他任务的未提交修改。
17. 提交前检查 diff、敏感信息和无关文件。
18. 完成后更新任务、验证记录、项目状态和相关技术债。
19. 每个任务必须形成可审计的分支、commit 或 PR 记录。
20. 验收通过后及时结束任务，不进行无限细节优化。

---

## 14. 相关文件索引

| 文件 | 职责 | 与本文件的关系 |
|------|------|--------------|
| `AGENTS.md` | 项目入口、Lumen V2 契约（状态机、Git 规则、公开仓库安全边界、禁止行为） | 项目入口，本文件是协作规则详细说明 |
| `.trae/rules/_trae-execution.md` | Trae 默认执行规则（Preflight、完成包、Codex 协作） | 通用执行流程权威来源，本文件第 13 节引用 |
| `docs/ai/COLLABORATION-RULES.md` | **协作规则单一权威入口**（本文件） | 权威入口 |
| `docs/ai/TRAE_COLLABORATION_GUIDE.md` | Trae 执行手册（Lumen V2 执行摘要） | Lumen V2 启动流程与落盘位置，遇冲突以本文件为准 |
| `docs/ai/COLLABORATION-BLUEPRINT.md` | Trae 与 GPT 长期协作规范（改造方案全文，背景资料） | 背景资料，遇冲突以本文件为准 |
| `docs/ai/PERMISSION-MATRIX.md` | 权限矩阵（三方能力边界、状态流转权限） | 本文件第 3 节引用 |
| `docs/ai/TASK-HANDOFF-PROTOCOL.md` | 任务交接协议（TASK_PACKET / FIX_PACKET / 回传格式） | 本文件第 4 节引用 |
| `docs/ai/CONFLICT-RESOLUTION.md` | 冲突解决流程（冲突分级、标准模板、异常处理） | 本文件第 5 节引用 |
| `docs/ai/REVIEW_POLICY.md` | 审查规则（P0/P1/P2 分级、阻塞合并规则、GPT 复审范围） | 本文件第 12 节引用 |
| `docs/ai/TECH_DEBT.md` | 技术债登记表 | 本文件第 8 节引用 |
| `docs/ai/PROJECT_STATE.md` | 项目当前状态（阶段、里程碑、进行中任务、阻塞项） | 项目状态摘要 |
| `docs/lumen-v2/state/STATE.json` | Lumen V2 详细任务状态与执行者判定 | 状态机唯一事实来源 |
| `docs/lumen-v2/state/PROJECT-MEMORY.md` | 项目记忆与当前最高风险 | 架构决策与风险记录 |
| `docs/lumen-v2/state/DECISION-LOG.md` | 架构决策日志 | 重大架构决策记录 |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | 会话交接 | 跨窗口上下文恢复 |
| `docs/lumen-v2/SECURITY-PUBLIC-REPO.md` | 公开仓库安全边界详细规则 | 本文件第 6 节引用 |
