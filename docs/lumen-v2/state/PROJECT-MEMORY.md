# 00｜PROJECT MEMORY — 光砚 Lumen Ink V2

> 本文件是跨窗口记忆的第一入口。每轮结束必须更新“当前状态”和“下一步”。

## 1. 固定事实

- 产品：光砚（Lumen Ink），面向摄影工作室内部团队的 AI 人像修图工作台。
- 当前团队：3 人全职创业团队。
- 主仓路径：`d:\360Downloads\Trae 项目\picture-edit`。
- 当前前端：React 19 + Vite 6 + Tailwind 4。
- 当前后端：Express 4 + TypeScript。
- 当前部署形态：Vercel Serverless，`vercel.json` 的函数上限为 90 秒。
- 当前能力：Seedream、Gemini、OpenAI、GLM 四类可用 Provider；Jimeng 和 Custom 尚未实现。
- 当前编辑主链：前端 base64 → `/api/edit` 长同步请求 → Provider → 单结果 + history。
- 当前长期数据真相不存在：图片主要在前端内存，Provider 配置在本地 JSON 或 Vercel `/tmp`。
- 当前根构建、前后端 build 和 typecheck 通过。
- 当前 client lint 失败：2 errors + 2 warnings。
- 前后端均无 test 脚本。
- 业务中的转化、准确率和效率提升均为内部预估，不得写成已验证实验结论。

## 2. 冻结产品方向

### D-001：主产品定位

V2 主线为摄影工作室内部 Pro 工作台，不是通用图片生成器，也不做 Photoshop 全量替代。

### D-002：Pro 与 Preview 分离

P0 只实现 Pro 工作台。客户 Preview 模式进入 P1，使用独立入口和权限边界。

### D-003：模型能力后台化

默认界面隐藏 Provider 和模型名称。日常用户选择质量、均衡、速度策略；高级设置才允许锁定模型。

### D-004：单一主操作

最终 P0 页面只保留一个模型调用主按钮：`生成预览`。自由文本统一为 `补充要求`。

### D-005：编辑参数语义化

人像类参数采用关闭、轻微、自然、明显、强烈五档，默认不超过自然。

### D-006：版本优先于图层

每次成功输出创建不可变版本。P0 不实现 Photoshop 式图层。

### D-007：持久化必须支持 3 人团队

IndexedDB 可作为本地缓存和原型手段，但不得作为最终多人工作区的唯一真相。具体数据库、对象存储和任务执行方案在 `STORAGE-001` 技术选型后冻结。

### D-008：默认单结果

P0 每次生成一个候选版本。用户需要第二个候选时主动再次生成，避免默认双倍成本。

### D-009：旧 history 不自动伪迁移

旧 `edit_history` 不进行静默自动迁移。升级时先备份为只读数据；只有图片仍可访问且用户明确确认时才导入。

### D-010：V2 feature flag 范围

本地开发和 Vercel Preview 可开启；Production 默认关闭，直至 P0 验收通过。

### D-011：Provider 配置边界

Production 不再依赖 `/tmp` 或浏览器明文 Key。P0 生产环境优先使用环境变量；动态工作区密钥进入后续持久化方案。

### D-012：P0 认证范围

P0 允许 3 人共享的单工作区认证，但必须取消默认密码和 JWT fallback、增加失败限流。多用户/角色权限进入 P1。

### D-013：先恢复工程基线

在 UI 改造前必须先让 lint、test、typecheck、build 全部可执行且通过。

## 3. 产品目标

让 3 人摄影团队完成：

> 导入照片 → 选择修图任务 → 调整配方 → 生成预览 → 对比迭代 → 采用版本 → 导出

核心质量标准：

- 保留身份、构图、皮肤纹理、服装与背景；
- 失败不污染已有结果；
- 刷新和网络中断后可恢复；
- 每次输出有来源配方、任务状态和版本关系；
- 模型切换与失败转移尽量不打断用户。

## 4. 当前最高风险

1. 当前同步请求最长接近平台上限，无法可靠取消、恢复和追踪。
2. 图片和 history 缺乏可靠持久化。
3. Vercel `/tmp` Provider 配置会随实例回收丢失。
4. 默认密码/JWT、无限制 CORS 和日志内容存在安全风险。
5. 没有自动化测试，重构回归概率高。
6. 当前 UI 暴露底层模型，并存在多个竞争性主按钮。
7. 部分面板未在 SCAN-001 中逐行核对，编码前必须完成补充事实检查。

## 5. 当前状态

- [x] 产品与 UI 审计。
- [x] V2 定位、范围、UI、PRD、技术和验收规格。
- [x] `SCAN-001` 主仓只读扫描。
- [x] GPT 审核扫描报告并冻结下一阶段决策。
- [x] `REPO-SEC-001` 公开仓库内容安全审查（GPT 已验收，Option A 已执行）。
- [x] `BASE-001` 工程基线修复（GPT 已验收，`MVP_PASS_WITH_DEBT`，2026-07-17；5 项 P2/Process 债务已登记 `docs/ai/TECH_DEBT.md`）。
- [x] `UI-001` V2 外壳（GPT 第三轮验收 `MVP_PASS`，2026-07-17；R2 唯一 P0 已关闭）。
- [x] `FLOW-001` 配方和单一操作（GPT 第三轮验收 `MVP_PASS`，2026-07-18；URL-only 状态不变量与参考图端到端回归均关闭）。
- [x] `STORAGE-001` 技术选型（GPT 验收 `MVP_PASS_WITH_DEBT`，2026-07-18；候选 A 已冻结，D-040 契约收敛进入 PERSIST 首门）。
- [~] `PERSIST-001` 持久化生成闭环（GPT 证据验收 `EVIDENCE_REVIEW_PASS` / `MVP_PASS_WITH_POST_MERGE_GATE`，2026-07-20；已合并到 `main`（fast-forward push `76d18f7..f0e28dd`）；`gpt_evidence_review_pass / nextActor=gpt`，等 GPT 确认合并 + 决定下一步推进；Production Cron 注册与运行仍为合并后强制门禁，由独立任务 `PROD-CRON-VERIFY` 验证；PERSIST-001 在该任务通过前不归档）。
- [ ] P0 实施与验收。

## 6. 下一步

### 6.1 当前任务：PERSIST-001（gpt_evidence_review_pass / 已合并到 main / 等 GPT 推进）

任务 ID：`PERSIST-001`
状态：`gpt_evidence_review_pass`，`nextActor=gpt`（GPT 证据验收通过 + 已合并到 main，2026-07-20）。
合并：fast-forward push `76d18f7..f0e28dd` 到 `main`（非 force-push；main 是 lumen/persist-001-trae 的祖先）。
reviewVerdict：`MVP_PASS_WITH_POST_MERGE_GATE`（合并后强制门禁：Production Cron 注册 + 运行验证）。
前置依赖：FLOW-001 与 STORAGE-001 均已通过 GPT 验收。
任务目标：在一个任务/分支/最终验收周期内完成 D-040 契约收敛、CloudBase 生产适配、Project/Asset/V0、不可变 Version、可恢复 GenerationJob、刷新恢复、取消/重试、删除、旧 history 显式导入和内部安全底线。
任务文件：`docs/lumen-v2/tasks/active/PERSIST-001.md`（在 PROD-CRON-VERIFY 通过前不归档到 `tasks/completed/`）。
实施计划：`docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`。
Trae 报告：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`。
GPT 验收：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（含首轮 MVP_FAIL → P0 修复轮 → P0 修复轮 2 → FINAL-CLOSURE → FINAL-CLOSURE-FIX-01 EVIDENCE_REVIEW_PASS 节）。
证据目录：`docs/lumen-v2/evidence/PERSIST-001/`（gate-results.md + base-commit.txt + Vercel 验证归档）。
分支：`lumen/persist-001-trae`（已合并到 main，HEAD `f0e28dd`）。
累计变更：54 文件，+10945/-550（首轮实施）+ 多轮修复。
8 门禁：全绿（client 194 tests / server 224 tests / root 418 combined / lint 0 errors / build / check-lumen-collab；dist/ 已清理）。
范围遵守：单任务/单分支/单验收周期；D-040 契约收敛完成；未启动 ROUTING / STORAGE-002 / PERSIST-002；未改变冻结的 Provider/API/存储决策；保留工作区既有无关修改；未提交密钥或未脱敏证据。

#### 合并后强制门禁（PROD-CRON-VERIFY）

PROD-CRON-VERIFY 任务文件：`docs/lumen-v2/tasks/backlog/PROD-CRON-VERIFY.md`（pending，待 GPT 激活）。
- `production_cron_registration`：`PENDING_POST_MERGE`（Vercel Cron 只在 Production Deployment 上注册，Preview 分支不注册；合并后由 Vercel 自动注册）
- `production_cron_execution`：`NOT_TESTED`（合并前不可测）
- 通过条件：Production Deployment Ready + Cron Jobs 页面有 `/api/worker/recover` `0 0 * * *` 记录 + 首次调度或手动调用 HTTP 200 + Function Logs 无错误
- 通过后才能将 `production_cron_*` 字段改为 `VERIFIED`，才能将 PERSIST-001 归档到 `tasks/completed/`，才能正式解除 HARDEN-001 / ROUTING-001 阻塞

#### GPT 下一步（用户明确要求"快速推进项目"）

1. 确认合并结果（`mergeCompletedHead: f0e28dd`，远端 `main` 已更新）
2. 决定 PROD-CRON-VERIFY 激活方式（用户在 Vercel Dashboard 操作 / 并行推进 HARDEN-001）
3. 选择推进路径：选项 A 激活 PROD-CRON-VERIFY；选项 B 并行激活 HARDEN-001；选项 C 激活 ROUTING-001（前置 PERSIST-001 已满足）

#### PERSIST-001 实施摘要（2026-07-18）

- D-040 契约收敛：完整 Project/Asset/Version/GenerationJob 字段 + 9 阶段 Job 状态机 + `(projectId, idempotencyKey)` 唯一性 + lease/heartbeat/原子 claim + stale worker 拒写 + 同事务上下文。接口再次冻结。
- CloudBase/local/mock adapter：`cloudbase-mock.ts` + `local.ts` 通过同一最终合约；6 contract tests + 3 PoC tests 全绿。
- ProjectService：原子成功边界（Object upload → DB 事务 → 条件完成；失败补偿删除孤儿对象）；`validateImageBytes` 7-step 验证；级联删除（metadata 事务 + best-effort object cleanup）。
- GenerationService：`executeJob` 生命周期（claim → upload → analyze → generate → postprocess → save → succeeded）；`createJob` 幂等；`cancelJob` / `retryJob`（attempt+1, parentJobId）；`classifyProviderError` 错误分类（timeout/quota/network → 504/429/502）；两 worker 接管 + stale worker 拒绝。
- 认证 API：`createProjectsRouter` / `createJobsRouter` / `mountProjectJobsRoutes`；`Idempotency-Key` 必需；DomainError → HTTP status 映射；storageKey 脱敏为 `redacted://<last-segment>`。
- /api/edit 受控兼容层：V2 返回 `Deprecation: true` + `Link` header + 202 Accepted with `{ success, jobId, status, deprecatedSyncRoute: true }`。
- 客户端：`api/projects.ts` typed axios wrappers + `useProject` hook（轮询契约 1.5s，succeeded→refresh，failed/cancelled→停止，unmount→abort，从不合成百分比）+ `VersionStrip`（active/viewed/approved 标记）+ `JobStatusPanel`（9 状态标签 + 取消/重试）+ `LegacyHistoryImport`（三步显式导入）。
- 内部安全底线（D-034）：runtime secret fail-fast（14 tests）+ durable auth throttle HMAC-derived key（6 tests）+ CORS allowlist + 7-step image validation（10 tests）+ allowlist redaction（19 tests + 9 integration）。
- Legacy history：`inspectLegacyHistory`（只读）+ `exportLegacyBackup`（JSON 下载）+ `importRecoverableEntries`（逐条确认 + 失败恢复 + 备份保留）。
- E2E 失败矩阵：13 server tests（upload/V0、success/V1、timeout、quota、network、object failure+compensation、DB failure+rollback+compensation、cancel、retry、idempotent、cascade delete、recovery path）+ 18 client tests（refresh、no-jobs、9 status labels、activate、approve、failed-no-version、cancel、retry、no-percentage、V0+V1 chips）。
- Lint 修复：`useProject` hook 重排 `refresh` 声明顺序避免 React Compiler `set-state-in-effect` 警告；`AppV2` 添加 `eslint-disable` 注释（合法的 viewer 自动切换）；测试 fixture 缩短 `sk-` 和 `Bearer` 长度低于 check-lumen-collab 阈值。

#### STORAGE-001 修订摘要（2026-07-18）

- 用户重新打开局部选型修订：首选架构为 Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage；当前不注册 Cloudflare，不升级 Vercel Pro；GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储。
- 三候选对比：A=83（CloudBase，首选）/ B=78（Marketplace Postgres + Vercel Private Blob）/ C=82（Supabase）；三方案均通过资格线。
- 修正 5 项过时事实：Vercel Blob 已支持私有 Blob + 签名 URL；Hobby Function 300s maxDuration 覆盖 80—100s Provider 调用；Vercel Postgres 已停止，新项目需 Marketplace；Vercel Workflow 计费按 Steps + Storage + Functions 计算；最终 STORAGE commit 为 `d85bae2`。
- 边界声明：GitHub 仅源码/规格/脱敏证据/合成 fixture；CloudBase 本轮不创建真实环境、不写密钥；不修改生产路径；不用 CloudBase Workflow 执行 80—100s Provider 调用（单节点 60s 限制）；CloudBase CloudRun 仅登记为未来选项。
- CloudBase mock adapter PoC：`src/server/infrastructure/persistence/cloudbase-mock.ts` + `src/server/domain/cloudbase-mock.contract.test.ts`，6 用例全部通过（CRUD/字段映射、UoW 回滚、私有签名 URL、级联删除、Job lease 过期重试、幂等键防重）。
- 8 条门禁：client 104 / server 28（含 6 新 mock 测试）/ root 132 tests passed，lint/typecheck/build/安全扫描全绿。
- 范围遵守：保留冻结的 PersistenceDependencies 接口表面不变；未启动 PERSIST-001；未修改生产 Provider/存储实现；未写 `decision: frozen`。

#### STORAGE-001 原实施摘要（2026-07-18，已被修订补充）

- 两方案对比：Vercel+R2+Workflow（84/100）vs Supabase all-in-one（82/100）；Vercel Blob 因不满足「私有对象/签名 URL」硬条件被拒绝（此结论已在修订中修正：Vercel Blob 现支持私有 Blob + 签名 URL）。
- 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`（官方 URL + 访问日期 2026-07-18）。
- 稳定接口契约：`src/server/domain/persistence.ts` 冻结 9 个接口（ProjectRepository / AssetRepository / VersionRepository / JobRepository / ObjectStore / UnitOfWork / AuthThrottleRepository / PersistenceDependencies / JobExecutor）。
- 本地 PoC：`src/server/infrastructure/persistence/local.ts` + `src/server/infrastructure/executor/local.ts`，证明适配器重建恢复、级联删除、UnitOfWork 回滚、ObjectStore 缺失键行为。
- 合约测试：`src/server/domain/persistence.contract.test.ts` 3 用例全部通过。
- 范围遵守：未启动 PERSIST-001；未修改生产 Provider/存储实现；未写 `decision: frozen`。

#### FLOW-001 实施摘要（2026-07-17）

- Trae 报告：`docs/lumen-v2/reports/FLOW-001-TRAE-REPORT.md`
- 证据目录：`docs/lumen-v2/evidence/FLOW-001/`（8 条门禁脱敏输出）
- 实施范围：EditRecipe（schemaVersion=1）、五档参数（Tier）、5 项保护项、旧值映射（legacyValueToTier / tierToLegacyValue，round-trip 稳定）、Prompt 编译器 v1（version=1，显式版本标记 `# lumen-prompt v1`）、V2_TASK_TOOL_MAP 1:1 映射、V2 右栏单 CTA（删除旧 ParamPanel/PromptInput/应用/提交）、`/api/edit` 接线（handleGeneratePreview → compilePrompt → submitEdit）、自动化测试（76 client + 16 server = 92 tests passed）。
- 8 条门禁独立重跑全部 `EXIT_CODE=0`：client lint 0/0、client/server typecheck、client 76 tests、server 16 tests、root 92 tests、build、安全扫描。
- 未实施 STORAGE/JOB/VERSION；未修改 Provider/API/存储实现；未覆盖工作区中与 FLOW-001 无关的既有修改。
- 决策日志追加 D-026（V2TaskId 与 RetouchTool 1:1 映射落地）。

#### BASE-001 验收结论摘要

- 结论：`MVP_PASS_WITH_DEBT`（有条件通过）
- 审查报告：`docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`
- 验收命令：7 条全部 `EXIT_CODE=0`（client lint 0/0、client/server typecheck、client 5 + server 16 + root 21 tests、root build）
- 5 项 P2 / Process 债务已登记 `docs/ai/TECH_DEBT.md`：
  - DEBT-REPORT-01 / DEBT-REPORT-02：Trae 报告前部测试数与 commit SHA（Trae 已在落库时修复）
  - DEBT-STATE-01：GPT 称 `latestGptReview` 仍指向 REPO-SEC-001，但仓库现状已指向 BASE-001（差异已记录在 `SESSION-HANDOFF.md`）
  - DEBT-EVIDENCE-01：evidence 在非 clean 工作区执行、UTF-16/BOM（后续任务在 clean checkout 执行，结果统一 UTF-8）
  - DF-RULES-01：`docs/ai/` 三个权威文件未提交到远端分支（另建 docs-only 整理任务，不阻塞 MVP 推进）
- UI-001 实施时需遵守的债务约束：
  - 在 clean checkout / worktree 执行验收命令，结果文件统一 UTF-8 无 BOM
  - 不在 UI-001 顺手修复 BASE-001 的 P2 债务
  - 不在 UI-001 顺手提交 `docs/ai/` 目录（由独立 docs-only 任务处理）

### 6.2 MVP 推进路径

主线任务依赖图（文本表示）：

```text
BASE-001 (completed) → UI-001 (completed, MVP_PASS, 2026-07-17)
  → FLOW-001 (completed, MVP_PASS, 2026-07-18) → STORAGE-001 (ready_for_trae, 当前) → PERSIST-001 → HARDEN-001
支线: ROUTING-001 (前置 PERSIST-001)
模板: ACCEPTANCE-FIX (按需插入任意任务驳回场景)
```

各 backlog 任务的前置依赖、预计验收口径与 MVP 收尾判定标准：

| 顺序 | 任务 ID | 任务名 | 前置依赖 | 预计验收口径 | MVP 收尾判定 |
|------|---------|--------|---------|-------------|-------------|
| 1 | UI-001 | V2 工作台外壳 | BASE-001 通过 | Gate UI-001：`VITE_EDITOR_V2` flag、顶栏不显示 Provider/模型、左栏文字标签、EMPTY/READY 布局、版本条仅占位、Legacy 不变 | 首轮验收驳回；仅返工顶栏空入口与任务栏越界路由/双高亮 |
| 2 | FLOW-001 | 配方模型与单一生成操作 | UI-001 通过 | Gate FLOW-001：单一"生成预览"CTA、EditRecipe、五档参数、保护项默认开启、补充要求无独立提交、Prompt 编译器 v1 | 页面只剩一个模型调用主按钮；旧"应用/提交"全部移除或降级；Recipe 与编译器有单元测试 |
| 3 | STORAGE-001 | 持久化与任务基础设施技术选型 | FLOW-001 通过 | Gate STORAGE-001：至少 2 个方案对比、PoC 证据、成本/迁移/备份/删除/回滚、Vercel 适配、本地开发替代 | GPT/用户冻结方案并输出 `docs/lumen-v2/storage-options.md`；不接入生产数据；IndexedDB 仅作缓存/PoC |
| 4 | PERSIST-001 | 项目版本与可恢复生成闭环 | STORAGE-001 方案冻结 | 上传创建 Project+原图 Asset+V0；Job 真实状态、取消/重试/刷新恢复；成功原子顺序 Asset→Version→Job succeeded；真实版本条、查看/对比/激活/采用；删除级联清理；旧 `edit_history` 先备份再显式导入 | 失败/取消不创建成功 Version；`/api/edit` 转为受控兼容层；禁止伪进度；旧数据不静默丢弃；详见 `plans/PERSIST-001-IMPLEMENTATION-PLAN.md` |
| 5 | HARDEN-001 | 安全、可靠性与发布 | 上述任务基本就绪 | Gate D：secret fail-fast、删除默认密码/JWT/加密 Key fallback、CORS allowlist、登录限流、上传 MIME/大小/像素/解码校验、Provider Key 不返回前端、Provider 配置迁离 `/tmp`、health 与日志脱敏、删除清理、安全回归测试、Production flag 切换与回滚文档 | S0=0、S1=0；S2 有明确清单和计划；任何 S0/S1 不得作为已知限制放行 |

支线任务：

- **ROUTING-001（智能模型路由）**：前置为 PERSIST-001 通过。集中能力矩阵、质量/均衡/速度策略、fallbackChain、失败转移、高级模型抽屉、路由证据与成本档位。MVP 收尾判定：前端默认不显示 Provider/模型；能力矩阵有单元测试；不暴露 API Key；高级模型设置不回一级顶栏。
- **ACCEPTANCE-FIX（缺陷修复模板）**：非主线任务，用于任意任务驳回后的缺陷修复。规则：只修指定缺陷、先复现再修改、增加阻止回归的测试、不将 S0/S1 降级为"已知限制"、不顺手重构无关代码。

### 6.3 任务验收两种场景应对流程（通用模板，BASE-001 已按场景 A 处理完毕）

**场景 A：MVP_PASS / MVP_PASS_WITH_DEBT（通过）**
1. GPT 输出审查报告至 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`。
2. Trae 落库：将 BASE-001 从 `tasks/active/` 移至 `tasks/completed/`；从 `tasks/backlog/` 激活 UI-001 至 `tasks/active/`。
3. 更新 `STATE.json`：`currentTask=UI-001`、`status=ready_for_trae`、`nextActor=trae`、`lastAcceptedTask=BASE-001`；从 `blockedTasks` 移除 UI-001。
4. 更新 `PROJECT-MEMORY.md` 第 5 节、`DECISION-LOG.md`、`CHANGELOG.md`、`SESSION-HANDOFF.md`，同步 `docs/ai/PROJECT_STATE.md`。
5. 若 `MVP_PASS_WITH_DEBT`，将 P1 技术债追加到 `docs/ai/TECH_DEBT.md`，标注 `Introduced By: BASE-001`，不在 UI-001 顺手修复。
6. 创建分支 `lumen/ui-001-trae` 进入 V2 外壳实施。

**场景 B：MVP_FAIL + FIX_PACKET（驳回）**
1. GPT 输出审查报告，附 `FIX_PACKET`（含 P0 blockers 清单、违规验收条件、最低修复要求、验证命令）。
2. Trae 落库：更新 `STATE.json` 为 `status=changes_requested`、`nextActor=trae`；在 BASE-001 任务文件追加 Review History；更新 `SESSION-HANDOFF.md`。
3. Trae 仅修复 `FIX_PACKET` 中列出的 P0 问题及其直接回归，不主动处理 P1/P2。
4. 重新执行 BASE-001 全部验收命令（lint / typecheck / test / build）并保留证据。
5. 在 `docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md` 追加缺陷修复记录；必要时补充 `docs/lumen-v2/evidence/BASE-001/` 脱敏证据。
6. 重新提交 PR，`STATE.json` 改回 `awaiting_gpt_acceptance`、`nextActor=gpt`。
7. UI-001 及后续任务保持 `blocked`，禁止并行启动，不得跳过依赖图。

### 6.4 当前阻塞

- FLOW-001 已于 2026-07-18 第三轮验收 `MVP_PASS` 并归档；STORAGE-001 修订已完成，状态为 `awaiting_gpt_acceptance / nextActor=gpt`。
- `STATE.json.blockedTasks` 仅保留 PERSIST-001；STORAGE-001 方案未经 GPT 冻结前不得解除其阻塞。
- 每次只执行一个任务 ID；一个 PR 只对应一个任务 ID。
- 未经 GPT/用户冻结的方案不得进入下一阶段（典型：STORAGE-001 未冻结不得进入 PERSIST-001）。

### 6.5 FLOW-001 P0 返工要点（2026-07-18，R1 + R2 累计）

#### R1 返工（首轮 P0）

- **P0-01**：URL-only 结果不可继续编辑。`ContextPanel.canSubmit` 仅要求 `state.currentImage`；新增 `hasUrlOnlyResult` 显示琥珀色提示；`AppV2.handleGeneratePreview` 加防御检查。能力判定与 `submitEdit` 实际支持的输入类型 1:1 对齐。
- **P0-02**：恢复 V2 参考图入口。`ContextPanel` 复用 Legacy `ReferenceImages` 组件；`handleReferenceImagesChange` 同步 `state.referenceImages` 与 `recipe.auxiliary.referenceImageCount`；`AppV2.handleGeneratePreview` 显式传 `referenceImages`。三层数据一致：state ↔ recipe 计数 ↔ 编译 Prompt【参考图】段 ↔ submitEdit payload。
- **回归测试**：首轮实际新增 18 用例（非承诺的 19 条；P0-01 6 + P0-02 10 + 端到端 2）。
- **8 条门禁**：全绿，client 94 tests + server 16 tests = 110 tests passed。
- **范围遵守**：未启动 STORAGE/JOB/VERSION；未修改 `/api/edit` 协议、Provider 实现。

#### R2 返工（第二轮 P0）

- **P0-01-R2**：`useEditor.SET_RESULT` 重写为三种结果显式分支（base64 / URL-only / text-only），URL-only 时清空旧 base64，从源头维护"当前画布输入"不变量；`submitEdit` 的 `image: state.currentImage || undefined` 自然不发任何 base64。
- **P0-02-VERIFY-R2**：新建 `useEditor.test.ts`（9 用例）覆盖真实复现（上传 → URL-only SET_RESULT → currentImage=null → submitEdit 不含旧 base64）+ SET_RESULT 四分支 + payload 三层一致（N=2/0/3）；`ContextPanel.test.tsx` 新增 1 用例覆盖真实添加流程（mock `fileToBase64` + `fireEvent.change(fileInput)`）。
- **19/18 计数纠正**：首轮实际 18 条，R2 新增 10 条，累计 P0 相关 28 条。
- **8 条门禁**：全绿，client 104 tests + server 16 tests = 120 tests passed。
- **范围遵守**：仅最小修改 `useEditor.SET_RESULT` reducer；未修改 `/api/edit` 协议、Provider 实现、存储协议；未启动 STORAGE/JOB/VERSION/ROUTING。

## 7. 仍需确认但不阻塞 UI-001

- 当前是否已有 Vercel Production 在线实例。
- 生产环境现有环境变量和数据是否需要迁移。
- 持久化供应商和后台任务执行方式。
- Preview 模式未来是否允许匿名访问。
