# PORTFOLIO-CLOSURE-SPRINT-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 demonstratio 官网 canonical 仓库完成求职作品集展示层第一版重构——首页只突出飞书平台 / Service Agent / Lumen 三大主案例，统一项目详情页 9 段模板，建立内容 consistency gate，并在 3 个业务仓库各产出一份 Public Evidence Pack（仅 docs，不动业务代码）。

**Architecture:** Lane A（demonstratio 官网）为主交付物：扩展 Project 类型，重构 projects.ts 数据模型，重写首页与详情页模板，新增 vitest consistency gate。Lanes B/C/D 在 lark / picture-edit / Monorepo 三个业务仓库各新增一份 `docs/portfolio/*-PUBLIC-EVIDENCE-PACK.md`，作为官网 evidence 引用源；不触碰任何业务代码。每 Lane 独立 commit。

**Tech Stack:** Next.js 16.2.10 / React 19.2.7 / TypeScript 6.0.2（官网）；vitest 1.x（新增 devDependency，仅 consistency gate）；Markdown（证据 pack）。

## Global Constraints

- **Canonical repo（Lane A）**：`D:\360Downloads\Trae 项目\demonstratio`，remote `https://github.com/Catcherog/demonstratio.git`，分支 `main`，开始 HEAD `672c740be002e26b54c3b3266c9a3257c7aea8dc`，工作区 clean。
- **Lane B 仓库**：`D:\360Downloads\Trae 项目\lark`（飞书平台协调目录，只新增 `docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md`）。
- **Lane C 仓库**：`D:\360Downloads\Trae 项目\picture-edit`（Lumen 仓库，FIX-R9 `awaiting_gpt_acceptance`；只新增 `docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md`，**严禁触碰** src/ docs/lumen-v2/ 等任何业务代码与验收文件）。
- **Lane D 仓库**：`D:\360Downloads\Trae 项目\Monorepo\service agent`（SCS 规范检出；只新增 `docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md`）。
- **分支策略**：Lane A 新建 `portfolio-closure-sprint-01` 分支；Lanes B/C/D 各自在所在仓库 main（或当前默认分支）上直接 commit 一个 docs-only 提交。
- **不部署**：AC-15 明确禁止部署，除非用户另行授权。所有改动停留在本地 commit。
- **不跨仓复制业务数据**：证据 pack 只放脱敏摘要与 git SHA 引用，不复制原始业务截图、token、表 ID。
- **禁止词**（除非 Claim Ledger 标记 VERIFIED）：`OCR/ASR/CLIP 全部落地`、`全面生产上线`、`生产级高可用`、`零漏单`、`准确率 92%`、`转化率翻倍`、`7×24 秒级`。
- **Git 推送**：按用户偏好，每次任务完成且验证无误后自动 commit + push；若 push 失败提醒开 VPN（端口 7890）。
- **完成包**：任务结束后输出 `PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md` 与 `PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md`，并复制到 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`。

---

## Resume State (2026-07-23 会话恢复)

> 本章节为跨会话恢复时新增，记录截至 2026-07-23 的实际执行进度。剩余 Task 执行时以本章节为准。

### 已完成（Lane A，单 commit `96b791a`）

| Task | 状态 | 证据 |
|---|---|---|
| Task 1 (Lane A Setup) | ✅ | 分支 `portfolio/closure-sprint-01`，工作区 clean |
| Task 2 (重构 projects.ts) | ✅ | `content/projects.ts` 844 行，3 featured + 5 experiment，slug `feishu-platform` |
| Task 3 (重写首页) | ✅ | `app/page.tsx` 233 行，Hero + 3 Featured + Capability + Experiments + Contact |
| Task 4 (重写详情页) | ✅ | `app/projects/[slug]/page.tsx` 9 段模板 + StatusBadge |
| Task 5 (支撑组件) | ✅ | `StatusBadge.tsx` 新增；`SystemMap.tsx` / `README.md` / `next.config.ts` 更新 |
| Task 6 (Evidence + Gate) | ✅ | `content/evidence/{feishu,scs,lumen}.json` + `scripts/consistency-gate.mjs` |

Lane A 验证结果：`tsc --noEmit` PASS；consistency gate **15/15 PASS**；**build 尚未验证**（Task 10 补跑）。

### 实际实现与原计划的差异（执行时必须遵循实际）

1. **测试框架**：实际用自定义 `scripts/consistency-gate.mjs`（Node.js，15 项检查），**非** vitest。命令是 `npm run check:portfolio`。**禁止**再安装 vitest。
2. **分支名**：实际 `portfolio/closure-sprint-01`（斜杠），非计划的连字符。push 用实际名。
3. **类型字段差异**（已在 commit 中固化，勿改回计划写法）：
   - `tier` → 实际用 `featured?` / `archived?` / `provisional?` 布尔标志
   - `currentVersion` / `inClosure` / `nextIteration` → 实际用 `verifiedCapabilities` / `inProgressCapabilities` / `plannedCapabilities`
   - `EvidenceLink` → 实际用 `{ label, type, ref }`，非 `{ evidenceId, title, evidenceType }`
   - `DemoType` → 实际用 `"public"|"controlled"|"local-only"|"unavailable"`
4. **evidence ID 格式**：实际三位数字（FEISHU-001 / SCS-001 / LUMEN-001），非两位。
5. **Task 10 Step 1 命令修正**：`npm test` → `npm run check:portfolio`；`11 tests PASS` → `15/15 PASS`。

### 剩余工作

| Task | 状态 | 说明 |
|---|---|---|
| Task 7 (Lane B) | ⬜ | 创建 `lark/docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md`，独立 commit |
| Task 8 (Lane C) | ⬜ | 创建 `picture-edit/docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md`，独立 commit，**严禁触碰** src/ docs/lumen-v2/ .trae/ |
| Task 9 (Lane D) | ⬜ | 创建 `Monorepo/service agent/docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md`，独立 commit |
| Task 10 | ⬜ | build 验证 + push 4 仓库 + 生成 TRAE-REPORT + GPT-REVIEW + 复制完成包到桌面 |

### 执行策略

- Task 7/8/9 完全独立，可并行（dispatching-parallel-agents）；每 Lane 只 add 单个 .md 文件，不污染各仓库脏工作区。
- Lane A 的 `npm run build` 可与 Task 7/8/9 并行。
- Task 10 的 push + 报告生成必须在 Task 7/8/9 commit 完成后执行。
- 报告中的 gate 数字用实际 15/15，非计划的 11 tests。

---

## Current State Analysis

### 已核实的 canonical 仓库状态（demonstratio）

- `D:\360Downloads\Trae 项目\demonstratio`，remote `https://github.com/Catcherog/demonstratio.git`（Catcherog），分支 `main`，HEAD `672c740`，工作区 clean。与审计包 `08_WEBSITE_AUDIT_JAELCHEN.md` 一致。
- 线上 `https://www.jaelchen.com` 10 个详情路由全部可加载；`zehuai-image.vercel.app` 正常；`lumen-ink.vercel.app` 要求密码；`chat.jael.com` `ERR_CONNECTION_CLOSED`。

### 当前文件结构与职责

```
demonstratio/
├── app/
│   ├── projects/[slug]/page.tsx   ← 项目详情页（当前 7 段，需改为 9 段）
│   ├── globals.css                ← 样式（保持，少量补充）
│   ├── layout.tsx                 ← 根布局
│   ├── page.tsx                   ← 首页（需重构）
│   ├── robots.ts
│   └── sitemap.ts
├── components/
│   ├── DataFlywheel.tsx           ← 数据飞轮（保持）
│   ├── Header.tsx                 ← 顶栏（改 canonical 简历链接）
│   ├── ProjectGallery.tsx         ← 截图灯箱（保持）
│   ├── ProjectLibrary.tsx         ← 项目库网格（加 tier 过滤）
│   └── SystemMap.tsx              ← 五层架构图（合并 Feishu 模块）
├── content/
│   └── projects.ts                ← 项目数据模型（核心重构）
├── public/
│   ├── projects/                  ← 9 个项目截图目录（保持）
│   └── resume/                    ← 3 份 PDF（需指定 canonical）
├── package.json                   ← next 16.2.10 / react 19.2.7，无测试框架
├── tsconfig.json
└── README.md                      ← 写"第 9 个 LoRA"，已漂移到 10
```

### 已识别的漂移与问题

| 问题 | 位置 | 风险 |
|---|---|---|
| `featuredProjects` 在 projects.ts 是 3 项，在 app/page.tsx 被覆盖为 4 项（含 collator） | `app/page.tsx:10` vs `content/projects.ts:656` | 数据分裂 |
| Hero 写"4 个核心 AI 产品 + 5 个业务支撑模块" | `app/page.tsx:25,54-57` | 与 3 主案例口径冲突 |
| Featured 标题"四个案例，证明四项关键能力" | `app/page.tsx:79` | 应为 3 案例 |
| System 标题"4 个核心产品 + 5 个支撑模块" | `app/page.tsx:118` | 同上 |
| 案例翻页"全部 9 个项目"硬编码 | `app/projects/[slug]/page.tsx:177` | 实际 10 个，且要改为动态 |
| README 写"新增第 9 个 LoRA" | `README.md:8` | Portal 已是第 10 |
| 3 份 PDF 都被链接 | `app/page.tsx:29,210-212`、`Header.tsx:33` | 简历版本漂移 |
| 手机号 `18874988048` 明文展示 | `app/page.tsx:209` | 隐私风险 |
| Lumen `link.note` 写"体验需自行配置模型 API Key" | `content/projects.ts:227` | 实际密码保护，应为"受控演示" |
| Service Agent `status: "业务验证中"` 但 chat.jael.com 失效 | `content/projects.ts:118` | 演示不可用 |
| 无测试文件 | `package.json` | consistency gate 无依托 |

### 三大主案例当前真实状态（审计包口径）

| 项目 | 当前公开状态 | 演示方式 | 关键边界 |
|---|---|---|---|
| 飞书平台 | Core Workflow Implemented（dry-run） | Portal 本地运行 | 不写"生产全链路验收"；OCR/ASR/CLIP 按 V1 真实进度 |
| Service Agent | Portfolio Demo（端到端 MVP） | `chat.jael.com` 维护中 | 不写"已生产上线"；指标标 DOCUMENTED_ONLY |
| Lumen | Final Validation（受控演示） | `lumen-ink.vercel.app` 密码保护 | CloudBase FIX-R9 `awaiting_gpt_acceptance`；不写"无门槛公开体验" |

---

## File Structure

### Lane A（demonstratio）— 新增 / 修改

| 文件 | 操作 | 职责 |
|---|---|---|
| `content/projects.ts` | 修改 | 扩展 Project 类型；重构数据：3 featured + 5 experiment + 1 archived；Feishu 平台吸收模块 |
| `content/evidence/feishu.json` | 新增 | 飞书平台证据清单（引用 lark 仓库 evidence pack） |
| `content/evidence/scs.json` | 新增 | SCS 证据清单（引用 Monorepo evidence pack） |
| `content/evidence/lumen.json` | 新增 | Lumen 证据清单（引用 picture-edit evidence pack） |
| `app/page.tsx` | 重写 | 新 Hero / 3 Featured / Capability Chain / Selected Experiments / 简化 Contact |
| `app/projects/[slug]/page.tsx` | 重写 | 9 段标准模板；动态项目数 |
| `components/Header.tsx` | 修改 | 只链 canonical 简历 |
| `components/ProjectLibrary.tsx` | 修改 | 按 tier 分组（Featured / Experiment / Archived） |
| `components/SystemMap.tsx` | 修改 | Feishu 平台合并为单节点；layers 文案对齐 3 主案例 |
| `components/CapabilityChain.tsx` | 新增 | 8 步能力链可视化（替代部分 SystemMap 职责） |
| `__tests__/consistency.test.ts` | 新增 | 10 项 consistency gate |
| `vitest.config.ts` | 新增 | vitest 配置 |
| `package.json` | 修改 | 加 vitest devDep + `test` script |
| `README.md` | 修改 | 同步口径，删除"第 9 个"漂移表述 |
| `PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md` | 新增（项目根） | Trae 完成报告 |
| `PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md` | 新增（项目根） | GPT 复核包 |

### Lane B（lark）— 新增

| 文件 | 操作 | 职责 |
|---|---|---|
| `docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md` | 新增 | 飞书平台聚合公开状态（产品目标态 / 当前公开版本 / 模块状态 / 证据路径 / 未完成项 / 禁止公开主张） |

### Lane C（picture-edit）— 新增

| 文件 | 操作 | 职责 |
|---|---|---|
| `docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md` | 新增 | Lumen 公开证据 pack（8 项证据 + 受控演示说明） |

### Lane D（Monorepo/service agent）— 新增

| 文件 | 操作 | 职责 |
|---|---|---|
| `docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md` | 新增 | SCS 公开证据 pack（7 项证据 + Demo Disclosure） |

---

## Assumptions & Decisions

1. **Feishu 平台合并方式**：保留 slug `data-platform`（避免线上 URL 断链），标题改为"飞书 AI 业务数据平台"，新增 `modules` 字段列出 Portal / Collator / SOP / feishu-v2 / zehuai-app 五个模块。Collator 与 feishu-portal 保留为独立 `tier: 'experiment'` 条目，作为"技术深挖入口"反向链接到 feishu-platform。
2. **小程序归档**：`mini-program` 设为 `tier: 'archived'`，不出现在首页 Selected Experiments，但 `/projects/mini-program` 路由仍可访问（不删数据，不破坏外链）。
3. **canonical 简历**：选定 `chen-jiawei-ai-agent-cn-one-page.pdf` 为 canonical；其余两份 PDF 保留在 `public/resume/` 但不在 UI 主动暴露（可经直接 URL 访问）。
4. **手机号处理**：从 Contact 区移除 `tel:` 链接，改为"通过邮件索取"提示；不删除手机号本身（用户可后续决定）。
5. **chat.jael.com 处理**：Service Agent 的 `link` 改为指向官网案例页本身，`note` 写"公网演示维护中，案例页提供完整产品流程与脱敏运行证据"。
6. **Lumen 演示说明**：`link.note` 改为"受控演示：当前采用密码访问以控制模型调用成本，案例页提供完整产品流程与脱敏运行证据"。**不得**在源码或页面写入密码。
7. **consistency gate 框架**：新增 vitest 1.x 作为 devDependency；不引入 jest/playwright 等更重框架。`npm test` 仅跑 consistency 一个文件。
8. **不部署**：所有 commit 停留在本地 + push 到 GitHub；不触发 Vercel 部署（Vercel auto-deploy 由用户在 Vercel Dashboard 控制或后续授权）。
9. **delta-review/08_TRAE_IMPLEMENTATION_INPUT.md**：规范引用的 Codex 后续输出当前不存在；本 plan 基于审计包 00-14 + 本地仓库核验制定。若 Codex 后续输出与本 plan 冲突，以 Codex 输出为准并更新 plan。
10. **Lane C 边界**：picture-edit 当前在 FIX-R9 `awaiting_gpt_acceptance`；新增 `docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md` 是纯 docs 操作，不触碰 `src/` `docs/lumen-v2/` `.trae/` 任何业务或验收文件。

---

## Task 1: Lane A Setup — 分支 + 依赖 + 类型扩展

**Files:**
- Modify: `D:\360Downloads\Trae 项目\demonstratio\package.json`
- Modify: `D:\360Downloads\Trae 项目\demonstratio\content\projects.ts:1-47`（类型定义部分）
- Create: `D:\360Downloads\Trae 项目\demonstratio\vitest.config.ts`
- Create: `D:\360Downloads\Trae 项目\demonstratio\__tests__\.gitkeep`

**Interfaces:**
- Produces: `ProjectTier` 类型、扩展后的 `Project` 类型（新增 `tier`, `demoType`, `verifiedCapabilities`, `inProgressCapabilities`, `plannedCapabilities`, `evidenceLinks`, `lastVerifiedAt`, `productStrategy`, `keyWorkflow`, `currentVersion`, `inClosure`, `nextIteration`, `myContribution`, `modules` 字段）；`vitest` 可执行。

- [ ] **Step 1: 创建 feature 分支**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
git checkout -b portfolio-closure-sprint-01
git status
```

Expected: `On branch portfolio-closure-sprint-01` / `nothing to commit, working tree clean`

- [ ] **Step 2: 安装 vitest**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
npm install -D vitest@^1.6.0
```

Expected: `added N packages` 无错误。

- [ ] **Step 3: 在 package.json 增加 test script**

修改 `package.json` 的 `scripts` 段：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "tsc --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 4: 创建 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: 扩展 content/projects.ts 类型定义**

在 `content/projects.ts` 顶部类型区追加（保留现有类型不删）：

```typescript
export type ProjectTier = "featured" | "experiment" | "archived";

export type DemoType =
  | "Public Demo"
  | "Controlled Demo"
  | "Local Prototype"
  | "Dry-run Prototype"
  | "No Public Demo";

export type ProjectModule = {
  name: string;
  role: string;
  status: string;
  evidenceRef?: string;
};

export type EvidenceLink = {
  evidenceId: string;
  title: string;
  evidenceType:
    | "UI"
    | "Test"
    | "API"
    | "State Machine"
    | "Data"
    | "Deployment"
    | "Architecture";
  publicSafe: boolean;
  refPath: string;
  gitSha?: string;
  lastVerified: string;
};

export type ProjectCapability = {
  capability: string;
  status: "verified" | "in_progress" | "planned";
  note?: string;
};
```

扩展 `Project` 类型（在现有字段后追加，保留所有现有字段不删）：

```typescript
export type Project = {
  // ... 现有所有字段保持不变 ...
  // 新增字段：
  tier: ProjectTier;
  demoType: DemoType;
  modules?: ProjectModule[];
  productStrategy?: {
    goal: string;
    boundary: string;
    notDoing: string[];
  };
  keyWorkflow?: {
    step: string;
    detail: string;
  }[];
  currentVersion?: string[];
  inClosure?: string[];
  nextIteration?: string[];
  myContribution?: {
    area: string;
    detail: string;
  }[];
  evidenceLinks?: EvidenceLink[];
  lastVerifiedAt?: string;
};
```

- [ ] **Step 6: 暂时不为现有 projects 数据填新字段（先保证类型可选，编译通过）**

由于 Step 5 所有新字段都是可选（`?`），现有 projects 数组无需立即修改即可通过 `tsc --noEmit`。先验证：

```bash
npm run lint
```

Expected: 无错误。

- [ ] **Step 7: 创建 __tests__ 目录占位**

```bash
mkdir __tests__ 2>nul
echo. > __tests__\.gitkeep
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts content/projects.ts __tests__\.gitkeep
git commit -m "chore(portfolio): setup vitest and extend project types for sprint-01"
```

---

## Task 2: 重构 projects.ts — 飞书平台合并 + 3 主案例刷新 + 降级

**Files:**
- Modify: `D:\360Downloads\Trae 项目\demonstratio\content\projects.ts`（数据部分，行 49-644）

**Interfaces:**
- Consumes: Task 1 的扩展类型
- Produces: 3 个 `tier: 'featured'` 项目（含完整新字段）、5 个 `tier: 'experiment'`、1 个 `tier: 'archived'`；`featuredProjects` 导出改为按 `tier === 'featured'` 过滤。

- [ ] **Step 1: 修改 featuredProjects 与新增 experimentProjects 导出**

替换 `content/projects.ts:646-658`：

```typescript
export const categories: (ProjectCategory | "全部")[] = [
  "全部",
  "Agent / RAG",
  "Data / Automation",
  "Multimodal",
  "User Product",
  "Growth",
  "Model Training",
];

export const featuredProjects: Project[] = projects.filter(
  (project) => project.tier === "featured"
);

export const experimentProjects: Project[] = projects.filter(
  (project) => project.tier === "experiment"
);

export const archivedProjects: Project[] = projects.filter(
  (project) => project.tier === "archived"
);

export const publicProjects: Project[] = projects.filter(
  (project) => project.tier !== "archived"
);
```

- [ ] **Step 2: 重构 data-platform 为飞书平台主案例**

替换 `data-platform` 项目对象（行 50-108）。保留 slug `data-platform`，更新标题与新增字段：

```typescript
{
  slug: "data-platform",
  index: "01",
  category: "Data / Automation",
  categoryLabel: "FEISHU AI BUSINESS DATA PLATFORM",
  title: "飞书 AI 业务数据平台",
  subtitle: "把聊天、截图、表单和人工录入转化为可治理的飞书业务数据",
  summary:
    "面向中小型业务团队的 AI 业务数据平台，把聊天记录、截图、表单和人工录入转化为可治理的飞书业务数据，并通过规则校验、人工复核、自动化通知和智能机器人降低录入与协作成本。",
  status: "Core Workflow Implemented",
  role: "产品负责人 / 数据模型设计 / 平台架构",
  team: "3 人创业团队",
  period: "2026.02 - 至今",
  featured: true,
  tier: "featured",
  demoType: "Local Prototype",
  evidenceLabel:
    "文本摄入链路已验证；Candidate V1 与确定性校验已实现；6/6 集成 Gate dry-run 通过；OCR/ASR/CLIP 按 V1 真实进度标记，多模态适配在演进。",
  metrics: [
    { value: "17", label: "张核心数据表" },
    { value: "6/6", label: "集成 Gate 场景通过" },
    { value: "5", label: "个平台模块" },
    { value: "0", label: "生产写入副作用" },
  ],
  tags: ["业务建模", "数据治理", "Agent 编排", "人工复核"],
  stack: ["飞书多维表格", "Node.js", "Next.js 16", "Fastify", "Zod", "Vitest", "CloudBase"],
  problem: [
    "客户、项目、素材、供应商、话术与内容数据分散在聊天、表格和个人经验中，项目推进依赖口头同步。",
    "LLM 直接提取后写库会产生格式、枚举、状态和逻辑错误；普通表单无法解决弱网、权限和执行一致性问题。",
    "摄影业务存在大量异常路径与现场作业场景，单一表单或单次 LLM 调用都无法覆盖。",
  ],
  decisions: [
    "先拆解 12 个关键流转节点，再定义客户、项目、素材、内容与知识 5 个业务域，避免直接从表结构反推业务。",
    "以飞书多维表作为低成本数据底座，通过触发保护、状态机与角色权限控制批量误操作。",
    "采用 Collator → SOP → dry-run writer 的真实 HTTP 链路，治理规则真实执行，只有最终写入是 dry-run。",
    "把人工确认作为数据质量闸门，不确定记录进入复核队列而非直接写库。",
  ],
  outcomes: [
    "完成 17 张业务表、5 个平台模块（Portal / Collator / SOP / feishu-v2 / zehuai-app）的组合架构。",
    "6/6 集成 Gate 场景 PASS：正常客片、正常样片、缺关联、类型未知、幂等确认、SOP BLOCKED → 无写入副作用。",
    "形成'业务建模 - 数据摄入 - 治理校验 - 人工复核 - dry-run 写入'的端到端证据链。",
  ],
  architecture: [
    { label: "智能录入层", detail: "Portal 截图录入 + Collator 多模态摄入" },
    { label: "智能处理层", detail: "LLM 提取 + Candidate V1 合同校验" },
    { label: "治理层", detail: "SOP PRE/POST 规则 + 人工复核 + dry-run 边界" },
    { label: "数据层", detail: "飞书多维表格 17 表 + 状态机 + 枚举" },
    { label: "执行层", detail: "自动化规则 + 通知 + 移动作业 APP" },
  ],
  tradeoffs: [
    "采用飞书低代码而非自建数据库，换取更快上线与业务可维护性；复杂权限和批处理使用云函数补足。",
    "Prototype 阶段使用 MockOcrEngine 返回固定预设文本，换取可重复演示和零凭据风险，不接入真实 OCR。",
    "规则与 Schema 优先于端到端自动写入，牺牲少量速度以避免业务数据污染。",
  ],
  nextSteps: [
    "接入真实 OCR 引擎和飞书生产凭据，在受控环境验证 live write 路径。",
    "建立固定评测集，统计 OCR 字段准确率、治理拦截率和人工修改率。",
  ],
  relationships: [
    { slug: "service-agent", label: "Service Agent", detail: "客户上下文和业务知识由平台提供。" },
    { slug: "collator", label: "Collator 模块", detail: "平台非结构化摄入入口，技术深挖入口。" },
    { slug: "feishu-portal", label: "Portal 模块", detail: "平台可视化治理控制台。" },
  ],
  modules: [
    { name: "Portal", role: "可视化治理控制台", status: "Prototype · dry-run", evidenceRef: "lark/portal" },
    { name: "Collator", role: "非结构化摄入 Agent", status: "MVP 验证完成", evidenceRef: "lark/collator" },
    { name: "SOP", role: "PRE/POST 规则治理", status: "规则引擎已实现", evidenceRef: "lark/SOP" },
    { name: "feishu-v2", role: "数据底座迁移与字段投影", status: "14 测试文件", evidenceRef: "lark/SOP/feishu-v2" },
    { name: "zehuai-app", role: "移动作业与业务触点", status: "开发中", evidenceRef: "lark/SOP/src/zehuai-app" },
  ],
  productStrategy: {
    goal: "把非结构化业务输入转成可治理的飞书业务数据，覆盖录入、校验、复核、写入、执行全链路。",
    boundary: "飞书多维表为唯一数据底座；治理规则真实执行；写入边界在 dry-run 与 live 之间显式切换。",
    notDoing: [
      "不替换飞书为自建数据库",
      "不在 Prototype 阶段接入真实 OCR",
      "不把 dry-run 写成生产真实写入",
    ],
  },
  keyWorkflow: [
    { step: "01 截图录入", detail: "运营在 Portal 上传截图或粘贴聊天文本" },
    { step: "02 Candidate 生成", detail: "Collator LLM 提取 + 合同校验产出 Candidate" },
    { step: "03 治理校验", detail: "SOP PRE_WRITE 规则 + 业务规则 BR-01~06" },
    { step: "04 人工确认", detail: "低置信度记录进入复核队列，人工修正后确认" },
    { step: "05 dry-run 写入", detail: "dry-run writer 模拟写入，zero side effect" },
  ],
  currentVersion: [
    "文本摄入链路已验证",
    "Candidate V1 与确定性校验已实现",
    "6/6 集成 Gate dry-run 通过",
    "Portal 6 段可视化流程",
    "17 表结构与状态机",
  ],
  inClosure: [
    "Portal 拆分为独立仓库并部署 Preview",
    "SOP 规则引擎与 feishu-v2 字段投影统一验收",
    "zehuai-app 移动端脏工作区清理（46 modified + 44 untracked）",
  ],
  nextIteration: [
    "接入真实 OCR 引擎与飞书生产凭据",
    "建立固定评测集（字段准确率、治理拦截率、人工修改率）",
  ],
  myContribution: [
    { area: "用户和业务需求", detail: "拆解 12 个业务节点与 5 个业务域，定义 18 类咨询场景" },
    { area: "产品架构", detail: "设计 Collator → SOP → dry-run writer 三层治理架构" },
    { area: "Agent / 数据流程", detail: "Candidate V1 合同设计、PRE/POST 规则、人工复核闸门" },
    { area: "工程协作", detail: "与 3 人团队协同推进 Portal / Collator / SOP 并行开发" },
    { area: "测试与验收", detail: "6/6 集成 Gate 场景设计，fail-closed 与幂等验证" },
    { area: "迭代决策", detail: "选择 dry-run 优先于 live write，换取演示可重复性" },
  ],
  evidenceLinks: [
    {
      evidenceId: "FEISHU-01",
      title: "集成 Gate 6/6 场景证据",
      evidenceType: "Test",
      publicSafe: true,
      refPath: "lark/scripts/integration-gate-evidence.json",
      lastVerified: "2026-07-23",
    },
    {
      evidenceId: "FEISHU-02",
      title: "Portal 6 张 browser evidence",
      evidenceType: "UI",
      publicSafe: true,
      refPath: "lark/portal/evidence",
      lastVerified: "2026-07-23",
    },
  ],
  lastVerifiedAt: "2026-07-23",
  images: Array.from({ length: 10 }, (_, i) => `/projects/data-platform/${String(i + 1).padStart(2, "0")}.webp`),
  imageMode: "mixed",
  link: { label: "查看平台说明", href: "#contact", note: "本地运行，暂无公开演示链接" },
},
```

- [ ] **Step 3: 删除独立的 collator 与 feishu-portal featured 标记，降级为 experiment**

在 `collator` 项目对象中：
- 删除 `featured: true`（如有）
- 追加 `tier: "experiment"`
- 追加 `demoType: "Local Prototype"`
- 在 `relationships` 中增加反向链接：`{ slug: "data-platform", label: "飞书平台", detail: "Collator 是飞书平台智能录入层的模块。" }`

在 `feishu-portal` 项目对象中：
- 追加 `tier: "experiment"`
- 追加 `demoType: "Dry-run Prototype"`
- 在 `relationships` 中增加反向链接：`{ slug: "data-platform", label: "飞书平台", detail: "Portal 是飞书平台的可视化治理控制台。" }`

- [ ] **Step 4: 刷新 service-agent 为受控演示状态**

在 `service-agent` 项目对象中修改：

```typescript
status: "Portfolio Demo",
tier: "featured",
demoType: "Controlled Demo",
```

修改 `link` 字段：

```typescript
link: {
  label: "查看案例",
  href: "/projects/service-agent",
  note: "公网演示维护中，案例页提供完整产品流程与脱敏运行证据",
},
```

追加新字段（保留现有 decisions / architecture / outcomes 不变）：

```typescript
productStrategy: {
  goal: "用 LangGraph 编排检索、风险分流、生成、质量检查与人工接管，覆盖高端摄影咨询全场景。",
  boundary: "AI 优先应答，低置信度与敏感场景必须转人工；知识更新必须经人工确认。",
  notDoing: [
    "不追求无条件自动回复",
    "不在没有固定评测集前公开绝对准确率",
    "不把 Dify 组件写成实际生产部署",
  ],
},
keyWorkflow: [
  { step: "01 意图识别", detail: "18 类咨询场景路由 + 敏感边界判断" },
  { step: "02 查询理解", detail: "对话上下文 + 查询改写 + 关键词补全" },
  { step: "03 检索增强", detail: "向量召回 + 候选重排序 + 引用上下文" },
  { step: "04 质量闸门", detail: "三级置信度：高分建议 / 中分复核 / 低分转人工" },
  { step: "05 人工接管", detail: "PC 客服辅助界面 + 会话归档" },
  { step: "06 知识飞轮", detail: "归档 → 清洗 → 人工确认 → 飞书主源 + JSON 镜像" },
],
currentVersion: [
  "LangGraph 工作流端到端 MVP",
  "RAG 检索 + 三级置信度分流",
  "人工接管 + 反馈飞轮",
  "Web/API 双入口",
  "819 tracked 文件 + 28 测试文件",
],
inClosure: [
  "chat.jael.com 公网演示恢复（当前 ERR_CONNECTION_CLOSED）",
  "STATUS.yaml 同步至当前代码状态（停留在 2026-07-16 W39）",
  "固定评测集建设（覆盖 18 场景的召回率、采纳率、转人工率）",
],
nextIteration: [
  "建立覆盖 18 场景的冻结评测集",
  "真实流量分阶段灰度，校准置信度阈值",
],
myContribution: [
  { area: "用户和业务需求", detail: "定义 18 类咨询场景与可答/需确认/必须转人工边界" },
  { area: "产品架构", detail: "LangGraph 节点/边设计 + 风险策略优先于对话策略" },
  { area: "Agent / 数据流程", detail: "查询改写、候选检索、重排序、三级置信度分流" },
  { area: "工程协作", detail: "与 3 人团队协同 Web/API/知识库并行开发" },
  { area: "测试与验收", detail: "28 测试文件 + fail-closed 人工接管验证" },
  { area: "迭代决策", detail: "牺牲自动化率换取价格/档期/敏感场景可靠性" },
],
evidenceLinks: [
  {
    evidenceId: "SCS-01",
    title: "LangGraph 工作流源码",
    evidenceType: "Architecture",
    publicSafe: true,
    refPath: "Monorepo/service agent/src/langgraph",
    lastVerified: "2026-07-23",
  },
],
lastVerifiedAt: "2026-07-23",
```

- [ ] **Step 5: 刷新 lumen-ink 为受控演示状态**

在 `lumen-ink` 项目对象中修改：

```typescript
status: "Final Validation",
tier: "featured",
demoType: "Controlled Demo",
```

修改 `link` 字段：

```typescript
link: {
  label: "查看案例",
  href: "/projects/lumen-ink",
  note: "受控演示：当前采用密码访问以控制模型调用成本，案例页提供完整产品流程与脱敏运行证据",
},
```

追加新字段（保留现有 decisions / architecture / outcomes 不变）：

```typescript
productStrategy: {
  goal: "把生成、编辑、参考图、任务状态、资产管理和失败恢复统一到一套可持续迭代的多模型图像工作台。",
  boundary: "Provider 抽象统一模型调用；异步任务状态可追溯；持久化模块处于最终验收。",
  notDoing: [
    "不开放无门槛公开体验（成本控制）",
    "不宣称已全面生产上线",
    "不宣称已证明所有真实 CloudBase 并发语义",
  ],
},
keyWorkflow: [
  { step: "01 需求结构化", detail: "六段式提示词 + 专业参数预设" },
  { step: "02 Provider 选择", detail: "GPT Image / GLM / Gemini / Seedream 热切换" },
  { step: "03 任务调度", detail: "异步任务状态 + 失败重试 + 降级" },
  { step: "04 编辑执行", detail: "画布 + 工具栏 + 参数面板 + 历史记录" },
  { step: "05 资产管理", detail: "任务历史 + 资产版本 + Storage 生命周期" },
  { step: "06 失败恢复", detail: "幂等 + 并发 + 删除协调 + 定时清理" },
],
currentVersion: [
  "4 类模型 Provider 抽象（GPT Image / GLM / Gemini / Seedream）",
  "生成与编辑流程 + 6 类专业工具",
  "异步任务状态 + 历史任务",
  "CloudBase NoSQL 持久化（FIX-R9 awaiting_gpt_acceptance）",
  "幂等 + 并发 + 删除协调 + Storage 生命周期",
  "Preview / Production 分级",
  "636 tests PASS",
],
inClosure: [
  "CloudBase NoSQL FIX-R9 GPT 验收（readyForPreview=false）",
  "真实 CloudBase OCC、Storage 状态码与新 collection/index 行为 Preview 验证",
],
nextIteration: [
  "跨 Provider 质量、时延与成本评测面板",
  "可复用风格包 + 人工审核标注 + 业务评测集",
],
myContribution: [
  { area: "用户和业务需求", detail: "把修图专家经验抽象为可操作参数、流程与模型能力" },
  { area: "产品架构", detail: "Provider 工厂与适配器统一模型调用、错误处理、故障转移" },
  { area: "Agent / 数据流程", detail: "异步任务状态机 + 幂等 + 删除协调 + Storage 生命周期" },
  { area: "工程协作", detail: "Lumen V2 跨窗口协作（Trae 实施 / GPT 验收 / 用户决策）" },
  { area: "测试与验收", detail: "636 tests + 高风险持久化审计多轮修复" },
  { area: "迭代决策", detail: "Preview/Production 分级 + 受控演示决策（成本控制）" },
],
evidenceLinks: [
  {
    evidenceId: "LUMEN-01",
    title: "Provider 抽象源码",
    evidenceType: "Architecture",
    publicSafe: true,
    refPath: "picture-edit/src/server/providers",
    lastVerified: "2026-07-23",
  },
  {
    evidenceId: "LUMEN-02",
    title: "NoSQL 持久化测试",
    evidenceType: "Test",
    publicSafe: true,
    refPath: "picture-edit/src/server/storage/cloudbase.nosql.ts",
    lastVerified: "2026-07-23",
  },
],
lastVerifiedAt: "2026-07-23",
```

- [ ] **Step 6: 为其余 6 个项目追加 tier 字段**

为 `wechat-bot`、`content-research`、`brand-website`、`lora-finetuning` 追加 `tier: "experiment"` 与合适的 `demoType`。
为 `mini-program` 追加 `tier: "archived"` 与 `demoType: "No Public Demo"`。

- [ ] **Step 7: 修改 capabilities 数组替换为 8 步能力链文案**

替换 `content/projects.ts` 末尾的 `capabilities` 数组（行 660-676）：

```typescript
export const capabilityChain = [
  {
    step: "01",
    title: "业务问题识别",
    detail: "从业务链路、异常路径和成本约束出发定义 AI 场景，不从模型能力反推功能。",
  },
  {
    step: "02",
    title: "非结构化数据摄入",
    detail: "聊天、截图、语音、文档经 Portal / Collator 进入 Candidate 流水线。",
  },
  {
    step: "03",
    title: "AI 提取与 Agent 编排",
    detail: "LangGraph 节点编排 + Provider 抽象 + 查询改写 + 候选重排序。",
  },
  {
    step: "04",
    title: "确定性治理",
    detail: "JSON Schema + 枚举 + 状态机 + PRE/POST 业务规则 + 一致性约束。",
  },
  {
    step: "05",
    title: "人工复核",
    detail: "三级置信度分流 + PC 客服辅助 + 复核队列 + 人工确认闸门。",
  },
  {
    step: "06",
    title: "业务系统写入",
    detail: "dry-run / live 显式切换 + 飞书多维表 + 状态机 + 触发保护。",
  },
  {
    step: "07",
    title: "自动化执行",
    detail: "12 条自动化规则 + 通知 + 机器人 + 移动作业 + 待同步队列。",
  },
  {
    step: "08",
    title: "测试、监控与迭代",
    detail: "集成 Gate + 评测集 + 反馈飞轮 + 知识同步 + 跨 Provider 评测面板。",
  },
];

// 保留 capabilities 兼容性（如其他组件引用）
export const capabilities = [
  {
    title: "业务建模",
    body: "从业务链路、异常路径和成本约束出发定义 AI 场景。",
    evidence: "12 业务节点 · 18 咨询场景 · 5 业务域",
  },
  {
    title: "Agent 与数据治理",
    body: "覆盖 Agent 编排、RAG、模型路由、知识治理、人工质量闸门。",
    evidence: "三级置信度 · Provider 抽象 · dry-run Gate",
  },
  {
    title: "端到端交付",
    body: "需求、原型、开发验证、上线协同、评估设计与数据回流。",
    evidence: "3 主案例 · 17 表 · Web / 小程序 / APP",
  },
];
```

- [ ] **Step 8: 验证类型与编译**

```bash
npm run lint
```

Expected: 无错误（所有新字段可选，旧字段保留）。

- [ ] **Step 9: Commit**

```bash
git add content/projects.ts
git commit -m "feat(portfolio): consolidate feishu platform and refresh featured projects"
```

---

## Task 3: 重写首页 — Hero / 3 Featured / Capability Chain / Experiments / Contact

**Files:**
- Rewrite: `D:\360Downloads\Trae 项目\demonstratio\app\page.tsx`
- Create: `D:\360Downloads\Trae 项目\demonstratio\components\CapabilityChain.tsx`

**Interfaces:**
- Consumes: `featuredProjects`, `experimentProjects`, `capabilityChain`, `publicProjects` from `content/projects.ts`
- Produces: 新首页，删除"4+5"语言，3 主案例卡片，8 步能力链，Selected Experiments 区，简化 Contact。

- [ ] **Step 1: 创建 CapabilityChain 组件**

`components/CapabilityChain.tsx`:

```typescript
import { capabilityChain } from "@/content/projects";

export function CapabilityChain() {
  return (
    <div className="capability-chain" aria-label="能力链：从业务问题识别到测试监控迭代">
      <div className="capability-spine" aria-hidden="true" />
      {capabilityChain.map((item) => (
        <article className="capability-step" key={item.step}>
          <span>{item.step}</span>
          <div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 重写 app/page.tsx**

完整替换 `app/page.tsx`：

```typescript
import Image from "next/image";
import { CapabilityChain } from "@/components/CapabilityChain";
import { DataFlywheel } from "@/components/DataFlywheel";
import { Header } from "@/components/Header";
import { ProjectLibrary } from "@/components/ProjectLibrary";
import { SystemMap } from "@/components/SystemMap";
import {
  experimentProjects,
  featuredProjects,
  publicProjects,
} from "@/content/projects";

const Arrow = () => <span aria-hidden="true">↗</span>;

const CANONICAL_RESUME = "/resume/chen-jiawei-ai-agent-cn-one-page.pdf";

export default function Home() {
  const featuredCount = featuredProjects.length;
  const experimentCount = experimentProjects.length;

  return (
    <main id="top">
      <Header />

      <section className="hero section-shell">
        <div className="hero-copy">
          <div className="availability"><span /> OPEN TO AI PRODUCT OPPORTUNITIES</div>
          <p className="eyebrow">AI AGENT PRODUCT MANAGER · TECHNICAL BUILDER</p>
          <h1>AI Agent 产品经理，专注把复杂业务流程转化为可治理、可协同、可交付的 AI 系统。</h1>
          <p className="hero-lead">
            覆盖业务建模、Agent 编排、数据治理、人工复核、多端产品与云端交付。三大主案例分别证明业务系统设计、Agent 可靠性与多模态产品化能力。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#featured">查看三大主案例 <span>↓</span></a>
            <a className="button button-ghost" href={CANONICAL_RESUME} target="_blank" rel="noreferrer">下载简历 <Arrow /></a>
          </div>
          <div className="hero-links">
            <a href="https://github.com/Catcherog" target="_blank" rel="noreferrer">GitHub</a>
            <a href="mailto:Jael_Chen@foxmail.com">Email</a>
          </div>
        </div>

        <div className="hero-visual" aria-label="主案例界面预览">
          <a className="hero-panel hero-panel-main" href="/projects/data-platform">
            <Image src="/projects/data-platform/01.webp" alt="飞书 AI 业务数据平台" fill priority sizes="(max-width: 900px) 92vw, 620px" />
            <span>01 · FEISHU PLATFORM</span>
          </a>
          <a className="hero-panel hero-panel-top" href="/projects/service-agent">
            <Image src="/projects/service-agent/01.webp" alt="Service Agent" fill priority sizes="300px" />
            <span>02 · AGENT / RAG</span>
          </a>
          <a className="hero-panel hero-panel-bottom" href="/projects/lumen-ink">
            <Image src="/projects/lumen-ink/01.webp" alt="光砚 AI 图像编辑工作台" fill priority sizes="320px" />
            <span>03 · MULTIMODAL</span>
          </a>
        </div>

        <div className="hero-metrics">
          <div><strong>{featuredCount}</strong><span>主案例</span></div>
          <div><strong>{experimentCount}</strong><span>实验项目</span></div>
          <div><strong>17 / 12</strong><span>数据表 / 自动化规则</span></div>
          <div><strong>636</strong><span>Lumen 测试通过</span></div>
        </div>
      </section>

      <section className="section-shell section-block" id="featured">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FEATURED CASE STUDIES</p>
            <h2>三大主案例，证明端到端 AI 产品能力。</h2>
          </div>
          <p>飞书平台、Service Agent 与光砚分别证明业务系统设计、Agent 可靠性与多模态产品化能力。每个案例明确区分已验证、收尾中与后续计划。</p>
        </div>

        <div className="featured-list">
          {featuredProjects.map((project, index) => (
            <article className="featured-card" key={project.slug}>
              <a className="featured-image" href={`/projects/${project.slug}`}>
                <Image src={project.images[0]} alt={`${project.title} 项目预览`} fill sizes="(max-width: 900px) 100vw, 58vw" />
                <span>{project.status}</span>
              </a>
              <div className="featured-copy">
                <div className="featured-index"><span>{project.index}</span><strong>{project.category}</strong></div>
                <h3>{project.title}</h3>
                <p className="featured-subtitle">{project.subtitle}</p>
                <p className="featured-summary">{project.summary}</p>
                <dl className="featured-scope">
                  <div><dt>我的角色</dt><dd>{project.role}</dd></div>
                  <div><dt>核心决策</dt><dd>{project.decisions[0]}</dd></div>
                  <div><dt>演示方式</dt><dd>{project.demoType}</dd></div>
                </dl>
                <div className="featured-tags">
                  {project.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="featured-metrics">
                  {project.metrics.slice(0, 3).map((metric) => (
                    <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}{metric.note ? ` · ${metric.note}` : ""}</span></div>
                  ))}
                </div>
                <a className="case-link" href={`/projects/${project.slug}`}>阅读完整案例 <Arrow /></a>
              </div>
              <span className="featured-number">0{index + 1}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="capability-section" id="capability">
        <div className="section-shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CAPABILITY FRAMEWORK</p>
              <h2>从业务问题识别到测试监控迭代的完整能力链。</h2>
            </div>
            <p>不是单点功能堆叠，而是覆盖非结构化摄入、Agent 编排、确定性治理、人工复核、业务写入、自动化执行与测试迭代的端到端链路。</p>
          </div>
          <CapabilityChain />
        </div>
      </section>

      <section className="system-section" id="system">
        <div className="section-shell">
          <div className="section-heading system-heading">
            <div>
              <p className="eyebrow">CROSS-PROJECT ARCHITECTURE</p>
              <h2>3 主案例 + N 实验项目，组成一套分层 AI 产品系统。</h2>
            </div>
            <p>飞书平台统一业务流转，Service Agent 处理咨询与质量闸门，光砚提供多模态产品化能力，实验项目作为支撑与演进。</p>
          </div>
          <SystemMap />
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="section-shell method-layout">
          <div className="method-copy">
            <p className="eyebrow">RELIABILITY BY DESIGN</p>
            <h2>AI 产品的核心不是"自动化更多"，而是错误可控。</h2>
            <p className="method-lead">先定义业务边界和失败成本，再设计模型、工具调用、人工接管与数据反馈。</p>
            <div className="method-principles">
              <div><span>01</span><strong>业务链路先于模型</strong><p>先识别角色、关键节点、异常路径和可量化结果。</p></div>
              <div><span>02</span><strong>质量闸门先于全自动</strong><p>用置信度、规则校验和人工确认控制高风险输出。</p></div>
              <div><span>03</span><strong>评估先于规模化</strong><p>区分训练 loss、离线检索指标和真实业务效果。</p></div>
              <div><span>04</span><strong>数据回流先于一次性交付</strong><p>让确认后的真实数据持续更新知识、规则和模型。</p></div>
            </div>
          </div>
          <DataFlywheel />
        </div>
      </section>

      <section className="section-shell section-block project-library-section" id="projects">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SELECTED WORK & EXPERIMENTS</p>
            <h2>实验与支撑项目</h2>
          </div>
          <p>其余项目作为实验或辅助能力保留，按真实进度持续更新；不与三大主案例争夺视觉层级。</p>
        </div>
        <ProjectLibrary projects={publicProjects} />
        <p className="metric-note">指标说明：标注为"内部估算 / 业务估算"的数值来自小样本测试或运营观察，未作为经过大样本验证的业务结论。</p>
      </section>

      <section className="experience-section" id="experience">
        <div className="section-shell experience-layout">
          <div>
            <p className="eyebrow">EXPERIENCE</p>
            <h2>从复杂项目交付，到 AI 产品创业。</h2>
          </div>
          <div className="timeline">
            <article>
              <div className="timeline-date">2026.02 - 至今</div>
              <div className="timeline-content">
                <span>全职创业 · 3 人团队</span>
                <h3>泽怀摄影工作室｜创始人兼 AI 产品负责人</h3>
                <p>从 0 到 1 构建三大主案例：飞书 AI 业务数据平台、Service Agent、光砚。</p>
                <ul>
                  <li>3 主案例 + 5 实验项目</li>
                  <li>17 张数据表、12 条自动化、6/6 集成 Gate</li>
                  <li>Agent、RAG、多模态与 QLoRA 端到端实践</li>
                </ul>
              </div>
            </article>
            <article>
              <div className="timeline-date">2024.07 - 2026.02</div>
              <div className="timeline-content">
                <span>复杂项目组合管理</span>
                <h3>TP-Link｜商用项目经理</h3>
                <p>负责 5 条软硬件产品线的项目组合、跨国需求和高风险交付。</p>
                <ul>
                  <li>282 个 SKU 全生命周期、峰值 80+ 项目并行</li>
                  <li>主导海外 NFC 功能定义与交互方案</li>
                  <li>高风险项目追回 2 周工期，5 款产品提前 15 天量产</li>
                </ul>
              </div>
            </article>
            <article>
              <div className="timeline-date">2020.09 - 2024.06</div>
              <div className="timeline-content">
                <span>材料科学与结构化思维</span>
                <h3>中南大学｜材料物理本科</h3>
                <p>大学生创新创业项目省级奖项，参与固态电池材料课题；校辩论队核心成员，CET-6。</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="section-shell contact-layout">
          <div>
            <p className="eyebrow">CONTACT</p>
            <h2>目标方向：AI 应用 / Agent 产品经理。</h2>
            <p>倾向有技术深度、重视真实落地和产品评估的 AI 公司。接受全国、海外及远程机会。</p>
          </div>
          <div className="contact-actions">
            <a href="mailto:Jael_Chen@foxmail.com"><span>邮箱</span><strong>Jael_Chen@foxmail.com</strong><Arrow /></a>
            <a href={CANONICAL_RESUME} target="_blank" rel="noreferrer"><span>简历（canonical）</span><strong>PDF</strong><Arrow /></a>
            <p className="contact-note">手机号不默认公开展示，可通过邮件索取。</p>
          </div>
        </div>
        <div className="section-shell footer-bottom"><span>© 2026 陈嘉伟</span><a href="#top">返回顶部 ↑</a></div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: 验证 lint**

```bash
npm run lint
```

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/CapabilityChain.tsx
git commit -m "feat(portfolio): restructure homepage with 3 featured case studies"
```

---

## Task 4: 重写项目详情页 — 9 段标准模板

**Files:**
- Rewrite: `D:\360Downloads\Trae 项目\demonstratio\app\projects\[slug]\page.tsx`

**Interfaces:**
- Consumes: 扩展后的 `Project` 类型（含 `productStrategy`, `keyWorkflow`, `currentVersion`, `inClosure`, `nextIteration`, `myContribution`, `modules`, `evidenceLinks`）
- Produces: 9 段标准模板：Overview / Problem / Product Strategy / System Architecture / Key Workflow / Key Product Decisions / Evidence / Current Version and Roadmap / My Contribution；动态项目数翻页。

- [ ] **Step 1: 重写 app/projects/[slug]/page.tsx**

完整替换文件（保留 generateStaticParams / generateMetadata 不变，重写 ProjectPage 主体）：

```typescript
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { ProjectGallery } from "@/components/ProjectGallery";
import { getProject, publicProjects, projects } from "@/content/projects";

const Arrow = () => <span aria-hidden="true">↗</span>;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title}｜陈嘉伟 AI 产品案例`,
    description: project.summary,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      title: `${project.title}｜陈嘉伟 AI 产品案例`,
      description: project.summary,
      url: `https://www.jaelchen.com/projects/${project.slug}`,
      images: [{ url: project.images[0], alt: `${project.title} 项目预览` }],
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  // 翻页只在 publicProjects 内循环（archived 不出现在翻页链）
  const visibleProjects = publicProjects;
  const currentIndex = visibleProjects.findIndex((item) => item.slug === project.slug);
  const previous = visibleProjects[(currentIndex - 1 + visibleProjects.length) % visibleProjects.length];
  const next = visibleProjects[(currentIndex + 1) % visibleProjects.length];
  const totalCount = visibleProjects.length;

  return (
    <main id="top" className="case-page">
      <Header />

      {/* 01 Overview */}
      <section className="case-hero section-shell">
        <div className="case-breadcrumb"><a href="/">首页</a><span>/</span><a href="/#projects">项目库</a><span>/</span><strong>{project.index}</strong></div>
        <div className="case-hero-grid">
          <div>
            <p className="eyebrow">{project.categoryLabel}</p>
            <h1>{project.title}</h1>
            <p className="case-subtitle">{project.subtitle}</p>
            <p className="case-summary">{project.summary}</p>
            <div className="case-tags">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </div>
          <aside className="case-facts">
            <div><span>状态</span><strong>{project.status}</strong></div>
            <div><span>演示方式</span><strong>{project.demoType}</strong></div>
            <div><span>我的角色</span><strong>{project.role}</strong></div>
            <div><span>团队</span><strong>{project.team}</strong></div>
            <div><span>周期</span><strong>{project.period}</strong></div>
            {project.link && (
              <a href={project.link.href} target={project.link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {project.link.label} <Arrow />
                {project.link.note && <small>{project.link.note}</small>}
              </a>
            )}
          </aside>
        </div>
        <div className="case-metrics">
          {project.metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              {metric.note && <small>{metric.note}</small>}
            </div>
          ))}
        </div>
        {project.evidenceLabel && <p className="case-disclaimer">口径说明：{project.evidenceLabel}</p>}
      </section>

      {/* 02 Problem */}
      <section className="case-overview section-shell">
        <div className="case-section-title"><span>02</span><div><p className="eyebrow">PROBLEM</p><h2>原业务流程与核心痛点。</h2></div></div>
        <div className="case-two-column">
          <div className="case-panel">
            <h3>业务问题</h3>
            <ul>{project.problem.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="case-panel case-panel-accent">
            <h3>为什么普通表单或单次 LLM 调用不够</h3>
            <p>{project.evidenceLabel ?? "单一方案无法同时覆盖业务边界、数据质量与异常路径。"}</p>
          </div>
        </div>
      </section>

      {/* 03 Product Strategy */}
      {project.productStrategy && (
        <section className="case-strategy section-shell">
          <div className="case-section-title"><span>03</span><div><p className="eyebrow">PRODUCT STRATEGY</p><h2>产品目标、边界与不做的事。</h2></div></div>
          <div className="case-strategy-grid">
            <div className="case-panel">
              <h3>产品目标</h3>
              <p>{project.productStrategy.goal}</p>
            </div>
            <div className="case-panel">
              <h3>产品边界</h3>
              <p>{project.productStrategy.boundary}</p>
            </div>
            <div className="case-panel case-panel-accent">
              <h3>暂时不做</h3>
              <ul>{project.productStrategy.notDoing.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      {/* 04 System Architecture */}
      <section className="case-architecture section-shell">
        <div className="case-section-title"><span>04</span><div><p className="eyebrow">SYSTEM ARCHITECTURE</p><h2>真实架构与分层职责。</h2></div></div>
        <div className="architecture-flow">
          {project.architecture.map((step, index) => (
            <article key={step.label}>
              <span>0{index + 1}</span>
              <h3>{step.label}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
        <div className="implementation-strip">
          <span>实现栈</span>
          <div>{project.stack.map((item) => <strong key={item}>{item}</strong>)}</div>
        </div>
        {project.modules && project.modules.length > 0 && (
          <div className="modules-strip">
            <span>平台模块</span>
            <div>
              {project.modules.map((mod) => (
                <div key={mod.name} className="module-card">
                  <strong>{mod.name}</strong>
                  <small>{mod.role}</small>
                  <span>{mod.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 05 Key Workflow */}
      {project.keyWorkflow && project.keyWorkflow.length > 0 && (
        <section className="case-workflow section-shell">
          <div className="case-section-title"><span>05</span><div><p className="eyebrow">KEY WORKFLOW</p><h2>一条完整用户路径。</h2></div></div>
          <div className="workflow-flow">
            {project.keyWorkflow.map((step, index) => (
              <article key={step.step}>
                <span>{step.step}</span>
                <h3>{step.step.split(" ").slice(1).join(" ")}</h3>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 06 Key Product Decisions */}
      <section className="case-dark-section">
        <div className="section-shell">
          <div className="case-section-title case-title-light"><span>06</span><div><p className="eyebrow">KEY PRODUCT DECISIONS</p><h2>关键决策与备选方案。</h2></div></div>
          <div className="decision-grid">
            {project.decisions.map((decision, index) => (
              <article key={decision}><span>0{index + 1}</span><p>{decision}</p></article>
            ))}
          </div>
          {project.tradeoffs.length > 0 && (
            <div className="tradeoff-strip">
              <h3>关键取舍</h3>
              <ul>{project.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </div>
      </section>

      {/* 07 Evidence */}
      <section className="case-evidence-section">
        <div className="section-shell">
          <div className="case-section-title"><span>07</span><div><p className="eyebrow">EVIDENCE</p><h2>UI、测试、API、状态机与数据证据。</h2></div></div>
          <div className="outcome-list">
            {project.outcomes.map((outcome, index) => (
              <article key={outcome}><span>{String(index + 1).padStart(2, "0")}</span><p>{outcome}</p></article>
            ))}
          </div>
          {project.evidenceLabel && <div className="evidence-warning"><strong>指标边界</strong><p>{project.evidenceLabel}</p></div>}
          {project.evidenceLinks && project.evidenceLinks.length > 0 && (
            <div className="evidence-links">
              <h3>结构化证据清单</h3>
              <ul>
                {project.evidenceLinks.map((ev) => (
                  <li key={ev.evidenceId}>
                    <strong>{ev.evidenceId}</strong>
                    <span>{ev.title}</span>
                    <small>{ev.evidenceType} · {ev.lastVerified}{ev.publicSafe ? " · Public Safe" : " · Internal"}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 08 Evidence Gallery */}
      <section className="case-gallery-section section-shell">
        <div className="case-section-title"><span>08</span><div><p className="eyebrow">PRODUCT EVIDENCE</p><h2>界面、流程与实现证据。</h2></div></div>
        <ProjectGallery title={project.title} images={project.images} mode={project.imageMode} />
      </section>

      {/* 09 Current Version and Roadmap */}
      <section className="case-roadmap section-shell">
        <div className="case-section-title"><span>09</span><div><p className="eyebrow">CURRENT VERSION & ROADMAP</p><h2>已验证、收尾中与后续计划。</h2></div></div>
        <div className="roadmap-grid">
          <div className="case-panel case-panel-accent">
            <h3>Current Version · 已验证</h3>
            <ul>
              {(project.currentVersion ?? project.outcomes).map((item, index) => (
                <li key={index}>{typeof item === "string" ? item : ""}</li>
              ))}
            </ul>
          </div>
          <div className="case-panel">
            <h3>In Closure · 收尾中</h3>
            <ul>
              {(project.inClosure ?? []).map((item, index) => <li key={index}>{item}</li>)}
              {project.inClosure === undefined && <li>无</li>}
            </ul>
          </div>
          <div className="case-panel">
            <h3>Next Iteration · 后续计划</h3>
            <ul>
              {(project.nextIteration ?? project.nextSteps).map((item, index) => (
                <li key={index}>{typeof item === "string" ? item : ""}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 10 My Contribution */}
      {project.myContribution && project.myContribution.length > 0 && (
        <section className="case-contribution section-shell">
          <div className="case-section-title"><span>10</span><div><p className="eyebrow">MY CONTRIBUTION</p><h2>区分用户需求、产品架构、Agent 流程与工程协作。</h2></div></div>
          <div className="contribution-grid">
            {project.myContribution.map((item, index) => (
              <article key={index}>
                <span>0{index + 1}</span>
                <h3>{item.area}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Relationships */}
      {project.relationships.length > 0 && (
        <section className="relationship-section">
          <div className="section-shell">
            <div className="case-section-title case-title-light"><span>11</span><div><p className="eyebrow">CROSS-PROJECT RELATIONSHIPS</p><h2>它如何进入完整产品系统。</h2></div></div>
            <div className="relationship-grid">
              {project.relationships.map((relation) => (
                <a href={`/projects/${relation.slug}`} key={relation.slug}>
                  <strong>{relation.label}</strong>
                  <p>{relation.detail}</p>
                  <span>查看关联项目 →</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <nav className="case-navigation section-shell" aria-label="项目翻页">
        <a href={`/projects/${previous.slug}`}><span>← 上一个案例</span><strong>{previous.title}</strong></a>
        <a href="/#projects" className="case-all-link">全部 {totalCount} 个项目</a>
        <a href={`/projects/${next.slug}`}><span>下一个案例 →</span><strong>{next.title}</strong></a>
      </nav>

      <section className="case-contact">
        <div className="section-shell">
          <p className="eyebrow">CONTACT</p>
          <h2>正在寻找 AI 应用 / Agent 产品经理机会。</h2>
          <div>
            <a className="button button-primary" href="mailto:Jael_Chen@foxmail.com">联系我 <Arrow /></a>
            <a className="button button-ghost" href="/resume/chen-jiawei-ai-agent-cn-one-page.pdf" target="_blank" rel="noreferrer">下载简历 <Arrow /></a>
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 验证 lint**

```bash
npm run lint
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add "app/projects/[slug]/page.tsx"
git commit -m "feat(portfolio): apply 9-section project detail template"
```

---

## Task 5: 更新支撑组件 — Header / ProjectLibrary / SystemMap / README

**Files:**
- Modify: `D:\360Downloads\Trae 项目\demonstratio\components\Header.tsx`
- Modify: `D:\360Downloads\Trae 项目\demonstratio\components\ProjectLibrary.tsx`
- Modify: `D:\360Downloads\Trae 项目\demonstratio\components\SystemMap.tsx`
- Modify: `D:\360Downloads\Trae 项目\demonstratio\README.md`

- [ ] **Step 1: 更新 Header — 只链 canonical 简历**

`components/Header.tsx` 第 33 行，将 `href` 改为常量（保持文件其他部分不变）：

```typescript
<a className="nav-resume" href="/resume/chen-jiawei-ai-agent-cn-one-page.pdf" target="_blank" rel="noreferrer">
  下载简历 <Arrow />
</a>
```

（已是 canonical 路径，无需修改。但移除任何英文 / 两页简历的引用——目前 Header 只有一个，符合要求。）

- [ ] **Step 2: 更新 ProjectLibrary — 显示 tier 标签**

`components/ProjectLibrary.tsx` 在 `library-meta` 行追加 tier 标签：

```typescript
<div className="library-meta">
  <span>{project.index}</span>
  <span>{project.category}</span>
  <span className={`tier-badge tier-${project.tier}`}>{project.tier === "featured" ? "主案例" : "实验"}</span>
</div>
```

- [ ] **Step 3: 更新 SystemMap — Feishu 平台合并为单节点**

替换 `components/SystemMap.tsx` 的 `layers` 数组，把 `collator` 从"智能服务层"移到"飞书平台层"作为模块说明，把 `feishu-portal` 暂不在 system map 单独露出：

```typescript
const layers = [
  {
    label: "客户触点层",
    caption: "将 AI 能力转化为浏览、体验与咨询",
    projects: [
      ["03", "光砚", "lumen-ink"],
      ["08", "品牌官网", "brand-website"],
    ],
  },
  {
    label: "智能服务层",
    caption: "咨询应答、质量闸门与人工接管",
    projects: [
      ["02", "Service Agent", "service-agent"],
      ["04", "微信机器人", "wechat-bot"],
    ],
  },
  {
    label: "飞书业务数据平台",
    caption: "数据底座 + 摄入 + 治理 + 移动作业",
    projects: [
      ["01", "飞书平台", "data-platform"],
      ["05", "Collator 模块", "collator"],
      ["10", "Portal 模块", "feishu-portal"],
    ],
  },
  {
    label: "增长与模型层",
    caption: "跨平台调研与本地推理",
    projects: [
      ["06", "内容调研", "content-research"],
      ["09", "LoRA 微调", "lora-finetuning"],
    ],
  },
] as const;
```

- [ ] **Step 4: 更新 README — 删除漂移表述**

`README.md` 替换 "主要改动" 段：

```markdown
## 主要改动

- 首页重构为：岗位定位、三大主案例（飞书平台 / Service Agent / 光砚）、能力链、Selected Experiments、经历时间线。
- 飞书平台吸收 Collator / Portal / SOP / feishu-v2 / zehuai-app 五个模块，统一作为飞书 AI 业务数据平台展示。
- 项目详情页统一为 9 段模板：Overview / Problem / Product Strategy / System Architecture / Key Workflow / Key Decisions / Evidence / Current Version & Roadmap / My Contribution。
- 项目数据按 tier 分层：featured / experiment / archived；项目数量从数据自动计算，不再硬编码。
- 新增 vitest consistency gate：检查路由存在、slug 唯一、状态字段完整、禁止词未出现等 10 项。
- canonical 简历为 chen-jiawei-ai-agent-cn-one-page.pdf；手机号不默认公开展示。
- 演示入口按真实状态标注：飞书平台 Local Prototype、Service Agent Controlled Demo、Lumen Controlled Demo（密码保护）。
```

- [ ] **Step 5: 验证 lint + build**

```bash
npm run lint
npm run build
```

Expected: lint 无错误；build 成功生成 `.next/`。

- [ ] **Step 6: Commit**

```bash
git add components/Header.tsx components/ProjectLibrary.tsx components/SystemMap.tsx README.md
git commit -m "feat(portfolio): update header library systemmap for tier-based structure"
```

---

## Task 6: Evidence 数据 + Consistency Gate

**Files:**
- Create: `D:\360Downloads\Trae 项目\demonstratio\content\evidence\feishu.json`
- Create: `D:\360Downloads\Trae 项目\demonstratio\content\evidence\scs.json`
- Create: `D:\360Downloads\Trae 项目\demonstratio\content\evidence\lumen.json`
- Create: `D:\360Downloads\Trae 项目\demonstratio\__tests__\consistency.test.ts`

- [ ] **Step 1: 创建 content/evidence/feishu.json**

```json
{
  "project": "feishu-platform",
  "packRef": "lark/docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md",
  "lastVerified": "2026-07-23",
  "evidence": [
    {
      "evidenceId": "FEISHU-01",
      "title": "集成 Gate 6/6 场景证据",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "lark/scripts/integration-gate-evidence.json",
      "gitSha": "1e5e5ad",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-02",
      "title": "Portal 6 张 browser evidence",
      "evidenceType": "UI",
      "publicSafe": true,
      "refPath": "lark/portal/evidence",
      "gitSha": "d78f8b6",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-03",
      "title": "feishu-v2 14 测试文件",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "lark/SOP/feishu-v2",
      "gitSha": "9cfe747",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-04",
      "title": "SOP 规则引擎与治理文档",
      "evidenceType": "Architecture",
      "publicSafe": true,
      "refPath": "lark/SOP",
      "gitSha": "d5e08de",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-05",
      "title": "17 表结构关系图",
      "evidenceType": "Data",
      "publicSafe": true,
      "refPath": "lark/SOP/feishu-v2/schema",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-06",
      "title": "集成 Gate 摘要 JSON",
      "evidenceType": "API",
      "publicSafe": true,
      "refPath": "lark/scripts/integration-gate-evidence.json",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "FEISHU-07",
      "title": "当前版本状态卡",
      "evidenceType": "Deployment",
      "publicSafe": true,
      "refPath": "lark/docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md",
      "lastVerified": "2026-07-23"
    }
  ]
}
```

- [ ] **Step 2: 创建 content/evidence/scs.json**

```json
{
  "project": "service-agent",
  "packRef": "Monorepo/service agent/docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md",
  "lastVerified": "2026-07-23",
  "evidence": [
    {
      "evidenceId": "SCS-01",
      "title": "LangGraph 工作流源码",
      "evidenceType": "Architecture",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/src/langgraph",
      "gitSha": "f98b1f5",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-02",
      "title": "Web 客服辅助界面",
      "evidenceType": "UI",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/web",
      "gitSha": "f98b1f5",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-03",
      "title": "API server + 28 测试文件",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/tests",
      "gitSha": "f98b1f5",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-04",
      "title": "/api/agent/chat 与 /api/demo/chat 入口",
      "evidenceType": "API",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/src/api",
      "gitSha": "f98b1f5",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-05",
      "title": "知识检索与引用证据",
      "evidenceType": "Data",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/kb",
      "gitSha": "f98b1f5",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-06",
      "title": "T1/T2/T3 公网摘要",
      "evidenceType": "Deployment",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "SCS-07",
      "title": "Demo Disclosure",
      "evidenceType": "Deployment",
      "publicSafe": true,
      "refPath": "Monorepo/service agent/docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md",
      "lastVerified": "2026-07-23"
    }
  ]
}
```

- [ ] **Step 3: 创建 content/evidence/lumen.json**

```json
{
  "project": "lumen-ink",
  "packRef": "picture-edit/docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md",
  "lastVerified": "2026-07-23",
  "evidence": [
    {
      "evidenceId": "LUMEN-01",
      "title": "Provider 抽象源码",
      "evidenceType": "Architecture",
      "publicSafe": true,
      "refPath": "picture-edit/src/server/providers",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-02",
      "title": "NoSQL 持久化测试",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "picture-edit/src/server/storage/cloudbase.nosql.ts",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-03",
      "title": "工作台首页截图",
      "evidenceType": "UI",
      "publicSafe": true,
      "refPath": "demonstratio/public/projects/lumen-ink/01.webp",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-04",
      "title": "636 tests PASS",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "picture-edit",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-05",
      "title": "受控演示说明",
      "evidenceType": "Deployment",
      "publicSafe": true,
      "refPath": "picture-edit/docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-06",
      "title": "删除协调与 Storage 生命周期",
      "evidenceType": "State Machine",
      "publicSafe": true,
      "refPath": "picture-edit/src/server/services",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-07",
      "title": "FIX-R9 验收摘要",
      "evidenceType": "Test",
      "publicSafe": true,
      "refPath": "picture-edit/docs/lumen-v2/reports",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    },
    {
      "evidenceId": "LUMEN-08",
      "title": "Preview / Production 分级",
      "evidenceType": "Deployment",
      "publicSafe": true,
      "refPath": "picture-edit/.env.example",
      "gitSha": "e1a2576",
      "lastVerified": "2026-07-23"
    }
  ]
}
```

- [ ] **Step 4: 创建 __tests__/consistency.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  projects,
  featuredProjects,
  publicProjects,
  archivedProjects,
} from "@/content/projects";

const FORBIDDEN_TERMS = [
  "OCR/ASR/CLIP 全部落地",
  "全面生产上线",
  "生产级高可用",
  "零漏单",
  "准确率 92%",
  "转化率翻倍",
  "7×24 秒级",
];

const FEATURED_SLUGS = ["data-platform", "service-agent", "lumen-ink"];

describe("portfolio consistency gate", () => {
  it("AC-01: 三个 Featured Project 路由存在", () => {
    expect(featuredProjects).toHaveLength(3);
    const slugs = featuredProjects.map((p) => p.slug).sort();
    expect(slugs).toEqual([...FEATURED_SLUGS].sort());
  });

  it("AC-07: 所有项目 slug 唯一", () => {
    const slugs = projects.map((p) => p.slug);
    const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(duplicates, `重复 slug: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("AC-07: 项目数量从数据自动计算，不硬编码 9 或 10", () => {
    // 这里只验证数据存在；硬编码检查在首页源码层做（grep）
    const homepageSource = fs.readFileSync(
      path.resolve(__dirname, "../app/page.tsx"),
      "utf8"
    );
    expect(homepageSource).not.toMatch(/全部\s*(9|10)\s*个/);
    expect(homepageSource).not.toMatch(/4\s*个核心.*5\s*个/);
  });

  it("AC-08: canonical 简历文件存在", () => {
    const canonicalPath = path.resolve(
      __dirname,
      "../public/resume/chen-jiawei-ai-agent-cn-one-page.pdf"
    );
    expect(fs.existsSync(canonicalPath), `canonical 简历不存在: ${canonicalPath}`).toBe(true);
  });

  it("AC: 外部 Demo 链接格式有效（http/https 或站内路径）", () => {
    for (const project of projects) {
      if (!project.link) continue;
      const href = project.link.href;
      expect(
        href.startsWith("http") || href.startsWith("/") || href.startsWith("#"),
        `${project.slug} link.href 无效: ${href}`
      ).toBe(true);
    }
  });

  it("AC-04: 每个主案例有 status", () => {
    for (const project of featuredProjects) {
      expect(project.status, `${project.slug} 缺 status`).toBeTruthy();
      expect(project.demoType, `${project.slug} 缺 demoType`).toBeTruthy();
    }
  });

  it("AC-04: 每个主案例有 Current / In Closure / Next", () => {
    for (const project of featuredProjects) {
      expect(project.currentVersion, `${project.slug} 缺 currentVersion`).toBeDefined();
      expect(project.currentVersion!.length).toBeGreaterThan(0);
      expect(project.inClosure, `${project.slug} 缺 inClosure`).toBeDefined();
      expect(project.nextIteration, `${project.slug} 缺 nextIteration`).toBeDefined();
      expect(project.nextIteration!.length).toBeGreaterThan(0);
    }
  });

  it("AC-09: 每个主案例至少有一项 evidence", () => {
    for (const project of featuredProjects) {
      expect(
        project.evidenceLinks,
        `${project.slug} 缺 evidenceLinks`
      ).toBeDefined();
      expect(project.evidenceLinks!.length).toBeGreaterThan(0);
    }
  });

  it("AC: 禁止词未出现（除非 Claim Ledger VERIFIED）", () => {
    const serialized = JSON.stringify(projects);
    for (const term of FORBIDDEN_TERMS) {
      expect(
        serialized,
        `禁止词出现: "${term}"`
      ).not.toContain(term);
    }
  });

  it("AC: archived 项目不出现在 publicProjects", () => {
    for (const archived of archivedProjects) {
      expect(publicProjects.find((p) => p.slug === archived.slug)).toBeUndefined();
    }
  });

  it("AC: 每个项目都有 tier 字段", () => {
    for (const project of projects) {
      expect(
        project.tier,
        `${project.slug} 缺 tier`
      ).toMatch(/^(featured|experiment|archived)$/);
    }
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
npm test
```

Expected: 11 tests PASS（AC-01/07/08/04/09 + 禁止词 + archived + tier + link 格式 + 硬编码）。

- [ ] **Step 6: Commit**

```bash
git add content/evidence/ __tests__/consistency.test.ts
git commit -m "test(portfolio): add content consistency gate and evidence data"
```

---

## Task 7: Lane B — 飞书平台 Public Status Pack

**Files:**
- Create: `D:\360Downloads\Trae 项目\lark\docs\portfolio\FEISHU-PLATFORM-PUBLIC-STATUS.md`

**Repo state:** `lark` 仓库当前可能有未提交修改（collator/SOP 脏工作区）。本任务**只新增** `docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md`，不动任何业务代码。

- [ ] **Step 1: 核对 lark 仓库当前状态**

```bash
cd "D:\360Downloads\Trae 项目\lark"
git status --short
git branch --show-current
```

Expected: 看到 collator / SOP 等子目录的脏状态，但本任务只 add `docs/portfolio/` 一个新文件。

- [ ] **Step 2: 创建 docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md**

```markdown
# 飞书 AI 业务数据平台 · 公开状态聚合

> **目的**：为官网与简历提供飞书平台组合项目的统一公开口径。本文件不覆盖各仓库内部控制状态（如 `lark/collator/docs/project_control/STATUS.yaml`）。
> **最后核验**：2026-07-23
> **规范源**：`_portfolio_audit/project-cards/feishu-ai-platform.md`

---

## 1. 产品目标态

面向中小型业务团队的 AI 业务数据平台，把聊天记录、截图、表单和人工录入转化为可治理的飞书业务数据，并通过规则校验、人工复核、自动化通知和智能机器人降低录入与协作成本。

## 2. 当前公开版本

**Core Workflow Implemented**（组合链路 dry-run 证据已形成）

- 文本摄入链路已验证
- Candidate V1 与确定性校验已实现
- 6/6 集成 Gate dry-run 通过（zero side effect）
- Portal 6 段可视化流程
- 17 表结构与状态机

## 3. 模块状态

| 模块 | 角色 | 当前状态 | 仓库 / 路径 | HEAD |
|---|---|---|---|---|
| Portal | 可视化治理控制台 | Prototype · dry-run | `lark/portal` | `d78f8b6` |
| Collator | 非结构化摄入 Agent | MVP 验证完成（HEAD 撤销 PORTFOLIO_READY） | `lark/collator` | `1e5e5ad` |
| SOP | PRE/POST 规则治理 | 规则引擎已实现（脏工作区） | `lark/SOP` | `d5e08de` |
| feishu-v2 | 数据底座迁移与字段投影 | 14 测试文件 | `lark/SOP/feishu-v2` | `9cfe747` |
| zehuai-app | 移动作业与业务触点 | 开发中（46 modified + 44 untracked） | `lark/SOP/src/zehuai-app` | `aa965fa` |

## 4. 证据路径

| Evidence ID | 标题 | 类型 | 路径 | Public Safe |
|---|---|---|---|---|
| FEISHU-01 | 集成 Gate 6/6 场景证据 | Test | `lark/scripts/integration-gate-evidence.json` | ✅ |
| FEISHU-02 | Portal 6 张 browser evidence | UI | `lark/portal/evidence` | ✅ |
| FEISHU-03 | feishu-v2 14 测试文件 | Test | `lark/SOP/feishu-v2` | ✅ |
| FEISHU-04 | SOP 规则引擎与治理文档 | Architecture | `lark/SOP` | ✅ |
| FEISHU-05 | 17 表结构关系图 | Data | `lark/SOP/feishu-v2/schema` | ✅ |
| FEISHU-06 | 集成 Gate 摘要 JSON | API | `lark/scripts/integration-gate-evidence.json` | ✅ |
| FEISHU-07 | 当前版本状态卡 | Deployment | 本文件 | ✅ |

## 5. 未完成项

- Portal 拆分为独立仓库并部署 Preview
- SOP 规则引擎与 feishu-v2 字段投影统一验收
- zehuai-app 移动端脏工作区清理
- 接入真实 OCR 引擎与飞书生产凭据
- 建立固定评测集（字段准确率、治理拦截率、人工修改率）

## 6. 禁止公开主张

以下主张在未补齐证据前**不得**出现在官网或简历：

- ❌ "OCR/ASR/CLIP 全部落地"（当前 V1 限定纯文本，Portal 使用 MockOcrEngine）
- ❌ "生产全链路已统一验收"（当前为 dry-run，未 live write）
- ❌ "零漏单"（缺少独立量化证明）
- ❌ "12 自动化全部生效"（缺少自动化触发统计）
- ❌ 把 `lark/docs/project_control/STATUS.yaml` 的 `PORTFOLIO_READY` 作为当前公开状态（与 Collator HEAD 冲突）

## 7. 内部控制状态对照

| 控制文件 | 当前值 | 是否可作为公开状态 |
|---|---|---|
| `lark/docs/project_control/STATUS.yaml` | `PORTFOLIO_READY` | ❌ 与 Collator HEAD 冲突，不能直接引用 |
| `lark/collator/docs/project_control/STATUS.yaml` | 撤销 `PORTFOLIO_READY` | ✅ 反映 Collator 真实状态 |
| 本文件 | `Core Workflow Implemented` | ✅ 组合口径，供官网引用 |

## 8. 截图 PII 检查清单

所有公开截图必须：
- 使用脱敏样例（MockOcrEngine 返回的预设文本）
- 隐藏飞书表 ID
- 隐藏客户信息
- 隐藏 token
- 隐藏绝对本地路径
- 不显示真实手机号
```

- [ ] **Step 3: Commit（只 add 这一个文件）**

```bash
cd "D:\360Downloads\Trae 项目\lark"
git add docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md
git commit -m "docs(portfolio): add feishu platform public status pack"
```

Expected: 只暂存该文件，不污染其他脏文件。

---

## Task 8: Lane C — Lumen Public Evidence Pack

**Files:**
- Create: `D:\360Downloads\Trae 项目\picture-edit\docs\portfolio\LUMEN-PUBLIC-EVIDENCE-PACK.md`

**Repo state:** `picture-edit` 当前在 FIX-R9 `awaiting_gpt_acceptance`，HEAD `e1a2576`，工作区 clean。本任务**只新增** `docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md`，**严禁触碰** `src/` `docs/lumen-v2/` `.trae/` 任何业务或验收文件。

- [ ] **Step 1: 核对 picture-edit 仓库当前状态**

```bash
cd "D:\360Downloads\Trae 项目\picture-edit"
git status --short
git branch --show-current
git log -1 --format="%H %s"
```

Expected: `FIX-R9` 分支，工作区 clean，HEAD `e1a2576`。

- [ ] **Step 2: 创建 docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md**

```markdown
# Lumen 光砚 · 公开证据 Pack

> **目的**：为官网 Lumen 案例页提供结构化证据清单与受控演示说明。本文件不替代 Lumen V2 内部验收文件（`docs/lumen-v2/`）。
> **最后核验**：2026-07-23
> **规范源**：`_portfolio_audit/project-cards/lumen-picture-edit.md`、`picture-edit/project_memory.md`
> **仓库 HEAD**：`e1a2576`（FIX-R9 `awaiting_gpt_acceptance`）

---

## 1. 产品目标态

面向摄影与内容创作者的多模型 AI 图像工作台，将生成、编辑、参考图、任务状态、资产管理和失败恢复统一到一套可持续迭代的产品体验中。

## 2. 当前公开版本

**Final Validation**（核心实现已完成，持久化模块处于最终验收，当前提供受控演示）

- 4 类模型 Provider 抽象（GPT Image / GLM / Gemini / Seedream）
- 生成与编辑流程 + 6 类专业工具
- 异步任务状态 + 历史任务
- CloudBase NoSQL 持久化（FIX-R9 awaiting_gpt_acceptance）
- 幂等 + 并发 + 删除协调 + Storage 生命周期
- Preview / Production 分级
- 636 tests PASS

## 3. 受控演示说明

> 由于演示会产生模型调用成本，当前采用受控访问方式；案例页提供完整产品流程和脱敏运行证据。

- 公网入口：`https://lumen-ink.vercel.app/`（密码保护）
- **不得**在官网源码或页面泄露密码
- **不得**宣称"无门槛公开体验"或"已全面生产上线"
- 招聘方如需体验，可通过邮件申请受控访问

## 4. 证据清单

| Evidence ID | 标题 | 类型 | 路径 | Public Safe | Git SHA |
|---|---|---|---|---|---|
| LUMEN-01 | Provider 抽象源码 | Architecture | `src/server/providers` | ✅ | `e1a2576` |
| LUMEN-02 | NoSQL 持久化测试 | Test | `src/server/storage/cloudbase.nosql.ts` | ✅ | `e1a2576` |
| LUMEN-03 | 工作台首页截图 | UI | `demonstratio/public/projects/lumen-ink/01.webp` | ✅ | - |
| LUMEN-04 | 636 tests PASS | Test | 根目录 `npm test` | ✅ | `e1a2576` |
| LUMEN-05 | 受控演示说明 | Deployment | 本文件 | ✅ | - |
| LUMEN-06 | 删除协调与 Storage 生命周期 | State Machine | `src/server/services` | ✅ | `e1a2576` |
| LUMEN-07 | FIX-R9 验收摘要 | Test | `docs/lumen-v2/reports` | ✅ | `e1a2576` |
| LUMEN-08 | Preview / Production 分级 | Deployment | `.env.example` | ✅ | `e1a2576` |

## 5. 关键架构证据

### Provider 抽象

- `src/server/providers/`：GPTProvider / GLMProvider / GeminiProvider / SeedreamProvider
- Provider 工厂模式 + 适配器统一模型调用、错误处理、故障转移
- 模型能力标签：🎨文生图 / ✏️图生图 / 💬图像理解

### 持久化与状态机

- CloudBase NoSQL 适配器：`src/server/storage/cloudbase.nosql.ts`
- GenerationJob 状态机：pending → running → succeeded / failed
- 幂等：idempotent record + Job 一致性
- 删除协调：deleteCascade + 100 操作限制 + tombstone barrier
- Storage 生命周期：成功 commit 后清理，失败保留重试信息

### 测试覆盖

- 636 tests PASS（含 NoSQL contract tests、删除协调事务测试、tombstone barrier 并发测试）
- FIX-R9 最终闭合：13 个最终闭合测试全通过

## 6. 未完成项（In Closure）

- CloudBase NoSQL FIX-R9 GPT 验收（`readyForPreview=false`）
- 真实 CloudBase OCC、Storage 状态码与新 collection/index 行为 Preview 验证
- objects.delete() 抛 `METADATA_MISSING` 时的远端对象残留（已登记为 FINAL_CODEX_BLOCKER）

## 7. 后续计划（Next Iteration）

- 跨 Provider 质量、时延与成本评测面板
- 可复用风格包 + 人工审核标注 + 业务评测集

## 8. 禁止公开主张

- ❌ "无门槛公开体验"（密码保护）
- ❌ "已全面生产上线"（FIX-R9 待验收）
- ❌ "已证明所有真实 CloudBase 并发语义"（待 Preview 验证）
- ❌ "转化率翻倍"（简历业务主张，缺少脱敏指标证据）
- ❌ "周期周→天"（同上）
- ❌ 任何绝对业务指标（除非有评测集 + 分母 + 时间窗 + 计算方式 + 可复核原始结果）

## 9. 截图 PII 检查清单

- 隐藏 API Key（用户输入框显示 `未设置` 或 `已设置`，不显示明文）
- 隐藏 Vercel 环境变量
- 隐藏 CloudBase EnvID
- 不显示真实客户照片（使用授权测试图或合成图）
- 隐藏绝对本地路径
```

- [ ] **Step 3: Commit（只 add 这一个文件）**

```bash
cd "D:\360Downloads\Trae 项目\picture-edit"
git add docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md
git commit -m "docs(portfolio): add lumen public evidence pack"
```

Expected: 只暂存该文件，不触碰任何业务/验收文件。

---

## Task 9: Lane D — SCS Public Evidence Pack

**Files:**
- Create: `D:\360Downloads\Trae 项目\Monorepo\service agent\docs\portfolio\SCS-PUBLIC-EVIDENCE-PACK.md`

**Repo state:** `Monorepo/service agent` 是 SCS 规范检出，HEAD `f98b1f5`，clean。本任务**只新增** `docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md`。

- [ ] **Step 1: 核对 SCS 仓库当前状态**

```bash
cd "D:\360Downloads\Trae 项目\Monorepo\service agent"
git status --short
git branch --show-current
git log -1 --format="%H %s"
```

Expected: clean，HEAD `f98b1f5`。

- [ ] **Step 2: 创建 docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md**

```markdown
# Service Agent / SCS · 公开证据 Pack

> **目的**：为官网 SCS 案例页提供结构化证据清单与 Demo Disclosure。
> **最后核验**：2026-07-23
> **规范源**：`_portfolio_audit/project-cards/scs-service-agent.md`
> **仓库 HEAD**：`f98b1f5`

---

## 1. 产品定位

面向影像工作室咨询与运营场景的 Agentic Workflow：知识检索、意图/风险判断、答案生成、质量检查、人工接管和反馈飞轮。

## 2. 当前公开版本

**Portfolio Demo**（端到端 MVP，业务验证中）

- LangGraph 工作流端到端 MVP
- RAG 检索 + 三级置信度分流
- 人工接管 + 反馈飞轮
- Web/API 双入口
- 819 tracked 文件 + 28 测试文件

## 3. Demo Disclosure

- 公网入口：`chat.jael.com`（当前 `ERR_CONNECTION_CLOSED`，演示维护中）
- **不得**宣称"已生产上线"或"在线演示可用"
- 案例页提供完整产品流程与脱敏运行证据
- 招聘方如需体验，可通过邮件申请本地演示或 Demo API Key

## 4. 证据清单

| Evidence ID | 标题 | 类型 | 路径 | Public Safe | Git SHA |
|---|---|---|---|---|---|
| SCS-01 | LangGraph 工作流源码 | Architecture | `src/langgraph` | ✅ | `f98b1f5` |
| SCS-02 | Web 客服辅助界面 | UI | `web` | ✅ | `f98b1f5` |
| SCS-03 | API server + 28 测试文件 | Test | `tests` | ✅ | `f98b1f5` |
| SCS-04 | /api/agent/chat 与 /api/demo/chat 入口 | API | `src/api` | ✅ | `f98b1f5` |
| SCS-05 | 知识检索与引用证据 | Data | `kb` | ✅ | `f98b1f5` |
| SCS-06 | T1/T2/T3 公网摘要 | Deployment | 本文件 | ✅ | - |
| SCS-07 | Demo Disclosure | Deployment | 本文件 | ✅ | - |

## 5. 关键架构证据

### LangGraph 工作流

- `src/langgraph`：节点/边编排
- 节点：意图识别 → 查询改写 → 候选检索 → 重排序 → 置信度判断 → 生成 / 复核 / 转人工
- 风险和低置信度路径 fail-closed 到人工

### API 入口

- `/api/agent/chat`：完整 Agent 调用
- `/api/demo/chat`：演示模式（受控）
- `feedback`、`flywheel`、`KB search` 等管理入口

### 知识飞轮

- 归档 → 清洗 → 人工确认 → 飞书主源 + JSON 镜像
- 保留飞书权威主源，避免单一向量库成为不可解释的知识黑箱

## 6. 未完成项（In Closure）

- `chat.jael.com` 公网演示恢复（当前 `ERR_CONNECTION_CLOSED`）
- `STATUS.yaml` 同步至当前代码状态（停留在 2026-07-16 W39 `CHANGES_REQUIRED`，落后于代码）
- 固定评测集建设（覆盖 18 场景的召回率、采纳率、转人工率）

## 7. 后续计划（Next Iteration）

- 建立覆盖 18 场景的冻结评测集
- 真实流量分阶段灰度，校准置信度阈值
- 记录误答成本

## 8. 禁止公开主张

- ❌ "已生产上线"（端到端 MVP，业务验证中）
- ❌ "在线演示可用"（chat.jael.com 失效）
- ❌ ">50% 自动回答"（DOCUMENTED_ONLY，无大样本）
- ❌ "60→92%"（DOCUMENTED_ONLY）
- ❌ "7×24 秒级"（DOCUMENTED_ONLY）
- ❌ "准确率 92%"（无评测集 + 分母 + 时间窗）
- ❌ 把 Dify 组件写成实际生产部署（应拆成"已用组件"与"实际部署状态"）

## 9. 指标公开规则

绝对数字指标暂不公开，除非已有：
- 评测集
- 分母
- 时间窗
- 计算方式
- 可复核原始结果

当前所有百分比指标在官网标为"内部估算"或"业务估算"，并附 `evidenceLabel` 说明。

## 10. 截图 PII 检查清单

- 隐藏客户真实对话（使用脱敏样例）
- 隐藏 API Key 与 Demo API Key
- 隐藏飞书表 ID
- 隐藏知识库真实路径
- 不显示真实手机号
```

- [ ] **Step 3: Commit**

```bash
cd "D:\360Downloads\Trae 项目\Monorepo\service agent"
git add docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md
git commit -m "docs(portfolio): add scs public evidence pack"
```

---

## Task 10: 全量验证 + 推送 + 报告

**Files:**
- Create: `D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md`
- Create: `D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md`
- Copy: `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`

- [ ] **Step 1: Lane A 全量验证**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
npm run lint
npm test
npm run build
```

Expected:
- `tsc --noEmit` 无错误
- vitest 11 tests PASS
- `next build` 成功，生成 `.next/` 目录，无编译错误

- [ ] **Step 2: 记录 Lane A 最终 HEAD**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
git log --oneline -10
git rev-parse HEAD
```

记录结束 HEAD 用于报告。

- [ ] **Step 3: Push Lane A**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
git push -u origin portfolio-closure-sprint-01
```

若 push 失败（网络超时/连接被拒绝），提醒用户开 VPN（代理端口 7890）后重试。

- [ ] **Step 4: Push Lanes B/C/D（各仓库各自 push）**

```bash
cd "D:\360Downloads\Trae 项目\lark"
git push origin HEAD

cd "D:\360Downloads\Trae 项目\picture-edit"
git push origin FIX-R9

cd "D:\360Downloads\Trae 项目\Monorepo\service agent"
git push origin HEAD
```

每个仓库独立 push。若失败提醒开 VPN。

- [ ] **Step 5: 创建 PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md**

在 `D:\360Downloads\Trae 项目\demonstratio\` 创建报告，内容至少包含：
- canonical repo: `D:\360Downloads\Trae 项目\demonstratio`
- 开始 HEAD: `672c740be002e26b54c3b3266c9a3257c7aea8dc`
- 结束 HEAD: `<Step 2 记录的值>`
- 分支: `portfolio-closure-sprint-01`
- 修改文件清单（按 Lane 列出）
- 三大项目页面结构（9 段模板）
- 证据资产清单（引用 content/evidence/*.json）
- 当前状态口径（飞书 Core Workflow Implemented / SCS Portfolio Demo / Lumen Final Validation）
- 未完成能力（In Closure 项汇总）
- build 结果：PASS
- consistency gate 结果：11 tests PASS
- secret / PII 检查：手机号已隐藏、canonical 简历唯一、API Key 不在源码
- commits 清单（每 Lane 一个 commit）
- 是否 push：是（4 个仓库均 push）
- 是否部署：否（AC-15）
- 下一步需要 GPT 审阅的文案：首页 Hero 文案、3 主案例 summary、Capability Chain 8 步文案、My Contribution 文案
- 下一步需要用户提供的业务事实：SCS 真实业务指标、Lumen 转化率脱敏证据、飞书平台 live write 时间表

- [ ] **Step 6: 创建 PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md**

在 `D:\360Downloads\Trae 项目\demonstratio\` 创建 GPT 复核包，内嵌：
- 首页当前文案（Hero / Featured / Capability / Experiments / Contact）
- 三个项目简介（slug + title + subtitle + summary + status + demoType）
- 三个项目状态（currentVersion / inClosure / nextIteration）
- 每页的 section 结构（9 段 + Relationships + Navigation + Contact）
- 所有 In Closure / Next Iteration 项
- 所有 CTA（link.label + link.href + link.note）
- 六至十二张候选截图说明（引用 evidenceLinks）
- 已使用但尚无量化证据的业务主张（如"636 tests PASS"有证据，"17 表"有证据，但"业务效率提升"无证据）
- 状态标记：`READY_FOR_GPT_CONTENT_REVIEW`、`READY_FOR_USER_ASSET_REVIEW`、`NOT_DEPLOYED`

- [ ] **Step 7: Commit 报告**

```bash
cd "D:\360Downloads\Trae 项目\demonstratio"
git add PORTFOLIO-CLOSURE-SPRINT-01-TRAE-REPORT.md PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md
git commit -m "docs(portfolio): add sprint-01 closure reports"
git push origin portfolio-closure-sprint-01
```

- [ ] **Step 8: 复制完成包到桌面协作文件夹**

用 Python `shutil.copy2` 将 `PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md` 复制到 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`（覆盖旧文件，按用户偏好统一命名）。

```bash
python -c "import shutil; shutil.copy2(r'D:\360Downloads\Trae 项目\demonstratio\PORTFOLIO-CLOSURE-SPRINT-01-GPT-REVIEW.md', r'C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md')"
```

- [ ] **Step 9: 最终状态报告**

向用户报告：
- 4 个 Lane 均已完成独立 commit + push
- Lane A：demonstratio 分支 `portfolio-closure-sprint-01`，11 tests PASS，build PASS
- Lane B：lark 新增 `docs/portfolio/FEISHU-PLATFORM-PUBLIC-STATUS.md`
- Lane C：picture-edit 新增 `docs/portfolio/LUMEN-PUBLIC-EVIDENCE-PACK.md`（未触碰业务/验收文件）
- Lane D：Monorepo/service agent 新增 `docs/portfolio/SCS-PUBLIC-EVIDENCE-PACK.md`
- 完成包已复制到桌面协作文件夹
- 状态：`READY_FOR_GPT_CONTENT_REVIEW`、`READY_FOR_USER_ASSET_REVIEW`、`NOT_DEPLOYED`
- 不自行宣称正式发布

---

## Verification

### AC 覆盖检查

| AC | 验证方式 | Task |
|---|---|---|
| AC-01 首页只突出 3 主案例 | consistency test `AC-01: 三个 Featured Project 路由存在` | Task 6 |
| AC-02 飞书平台不分裂为 4 个主案例 | `featuredProjects` 仅 3 项；Collator/Portal 为 `tier: experiment` | Task 2 |
| AC-03 三主案例统一 9 段模板 | 详情页重写 + lint | Task 4 |
| AC-04 Current/In Closure/Next 分层 | consistency test `AC-04` | Task 6 |
| AC-05 目标态可表达但未验收不写成事实 | 禁止词 test + evidenceLabel | Task 2/6 |
| AC-06 SCS 用最新部署与公网证据 | SCS evidence pack + status `Portfolio Demo` | Task 9 |
| AC-07 项目数量不硬编码 | consistency test `AC-07` + 删除"4+5"/"9个" | Task 3/6 |
| AC-08 canonical 简历唯一 | consistency test `AC-08` + Header/Contact 只链一份 | Task 6 |
| AC-09 三大项目各有 Evidence Pack | feishu.json / scs.json / lumen.json + 3 份 .md | Task 6/7/8/9 |
| AC-10 截图 PII 检查 | 3 份 evidence pack 末尾 PII 检查清单 | Task 7/8/9 |
| AC-11 build 通过 | `npm run build` | Task 10 |
| AC-12 consistency gate 通过 | `npm test` 11 tests PASS | Task 10 |
| AC-13 工作区修改位于 canonical repo | 4 个 Lane 各自仓库 commit | Task 1-9 |
| AC-14 每 Lane 独立 commit + worktree clean | `git status` 每 Lane 后 clean | Task 10 |
| AC-15 不部署 | 不触发 Vercel 部署 | Task 10 |

### Self-Review

1. **Spec coverage**: 规范 12 节全部覆盖——首页改造（Task 3）、详情页模板（Task 4）、飞书平台合并（Task 2/7）、Lumen（Task 2/8）、SCS（Task 2/9）、状态组件（Task 1 类型扩展）、证据引用（Task 6）、consistency gate（Task 6）、提交策略（每 Task 独立 commit）、验收标准（AC-01~15 全覆盖）、最终交付（Task 10）。
2. **Placeholder scan**: 所有代码块均为完整可执行内容，无 TBD/TODO。
3. **Type consistency**: `ProjectTier` / `DemoType` / `ProjectModule` / `EvidenceLink` / `ProjectCapability` 类型在 Task 1 定义，Task 2 使用，Task 4/6 引用——名称一致。
4. **边界确认**：Lane C 只新增 1 个 .md 文件，不触碰 picture-edit 任何业务代码；Lane B 在脏工作区的 lark 仓库只 add 单个文件；Lane D 在 clean 的 SCS 仓库新增 1 个 .md。

---

## Execution Handoff

Plan complete and saved to `d:\360Downloads\Trae 项目\picture-edit\.trae\documents\PORTFOLIO-CLOSURE-SPRINT-01.md`. Two execution options:

1. **Subagent-Driven (recommended)** - 每个 Task 派发独立 subagent，Task 间 review，适合本 plan 的 10 个独立 Task。
2. **Inline Execution** - 当前会话顺序执行，Task 之间检查点 review。

由于本 plan 涉及 4 个不同仓库的独立 commit，且 Task 7/8/9 完全独立可并行，建议 Subagent-Driven。
