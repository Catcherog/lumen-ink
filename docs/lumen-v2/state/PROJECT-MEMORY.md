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
- [ ] `UI-001` V2 外壳（首轮 GPT 验收 `MVP_FAIL` → Trae 完成 2 项 P0 返工，`awaiting_gpt_acceptance / nextActor=gpt`，待二轮验收）。
- [ ] `FLOW-001` 配方和单一操作。
- [ ] `STORAGE-001` 技术选型。
- [ ] P0 实施与验收。

## 6. 下一步

### 6.1 当前任务：UI-001（awaiting_gpt_acceptance，第二轮）

任务 ID：`UI-001`
状态：`awaiting_gpt_acceptance`，`nextActor=gpt`（第二轮，待 GPT 二轮验收）
前置依赖：`BASE-001` 已通过 GPT 验收（`MVP_PASS_WITH_DEBT`，2026-07-17）。
任务目标：建立可回滚的 V2 工作台外壳（`VITE_EDITOR_V2` feature flag），不改 Provider、API、Prompt 和生成结果；顶栏不显示 Provider/模型；左栏稳定文字标签；右侧 360px 上下文面板容器；底部版本区结构占位；EMPTY 与 READY 布局；1440×900 / 1280×800 可用。
任务文件：`docs/lumen-v2/tasks/active/UI-001.md`。
实施分支：`lumen/ui-001-trae`。
Trae 报告：`docs/lumen-v2/reports/UI-001-TRAE-REPORT.md`（第 10 节为 P0 返工记录）。
证据目录：`docs/lumen-v2/evidence/UI-001/`（4 张截图已重新捕获）。
GPT 审查：`docs/lumen-v2/reviews/UI-001-GPT-REVIEW.md`（首轮 `MVP_FAIL`，2 项 P0）。
返工实施：顶栏对比/导出接入 `ResultViewer` 真实能力（受控 `viewMode` + `canCompare`/`canExport` 禁用态）；任务栏引入 `V2TaskId` 与 `RetouchTool` 解耦（移除 `setTool` 调用，单一高亮）。7 条基线命令 + 手工验证全部通过。

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
BASE-001 (completed, MVP_PASS_WITH_DEBT, 2026-07-17)
  → UI-001 (changes_requested, 当前) → FLOW-001 → STORAGE-001 → VERSION-001 → JOB-001 → HARDEN-001
支线: ROUTING-001 (前置 JOB-001)
模板: ACCEPTANCE-FIX (按需插入任意任务驳回场景)
```

各 backlog 任务的前置依赖、预计验收口径与 MVP 收尾判定标准：

| 顺序 | 任务 ID | 任务名 | 前置依赖 | 预计验收口径 | MVP 收尾判定 |
|------|---------|--------|---------|-------------|-------------|
| 1 | UI-001 | V2 工作台外壳 | BASE-001 通过 | Gate UI-001：`VITE_EDITOR_V2` flag、顶栏不显示 Provider/模型、左栏文字标签、EMPTY/READY 布局、版本条仅占位、Legacy 不变 | 首轮验收驳回；仅返工顶栏空入口与任务栏越界路由/双高亮 |
| 2 | FLOW-001 | 配方模型与单一生成操作 | UI-001 通过 | Gate FLOW-001：单一"生成预览"CTA、EditRecipe、五档参数、保护项默认开启、补充要求无独立提交、Prompt 编译器 v1 | 页面只剩一个模型调用主按钮；旧"应用/提交"全部移除或降级；Recipe 与编译器有单元测试 |
| 3 | STORAGE-001 | 持久化与任务基础设施技术选型 | FLOW-001 通过 | Gate STORAGE-001：至少 2 个方案对比、PoC 证据、成本/迁移/备份/删除/回滚、Vercel 适配、本地开发替代 | GPT/用户冻结方案并输出 `docs/lumen-v2/storage-options.md`；不接入生产数据；IndexedDB 仅作缓存/PoC |
| 4 | VERSION-001 | 项目、资产与不可变版本 | STORAGE-001 方案冻结 | 上传创建 Project+原图 Asset+V0；成功生成创建子 Version；版本条显示真实版本；查看/对比/激活/采用；刷新恢复；删除级联清理；旧 `edit_history` 先备份再显式导入 | history 不再被改名冒充 Version；旧数据不静默丢弃；不自动导入失效 URL |
| 5 | JOB-001 | 可恢复生成任务 | VERSION-001 通过 | jobId、真实阶段（queued/uploading/analyzing/generating/postprocessing/saving/succeeded/failed/cancelled）、取消/重试、断线恢复、errorCode/diagnosticId；失败不创建成功版本；测试超时/额度/网络/保存失败 | `/api/edit` 转为受控兼容层并提供弃用计划；不再以 100 秒同步请求为唯一工作模式；禁止伪造百分比 |
| 6 | HARDEN-001 | 安全、可靠性与发布 | 上述任务基本就绪 | Gate D：secret fail-fast、删除默认密码/JWT/加密 Key fallback、CORS allowlist、登录限流、上传 MIME/大小/像素/解码校验、Provider Key 不返回前端、Provider 配置迁离 `/tmp`、health 与日志脱敏、删除清理、安全回归测试、Production flag 切换与回滚文档 | S0=0、S1=0；S2 有明确清单和计划；任何 S0/S1 不得作为已知限制放行 |

支线任务：

- **ROUTING-001（智能模型路由）**：前置为 JOB-001 通过。集中能力矩阵、质量/均衡/速度策略、fallbackChain、失败转移、高级模型抽屉、路由证据与成本档位。MVP 收尾判定：前端默认不显示 Provider/模型；能力矩阵有单元测试；不暴露 API Key；高级模型设置不回一级顶栏。
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

- BASE-001 已通过验收，UI-001 阻塞已解除（`STATE.json.blockedTasks` 现仅列出 FLOW-001 / STORAGE-001 / VERSION-001 / JOB-001）。
- UI-001 当前为 `awaiting_gpt_acceptance（第二轮）`；Trae 已完成 `UI-001-GPT-REVIEW.md` FIX_PACKET 中 2 项关键 P0 返工；GPT 二轮验收通过前，禁止 FLOW-001 及后续所有任务。
- 每次只执行一个任务 ID；一个 PR 只对应一个任务 ID。
- 未经 GPT/用户冻结的方案不得进入下一阶段（典型：STORAGE-001 未冻结不得进入 VERSION-001）。

## 7. 仍需确认但不阻塞 UI-001

- 当前是否已有 Vercel Production 在线实例。
- 生产环境现有环境变量和数据是否需要迁移。
- 持久化供应商和后台任务执行方式。
- Preview 模式未来是否允许匿名访问。
