# GPT Review — LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R5

**Date**: 2026-07-22
**Reviewer**: GPT (Web, remote read-only review)
**Task ID**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-TWO-PHASE-DELETE-PREVIEW-ENV
**Branch Reviewed**: `lumen/cloudbase-nosql-implement-01-fix-r5` (remote, read-only)
**Implementation SHA**: `6b4b379` (full: `6b4b379d8e280edd023c9242ba577073ff96b12b`)
**Evidence Closure HEAD (at review time)**: `98764ad` (docs-only backfill commit)
**Base SHA**: `342541d` (FIX-R4 state commit)
**Ancestor verification**: `6b4b379` is an ancestor of `98764ad` (confirmed)

## Verdict

**FIX_REQUIRED** (changes_requested)

R5 的两阶段删除屏障、确定性交错测试和 VERCEL_ENV 修正方向基本正确，但仍有一个 P1 级 Storage 恢复缺陷，并且 AC-29、AC-37 的证据闭合仍不成立。当前不能判定 40/40 PASS，也不能进入 Preview。

本次完成了远端 GitHub 分支与代码的只读核查；没有独立运行本地测试，也无法独立确认本地 worktree 状态。上传的完成包是提交前版本，仍包含 TODO/PENDING，因此最终判断以远端 `6b4b379 → 98764ad` 为准。

## Acceptance Criteria Review

### 已有充分改善

以下核心修正可以接受为代码级通过：

- **AC-09 / AC-10**: Phase A 通过独立事务提交 tombstone，Phase B 才读取 child 快照并删除。
- **AC-12**: child create 的 project/tombstone 检查与写入进入同一事务，避免原来的明显 TOCTOU。
- **AC-22 / AC-27**: Preview 改用 VERCEL_ENV 判断，缺失或非法值 fail-closed。
- Phase B 的删除顺序和 N+3 限制检查逻辑基本清晰。

### 仍未通过

#### P1-01: Cleanup ledger 在 Storage cleanup 前被删除

`ProjectService.deleteProject()` 当前顺序是：

1. `deleteCascade()`
2. 读取 cleanup keys
3. 立即调用 `deleteCleanupKeys()`
4. 随后才逐个删除 Storage 对象

也就是说，恢复记录在实际清理发生前已经消失。若进程在第 3、4 步之间崩溃，或任意 Storage 删除失败，sweeper 已经没有权威记录可以重放。

这与状态文件声称的"cleanup keys 在成功后删除、崩溃时保留"不一致。

现有 T5 没有覆盖真实服务路径：它明确绕过 `ProjectService.deleteProject()`，直接调用 `deleteCascade()`，因此自然不会触发过早删除 cleanup ledger 的代码。

**影响**:
- crash recovery 不成立
- partial Storage failure 的持久化重试不成立
- AC-14 只能证明"快照内容正确"，不能证明端到端 cleanup lifecycle 正确
- 完成包中的 T5 恢复结论不可接受

#### P2-01: AC-29 仍没有真实 Smoke Harness

R4 的问题是"只有纯函数导出，没有共享 Smoke Harness"。R5 仍然只以 `isPreviewEnvironment` 和 `validatePreviewIsolation` 的纯函数导出作为 AC-29 证据。远端 15 文件 diff 中没有新增或修改实际 smoke harness/部署检查入口。

`select.ts` 只声明这些函数"可供 Smoke Harness 调用"，不等于已经存在 Harness 并实际复用。

而 STATE.json 仍将"pure, exported, tested"直接标记为 AC-29 PASS。

**AC-29: FAIL**

#### P2-02: AC-37 的 SHA 陈述再次失真

远端实际提交关系是：

```
342541d
  └─ 6b4b379  implementation
       └─ 98764ad  docs-only backfill / current branch HEAD
```

但远端 STATE.json 和 gate evidence 声称：

```
Local HEAD = Remote HEAD = 6b4b379
```

在 `98764ad` 已提交并推送后，这个陈述已经不成立。远端状态文件仍保存该错误值。

正确证据应是：

- Implementation SHA = `6b4b379`
- Evidence Closure HEAD = `98764ad`
- Remote branch HEAD = `98764ad`
- `6b4b379` is an ancestor of `98764ad`

不得再通过一个新的"回填 HEAD SHA"提交制造下一轮自指矛盾。

#### P2-03: 部署声明需要校正

GitHub 当前为 `98764ad` 返回了成功的 Vercel 状态并关联部署目标。因此证据不应继续绝对声称"未部署"。

建议改为：

> 未手动执行部署、未进行真实 Preview 运行时验证、未使用真实 CloudBase 凭据或执行真实数据写入；分支 push 触发了 Vercel 自动 Preview 构建/部署状态。

## Test Coverage Review

报告中的 604 tests / 8 门禁 PASS 可作为 Trae 提交的测试证据接受，但缺少以下关键回归测试：

- **Storage 单项失败**: cleanup ledger 必须继续存在；ledger 只保留未清理成功的 keys，或提供等价的幂等恢复机制。
- **真实服务路径 crash/retry**: 必须通过 `ProjectService.deleteProject()` 或共享 cleanup worker 测试；不得再用直接调用 `deleteCascade()` 代替真实路径。
- **真正的 Smoke Harness**: Harness 必须调用与 selector 相同的 `isPreviewEnvironment` / `validatePreviewIsolation`；非法 Preview 配置必须在 SDK 初始化前失败；Harness 本身应进入门禁命令。

## Required Fixes — FIX-R6 Task

- **Project ID**: picture-edit / lumen-v2
- **Task ID**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-CLEANUP-LEDGER-CLOSURE
- **Risk Level**: HIGH
- **Recommended Owner**: Trae
- **Recommended Route**: R3 (GPT 规划 → Trae 修复 → GPT 证据审查 → Codex 限域只读审计)

### Objective

修复 Storage cleanup ledger 的生命周期，补齐真实 Smoke Harness，并消除最终 SHA 与部署证据矛盾。

### In Scope

- `ProjectService.deleteProject()` cleanup 顺序
- cleanup ledger 更新/重放能力
- Storage partial failure 与 crash recovery 测试
- Preview isolation Smoke Harness
- FIX-R6 状态和证据修正

### Out of Scope

- 不重构整个 persistence interface
- 不升级 CloudBase SDK
- 不合并 main
- 不配置真实 CloudBase/Vercel 环境
- 不扩大审计至已通过的 transaction/idempotency workstreams

### Acceptance Criteria (AC-R6-01 ~ AC-R6-10)

| AC | Description |
|----|-------------|
| AC-R6-01 | 在 Storage cleanup 全部完成前，不得删除 cleanup ledger |
| AC-R6-02 | 部分对象删除失败时，失败 keys 必须持久化并可重放 |
| AC-R6-03 | 已成功删除的 keys 不得导致后续 sweeper 永久失败 |
| AC-R6-04 | 新增真实 ProjectService crash/retry 测试，不得直接绕过服务层 |
| AC-R6-05 | 新增实际 Smoke Harness，并复用生产 selector 的相同安全函数 |
| AC-R6-06 | Smoke Harness 进入 gate，非法 Preview 配置必须非零退出 |
| AC-R6-07 | 证据明确区分 implementation SHA、evidence commit 和 remote HEAD |
| AC-R6-08 | 部署声明改为"无手动部署/无真实运行时验证"，不得否认自动 Vercel Preview 状态 |
| AC-R6-09 | 全部原有门禁与测试继续通过 |
| AC-R6-10 | `readyForPreview=false` 保持不变 |

### Implementation Guidance

推荐提取一个共享 cleanup replay 流程：

1. 读取剩余 cleanup keys
2. 逐项执行对象删除
3. 成功项从 ledger 中移除
4. 失败项继续保留
5. ledger 为空后才删除 ledger 文档

必须考虑以下 crash window：

- 对象已经删除
- 但 ledger 尚未更新
- 进程崩溃

因此重放流程应把"对象/metadata 已不存在"视为该 key 已完成，或者使用等价的幂等设计。不能仅把完整原始 key 列表永久保留，否则成功项的 metadata 已删除后，后续 `resolveFileId()` 可能无法重放。

Smoke Harness 必须是实际可执行入口，例如：

```
scripts/verify-preview-isolation.*
```

并真实 import/调用生产安全判断，而不是在测试中复制逻辑。

### Evidence Rule

不要再提交"回填当前 HEAD SHA"的自指提交。

仓库文件记录：

- Implementation SHA
- Evidence commit parent/relationship

最终 push 后的：

- Local HEAD
- Remote HEAD
- `git status`
- ancestor verification

放入仓库外完成包或命令输出证据。

### Stop Conditions

- 不允许把 readyForPreview 改为 true
- 不允许真实 CloudBase 写入
- 不允许合并 main
- cleanup ledger 在失败路径丢失时立即停止并报告
- Smoke Harness 未实际执行时不得标记 AC-29 PASS

### Codex Necessity

本轮先不让 Codex 审查现有 R5。

Trae 完成 FIX-R6 并通过 GPT 证据复审后，必须进行一次 Codex READ_ONLY 限域审计。原因是该任务直接涉及并发事务、两阶段状态、崩溃恢复和幂等重放，符合 Codex 升级条件。

Codex 只需审计：

- cleanup ledger 的 crash-window 与 partial-failure 语义
- 两阶段 tombstone 与 child create 的并发不变量
- Preview Smoke Harness 是否真正复用生产逻辑
- 不重新审计已闭合的其他 workstreams

## Status Transition

- **Previous**: `fixR5Status = awaiting_gpt_acceptance / nextActor = gpt`
- **Current**: `fixR5Status = changes_requested / nextActor = trae`
- **New Task**: `fixR6TaskId = LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-CLEANUP-LEDGER-CLOSURE`
- **readyForPreview**: remains `false`
