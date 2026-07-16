---
alwaysApply: false
description: Lumen V2 跨窗口协作规范 - Trae 角色边界、状态机、落盘位置、Git规则
---
# Lumen V2 协作规范

> **生效模式**：智能生效
> **触发信号**：涉及 `docs/lumen-v2/`、AGENTS.md、Lumen V2 任务、跨窗口协作时
> **权威来源**：`AGENTS.md` 是唯一真相来源，本文件是 Trae 执行摘要。冲突时以 AGENTS.md 为准。

---

## 触发判定

| 判定条件 | 是否触发 | 示例 |
|---------|---------|------|
| 用户提到 Lumen V2 / 光砚 V2 | **触发** | "开始 BASE-001" |
| 涉及 `docs/lumen-v2/` 路径 | **触发** | 读取 STATE.json |
| 用户提到跨窗口协作 / GPT 协作 | **触发** | "GPT 验收过了" |
| 读取到 AGENTS.md 中的协作指令 | **触发** | 会话启动读取规则 |
| 纯 V1 功能开发（无 V2 关联） | **不触发** | 修改 V1 现有组件 |

---

## 1. 任务启动前必读

每次开始 Lumen V2 任务时，必须按顺序读取：

1. `docs/lumen-v2/state/STATE.json` - 当前任务 ID、状态、下一执行者
2. `docs/lumen-v2/state/PROJECT-MEMORY.md` - 项目记忆
3. `docs/lumen-v2/state/DECISION-LOG.md` - 已做决策
4. `STATE.json.activeTaskPath` 指向的当前任务文件
5. 当前任务引用的规格与验收文件
6. `docs/lumen-v2/state/SESSION-HANDOFF.md` - 会话交接

**禁止**：不读取 STATE 就开始工作；用聊天记忆覆盖仓库事实。

---

## 2. Trae 角色边界

### 可以做

- 扫描、编码、测试、截图和实现报告
- 把状态从 `ready_for_trae` 或 `changes_requested` 改为 `awaiting_gpt_acceptance` 或 `blocked`

### 不能做

- **不得自行验收**（不能把任务标记为通过）
- **不得把任务移动到 completed**
- **不得创建下一项 active task**
- **不得同时执行多个任务 ID**
- 生产代码修改必须与当前任务 ID 一一对应

---

## 3. 状态机

```text
ready_for_trae
  -> Trae 实施 -> awaiting_gpt_acceptance

awaiting_gpt_acceptance
  -> GPT 验收通过 -> 下一任务 ready_for_trae
  -> GPT 驳回 -> changes_requested -> Trae 重新实施
  -> 需要用户决策 -> awaiting_user_decision

blocked -> 排除阻塞后 -> ready_for_trae
```

---

## 4. 每轮仓库落盘位置

### Trae 完成任务后必须新增

| 文件 | 用途 |
|------|------|
| `docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md` | 实现报告 |
| `docs/lumen-v2/evidence/<TASK-ID>/` | 脱敏证据（截图、日志等） |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | 会话交接更新 |
| `docs/lumen-v2/state/STATE.json` | 状态改为 `awaiting_gpt_acceptance`，`nextActor` 改为 `gpt` |

### 状态只能改为

```json
{
  "status": "awaiting_gpt_acceptance",
  "nextActor": "gpt"
}
```

---

## 5. Git 规则

| 操作 | 格式 |
|------|------|
| Trae 分支 | `lumen/<task-id>-trae` |
| Trae 提交 | `feat(lumen-v2): <TASK-ID> implementation` |
| 一个 PR | 只对应一个任务 ID |
| PR 必须 | 通过 `.github/workflows/lumen-v2-collab-check.yml` |
| 禁止 | force-push 到受保护主分支 |

---

## 6. 公开仓库安全边界

不得提交到仓库：

- `.env`、API Key、JWT Secret、密码、私钥
- `providers.json` 或其他真实 Provider 配置
- 真实客户照片、联系方式、订单、聊天记录
- 完整请求体、Authorization Header、base64 图片
- 数据库导出、生产签名 URL、模型权重
- 含密钥的终端/浏览器截图

证据必须使用授权测试图、合成图或充分脱敏截图。公开前执行 `node scripts/check-lumen-collab.mjs`，但自动扫描不能替代人工检查。

---

## 7. 禁止行为

- 不读取 STATE 就开始工作
- 同时执行多个任务 ID
- Trae 自行宣布验收通过
- 用聊天记忆覆盖仓库事实
- 把旧 history 改名为 Version 冒充持久化
- 用伪造百分比或随机定时器冒充真实任务进度
- 在无明确任务时顺手重构或升级依赖

---

## 与其他规则的优先级

本规则在 `_experience.md` 之后执行。当 Lumen V2 协作任务触发时，协作状态机优先于通用工作流。
