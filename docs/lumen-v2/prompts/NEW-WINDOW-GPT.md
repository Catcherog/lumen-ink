# 新对话启动词｜GPT

将下面代码块内容复制到新的 GPT 对话即可。当前为 **UI-001 验收场景模板**，Trae 实施完成后填入实际值（仓库地址、分支、任务 ID、状态、commit SHA、evidence 路径）。

> 完整协作规则以 `docs/ai/COLLABORATION-RULES.md` 为权威入口。本启动词仅提供启动流程，详细规则见上述文件。
>
> **本次为 UI-001 实施完成后的首次验收**：Trae 已在 `lumen/ui-001-trae` 分支完成 V2 外壳实施，请求 GPT 按 Gate UI-001 只读验收。

```text
请打开公开 GitHub 仓库 https://github.com/Catcherog/lumen-ink.git 的 lumen/ui-001-trae 分支（或合并到 docs/lumen-v2-repo-collaboration 的 PR）。
本窗口不使用任何旧聊天记忆，只以仓库为准。完整协作规则以 docs/ai/COLLABORATION-RULES.md 为权威入口，本启动词仅提供启动流程，详细规则见上述文件。

【背景：本次为 UI-001 实施完成后的首次验收】
- 前置任务：BASE-001 已通过 GPT 验收（MVP_PASS_WITH_DEBT，2026-07-17），工程基线已恢复
- 当前任务：UI-001 V2 工作台外壳
- Trae 实施报告：docs/lumen-v2/reports/UI-001-TRAE-REPORT.md（Trae 实施完成后填入实际路径）
- implementation commit：<Trae 实施完成后填入实际 SHA>
- evidence 目录：docs/lumen-v2/evidence/UI-001/（Trae 实施完成后填入实际内容）

【第一步：按顺序读取以下项】
1. AGENTS.md
2. docs/lumen-v2/state/STATE.json
3. docs/lumen-v2/START-HERE.md
4. docs/lumen-v2/state/PROJECT-MEMORY.md
5. docs/lumen-v2/state/DECISION-LOG.md
6. STATE.json.activeTaskPath 指向的任务文件（docs/lumen-v2/tasks/active/UI-001.md）
7. docs/lumen-v2/state/SESSION-HANDOFF.md
8. docs/lumen-v2/reports/UI-001-TRAE-REPORT.md（Trae 实施完成后填入实际路径）
9. docs/lumen-v2/evidence/UI-001/（Trae 实施完成后填入实际内容）

【第二步：先汇报，再执行】
读取完成后必须先输出以下标准化汇报，再决定是否执行任务：

仓库：https://github.com/Catcherog/lumen-ink.git
分支/commit：lumen/ui-001-trae（implementation commit <Trae 填入>）
当前任务：UI-001
状态：awaiting_gpt_acceptance
nextActor：gpt
允许修改范围：只读验收
阻塞项：无

【第三步：本次验收重点（Gate UI-001）】
按 docs/lumen-v2/specs/07-ACCEPTANCE-PLAN.md 第 3 节 Gate UI-001 验收口径：

1. Feature flag：VITE_EDITOR_V2=false 时 Legacy 行为不变；本地/Preview 可开启 V2；Production 无变量时必须为 false；提供切换和回滚说明。
2. 顶栏：不显示 Provider/模型/API Key/伪造云保存状态；显示光砚标识、项目名、临时状态（「当前会话」）、对比/导出/设置入口、退出登录。
3. 左栏：稳定文字标签（项目/人物/色彩/清理/局部/导出），文字不依赖 hover 或展开态。
4. 底部版本占位：明确显示「版本记录将在 VERSION-001 启用」，不把 history 改名为版本，不显示虚假 V1/V2。
5. 布局：EMPTY 与 READY 均可用；1440×900 和 1280×800 无横向溢出。
6. 临时兼容：不新增第二个活跃「生成预览」按钮；现有「应用/提交」在 V2 兼容区域暂时保留但必须标记为 FLOW-001 临时债务；V2 Production flag 保持关闭。
7. 不改 Provider、API、Prompt 和生成结果。
8. 视觉证据：Legacy 1440×900、V2 EMPTY 1440×900、V2 READY 1440×900、V2 READY 1280×800、feature flag 切换证据、无横向溢出证据。

【第四步：BASE-001 遗留债务约束检查】
UI-001 实施时应遵守 BASE-001 遗留债务约束（见 docs/ai/TECH_DEBT.md）：

- DEBT-EVIDENCE-01：UI-001 evidence 应在 clean checkout / git worktree 执行验收命令；结果文件统一 UTF-8 无 BOM；evidence README 声明工作区状态。
- 不在 UI-001 顺手修复 BASE-001 的 P2 债务。
- 不在 UI-001 顺手提交 docs/ai/ 目录（由独立 docs-only 任务处理）。

请核对 Trae 是否遵守上述约束。若 UI-001 evidence 仍在非 clean 工作区执行或使用 UTF-16/BOM，应作为新债务登记或要求 Trae 修正。

【第五步：验收结论与输出】
- 验收结论必须为 MVP_PASS / MVP_PASS_WITH_DEBT / MVP_FAIL 三种之一（定义见 docs/ai/COLLABORATION-RULES.md 第 11 节与 docs/ai/REVIEW_POLICY.md）。
- 验收结果必须生成完整的 docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md 内容（模板见 docs/lumen-v2/templates/GPT-ACCEPTANCE-REPORT.md）。
- 给出 STATE、PROJECT-MEMORY、DECISION-LOG、CHANGELOG、SESSION-HANDOFF 需要更新的完整 patch。
- 若当前环境具备 GitHub 写入能力，直接按 AGENTS.md 提交（提交信息：docs(lumen-v2): review UI-001）。
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

## 下次任务时更新清单

Trae 在 UI-001 实施完成、回传报告后，需更新本启动词以下字段：

- 分支名（若使用 `lumen/ui-001-trae` 或合并到 `docs/lumen-v2-repo-collaboration` 的 PR）
- implementation commit SHA
- Trae 实施报告路径（`docs/lumen-v2/reports/UI-001-TRAE-REPORT.md`）
- evidence 目录路径与内容（`docs/lumen-v2/evidence/UI-001/`）
- STATE.json 当前状态（应为 `awaiting_gpt_acceptance / nextActor=gpt`）

## 历史启动词

### BASE-001 返工后重新验收（2026-07-17，已完成）

GPT 已完成 BASE-001 复核，结论 `MVP_PASS_WITH_DEBT`。原启动词已归档至 git 历史（commit `b015531` 之前的版本）。
