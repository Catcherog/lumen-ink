<!--
  模板用途：项目当前状态文件，仅记录当前快照，不作为完整历史日志。
  来源改造方案章节：第 14 节。
  注意：详细历史应放在任务、PR 和 Git 提交中，本文件只反映当前状态。
-->

# Project State — 光砚 Lumen Ink V2 (picture-edit)

## Current Stage
持久化与任务基础设施选型阶段（storage-selection）。FLOW-001 已通过 GPT 第三轮验收（`MVP_PASS`），当前激活 STORAGE-001。

## Current Milestone
完成 STORAGE-001 的至少两个完整方案比较、合成数据 PoC、评分矩阵、稳定接口与合约测试，并由 GPT/用户冻结方案。

## In Progress
- STORAGE-001：持久化与任务基础设施技术选型，当前状态 `ready_for_trae / nextActor=trae`。仅允许方案比较、稳定接口、合成数据 PoC 与合约测试；未经 GPT/用户冻结不得进入 PERSIST-001。

## Recently Completed
- FLOW-001：配方模型与单一生成操作（GPT 第三轮验收 `MVP_PASS`，2026-07-18）。第二轮两个 P0 已关闭；GPT 独立 8 条门禁全绿（client 104、server 16、root 120）。
- UI-001：V2 工作台外壳（GPT 第三轮验收 `MVP_PASS`，2026-07-17）。唯一 R2 P0 已关闭；本轮 8 条门禁全绿。
- BASE-001：工程基线修复（GPT 已验收，`MVP_PASS_WITH_DEBT`，2026-07-17）。lint 0/0、typecheck 通过、21 个测试通过（client 5 + server 16）、build 通过；5 个面板补充扫描；最小重构提取 `getProviderOperationType`。5 项 P2/Process 债务已登记 `docs/ai/TECH_DEBT.md`。
- REPO-SEC-001：公开仓库内容安全审查（GPT 已验收，Option A 已执行）。
- SCAN-001：主仓只读扫描与冻结下一阶段决策（GPT 已验收）。
- 产品与 UI 审计、V2 定位 / 范围 / UI / PRD / 技术 / 验收规格已冻结。

## Next Priorities
1. Trae 按内部稳定版快速计划执行 STORAGE-001：恰好两个完整方案、合成数据 PoC、成本/迁移/备份/回滚与稳定接口合约。
2. GPT/用户冻结 STORAGE-001 方案，未冻结前不得启动 PERSIST-001。
3. 方案冻结后连续执行已确认的 PERSIST-001 合并闭环与三个内部安全单元；ROUTING、完整公开发布 HARDEN 和非关键体验优化延期。

## Active Blockers
- PERSIST-001 仍处于 blocked / backlog；STORAGE-001 方案冻结前不得启动。

## Known Risks
- 同步请求最长接近 Vercel 平台上限（90 秒），无法可靠取消、恢复和追踪。
- 图片与 history 缺乏可靠持久化，主要在前端内存。
- Vercel `/tmp` Provider 配置会随实例回收丢失。
- 默认密码 / JWT fallback、无限制 CORS 和日志内容存在安全风险。
- 当前自动化门禁为 client 104 + server 16 = 120 tests；后续任务继续补对应合约/集成覆盖。
- `docs/ai/` 三个权威文件未提交到远端分支（DF-RULES-01，另建 docs-only 任务处理）。

## Last Updated
2026-07-18

---

## 推进计划

> 本章节用于规划 BASE-001 验收后到 P0 上线前的 MVP 推进路径。任务依赖以 `docs/lumen-v2/tasks/` 中各任务文件声明的前置条件为准，状态流转以 `docs/lumen-v2/state/STATE.json` 为唯一事实来源。

### 1. 任务依赖图

```text
[BASE-001] 工程基线修复  (当前: completed, MVP_PASS_WITH_DEBT, 2026-07-17)
    │
    ├─ 通过 (MVP_PASS_WITH_DEBT)
    │     → 已归档 BASE-001 至 tasks/completed/
    │     → UI-001 已完成并归档
    │     → 5 项 P2/Process 技术债同步写入 docs/ai/TECH_DEBT.md
    │
    └─ (原驳回路径不再适用，BASE-001 已通过)
    ↓
[UI-001] V2 工作台外壳  (completed, MVP_PASS, 2026-07-17)
    │  前置依赖: BASE-001 通过 (已满足)
    │  预计验收口径: Gate UI-001（见 07-ACCEPTANCE-PLAN.md 第 3 节）
    │    - VITE_EDITOR_V2=false 时 Legacy 行为不变
    │    - 本地/Preview 可开启 V2，Production 默认关闭
    │    - 1440×900 和 1280×800 无横向溢出
    │    - 顶栏不显示 Provider/模型；左栏每个入口始终有文字标签
    │    - EMPTY 与 READY 布局可用；底部版本条仅显示明确占位，不伪造版本
    │    - 本轮没有改 Provider、API 或存储
    │  MVP 收尾判定: V2 外壳在 1440×900/1280×800 可用且可回滚；兼容期旧 CTA 已记录为 FLOW-001 待办
    ↓
[FLOW-001] 配方模型与单一生成操作  (completed, MVP_PASS, 2026-07-18)
    │  前置依赖: UI-001 通过
    │  预计验收口径: Gate FLOW-001（见 07-ACCEPTANCE-PLAN.md 第 3 节）
    │    - 页面只剩一个模型调用主按钮"生成预览"
    │    - 所有工具参数进入 EditRecipe
    │    - 人像参数为五档；保护项默认开启
    │    - "补充要求"没有独立提交
    │    - Prompt 编译器版本可追踪
    │    - 现有 Provider 输出行为未被无意改变
    │  MVP 收尾判定: 单一 CTA 落地；旧"应用/提交"按钮全部移除或降级；Recipe 与 Prompt 编译器有单元测试
    ↓
[STORAGE-001] 持久化与任务基础设施技术选型
    │  前置依赖: FLOW-001 通过
    │  预计验收口径: Gate STORAGE-001（见 07-ACCEPTANCE-PLAN.md 第 3 节）
    │    - 至少比较 2 个可执行方案（元数据 DB / 图片对象存储 / 签名 URL / GenerationJob 持久化 / 长任务执行 / 本地开发替代）
    │    - 明确 Vercel 适配和后台任务策略
    │    - 提供最小 PoC 证据（合成图，不接入生产数据）
    │    - 给出成本、迁移、备份、删除和回滚
    │    - GPT/用户冻结方案后才能进入 PERSIST-001
    │  MVP 收尾判定: 方案冻结并输出 docs/lumen-v2/storage-options.md；未接入生产数据；IndexedDB 仅作缓存/PoC
    ↓
[PERSIST-001] 项目版本与可恢复生成闭环
    │  前置依赖: STORAGE-001 方案冻结
    │  预计验收口径:
    │    - 上传创建 Project、原图 Asset 和 V0；版本不可变
    │    - 创建 jobId 并持久化真实阶段 (queued/uploading/analyzing/generating/postprocessing/saving/succeeded/failed/cancelled)
    │    - 查询状态、取消和重试
    │    - 断线/刷新恢复
    │    - 标准 errorCode 和 diagnosticId
    │    - 成功顺序为 Asset → Version → Job succeeded；失败不创建成功版本
    │    - 真实版本条支持查看、对比、激活和采用；删除项目级联清理资产
    │    - 旧 edit_history 先备份再显式导入可恢复条目
    │    - 测试超时、额度不足、网络中断、保存失败
    │    - 内部安全底线：secret fail-fast、登录限流、CORS allowlist、图片解码限制、Provider/health/log 脱敏
    │  MVP 收尾判定: history 不冒充 Version；旧 /api/edit 转为受控兼容层；不再以同步请求为唯一工作模式；禁止伪造百分比；S0/S1=0
    ↓
[ROUTING-001] 智能模型路由  (内部稳定版延期，前置 PERSIST-001)
    │  预计验收口径:
    │    - 集中 Provider/模型能力矩阵（不在多个文件复制字符串判断）
    │    - 质量/均衡/速度策略与 fallbackChain
    │    - 失败转移按可解释规则
    │    - 高级抽屉允许查看或锁定模型（不匹配时禁止提交并给出原因）
    │    - 记录路由原因、延迟和成本档位
    │  MVP 收尾判定: 前端默认不显示 Provider/模型；能力矩阵有单元测试；不暴露 API Key
    ↓
[HARDEN-001] 完整公开发布安全、可靠性与发布（内部稳定版延期）
       前置依赖: 上述任务基本就绪，进入 P0 发布前门禁
       预计验收口径: Gate D（见 07-ACCEPTANCE-PLAN.md 第 4 节）
         - Production 缺少安全变量时启动失败（secret fail-fast）
         - 删除默认密码、JWT 和加密 Key fallback
         - CORS allowlist；登录限流
         - 上传 MIME/大小/像素/解码校验
         - Provider Key 不返回前端；Provider 配置迁离 /tmp
         - health 与 edit/detect 日志脱敏
         - 项目删除和资产清理；安全回归测试
         - Production flag 切换和回滚文档
       MVP 收尾判定: S0=0、S1=0；S2 有明确清单和计划；任何 S0/S1 不得作为已知限制放行
```

### 2. BASE-001 验收两种场景应对流程

#### 场景 A：MVP_PASS / MVP_PASS_WITH_DEBT（通过）

1. GPT 输出审查报告至 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`，结论为 `MVP_PASS` 或 `MVP_PASS_WITH_DEBT`。
2. Trae 落库（按 `docs/ai/TRAE_COLLABORATION_GUIDE.md` 的「GPT 验收后必须新增/更新」清单）：
   - 将 BASE-001 从 `tasks/active/` 移至 `tasks/completed/`
   - 从 `tasks/backlog/` 激活 UI-001 至 `tasks/active/`
   - 更新 `STATE.json`：`currentTask=UI-001`、`status=ready_for_trae`、`nextActor=trae`、`lastAcceptedTask=BASE-001`、`activeTaskPath` 指向 UI-001 任务文件、`latestGptReview` 指向 BASE-001 审查报告、`lastUpdatedAt` 更新、`lastUpdatedBy=trae`；从 `blockedTasks` 移除 UI-001
   - 更新 `PROJECT-MEMORY.md` 第 5、6 节
   - 更新 `DECISION-LOG.md`、`CHANGELOG.md`、`SESSION-HANDOFF.md`
3. 同步更新 `docs/ai/PROJECT_STATE.md`（In Progress / Recently Completed / Active Blockers 摘要）。
4. 若 `MVP_PASS_WITH_DEBT`，将 GPT 指出的 P1 技术债追加到 `docs/ai/TECH_DEBT.md`，标注 `Introduced By: BASE-001`，不在 UI-001 中顺手修复。
5. 创建分支 `lumen/ui-001-trae`，按 `docs/lumen-v2/tasks/active/UI-001.md` 进入 V2 外壳实施。
6. UI-001 实施完成后回传报告，状态再次进入 `awaiting_gpt_acceptance`。

#### 场景 B：MVP_FAIL + FIX_PACKET（驳回）

1. GPT 输出审查报告至 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`，结论为 `MVP_FAIL`，附 `FIX_PACKET`（含 P0 blockers 清单、违规验收条件、最低修复要求、验证命令）。
2. Trae 落库：
   - 更新 `STATE.json`：`status=changes_requested`、`nextActor=trae`、`lastUpdatedAt` 更新、`lastUpdatedBy=trae`
   - 在 BASE-001 任务文件追加 Review History 条目
   - 更新 `SESSION-HANDOFF.md` 说明驳回结论与待修缺陷
3. Trae 仅修复 `FIX_PACKET` 中列出的 P0 问题及其直接回归，**不主动处理 P1 和 P2**（按 `docs/ai/REVIEW_POLICY.md` 与 `AGENTS.md` 第 7 节）。
4. 修复后重新执行 BASE-001 的全部验收命令（lint / typecheck / test / build）并保留输出证据。
5. 在 `docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md` 追加缺陷修复记录（修改文件、根因、测试、截图或日志）。
6. 必要时在 `docs/lumen-v2/evidence/BASE-001/` 下补充脱敏证据。
7. 重新提交 PR，更新 `STATE.json`：`status=awaiting_gpt_acceptance`、`nextActor=gpt`。
8. UI-001 及后续任务保持 `blocked`，**禁止并行启动**；不得跳过依赖图提前进入下一任务。

### 3. 支线与模板任务

- **ROUTING-001（智能模型路由）**：前置依赖为 PERSIST-001 通过。可与 HARDEN-001 准备阶段并行，但能力矩阵单元测试、三类策略路由测试、故障转移测试必须独立通过。前端默认不显示 Provider/模型，高级模型设置不回一级顶栏。
- **ACCEPTANCE-FIX（验收缺陷修复模板）**：非主线任务，用于任意任务被驳回后的缺陷修复流程。规则：只修指定缺陷、先复现再修改、增加阻止回归的测试、不将 S0/S1 降级为"已知限制"、不顺手重构无关代码。每次驳回按 `docs/lumen-v2/tasks/backlog/ACCEPTANCE-FIX.md` 模板生成针对该任务 ID 的修复记录。

### 4. 推进过程的全局约束

- 每次只执行一个任务 ID，禁止并行多任务（`AGENTS.md` 第 7 节）。
- 每个任务必须形成可审计的分支、commit 和 PR；一个 PR 只对应一个任务 ID。
- 状态流转只能由 Trae 在 GPT 验收后或用户决策后推进；Trae 不得自行宣布验收通过，不得把任务移动到 `complete`。
- 未经 GPT/用户冻结的方案不得进入下一阶段（典型：STORAGE-001 未冻结不得进入 PERSIST-001）。
- 所有改造必须可回滚：UI-001 使用 `VITE_EDITOR_V2` feature flag；其他任务使用独立分支和提交级回滚。
- 证据必须使用授权测试图、合成图或充分脱敏截图，禁止真实客户数据、密钥或未脱敏 Prompt 进入仓库。

---

本项目的详细任务状态以 `docs/lumen-v2/state/STATE.json` 为准，本文件为标准化摘要。
