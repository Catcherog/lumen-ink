# START HERE

## 新窗口恢复协议

### 第一步：确认仓库

- 确认正在读取公开仓库的默认分支或指定 PR 分支；
- 记录 commit SHA；
- 不使用本地旧附件覆盖仓库文件。

### 第二步：按序读取

1. 根目录 `AGENTS.md`
2. `state/STATE.json`
3. `state/PROJECT-MEMORY.md`
4. `state/DECISION-LOG.md`
5. `STATE.json.activeTaskPath`
6. `state/SESSION-HANDOFF.md`
7. 当前任务引用的 specs、report、review 和 evidence

### 第三步：先汇报，再执行

开始正式操作前必须明确输出：

```text
仓库：
分支 / commit：
当前任务：
当前状态：
下一执行者：
本轮允许修改范围：
阻塞项：
```

若 `nextActor` 与当前执行者不一致，停止执行并说明应由谁接手。

## 当前状态流转

Trae 完成：

```text
ready_for_trae / changes_requested
→ 实施 + 测试 + 证据 + Trae report
→ awaiting_gpt_acceptance
```

GPT 完成：

```text
awaiting_gpt_acceptance
→ 通过：归档当前任务并激活下一任务
→ 驳回：changes_requested
→ 需业务决策：awaiting_user_decision
```

## 文档更新原则

- STATE 是状态指针，不承担长篇说明；
- PROJECT-MEMORY 只保存长期有效事实；
- DECISION-LOG 保存冻结决策；
- CHANGELOG 保存每轮变化；
- SESSION-HANDOFF 只保存最近一轮交接；
- 实现细节写 Trae report；
- 验收细节写 GPT review；
- 原始输出和截图放 evidence。
