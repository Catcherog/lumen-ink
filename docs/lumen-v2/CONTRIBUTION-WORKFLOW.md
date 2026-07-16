# GPT × Trae × 用户协作流程

## 1. 原则

仓库是唯一跨窗口记忆。聊天只承担当轮推理与沟通；最终状态必须落盘。

## 2. Trae 周期

1. 读取启动文件和 active task；
2. 建立 `lumen/<task-id>-trae` 分支；
3. 只修改任务允许范围；
4. 执行任务要求的测试；
5. 新增 `reports/<TASK-ID>-TRAE-REPORT.md`；
6. 把脱敏证据放入 `evidence/<TASK-ID>/`；
7. 更新 SESSION-HANDOFF；
8. 将 STATE 改为：

```json
{
  "status": "awaiting_gpt_acceptance",
  "nextActor": "gpt",
  "latestTraeReport": "docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md"
}
```

9. 提交并发起 PR，不合并自己的任务。

## 3. GPT 周期

1. 读取 PR branch 的仓库状态、diff、report 和 evidence；
2. 对照任务与验收规格逐项检查；
3. 新增 `reviews/<TASK-ID>-GPT-REVIEW.md`；
4. 驳回时：STATE=`changes_requested`、nextActor=`trae`，列出缺陷 ID；
5. 通过时：
   - 将 active task 移入 completed；
   - 激活下一 backlog task；
   - 更新 PROJECT-MEMORY、DECISION-LOG、CHANGELOG、SESSION-HANDOFF；
   - STATE=`ready_for_trae`、nextActor=`trae`；
6. 若 GPT 当前没有 GitHub 写权限，输出完整 patch，由 Trae 建立 **docs-only commit** 原样应用。Trae不得改写 GPT 的验收结论。

## 4. 用户周期

当 STATE 为 `awaiting_user_decision`：

- 阅读 decision request；
- 在仓库 discussion、issue 或指定决策文件中给出选择；
- GPT 将结论写入 DECISION-LOG 后再恢复任务流。

## 5. PR 门禁

每个 PR 必须：

- 只有一个任务 ID；
- 有对应 report 或 review；
- STATE 的状态与 nextActor 一致；
- action 检查通过；
- 无敏感数据；
- 有回滚方式。
