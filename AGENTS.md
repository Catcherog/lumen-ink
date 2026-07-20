## 标准启动入口（Web GPT、Trae 与 Codex 协作规范）

本项目同时遵循两套协作规范，二者职责边界明确：
1. **标准化协作骨架**（`docs/ai/`）：通用协作骨架，包括角色、权限、P0/P1/P2、Git 原则、验证规则、技术债、协作规则单一权威入口。新窗口启动时优先读取。
2. **Lumen Ink V2 契约**（本文件下方 + `docs/lumen-v2/`）：V2 项目特定实现，包括任务流转、状态机、规格、证据、决策日志、会话交接、证据脱敏、安全边界规则。

### docs/ai/ 与 docs/lumen-v2/ 的职责边界

| 目录 | 职责 | 内容 |
|------|------|------|
| `docs/ai/` | 通用协作骨架 | 角色、权限、P0/P1/P2、Git 原则、验证规则、技术债、协作规则入口 |
| `docs/lumen-v2/` | V2 项目特定实现 | 任务流转、状态机、规格、证据、决策日志、会话交接 |

协作流程的单一权威入口为 `docs/ai/COLLABORATION-RULES.md`，整合权限矩阵、任务交接协议、冲突解决流程、Git 规则、验证规则、技术债管理、实现原则、任务状态流转、GPT 审查结论处理、P0/P1/P2 分级与 Trae 核心规则。平台能力和角色边界以本 `AGENTS.md` 为准；显式 Codex 任务的专项执行规则以 `docs/ai/CODEX_EXECUTION_PROTOCOL.md` 为准。其他文件（`TRAE_COLLABORATION_GUIDE.md`、`COLLABORATION-BLUEPRINT.md`）为执行摘要或背景资料。

COLLABORATION-RULES.md 引用的协作规则子文档（均位于 `docs/ai/`）：

- `PERMISSION-MATRIX.md` — 权限矩阵（三方能力边界、状态流转权限）
- `TASK-HANDOFF-PROTOCOL.md` — 任务交接协议（TASK_PACKET / FIX_PACKET / 回传格式）
- `CONFLICT-RESOLUTION.md` — 冲突解决流程（冲突分级、标准模板、异常处理）
- `FILE-OPERATION-SAFETY.md` — 文件操作安全规范（备份、版本控制、提交前检查、证据脱敏）
- `COLLABORATION-BLUEPRINT.md` — 改造方案全文（背景资料，原始 `改造方案.txt` 已迁移）
- `TECH_DEBT.md` — 技术债登记表
- `REVIEW_POLICY.md` — 审查规则（P0/P1/P2 分级、阻塞合并规则）
- `CODEX_EXECUTION_PROTOCOL.md` — Codex 显式任务的 AUDIT/FIX、范围、提交与回交协议

### 新窗口启动读取顺序
1. 本文件（AGENTS.md）
2. `docs/ai/PROJECT_STATE.md` — 项目当前阶段摘要
3. `docs/ai/REVIEW_POLICY.md` — 审查规则（P0/P1/P2 + Lumen V2 状态机）
4. `docs/ai/COLLABORATION-RULES.md` — 协作流程权威入口（任务交接、冲突解决、Git 规则、验证规则、技术债、实现原则、状态流转、审查结论、Trae 核心规则）
5. `docs/ai/CODEX_EXECUTION_PROTOCOL.md` — 仅在任务显式转交 Codex 时必读的专项权威协议
6. `.trae/rules/_trae-execution.md` — Trae 默认执行规则（Preflight、完成包、Codex 协作）
7. `docs/lumen-v2/state/STATE.json` — 详细任务状态（Lumen V2）
8. `docs/lumen-v2/state/SESSION-HANDOFF.md` — 会话交接
9. 当前任务引用的规格与验收文件

### 事实来源声明
本地工作区与 GitHub 仓库同为长期事实来源，本地工作区有未 push 的修改时以本地工作区为准。聊天记录、模型记忆、临时说明不作为项目事实。冲突时按优先级：用户明确决定 > 已接受任务规格 > 已接受 ADR > 本地工作区或 GitHub 当前代码和配置（本地有未 push 修改时以本地为准）> 模型建议。

---

# AI Collaboration Contract — Lumen Ink V2

本文件约束所有参与光砚 V2 的 AI、自动化工具与人工协作者。适用范围为整个仓库，尤其是 `docs/lumen-v2/` 和 V2 相关生产代码。

## 1. 唯一真相来源

每次开始任务时必须按顺序读取：

1. `docs/lumen-v2/state/STATE.json`
2. `docs/lumen-v2/state/PROJECT-MEMORY.md`
3. `docs/lumen-v2/state/DECISION-LOG.md`
4. `STATE.json.activeTaskPath` 指向的当前任务
5. 当前任务引用的规格与验收文件
6. `docs/lumen-v2/state/SESSION-HANDOFF.md`

聊天历史、旧附件和本地口头说明都不能覆盖仓库中的冻结状态。发现冲突时停止实施，在任务报告中列出冲突。

## 2. 角色边界

### Trae

- 负责扫描、编码、测试、截图和实现报告。
- 可以把状态从 `ready_for_trae` 或 `changes_requested` 改为 `awaiting_gpt_acceptance` 或 `blocked`。
- 不得自行验收，不得把任务移动到 completed，不得创建下一项 active task。
- 生产代码修改必须与当前任务 ID 一一对应。
- 通用执行流程（Preflight、完成包、Codex 协作）遵循 `.trae/rules/_trae-execution.md`。

### Web GPT

- 负责产品框架、技术边界、任务拆解、证据验收和决策建议。
- 分析用户、Trae 或 Codex 提供的仓库上下文、Diff、日志和测试证据，输出 TASK_PACKET、FIX_PACKET 或验收结论。
- 判断是否需要 Codex，并区分证据审查与仓库独立验证。
- 不得声称读取未提供的本地仓库、检查未上传文件、运行本地测试、直接修改或提交仓库，或独立验证本地工作区。
- 只在 `nextActor=gpt` 时输出正式验收或架构结论；`EVIDENCE_REVIEW_PASS` 仅表示提交证据通过。
- 验收通过时给出状态推进指令，驳回时生成明确缺陷；实际仓库落盘、状态推进和 Git 操作由 Trae 完成。

### Codex

- 仅在用户直接授权或任务明确标记 `CODEX_REQUIRED` 时介入，处理指定的高风险、复杂或疑难仓库工作。
- `AUDIT` 模式只读；`FIX` 模式采取最小修改、执行指定验证并创建仅含 Codex 修改的本地 Commit，不 Push。
- 开始前必须核对 Branch、HEAD、Git Status 与 Baseline Commit；发现需求、架构、权限、基线或范围冲突时立即停止。
- 完成后由 Trae 逐文件审查 Commit、重新运行验证，并负责 Push、PR 和状态维护。
- 完整规则见 `docs/ai/CODEX_EXECUTION_PROTOCOL.md`。

### 用户

- 负责商业目标、预算、账号权限、生产发布和不可逆决策。
- `nextActor=user` 时，任何 AI 不得替用户猜测并继续实施。

## 3. 状态机

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
  → GPT 验收通过 → 下一任务 ready_for_trae
  → GPT 驳回 → changes_requested
  → 需要用户决策 → awaiting_user_decision
```

## 4. 每轮仓库落盘位置

Trae 完成任务后必须新增：

- `docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md`
- `docs/lumen-v2/evidence/<TASK-ID>/` 下的脱敏证据
- 更新 `docs/lumen-v2/state/SESSION-HANDOFF.md`
- 更新 `docs/lumen-v2/state/STATE.json` 为等待 GPT 验收
- 更新 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md`（固定模板，无需替换占位符），并向用户输出启动指示（详见 `docs/ai/COLLABORATION-RULES.md` 第 4.6 节）

Web GPT 输出验收结论后，由 Trae 落盘：

- `docs/lumen-v2/reviews/<TASK-ID>-GPT-REVIEW.md`
- 根据验收结论更新 `STATE.json`、`PROJECT-MEMORY.md`、`DECISION-LOG.md`、`CHANGELOG.md`、`SESSION-HANDOFF.md`
- 通过时按已接受结论把任务从 `tasks/active/` 移到 `tasks/completed/`，并从 `tasks/backlog/` 激活下一任务

## 5. Git 规则

- 分支建议：`lumen/<task-id>-trae`、`lumen/<task-id>-gpt-review`
- Trae 提交：`feat(lumen-v2): <TASK-ID> implementation`
- Trae 根据 GPT 审查结论提交文档：`docs(lumen-v2): review <TASK-ID>`
- 一个 PR 只对应一个任务 ID。
- PR 必须通过 `.github/workflows/lumen-v2-collab-check.yml`。
- 禁止 force-push 到受保护主分支。

## 6. 公开仓库安全边界

不得提交：

- `.env`、API Key、JWT Secret、密码、私钥、Provider 完整配置；
- 真实客户照片、联系方式、订单、聊天记录或未脱敏 Prompt；
- 模型权重、训练数据、生产数据库导出；
- 含密钥的终端截图、网络请求或日志；
- 可用于还原凭据的加密文件与派生材料。

证据必须使用授权测试图、合成图或充分脱敏截图。公开前执行 `node scripts/check-lumen-collab.mjs`，但自动扫描不能替代人工检查。

## 7. 禁止行为

- 不读取 STATE 就开始工作；
- 同时执行多个任务 ID；
- Trae 自行宣布验收通过；
- GPT 在证据不足时放行；
- 用聊天记忆覆盖仓库事实；
- 把旧 history 改名为 Version 冒充持久化；
- 用伪造百分比或随机定时器冒充真实任务进度；
- 在无明确任务时顺手重构或升级依赖。
