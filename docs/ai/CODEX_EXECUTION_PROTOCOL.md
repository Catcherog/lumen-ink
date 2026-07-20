# Codex Execution Protocol — 光砚 Lumen Ink V2

## Project Identity

- Project ID: `LUMEN-V2`
- Project Name: 光砚 Lumen Ink V2
- Repository: `D:\\360Downloads\\Trae 项目\\picture-edit`

## Authority and Role

本文件是显式 Codex 任务的专项权威协议。若一般协作文档仍把网页 GPT 描述为可直接读取、修改或独立验证本地仓库，该描述视为旧能力假设，以 `AGENTS.md` 与本文件的角色边界为准。

Codex 是高成本高级仓库执行者，仅处理明确指定的高风险、复杂或疑难部分。Trae 仍是默认本地执行者、验证者、Git 操作者和项目状态维护者；Web GPT（网页端 GPT）是规划者、任务拆解者、故障分析者和证据审查者。

## Invocation Gate

仅在用户直接授权，或任务包明确给出 `Recommended Owner: CODEX` / `Status: CODEX_REQUIRED` 时调用 Codex。普通实现、机械重构、文档整理、常规测试补充和明确 Bug 默认交给 Trae。

有效任务必须给出：

- Project ID、Task ID、Repository、Branch、Baseline Commit、Codex Mode。
- Objective、Why Codex Is Required。
- Allowed Read Scope、Allowed Write Scope、Prohibited Paths。
- Business Invariants、Acceptance Criteria、Required Verification。
- Stop Conditions。

缺少的动态仓库事实不得从模型记忆补全；应从当前仓库读取，无法确认时停止并报告。

## Required Preflight

1. 确认仓库根目录、当前 Branch、HEAD 和 Git Status。
2. 确认 Baseline Commit 存在并与任务一致。
3. 识别并保护任务开始前已有的未提交修改。
4. 确认允许读取、允许修改和禁止修改的路径。
5. 确认 Business Invariants、Acceptance Criteria 和验证命令可执行。
6. 发现需求、架构、权限、基线或范围冲突时立即停止。

## Execution Modes

### AUDIT

- 只读，不得修改文件、创建 Commit 或维护项目状态。
- 只独立验证任务明确指定的仓库声明、业务不变量和验收条件。
- 报告实际执行的命令、证据、发现、剩余风险和未验证区域。

### FIX

- 只做满足 Objective 和 Acceptance Criteria 所需的最小修改。
- 不修改 Out of Scope 文件，不进行无关重构或继续优化。
- 执行规定验证，记录准确命令和 Exit Code。
- 创建一个仅包含 Codex 自有修改、可识别的本地 Commit。
- 除非另行授权，不得 Push、Merge、创建 PR、执行生产写入或推进普通项目状态。

## Handoff to Trae

- Codex 与 Trae 不得并行修改同一 Branch 或 Worktree。
- Trae 在转交前停止修改、记录 Branch/HEAD/Git Status/Baseline，并明确文件白名单；高冲突风险时优先提供独立 Branch 或 Worktree。
- Trae 接管后逐文件审查 Codex Commit，重新运行 Required Verification，并负责 Push、PR 和正常状态文件维护。

## Required Output

### FIX

```text
Result:
Commit Hash:
Changed Files:
Diff Summary:
Commands Run:
Exit Codes:
Acceptance Criteria Mapping:
Remaining Risks:
Unverified Areas:
Recommended Next Action:

Status: CODEX_FIX_READY_FOR_TRAE_REVIEW
```

### AUDIT

```text
Verified Commit:
Repository Checks:
Commands Run:
Business Invariant Review:
Findings:
Remaining Risks:

Status: REPOSITORY_VERIFIED_PASS | REPOSITORY_VERIFICATION_FAILED
```

## Stop Conditions

完成或明确定位指定问题、检查指定不变量、执行指定验证并报告所有剩余风险后立即停止。不得越过真实写入、迁移、发布、范围扩张或用户裁决门禁。
