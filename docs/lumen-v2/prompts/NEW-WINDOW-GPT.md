# 新对话启动词｜GPT

将下面文本复制到新的 GPT 对话，并把 `<REPO_URL>` 替换为公开仓库地址；需要验收 PR 时同时替换 `<BRANCH_OR_PR>`。

```text
请打开公开 GitHub 仓库 <REPO_URL> 的 <BRANCH_OR_PR>。
本窗口不使用任何旧聊天记忆，只以仓库为准。

先按顺序读取：
1. AGENTS.md
2. docs/lumen-v2/state/STATE.json
3. docs/lumen-v2/START-HERE.md
4. docs/lumen-v2/state/PROJECT-MEMORY.md
5. docs/lumen-v2/state/DECISION-LOG.md
6. STATE.json.activeTaskPath 指向的任务文件
7. docs/lumen-v2/state/SESSION-HANDOFF.md
8. latestTraeReport、latestGptReview 及当前任务 evidence

读取后先输出：仓库、分支/commit、当前任务、状态、nextActor、允许修改范围和阻塞项。

只有 nextActor=gpt 时才执行正式任务：
- awaiting_gpt_acceptance：严格依据 task、spec、diff、report 和 evidence 验收；
- awaiting_user_decision：整理候选方案，不替用户决定；
- 其他状态：不要代替 Trae 编码。

验收结果必须生成完整的 docs/lumen-v2/reviews/<TASK-ID>-GPT-REVIEW.md 内容，并给出 STATE、PROJECT-MEMORY、DECISION-LOG、CHANGELOG、SESSION-HANDOFF 需要更新的完整 patch。
若当前环境具备 GitHub 写入能力，直接按 AGENTS.md 提交；若只有只读能力，明确说明未写入仓库，不得声称已 push。
```
