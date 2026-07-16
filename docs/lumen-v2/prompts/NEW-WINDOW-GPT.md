# 新对话启动词｜GPT

将下面代码块内容复制到新的 GPT 对话即可。当前已填入 BASE-001 返工后重新验收所需的实际值（仓库地址、分支、任务 ID、状态）。下次任务时需更新分支名、任务 ID 和状态。

> 完整协作规则以 `docs/ai/COLLABORATION-RULES.md` 为权威入口。本启动词仅提供启动流程，详细规则见上述文件。
>
> **本次为 BASE-001 返工后的重新验收**：GPT 上一次验收结论为 `MVP_FAIL`（见 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`），Trae 已按 FIX_PACKET 补齐 evidence 与报告更新，现请求 GPT 复核。

```text
请打开公开 GitHub 仓库 https://github.com/Catcherog/lumen-ink.git 的 docs/lumen-v2-repo-collaboration 分支。
本窗口不使用任何旧聊天记忆，只以仓库为准。完整协作规则以 docs/ai/COLLABORATION-RULES.md 为权威入口，本启动词仅提供启动流程，详细规则见上述文件。

【背景：本次为 BASE-001 返工后的重新验收】
- 上一次 GPT 验收结论：MVP_FAIL（审查基线 commit a16734301b80891cf06b34e8d32a8ff5bc8f8032）
- 上一次审查报告：docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md
- Trae 返工报告：docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md（第 8-12 节为返工记录）
- 返工新增 evidence：docs/lumen-v2/evidence/BASE-001/（README.md / commands.txt / lint-results.txt / typecheck-results.txt / test-results.txt / build-results.txt）
- 返工 docs commit：docs(lumen-v2): review BASE-001（仅追加 docs/evidence，不修改 src/ 生产代码，验收结果在 docs commit 后保持有效）

【第一步：按顺序读取以下 9 项】
1. AGENTS.md
2. docs/lumen-v2/state/STATE.json
3. docs/lumen-v2/START-HERE.md
4. docs/lumen-v2/state/PROJECT-MEMORY.md
5. docs/lumen-v2/state/DECISION-LOG.md
6. STATE.json.activeTaskPath 指向的任务文件（docs/lumen-v2/tasks/active/BASE-001.md，含 Review History）
7. docs/lumen-v2/state/SESSION-HANDOFF.md
8. docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md（重点关注第 8 节返工记录、第 9 节回滚说明、第 10 节 Disputed Finding）
9. docs/lumen-v2/evidence/BASE-001/（README.md + 5 个结果文件，含 7 条验收命令的完整 stdout/stderr 与退出码）

【第二步：先汇报，再执行】
读取完成后必须先输出以下标准化汇报，再决定是否执行任务：

仓库：https://github.com/Catcherog/lumen-ink.git
分支/commit：docs/lumen-v2-repo-collaboration（implementation commit a167343，返工 docs commit 在其上）
当前任务：BASE-001
状态：awaiting_gpt_acceptance（返工后重新提交）
nextActor：gpt
允许修改范围：只读验收
阻塞项：无

【第三步：本次复核重点】
本次为 MVP_FAIL 后的返工复核，请重点核对以下 P0 缺陷是否已修复：

1. EVIDENCE-BLOCK-01（P0）：检查 docs/lumen-v2/evidence/BASE-001/ 是否存在且包含 README.md / commands.txt / lint-results.txt / typecheck-results.txt / test-results.txt / build-results.txt，每条命令是否有完整输出与 EXIT_CODE 标记。
2. REPORT-BIND-01（P0）：检查 BASE-001-TRAE-REPORT.md 任务元数据是否记录 implementation commit / review-target commit / 返工 docs commit。
3. VERIFY-BLOCK-01（P0）：核对 evidence 中 7 条验收命令的退出码是否均为 0；PR checks 的 CI 覆盖不在 Trae 权限内，请基于本地 evidence 判定。
4. ROLLBACK-01（P1）：检查 BASE-001-TRAE-REPORT.md 第 9 节是否提供回滚说明。

【第四步：Disputed Finding DF-RULES-01 复核】
上一次验收中，GPT 指出 docs/ai/COLLABORATION-RULES.md、REVIEW_POLICY.md、CONFLICT-RESOLUTION.md 在当前分支不存在（Disputed Finding / Process）。

Trae 复核结论（见 BASE-001-TRAE-REPORT.md 第 10 节）：
- docs/ai/ 目录在本地工作区存在（含 COLLABORATION-RULES.md 等 10+ 文件），但未提交到远端 HEAD a167343，故 GPT 只读远端时无法看到。
- 根因：docs/ai/ 由之前会话创建，属仓库整理任务范围，未在 BASE-001 返工 commit 中提交（遵循"隔离当前任务"原则）。
- 请求：GPT 基于本地工作区事实重新核实 DF-RULES-01；该 Disputed Finding 不影响 MVP_FAIL 整体结论（基于 3 个 P0）。

请基于最新事实重新判定 DF-RULES-01 是否仍成立，并在审查报告中记录复核结论。

【第五步：验收结论与输出】
- 验收结论必须为 MVP_PASS / MVP_PASS_WITH_DEBT / MVP_FAIL 三种之一（定义见 docs/ai/COLLABORATION-RULES.md 第 11 节与 docs/ai/REVIEW_POLICY.md）。
- 验收结果必须生成完整的 docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md 内容（覆盖上一次版本，模板见 docs/lumen-v2/templates/GPT-ACCEPTANCE-REPORT.md）。
- 给出 STATE、PROJECT-MEMORY、DECISION-LOG、CHANGELOG、SESSION-HANDOFF 需要更新的完整 patch。
- 若当前环境具备 GitHub 写入能力，直接按 AGENTS.md 提交（提交信息：docs(lumen-v2): review BASE-001）。
- 若只有只读能力，明确说明「未写入仓库」，输出完整文件或 patch 由用户或 Trae 原样提交，不得声称已 push。
- 不得在证据不足时放行验收；不得自行将任务移动到 completed；不得创建下一项 active task（这些由 GPT 验收通过后由 Trae 落库，详见 docs/ai/COLLABORATION-RULES.md 第 3.1 节）。

【第六步：异常处理标准动作】
遇到以下情况按规则处理（详见 docs/ai/COLLABORATION-RULES.md 第 5 节冲突解决流程）：

1. 若 nextActor != gpt：停止执行，明确说明应由 Trae 还是用户接手，不强行推进。
2. 若任务包基于旧 commit（审查证据与当前 HEAD 不符）：不根据旧状态审查，请求基于最新 PR/commit 重新读取，记录 Disputed Finding（模板见 docs/ai/CONFLICT-RESOLUTION.md 第 4 节）。
3. 若发现 Execution Conflict（GPT 任务说明与仓库已接受事实重大冲突）：记录到任务文件 Review History，状态推进至 awaiting_user_decision、nextActor=user，不替用户裁决。
4. 若发现安全风险（密钥泄露、数据损坏、权限绕过等）：立即停止相关合并或推进，报告安全风险，状态推进至 blocked、nextActor=user。
5. 若证据不足以作出结论：不得放行验收，明确列出缺失证据并要求 Trae 补充。
```
