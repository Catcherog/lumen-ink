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

### GPT

- 负责产品框架、技术边界、任务拆解、验收和决策记录。
- 只在 `nextActor=gpt` 时执行正式验收或架构任务。
- 通过验收后负责推进 STATE、归档任务、激活下一任务；驳回时生成明确缺陷。
- 若当前环境只有仓库只读能力，必须输出完整文件或 patch，不得声称已经 push；由用户或 Trae 原样提交 docs-only 变更。

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

GPT 验收后必须新增：

- `docs/lumen-v2/reviews/<TASK-ID>-GPT-REVIEW.md`
- 更新 `STATE.json`、`PROJECT-MEMORY.md`、`DECISION-LOG.md`、`CHANGELOG.md`、`SESSION-HANDOFF.md`
- 通过时把任务从 `tasks/active/` 移到 `tasks/completed/`，并从 `tasks/backlog/` 激活下一任务

## 5. Git 规则

- 分支建议：`lumen/<task-id>-trae`、`lumen/<task-id>-gpt-review`
- Trae 提交：`feat(lumen-v2): <TASK-ID> implementation`
- GPT 文档提交：`docs(lumen-v2): review <TASK-ID>`
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
