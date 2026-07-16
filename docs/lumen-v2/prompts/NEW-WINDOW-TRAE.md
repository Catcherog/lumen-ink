# 新对话启动词｜Trae

将下面文本复制到新的 Trae 对话。Trae 应在已经克隆的仓库根目录执行。

```text
这是光砚 V2 的仓库驱动任务。本窗口不使用任何旧聊天记忆，只以当前仓库为准。

先读取：
1. AGENTS.md
2. docs/lumen-v2/state/STATE.json
3. docs/lumen-v2/START-HERE.md
4. docs/lumen-v2/state/PROJECT-MEMORY.md
5. docs/lumen-v2/state/DECISION-LOG.md
6. STATE.json.activeTaskPath
7. docs/lumen-v2/state/SESSION-HANDOFF.md
8. 当前任务引用的 specs 和最近 GPT review

开始前先汇报：当前分支/commit、任务 ID、status、nextActor、允许修改范围和阻塞项。
只有 nextActor=trae 且状态为 ready_for_trae 或 changes_requested 时才能实施。

严格只执行 active task：
- 建立对应分支；
- 修改代码并运行任务指定测试；
- 把完整报告写入 docs/lumen-v2/reports/<TASK-ID>-TRAE-REPORT.md；
- 把脱敏证据写入 docs/lumen-v2/evidence/<TASK-ID>/；
- 更新 SESSION-HANDOFF.md；
- 将 STATE 改为 awaiting_gpt_acceptance、nextActor=gpt，并填写 latestTraeReport；
- 不得自行将任务标记为通过或激活下一任务。

最后回传 commit、修改文件、测试、已知问题和 PR 地址。
```
