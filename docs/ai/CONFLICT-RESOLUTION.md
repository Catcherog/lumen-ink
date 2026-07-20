<!--
  模板用途：冲突解决流程文件，定义冲突分级、处理流程与事实来源优先级声明。
  来源改造方案章节：第 6.2 节、第 18 节、AGENTS.md 事实来源声明。
  完整规范以改造方案为准；本文件为冲突处理执行摘要，遇冲突以 AGENTS.md 和 REVIEW_POLICY.md 为准。
-->

# 冲突解决流程 — 光砚 Lumen Ink V2 (picture-edit)

## 1. 事实来源优先级

当任何来源的信息发生冲突时，按以下优先级从高到低处理（见 `AGENTS.md` 事实来源声明、改造方案第 18 节）：

1. **用户最新明确决定**：用户在当前会话或决策记录中明确表达的方向。
2. **已接受的任务规格**：当前任务文件 `docs/lumen-v2/tasks/active/<TASK-ID>.md` 中已确认的 Objective / In Scope / Out of Scope / Acceptance Criteria。
3. **已接受的架构决策（ADR）**：`docs/ai/decisions/` 下的 ADR 与 `docs/lumen-v2/state/DECISION-LOG.md`、`PROJECT-MEMORY.md` 的「冻结产品方向」章节（D-001 ~ D-013）。
4. **本地工作区或 GitHub 当前代码和配置**：本地工作区当前状态（若有未 push 的修改以本地为准）或仓库当前 HEAD 的实际代码与配置文件状态。
5. **模型建议（GPT 或 Trae）**：模型在对话中给出的建议、解释或推断。

### 长期事实来源声明

本地工作区与 GitHub 仓库同为长期事实来源，本地工作区有未 push 的修改时以本地工作区为准。聊天记录、模型记忆、临时说明、口头沟通均不作为项目事实。

### 冲突处理原则

- 聊天内容与仓库/本地工作区内容冲突时，按上述优先级处理，而不是按时间顺序处理。
- 模型建议不得覆盖用户决定、已接受任务规格、已接受 ADR 或本地工作区/GitHub 当前代码。
- 发现冲突时停止实施，在任务报告或本文件定义的标准模板中列出冲突，按冲突分级流程推进。
- 不得用聊天记忆覆盖仓库事实，不得把旧 history 改名冒充持久化决策。

---

## 2. 冲突分级

冲突按严重程度分为三级，处理流程见各小节。

### 级别一：轻微措辞差异

**定义**：GPT 任务包与仓库存在轻微措辞差异，但目标明确，不影响架构理解、文件引用或验收条件可验证性。

**处理流程**：

1. Trae 根据仓库事实进行修正，使任务包与仓库一致。
2. 在任务文件 `Review History` 章节记录修正内容（原措辞 / 修正后措辞 / 依据）。
3. 继续执行任务，无需停止等待。

**示例**：GPT 任务包写「配置文件 `src/config/index.ts`」，仓库实际路径为 `src/config/app.ts`，文件内容和职责一致 → 直接修正路径并记录。

### 级别二：重大冲突

**定义**：GPT 任务包与仓库存在重大冲突，包括但不限于：

- 架构理解错误（如误判框架、误判数据流、误判模块边界）。
- 引用的文件、模块或接口不存在。
- 与已接受 ADR 或 Lumen V2 冻结决策冲突。
- 验收条件无法客观验证（如依赖主观判断、无法复现的流程）。
- 任务范围明显过大，超出一个合理的独立交付单元。

**处理流程**：

1. **不得自行选择方案**。Trae 不应在多个可行方案中擅自决策。
2. 记录 Execution Conflict，使用本文件第 3 节的标准模板。
3. **停止扩大修改范围**。已完成的部分可以保留，但不得在冲突未解决前继续推进新修改。
4. 将 Lumen V2 状态推进至 `awaiting_user_decision`，`nextActor=user`。
5. 交由用户裁决。用户决策后按其指示将状态推进至 `ready_for_trae` 或 `changes_requested`。

### 级别三：GPT 审查争议

**定义**：GPT 审查证据与当前代码不符，包括：GPT 引用的 commit 已被后续修改覆盖、GPT 引用的代码行实际不存在、GPT 描述的问题已经修复、GPT 基于旧版本审查。

**处理流程**：

1. **确认 GPT 审查的 commit 是否仍然是当前版本**。通过 `git log` 与 GPT 引用的 commit hash 比对。
2. **检查证据是否成立**。在当前代码中复现 GPT 描述的问题。
3. 若证据不成立（commit 已过时、代码已修复、问题不存在），记录 Disputed Finding，使用本文件第 4 节的标准模板。
4. 请求 GPT 基于最新 commit 重新审查。
5. **不得为了迎合审查结论而修改本来正确的代码**。审查争议不通过修改正确代码来「对齐」GPT 结论。

---

## 3. Execution Conflict 标准模板

重大冲突发生时，Trae 先按 `.trae/rules/_trae-execution.md` 第 3 节的简化格式输出，然后在任务文件 `Review History` 章节使用以下完整模板记录：

### 3.1 简化输出格式（Trae 首次响应使用）

Trae 发现冲突时，首次响应只输出以下格式，不展开执行：

```
EXECUTION_CONFLICT

GPT Assumption:
Repository Fact:
Evidence Files:
Impact:
Recommended Adjustment:
```

### 3.2 完整记录模板（落盘到任务文件）

```markdown
## Execution Conflict

### GPT Assumption
GPT 任务包中的原始假设或要求，引用原文不得改写。

### Repository Fact
仓库中发现的实际情况（与 GPT 假设矛盾的事实）。

### Evidence Files
可复现的仓库路径、commit hash 或代码片段，证据脱敏后引用。

### Impact
直接执行会导致的具体后果（架构冲突、数据损坏、范围蔓延等）。

### Recommended Adjustment
建议的调整方案，或需要用户裁决的明确问题（避免开放式询问）。
```

**填写要求**：

- `GPT Assumption` 引用任务文件原文或 GPT 任务包原文，不得改写。
- `Repository Fact` 与 `Evidence Files` 拆分：前者陈述事实，后者给出可复现证据。
- `Evidence Files` 必须给出可复现的仓库路径、commit hash 或代码片段，证据脱敏后引用。
- `Impact` 说明直接执行会导致的具体后果（架构冲突、数据损坏、范围蔓延等）。
- `Recommended Adjustment` 列出明确问题或建议方案，避免开放式询问。

---

## 4. Disputed Finding 标准模板

GPT 审查争议发生时，在任务文件 `Review History` 章节使用以下模板记录：

```markdown
## Disputed Finding

### Finding
P0-XX

### GPT Evidence
GPT 引用的证据。

### Repository Evidence
当前代码中的实际情况。

### Assessment
该问题不存在、已经修复，或者审查基于旧 commit。

### Requested Action
请基于最新 commit 重新审查。
```

**填写要求**：

- `Finding` 对应 GPT 审查报告中的问题编号（如 P0-01、P1-02）。
- `GPT Evidence` 引用 GPT 审查报告原文片段。
- `Repository Evidence` 给出当前 commit hash 与实际代码片段，证据脱敏后引用。
- `Assessment` 明确结论：问题不存在 / 已经修复 / 审查基于旧 commit。
- `Requested Action` 明确请求 GPT 重新审查的范围（整个任务或特定 Finding）。

---

## 5. 异常情况处理流程

### 5.1 任务范围不断扩大

**场景**：在执行过程中，GPT 或用户不断追加新需求，导致任务范围超出原始 Acceptance Criteria。

**处理流程**：

1. 完成能够独立交付的当前部分，不因范围扩大而中止已开始的工作。
2. 记录新增需求，明确其不属于当前任务的 Acceptance Criteria。
3. 建议拆分新的 TASK，将新增需求移入 `docs/lumen-v2/tasks/backlog/`。
4. 让 GPT 重新定义范围或由用户裁决，状态推进至 `awaiting_user_decision`。

**禁止**：在当前任务中无限追加范围；把新增需求当作 P0 阻塞当前任务。

### 5.2 GPT 要求大范围重构

**场景**：GPT 在审查或任务包中要求大范围重构（如更换框架、重写模块、大范围重命名、大范围目录迁移），但该重构不是当前任务 Acceptance Criteria 的必要前提。

**处理流程**：

1. 不作为 P0 处理。当前 MVP 任务的目标是满足验收条件，不是追求完美架构。
2. 记录为 P1（技术债）或 P2（优化建议），写入 `docs/ai/TECH_DEBT.md`。
3. 不在当前 MVP 任务中执行该重构。
4. 若 GPT 坚持，记录 Execution Conflict，状态推进至 `awaiting_user_decision`。

**判断标准**：重构是否为 Acceptance Criteria 的必要前提？是 → 可作为 P0；否 → P1 或 P2。

### 5.3 GPT 反复提出新细节

**场景**：GPT 在多轮审查中反复提出新的细节问题，可能阻塞当前任务推进。

**处理流程**：

检查每个新意见属于以下哪一类：

| 类别 | 是否阻塞当前任务 | 处理方式 |
|------|-----------------|---------|
| 新发现的真实 P0（核心验收条件未实现、构建失败、数据损坏、安全漏洞等） | **是** | 继续阻塞当前任务，按 P0 流程处理 |
| 原 P0 修复导致的直接回归（修复 A 引入 B 的回归） | **是** | 继续阻塞当前任务，必须修复回归 |
| 与当前任务无关的全仓库问题 | **否** | 不阻塞当前任务，记录为技术债或新任务 |
| 代码偏好或优化建议（命名风格、非必要抽象、推测性扩展设计） | **否** | 不阻塞当前任务，记录为 P2 |

只有前两类可以继续阻塞当前任务。后两类记录到 `docs/ai/TECH_DEBT.md` 或新任务，不在当前任务中处理。

### 5.4 任务包基于旧代码

**场景**：GPT 任务包或审查报告基于旧 commit，与当前仓库状态不一致。

**处理流程**：

1. **不要根据旧状态修改**。不得为了对齐旧任务包而回退代码或引入已修复的问题。
2. 明确指出当前最新 commit hash，记录在任务文件 `Review History` 章节。
3. 请求 GPT 基于 latest PR 或最新 commit 重新读取仓库状态。
4. 必要时记录审查基线（GPT 审查时的 commit vs 当前 commit），使用 Disputed Finding 模板。

**禁止**：基于旧任务包修改当前代码；基于旧审查结论修改已修复的问题。

### 5.5 测试失败但与当前任务无关

**场景**：在验证当前任务时，发现测试失败，但该失败与当前修改无关。

**处理流程**：

1. **先验证失败是否由当前修改引起**。在基线分支（如 main）上运行同一测试，对比结果。
2. 如果是**已有失败**（基线分支也失败）：
   - 记录失败证据（命令、输出、基线分支 commit hash）。
   - 说明当前分支和基线分支均失败。
   - 不擅自修复无关问题，避免范围蔓延。
   - 根据项目规则判断是否阻塞：若是安全或数据损坏相关失败 → 阻塞；其他已有失败 → 记录为 P1 技术债，不阻塞当前任务。
3. 如果是**当前修改引起**：
   - 必须修复。当前修改引入的回归属于 P0，阻塞当前任务。

**禁止**：把已有失败当作当前任务的 P0；擅自修复无关失败以「清理」测试。

### 5.6 发现安全或数据损坏风险

**场景**：在执行任务过程中，发现安全漏洞、数据损坏风险、权限绕过、密钥泄露等风险，即使不在原任务范围内。

**处理流程**：

1. **立即停止相关发布或合并**。即使当前任务已通过验收，也不得合并。
2. 清楚报告风险的具体位置、影响范围、复现方式，证据脱敏后记录。
3. 将 Lumen V2 状态推进至 `blocked`，无论当前状态如何（见第 6 节）。
4. 同步记录到 `docs/lumen-v2/state/PROJECT-MEMORY.md` 的「当前最高风险」章节。
5. 通知用户决策。安全问题和数据完整性问题不能因为「MVP 优先」而忽略。

**禁止**：因「不在任务范围内」而忽略安全风险；因「MVP 优先」而放行数据损坏风险。

---

## 6. Lumen V2 状态机整合

冲突解决与 Lumen V2 状态机（定义于 `AGENTS.md` 第 3 节与 `docs/lumen-v2/`）通过以下方式整合：

| 冲突类型 | 状态推进 | nextActor | 说明 |
|---------|---------|-----------|------|
| 轻微措辞差异 | 不变 | 不变 | Trae 直接修正并记录，不改变状态 |
| 重大冲突 | `awaiting_user_decision` | `user` | 交由用户裁决 |
| GPT 审查争议 | 保持 `awaiting_gpt_acceptance` | `gpt` | 等待 GPT 基于最新 commit 复核 |
| 安全或数据损坏风险 | `blocked` | `user` | 立即阻塞，无论当前状态如何 |

### 状态回退路径

- 用户裁决重大冲突后：
  - 决策为「按仓库事实执行」→ 状态回到 `ready_for_trae`，`nextActor=trae`。
  - 决策为「按 GPT 任务包执行」→ GPT 更新任务包后，状态回到 `ready_for_trae`，`nextActor=trae`。
  - 决策为「需要 GPT 重新定义」→ 状态推进至 `changes_requested`，等待 GPT 重新下发任务包。
- GPT 复核审查争议后：
  - 复核结论为「审查有误」→ 状态推进至 `ready_for_trae`（下一任务）或 `complete`。
  - 复核结论为「审查正确，代码确实有问题」→ 状态推进至 `changes_requested`，Trae 修复。
- 安全风险解除后：
  - 用户确认风险已处理 → 状态回到 `ready_for_trae` 或原状态。
  - 风险未解除 → 保持 `blocked`。

### 优先级声明

Lumen V2 状态机是任务流转的唯一来源；改造方案 P0 / P1 / P2 分级是审查结论分级的唯一依据；本文件的冲突分级是冲突处理流程的唯一依据。三者不冲突：状态机回答「现在该谁做什么」，分级回答「这个问题能否阻塞合并」，冲突分级回答「发现冲突时按什么流程处理」。冲突时按 `AGENTS.md` 的事实来源优先级处理。

---

## 7. 冲突解决记录位置

冲突解决记录必须落盘到以下位置，确保可追溯：

| 记录类型 | 落盘位置 | 章节 | 触发条件 |
|---------|---------|------|---------|
| Execution Conflict | `docs/lumen-v2/tasks/active/<TASK-ID>.md` | Review History | 重大冲突发生时 |
| Disputed Finding | `docs/lumen-v2/tasks/active/<TASK-ID>.md` | Review History | GPT 审查争议发生时 |
| 重大架构冲突 | `docs/lumen-v2/state/DECISION-LOG.md` | 新增条目 | 重大冲突涉及架构决策时同步记录 |
| 安全风险 | `docs/lumen-v2/state/PROJECT-MEMORY.md` | 当前最高风险 | 发现安全或数据损坏风险时同步记录 |
| 轻微措辞修正 | `docs/lumen-v2/tasks/active/<TASK-ID>.md` | Review History | 轻微措辞差异修正时记录 |

### 记录要求

- 所有记录必须包含时间戳（`YYYY-MM-DD HH:mm`）、记录者标识（Trae / GPT / User）、相关 commit hash。
- Execution Conflict 和 Disputed Finding 的模板字段不得省略，无内容的字段填写「无」或「不适用」并说明原因。
- 重大架构冲突同步到 `DECISION-LOG.md` 时，引用任务文件中的 Execution Conflict 原文位置。
- 安全风险同步到 `PROJECT-MEMORY.md` 时，引用任务文件或证据目录的脱敏证据位置。

### 证据脱敏

所有冲突解决记录中的证据必须遵循 `AGENTS.md` 第 6 节「公开仓库安全边界」：

- 证据必须使用授权测试图、合成图或充分脱敏截图。
- 不得包含 `.env`、API Key、密码、真实客户照片、未脱敏 Prompt 等敏感信息。
- 公开前执行 `node scripts/check-lumen-collab.mjs`，但自动扫描不能替代人工检查。

---

## 8. 相关文件索引

- `AGENTS.md`：事实来源声明、角色边界、Lumen V2 状态机、公开仓库安全边界。
- `docs/ai/REVIEW_POLICY.md`：P0 / P1 / P2 分级定义、阻塞合并规则、GPT 复审范围。
- `docs/ai/TRAE_COLLABORATION_GUIDE.md`：Trae 执行手册、GPT 任务包处理方式、验证规则。
- `docs/lumen-v2/state/STATE.json`：当前任务状态与执行者判定。
- `docs/lumen-v2/state/DECISION-LOG.md`：架构决策记录。
- `docs/lumen-v2/state/PROJECT-MEMORY.md`：项目记忆与当前最高风险。
- `docs/lumen-v2/SECURITY-PUBLIC-REPO.md`：公开仓库安全边界详细规则。
