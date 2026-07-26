# PORTFOLIO-CLOSURE-SPRINT-01 Resume Plan (报告生成阶段)

> **For agentic workers:** 本计划是 PORTFOLIO-CLOSURE-SPRINT-01 的最后一段，只覆盖剩余的报告生成工作。原计划见 `PORTFOLIO-CLOSURE-SPRINT-01.md`。

**Goal:** 在 demonstratio 官网仓库根目录生成两份收尾报告（`PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md` 与 `PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md`），commit 后 push 到远程分支，并将 GPT-REVIEW 内容复制到桌面协作文件夹 `picture-edit-collab-completion.md`。

**状态标记:** `READY_FOR_GPT_CONTENT_REVIEW` / `READY_FOR_USER_ASSET_REVIEW` / `NOT_DEPLOYED`

---

## 当前已就位的事实基线（Phase 1 探索结论）

### Lane A — demonstratio（官网 canonical repo）

- 路径：`D:\360Downloads\Trae 项目\demonstratio`
- 远程：`https://github.com/Catcherog/demonstratio.git`
- 分支：`portfolio/closure-sprint-01`
- HEAD：`96b791a47229d2d371ab4778d5ff7527050ef1a0`
- commit 时间：`2026-07-23T16:49:42+08:00`
- commit message：`feat(portfolio): restructure featured case studies and add consistency gate`
- 工作区状态：clean，已与 origin 同步
- 报告文件状态：**两份报告均未创建**

### Lane B — lark（飞书协调目录）

- 文件：`D:\360Downloads\Trae 项目\lark\docs\portfolio\FEISHU-PLATFORM-PUBLIC-STATUS.md`（4624 字节，已存在）
- Git 状态：lark 不是 git 仓库（协调目录），无 commit SHA，无法 push。视为 Lane B 文件就位完成。

### Lane C — picture-edit（Lumen / lumen-ink）

- 路径：`D:\360Downloads\Trae 项目\picture-edit`
- 远程：`https://github.com/Catcherog/lumen-ink.git`
- 分支：`portfolio/lumen-evidence-pack-01`
- HEAD：`2b92ce0`（commit `docs(portfolio): add lumen public evidence pack`）
- 文件：`docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md` 已存在

### Lane D — Monorepo/service agent（SCS）

- 路径：`D:\360Downloads\Trae 项目\Monorepo\service agent`
- 远程：`https://github.com/Catcherog/service-agent.git`
- 分支：`portfolio/scs-evidence-pack-01`
- HEAD：`e947941`（commit `docs(portfolio): refresh service agent evidence pack`）
- 文件：`docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md` 已存在

### 证据 JSON（demonstratio/content/evidence/）

| 文件 | 条目数 | 状态分布 |
|---|---|---|
| `feishu.json` | 7（FEISHU-001~007） | 全部 VERIFIED |
| `scs.json` | 7（SCS-001~007） | 6 VERIFIED + 1 CONTRADICTED（SCS-007 chat.jael.com 关闭） |
| `lumen.json` | 8（LUMEN-001~008） | 7 VERIFIED + 1 IN_PROGRESS（LUMEN-005 CloudBase FIX-R9 验收中） |
| 合计 | 22 项 | 20 VERIFIED + 1 CONTRADICTED + 1 IN_PROGRESS |

全部 `publicSafe: true`。

### 首页结构（app/page.tsx，248 行）

1. Hero（定位 + 6 个能力标签 + 邮箱链接）
2. Proof Section（capabilities 卡片网格）
3. Capability Chain Section（8 步能力链）
4. Featured Case Studies（3 主案例卡片，featuredProjects.map）
5. System Section（跨项目架构 SystemMap）
6. Method Section（4 个原则 + DataFlywheel）
7. Selected Experiments（实验项目，experimentProjects）
8. Experience Section（时间线）
9. Contact Section（邮箱 / GitHub / canonical 简历）

`hero-metrics` 显示：`featuredCount` / `experimentCount` / `17 / 12` / `282 / 80+`。项目数量动态计算。

### 详情页结构（app/projects/[slug]/page.tsx，273 行）

实际是 12 段（plan 写 9 段，实现已扩展为 12 段，固化在 commit 中不再改）：

| # | Section 标识 | 标题 |
|---|---|---|
| 01 | OVERVIEW | 项目概览 |
| 02 | PROBLEM | 业务问题与痛点 |
| 03 | PRODUCT STRATEGY | 产品策略与边界 |
| 04 | SYSTEM ARCHITECTURE | 系统架构 |
| 05 | KEY WORKFLOW | 关键用户路径 |
| 06 | KEY PRODUCT DECISIONS | 关键决策 |
| 07 | EVIDENCE | 展示证据与边界 |
| 08 | CURRENT VERSION & ROADMAP | 当前版本与路线图（StatusBadge verified/inProgress/planned 三栏） |
| 09 | MY CONTRIBUTION | 我的贡献 |
| 10 | PRODUCT EVIDENCE | 界面/流程证据（ProjectGallery） |
| 11 | TRADE-OFFS & NEXT | 取舍与下一步 |
| 12 | CROSS-PROJECT RELATIONSHIPS | 跨项目关系 |

### consistency-gate.mjs（15 项检查）

自定义 Node.js 脚本，命令 `npm run check:portfolio`。检查项：
1. Featured 项目恰好为 3 个
2. 所有项目 slug 唯一
3. 三个旧路由存在重定向（data-platform/collator/feishu-portal → feishu-platform）
4. evidence ID 唯一
5. 所有 evidence ref 在 evidence json 中存在
6. 每个 featured 项目有 verified/inProgress/planned
7. 不存在禁止 CTA 措辞（立即在线体验 / 无门槛公开体验 / 可在线体验）
8. 不存在禁止主张（OCR/ASR/CLIP 全部落地 / 全面生产上线 / 生产级高可用 / 零漏单 / 准确率 92% / 转化率翻倍 / 7×24 秒级）
9. 不存在公开手机号
10. 首页简历入口不超过一个
11. canonical 简历文件存在
12. 外部 Demo 链接使用 https
13. 不存在硬编码项目数量（9 个项目 / 4 个核心 / 5 个支撑 / 4 核心产品）
14. 三个主案例各有至少一项 evidence
15. data-platform/collator/feishu-portal slug 已移除

### 三大主案例当前公开状态口径

| 项目 | status 字段 | demoType | link.note |
|---|---|---|---|
| feishu-platform | `Portfolio MVP｜核心链路已实现,最终集成收尾中` | `local-only` | `Prototype 阶段,暂无公开演示链接` |
| service-agent | `Portfolio MVP｜演示维护中` | `unavailable` | `chat.jael.com 当前连接关闭,演示维护中` |
| lumen-ink | `Controlled Demo｜受控演示,申请体验` | `controlled` | （evidenceLabel 写受控演示说明） |

### 已使用但尚无量化证据的业务主张（需 GPT 重点审查）

1. `17 张业务表与 12 条自动化`（feishu-platform metrics）— 标注为"历史基线"，未独立量化
2. `Collator 504 单元测试 + SOP 91 单元测试`（feishu-platform metrics）— 数字源自仓库内部计数
3. `282 SKU / 峰值 80+ 项目`（hero-metrics + experience section）— TP-Link 时期业务叙述
4. `5 款产品提前 15 天量产`（experience section）— 业务叙述，无独立证据
5. `18 类咨询场景 / 3 级置信度分流`（service-agent metrics）— 设计产物，非线上验证
6. `819 tracked 文件 / 28 测试文件 / 560 文档`（service-agent outcomes）— 仓库内部统计
7. `4 类模型 Provider / 6 类专业工具 / 46 测试文件`（lumen-ink metrics）— 仓库内部统计

---

## Proposed Changes

### 文件 1：`D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md`

**职责：** Trae 完成报告，记录整个 Sprint 的工程产物与状态。

**结构（必须包含的章节）：**

1. **元信息**
   - canonical repo: `https://github.com/Catcherog/demonstratio.git`
   - 分支：`portfolio/closure-sprint-01`
   - 开始 HEAD：`672c740be002e26b54c3b3266c9a3257c7aea8dc`（main）
   - Lane A 结束 HEAD：`96b791a47229d2d371ab4778d5ff7527050ef1a0`
   - Lane C HEAD：`2b92ce0`（lumen-ink）
   - Lane D HEAD：`e947941`（service-agent）
   - Lane B：无 SHA（lark 非 git 仓库）
   - 报告生成时间：执行时取当前时间

2. **修改文件清单（按 Lane）**
   - Lane A：12 文件（README.md / app/page.tsx / app/projects/[slug]/page.tsx / components/StatusBadge.tsx / components/SystemMap.tsx / content/evidence/{feishu,scs,lumen}.json / content/projects.ts / next.config.ts / package.json / scripts/consistency-gate.mjs），1246 insertions + 410 deletions
   - Lane B：1 文件（lark/docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md，4624 字节，未 push）
   - Lane C：1 文件（picture-edit/docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md，commit `2b92ce0`）
   - Lane D：1 文件（Monorepo/service agent/docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md，commit `e947941`）

3. **三大项目页面结构**
   - 详情页 12 段模板（按上方表格列出）
   - 首页 9 section 结构（按上方列表列出）

4. **证据资产清单**
   - 表格列出 22 项 evidence ID（FEISHU-001~007 / SCS-001~007 / LUMEN-001~008）
   - 标注每项的 verificationStatus（VERIFIED / CONTRADICTED / IN_PROGRESS）

5. **当前状态口径**
   - 三大主案例 status / demoType / link.note（按上方表格列出）

6. **未完成能力**
   - feishu-platform inProgressCapabilities / plannedCapabilities（从 projects.ts 摘录）
   - service-agent inProgressCapabilities / plannedCapabilities
   - lumen-ink inProgressCapabilities / plannedCapabilities

7. **build 结果**
   - 命令：`npm run build`（Next.js 16.2.10 Turbopack）
   - 预期：13 静态页面生成成功（/、/_not-found、/projects/[slug] × 8、/robots.txt、/sitemap.xml），exit 0
   - 执行时需重新跑一次以确认

8. **consistency gate 结果**
   - 命令：`npm run check:portfolio`
   - 预期：15/15 PASS
   - 执行时需重新跑一次以确认

9. **secret / PII 检查**
   - consistency gate 检查 9 已确认无 11 位手机号
   - 所有 evidence `publicSafe: true`
   - 简历入口仅 1 个（canonical PDF）

10. **commits 清单**
    - `96b791a` feat(portfolio): restructure featured case studies and add consistency gate（Lane A）
    - `2b92ce0` docs(portfolio): add lumen public evidence pack（Lane C）
    - `e947941` docs(portfolio): refresh service agent evidence pack（Lane D）
    - 报告本身的 commit（执行时生成）

11. **是否 push**
    - Lane A：是（已与 origin/portfolio/closure-sprint-01 同步）
    - Lane C：是（已推到 Catcherog/lumen-ink portfolio/lumen-evidence-pack-01）
    - Lane D：是（已推到 Catcherog/service-agent portfolio/scs-evidence-pack-01）
    - Lane B：否（lark 非 git 仓库）

12. **是否部署**
    - 否（AC-15 禁止部署，未触发 Vercel auto-deploy）

13. **下一步需要 GPT 审阅的文案**
    - Hero 文案（定位句、6 个能力标签、hero-lead 段落）
    - 三个主案例的 status / subtitle / summary / productStrategy / decisions
    - 7 项已使用但无量化证据的业务主张（按上方清单）
    - 首页 hero-metrics 4 个数字（17/12、282/80+）
    - Selected Experiments 文案

14. **下一步需要用户提供的业务事实**
    - 是否要为 `17/12`、`282/80+`、`5 款产品提前 15 天量产` 等业务主张提供独立证据
    - 是否要为 service-agent 恢复 `chat.jael.com` 公网演示
    - 是否要为 lumen-ink 提供密码访问申请流程
    - canonical 简历 PDF 内容是否需要同步更新
    - 是否要为 OCR/ASR/CLIP 中的某一项提供 VERIFIED 证据

15. **最终状态标记**
    - `READY_FOR_GPT_CONTENT_REVIEW`
    - `READY_FOR_USER_ASSET_REVIEW`
    - `NOT_DEPLOYED`

### 文件 2：`D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md`

**职责：** 内嵌官网当前文案与状态分层，供 GPT 直接审查。

**结构（必须包含的章节）：**

1. **元信息**
   - 报告目的、对应 TRAE-REPORT 引用
   - 三大状态标记

2. **首页当前文案（直接复制 app/page.tsx 关键文案）**
   - Hero：定位句、eyebrow、hero-lead、6 个能力标签、hero-actions、hero-links
   - hero-metrics：4 个数字与 label
   - Featured Section heading + intro
   - Capability Chain 8 步（从 content/projects.ts capabilityChain 读取）
   - Selected Experiments heading + intro
   - Experience timeline 3 段
   - Contact section

3. **三大主案例简介（从 projects.ts 摘录）**
   - 每个项目：slug / title / subtitle / summary / status / demoType / role / team / period
   - 每个项目：metrics 4 项
   - 每个项目：tags（前 3 个）
   - 每个项目：problem 2 项 / productStrategy 4 项 / decisions 3 项

4. **三大主案例状态分层（直接复制）**
   - feishu-platform verifiedCapabilities（7 项）/ inProgressCapabilities（3 项）/ plannedCapabilities（3 项）
   - service-agent verifiedCapabilities（6 项）/ inProgressCapabilities（3 项）/ plannedCapabilities（3 项）
   - lumen-ink verifiedCapabilities / inProgressCapabilities / plannedCapabilities

5. **每页 section 结构**
   - 详情页 12 段表格（按上方表格列出，标注每段渲染的字段来源）
   - 首页 9 section 列表

6. **所有 In Closure / Next Iteration 项**
   - 三大项目的 inProgressCapabilities 与 plannedCapabilities 合并表

7. **所有 CTA**
   - 首页：`查看重点案例 ↓`、`联系 ↗`、`Email`、`GitHub`、`联系`、`下载简历(临时入口) ↗`
   - 详情页：`阅读完整案例 ↗`、`link.label`（按项目：本地运行说明 / 查看案例｜演示维护中 / 受控演示入口）
   - 翻页：`← 上一个案例` / `下一个案例 →` / `全部 N 个项目`

8. **候选截图说明（6-12 张）**
   - 从 evidence json 中筛 6-12 项 screenshot/architecture 类型，列出：
     - evidence ID
     - title
     - project
     - capability
     - evidenceType
     - screenshotPath
     - publicSafe
     - 当前状态

9. **已使用但尚无量化证据的业务主张**
   - 7 项主张清单（按上方清单）
   - 每项标注：主张文本 / 出现位置 / 是否有证据 / 建议 GPT 审查方向

10. **审查请求**
    - 明确 GPT 需要审阅的 5 个维度：文案口径、状态分层、CTA 边界、业务主张、PII/secret
    - 明确不可自行上调的字段：`provisional: true` 标记的两个项目（feishu-platform / service-agent）

### 文件 3：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`

**职责：** 桌面协作文件夹的稳定完成包，内容 = GPT-REVIEW.md 完整复制。

**操作方式：** 用 Python `shutil.copy2()` 复制，保持文件名稳定（不随任务变化）。

---

## Task 分解

### Task R1: 验证 build 与 gate 仍然 PASS

**Files:**
- Read: `D:\360Downloads\Trae 项目\demonstratio\package.json`

**Steps:**

- [ ] **Step 1: 跑 consistency gate**

```powershell
cd "D:\360Downloads\Trae 项目\demonstratio"
npm run check:portfolio
```

Expected: `通过: 15` / `✅ CONSISTENCY GATE PASSED`，exit 0

- [ ] **Step 2: 跑 build**

```powershell
cd "D:\360Downloads\Trae 项目\demonstratio"
npm run build
```

Expected: `✓ Compiled successfully` + 13 静态页面生成（/、/_not-found、/projects/[slug] × 8、/robots.txt、/sitemap.xml），exit 0

- [ ] **Step 3: 跑 lint**

```powershell
cd "D:\360Downloads\Trae 项目\demonstratio"
npm run lint
```

Expected: 无错误，exit 0

### Task R2: 创建 TRAE-REPORT.md

**Files:**
- Create: `D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md`

**Steps:**

- [ ] **Step 1: 用 Write 工具创建报告文件**

按"文件 1"章节结构写入完整内容。引用 Phase 1 探索得到的实际数据（HEAD、commits、文件清单、evidence 列表、状态口径、未完成能力）。

- [ ] **Step 2: 验证文件存在**

```powershell
Test-Path "D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md"
```

Expected: `True`

### Task R3: 创建 GPT-REVIEW.md

**Files:**
- Create: `D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md`

**Steps:**

- [ ] **Step 1: 读取 projects.ts 完整内容（确保所有项目数据准确）**

读取 `D:\360Downloads\Trae 项目\demonstratio\content\projects.ts` 全文，提取：
- capabilityChain 数组
- capabilities 数组
- featuredProjects 中三个项目的所有字段
- experimentProjects 列表

- [ ] **Step 2: 用 Write 工具创建 GPT-REVIEW.md**

按"文件 2"章节结构写入完整内容。所有文案直接从源文件复制，不做改写。状态分层、CTA、截图说明、业务主张清单必须完整内嵌。

- [ ] **Step 3: 验证文件存在**

```powershell
Test-Path "D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md"
```

Expected: `True`

### Task R4: Commit 两份报告到 demonstratio

**Files:**
- Modify: `D:\360Downloads\Trae 项目\demonstratio`（git index）

**Steps:**

- [ ] **Step 1: 暂存两份报告**

```powershell
cd "D:\360Downloads\Trae 项目\demonstratio"
git add PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md
git status
```

Expected: 2 files staged

- [ ] **Step 2: Commit**

```powershell
git commit -m "docs(portfolio): add closure sprint 01 trae-report and gpt-review"
```

Expected: `1 file changed` 或 `2 files changed`

- [ ] **Step 3: 记录新 HEAD**

```powershell
git rev-parse HEAD
```

记录输出，填入 TRAE-REPORT 的"报告生成时间"与"commits 清单"末项。

### Task R5: Push 到远程

**Files:**
- Modify: `origin/portfolio/closure-sprint-01`

**Steps:**

- [ ] **Step 1: Push**

```powershell
cd "D:\360Downloads\Trae 项目\demonstratio"
git push origin portfolio/closure-sprint-01
```

Expected: exit 0，无新分支创建（已有 tracking）。若 push 失败提示网络超时，提醒用户开 VPN（端口 7890）。

- [ ] **Step 2: 验证远程同步**

```powershell
git status
```

Expected: `Your branch is up to date with 'origin/portfolio/closure-sprint-01'.`

### Task R6: 复制 GPT-REVIEW 到桌面协作文件夹

**Files:**
- Create: `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`

**Steps:**

- [ ] **Step 1: 确保目标目录存在**

```powershell
if (-not (Test-Path "C:\Users\Catcher\Desktop\协作文件夹")) {
  New-Item -ItemType Directory -Path "C:\Users\Catcher\Desktop\协作文件夹" -Force
}
```

- [ ] **Step 2: 用 Python shutil.copy2 复制**

```powershell
python -c "import shutil; shutil.copy2(r'D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md', r'C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md'); print('copied')"
```

Expected: `copied`

- [ ] **Step 3: 验证目标文件存在且大小一致**

```powershell
Get-Item "C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md" | Select-Object Name, Length, LastWriteTime
```

Expected: 文件存在，Length > 0

### Task R7: 向用户输出最终状态报告

**Steps:**

- [ ] **Step 1: 汇总输出**

在最终回复中包含：
- 两份报告的本地路径与远程 URL
- 三大状态标记（READY_FOR_GPT_CONTENT_REVIEW / READY_FOR_USER_ASSET_REVIEW / NOT_DEPLOYED）
- 15 条 AC 的执行结果简表
- 桌面协作文件夹路径
- 下一步建议（GPT 内容审查 + 用户业务事实补充）

---

## Assumptions & Decisions

1. **报告语言**：中文正文 + 英文技术标识符（与原计划、commits、源码注释风格一致）。
2. **报告位置**：demonstratio 仓库根目录（与原计划 Task 10 Step 5/6 一致）。不在 picture-edit 仓库根目录创建，避免污染 Lumen FIX-R9 工作区。
3. **commit message**：`docs(portfolio): add closure sprint 01 trae-report and gpt-review`（docs 前缀，符合 portfolio scope）。
4. **桌面复制源**：GPT-REVIEW.md（不是 TRAE-REPORT.md），因为 Web GPT 主要做内容审查，GPT-REVIEW 内嵌了所有需审查的文案。
5. **不重跑 build/gate**：若 Task R1 三个命令任一失败，先停下来分析；不绕过验证直接写报告。
6. **provisional 标记保留**：feishu-platform 和 service-agent 的 `provisional: true` 标记保留，报告明确告知 GPT 不可自行上调。
7. **lark Lane B 处理**：报告明确说明 lark 非 git 仓库，FEISHU-PLATFORM-PUBLIC-STATUS.md 文件就位即视为完成，不强行 commit。
8. **报告生成时间**：执行时取系统当前时间，写入报告元信息。
9. **HEAD 记录**：TRAE-REPORT 的"commits 清单"末项在 Task R4 commit 后回填实际 SHA。
10. **不部署**：AC-15 明确禁止，报告中"是否部署"字段固定为"否"。

---

## Verification Steps

执行完成后，最终验证清单：

- [ ] `PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md` 存在于 demonstratio 根目录
- [ ] `PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md` 存在于 demonstratio 根目录
- [ ] 两份报告已 commit 到 `portfolio/closure-sprint-01` 分支
- [ ] `git push origin portfolio/closure-sprint-01` 成功
- [ ] `git status` 显示 `working tree clean` 与 `up to date with origin`
- [ ] `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md` 存在且 Length > 0
- [ ] TRAE-REPORT 包含 15 个必填章节
- [ ] GPT-REVIEW 包含 10 个必填章节
- [ ] GPT-REVIEW 中"已使用但尚无量化证据的业务主张"清单包含 7 项
- [ ] 报告末尾明确标注三大状态标记
- [ ] 未触发任何部署（Vercel auto-deploy 由用户在 Dashboard 控制）
- [ ] AC-15（不部署）满足

---

## 与原计划的差异说明

1. **原计划 Task 10 Step 1 命令**：`npm test`（vitest）→ 实际用 `npm run check:portfolio`（自定义 Node.js 脚本，15 项检查）。
2. **原计划写 9 段详情页**：实际实现为 12 段（已固化在 commit `96b791a` 中，不再改回）。
3. **原计划用 `tier` 字段**：实际用 `featured?` / `archived?` / `provisional?` 布尔标志。
4. **原计划 evidence ID 两位数**：实际三位数（FEISHU-001 等）。
5. **原计划 Lane B 期望 push**：lark 非 git 仓库，无法 push，报告需说明。
6. **新增桌面复制步骤**：用户偏好要求每项目稳定的 `*-collab-completion.md`，本计划新增 Task R6。
