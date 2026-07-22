# SESSION HANDOFF｜窗口交接

## 当前状态（2026-07-22，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R7 实施完成，等待 GPT 证据复审 + Codex 限域审计）

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R7-SERVICE-CRASH-TEST-CORRECTION`（子任务，GPT FIX-R6 FIX_REQUIRED 后 Trae 实施）
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **Risk Level**：MEDIUM
- **Route**：R3（GPT FIX_REQUIRED → Trae FIX-R7 → GPT 证据复审 → Codex READ_ONLY 限域审计）
- **Base SHA**：`5d28b32`（FIX-R6 docs commit，FIX-R7 worktree 创建时的分支 HEAD）
- **Implementation SHA**：`2e5df25`
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r7`
- **Worktree**：`d:/360Downloads/Trae 项目/picture-edit/.worktrees/cloudbase-nosql-implement-01-fix-r6`（复用 R6 worktree，分支已切到 R7）
- **GPT FIX-R6 裁决**：FIX_REQUIRED（changes_requested）— 见下方 FIX-R6 历史段落
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R7-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R7-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r7-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r7-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **readyForPreview**：`false`（必须继续保持，禁止配置 Preview / Production / 合并 main）
- **Codex**：`REQUIRED_AFTER_GPT_REVIEW_PASS`（GPT 通过 R7 后必须进行一次 Codex READ_ONLY 限域审计）

### GPT FIX-R6 裁决摘要（FIX_REQUIRED → changes_requested）

GPT 审查 FIX-R6 远端代码后给出 `FIX_REQUIRED`，核心结论：

| AC | Status | 说明 |
|----|--------|------|
| AC-R6-01 | PASS | Ledger 不再在 Storage cleanup 前删除 |
| AC-R6-02 | PASS | 部分失败时失败 keys 保留 |
| AC-R6-03 | PASS_CODE/TEST_GAP | 生产代码正确，但测试走 `deleteCascade()` 非服务层 |
| AC-R6-04 | **FAIL** | 名为 AC-R6-04 的测试实际只覆盖 partial-failure retry，没有模拟 crash window |
| AC-R6-05/06 | PASS | Smoke Harness 真实可执行 |
| AC-R6-07 | PASS | SHA 链正确 |
| AC-R6-08 | PASS | 部署声明已修正 |
| AC-R6-09 | PASS_WITH_LIMITATION | 门禁全过 ≠ AC-R6-04 被覆盖（测试设计缺口） |
| AC-R6-10 | PASS | readyForPreview=false 不变 |

**关键缺陷**：FIX-R6 证据不准确声称 5 个测试全部走服务层，实际只有 3 个真实服务路径 + 2 个 adapter-level crash fixture，0 个真实服务路径 crash-window 测试。

### FIX-R7 实施核心结论（3 Required Fixes）

1. **RF-R7-01 — 新增真实服务路径 crash-window 测试（AC-R6-04 官方闭合）**：
   - 1 个新测试通过真实 `ProjectService.deleteProject()` 路径
   - 一次性故障注入 `removeCleanupKeys()`：第一次调用在 Storage 对象删除后失败
   - 验证 crash-window 状态：对象已删除，ledger 仍包含两个 keys
   - 第二次 `service.deleteProject()` 调用：`OBJECT_NOT_FOUND` 被服务层识别为幂等成功
   - ledger 最终被清空并删除
   - **此测试正式闭合 AC-R6-04**

2. **RF-R7-02 — 修正测试和证据陈述**：
   - 测试文件顶部注释：准确分类 4 个 REAL SERVICE-PATH vs 2 个 ADAPTER-LEVEL crash fixture
   - ADAPTER-LEVEL fixture 前言注释添加到 AC-R6-03 和 AC-R6-01 regression 测试
   - Trae Report、gate evidence、STATE.json、SESSION-HANDOFF、完成包同步修正
   - 不再声称"5 个测试全部走服务层"

3. **RF-R7-03 — 重新运行门禁**：
   - 9/9 PASS（610 root tests：194 client + 416 server，+1 vs R6）
   - `readyForPreview=false` 保持不变
   - 不合并 main、不使用真实 CloudBase 凭据、不进行真实数据写入
   - **无生产代码变更**（仅测试 + 证据修正）

### 测试分类修正（RF-R7-02）

| 类型 | 数量 | 测试 |
|------|------|------|
| REAL SERVICE-PATH（通过 `ProjectService.deleteProject()`） | 4 | AC-R6-01 full success、AC-R6-02 partial failure、AC-R6-04 partial-failure retry、**AC-R6-04 crash-window (FIX-R7 NEW)** |
| ADAPTER-LEVEL crash fixture（直接 `deleteCascade()` + 手动 ledger 操作） | 2 | AC-R6-03 crash window、AC-R6-01 regression mid-crash |

### 9 门禁结果（FIX-R7）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | built successfully (1859 modules) |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 416 tests / 34 files |
| 6 | Root tests | PASS | 610 combined (194 client + 416 server, +1 vs R6) |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |
| 9 | Smoke Harness | PASS | exit 0; 9 self-tests pass |

### 文件变更（1 modified + 2 new + 2 state files modified）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloudbase.nosql.cascade-boundary.test.ts` | 修改 | +1 NEW AC-R6-04 crash-window test；header 注释重写分类测试；adapter-level fixture 前言添加 |
| `LUMEN-...-FIX-R7-TRAE-REPORT.md` | 新增 | FIX-R7 Trae Report（含测试分类表） |
| `fix-r7-gate-results.md` | 新增 | FIX-R7 门禁证据（含修正后 AC 覆盖） |
| `STATE.json` | 修改 | fixR6 status → changes_requested；AC-R6-04 claim 修正；fixR7 字段添加 |
| `SESSION-HANDOFF.md` | 修改 | FIX-R7 段落添加 |

**无生产代码变更。**

### AC 覆盖矩阵（AC-R6-01 ~ AC-R6-10，修正后）

| AC | Status | 证据 |
|----|--------|------|
| AC-R6-01 | PASS | Ledger 在 Storage cleanup 全部完成前不被删除（1 service-path + 1 adapter-level regression） |
| AC-R6-02 | PASS | 失败 keys 持久化并可通过 removeCleanupKeys 重放（1 service-path） |
| AC-R6-03 | PASS_WITH_LIMITATION | OBJECT_NOT_FOUND 幂等成功（adapter-level fixture，非 service-path；生产代码正确；AC-R6-04 FIX-R7 间接覆盖） |
| AC-R6-04 | **PASS (FIX-R7)** | **NEW 真实服务路径 crash-window 测试**：removeCleanupKeys 故障注入 → 第二次 service.deleteProject() 幂等成功清空 ledger |
| AC-R6-05 | PASS | Smoke Harness 导入生产 selector 函数 |
| AC-R6-06 | PASS | Smoke Harness 非法 Preview 配置 exit 1（已验证） |
| AC-R6-07 | PASS | SHA 链：`98764ad → ff6d33d → 5d28b32 → <R7-impl>`；ancestor 已验证 |
| AC-R6-08 | PASS | 部署声明：无手动部署；Vercel auto-build 已确认 |
| AC-R6-09 | PASS | 9 门禁 PASS（610 root tests，+1 vs R6） |
| AC-R6-10 | PASS | `readyForPreview=false` 不变 |

### 遗留风险（Codex 审计范围）

- `removeCleanupKeys()` 注释称"atomically"但实现是普通 read → compute → update/remove，无事务
- 并发 stale write 可能导致：两个 cleanup worker 同时重放同一 ledger；一个 worker 删除 ledger、另一个基于旧快照 update
- 这些风险保留在 Codex READ_ONLY 审计范围内

### Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`
- ❌ 禁止合并到 main
- ❌ 禁止真实 CloudBase 写入
- ❌ 禁止生产代码变更（本轮仅测试 + 证据修正）
- ❌ Trae 不得自行标记任务完成

### GPT 下一步（FIX-R7 证据复审）

1. 读取本文件 + Trae 报告 + 门禁证据
2. 审查 `5d28b32` → `<R7-impl>` diff（1 test file + 2 new evidence + 2 state files）
3. 核查 9 门禁真实输出（610 root tests）
4. 核查 RF-R7-01：NEW 真实服务路径 crash-window 测试是否正式闭合 AC-R6-04
5. 核查 RF-R7-02：测试分类修正是否准确（4 service-path + 2 adapter-level）
6. 核查 RF-R7-03：门禁重新运行 + 无生产代码变更
7. 给出验收结论：
   - 通过 → 授权 Codex READ_ONLY 限域审计
   - 驳回 → 生成 FIX-R8 修复包

### Codex 审计范围（GPT 通过后必须执行）

Codex READ_ONLY 限域审计，只检查：
1. cleanup ledger 的 crash-window 与 partial-failure 语义
2. cleanup worker 并发和 read-modify-write 语义（removeCleanupKeys 非真正原子）
3. 两阶段 tombstone 与 child create 的并发不变量
4. Preview Smoke Harness 是否真正复用生产逻辑
5. 不重新审计已闭合的其他 workstreams

---

## 历史状态（2026-07-22，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R6 实施完成，GPT FIX_REQUIRED → changes_requested）

> **注意**：FIX-R6 已被 GPT 驳回（FIX_REQUIRED），触发 FIX-R7。以下为 R6 历史记录，保留供追溯。

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-CLEANUP-LEDGER-CLOSURE`（子任务，GPT FIX-R5 FIX_REQUIRED 后 Trae 实施）
- **状态**：`changes_requested / nextActor=trae`（GPT 驳回后触发 FIX-R7）
- **Risk Level**：HIGH
- **Route**：R3（GPT FIX_REQUIRED → Trae FIX-R6 → GPT 证据复审 → ~~Codex~~ → FIX-R7）
- **Base SHA**：`98764ad`（FIX-R5 docs backfill，FIX-R6 worktree 创建时的分支 HEAD）
- **Implementation SHA**：`ff6d33d`（full: `ff6d33d7f171e87a210d609f8e4a63c2e38f367b`）
- **Evidence Closure SHA**：`5d28b32`（FIX-R6 docs commit — R7 的 base）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r6`
- **Worktree**：`d:/360Downloads/Trae 项目/picture-edit/.worktrees/cloudbase-nosql-implement-01-fix-r6`
- **GPT FIX-R5 裁决**：[docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-GPT-REVIEW.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-GPT-REVIEW.md)
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r6-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r6-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **readyForPreview**：`false`（必须继续保持，禁止配置 Preview / Production / 合并 main）
- **Codex**：`REQUIRED_AFTER_FIX_R7_GPT_REVIEW_PASS`（GPT 通过 R7 后必须进行一次 Codex READ_ONLY 限域审计）

### GPT FIX-R5 裁决摘要（FIX_REQUIRED → changes_requested）

GPT 审查 FIX-R5 远端代码后给出 `FIX_REQUIRED`，识别 4 项缺陷：

| 缺陷 | 严重度 | AC | 描述 |
|------|--------|----|------|
| P1-01 | P1 | AC-R6-01/02/03/04 | Cleanup ledger 在 Storage cleanup 前被删除；crash recovery 不成立 |
| P2-01 | P2 | AC-R6-05/06 | AC-29 仍没有真实 Smoke Harness，只有纯函数导出 |
| P2-02 | P2 | AC-R6-07 | AC-37 SHA 陈述失真（声称 HEAD=6b4b379，但 98764ad 已推送） |
| P2-03 | P2 | AC-R6-08 | 部署声明需要校正（不应绝对声称"未部署"） |

### FIX-R6 实施核心结论（4 Required Fixes）

1. **RF-R6-01 — Cleanup Ledger 生命周期（AC-R6-01/02/03）**：
   - 新增 `removeCleanupKeys(id, removedKeys)` 到 NoSQL adapter
   - `ProjectService.deleteProject()` 不再在 Storage cleanup 前删除 ledger
   - 成功删除的 keys 在 Storage cleanup 后通过 `removeCleanupKeys()` 从 ledger 移除
   - 失败的 keys 保留在 ledger 中供 sweeper 恢复
   - `OBJECT_NOT_FOUND` 视为幂等成功（crash window 安全）
   - ledger 为空时才删除 ledger 文档

2. **RF-R6-02 — 真实服务路径 Crash/Retry 测试（AC-R6-04）**：
   - 5 个新测试通过真实 `ProjectService.deleteProject()` 路径（不绕过服务层）
   - 覆盖：完全成功、部分失败、crash window 幂等重放、服务重试、mid-crash 回归

3. **RF-R6-03 — Preview Isolation Smoke Harness（AC-R6-05/06）**：
   - 新增 `scripts/verify-preview-isolation.ts` — 可执行 TypeScript 脚本
   - 导入生产 `isPreviewEnvironment` / `validatePreviewIsolation`（非复制逻辑）
   - 9 个合成自测 + 当前环境检查
   - `VERCEL=1` 无 `VERCEL_ENV` → exit 1（fail-closed 验证通过）

4. **RF-R6-04 — 证据修正（AC-R6-07/08）**：
   - SHA 证据明确区分：Implementation SHA (`ff6d33d`) vs Evidence Commit vs Remote HEAD
   - 部署声明修正：无手动部署、无运行时验证；Vercel 自动 Preview 构建状态已确认

### 9 门禁结果（FIX-R6）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | built successfully |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 415 tests / 34 files |
| 6 | Root tests | PASS | 609 combined (194 client + 415 server, +5 vs R5) |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |
| 9 | Smoke Harness | PASS | exit 0; 9 self-tests pass |

### 文件变更（5 files: 3 modified + 2 new）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `ProjectService.ts` | 修改 | `deleteProject()` 重构：removeCleanupKeys + completedKeys 跟踪 + OBJECT_NOT_FOUND 幂等 |
| `cloudbase.nosql.ts` | 修改 | 新增 `removeCleanupKeys()` 到 projects 接口 + 实现 |
| `cloudbase.nosql.cascade-boundary.test.ts` | 修改 | +5 FIX-R6 服务路径测试（AC-R6-01..04） |
| `scripts/verify-preview-isolation.ts` | 新增 | Smoke Harness（9 自测 + 当前环境 gate） |
| `FIX-R5-GPT-REVIEW.md` | 新增 | GPT 裁决文件 |

### AC 覆盖矩阵（AC-R6-01 ~ AC-R6-10 全部 PASS）

| AC | Status | 证据 |
|----|--------|------|
| AC-R6-01 | PASS | Ledger 在 Storage cleanup 全部完成前不被删除 |
| AC-R6-02 | PASS | 失败 keys 持久化并可通过 removeCleanupKeys 重放 |
| AC-R6-03 | PASS | OBJECT_NOT_FOUND 视为幂等成功；crash window 安全 |
| AC-R6-04 | PASS | 5 个真实服务路径测试（ProjectService.deleteProject） |
| AC-R6-05 | PASS | Smoke Harness 导入生产 selector 函数 |
| AC-R6-06 | PASS | Smoke Harness 非法 Preview 配置 exit 1（已验证） |
| AC-R6-07 | PASS | SHA 证据区分 impl/evidence/remote HEAD；ancestor 已验证 |
| AC-R6-08 | PASS | 部署声明：无手动部署；Vercel auto-build 已确认 |
| AC-R6-09 | PASS | 9 门禁 PASS（609 root tests） |
| AC-R6-10 | PASS | `readyForPreview=false` 不变 |

### Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`
- ❌ 禁止合并到 main
- ❌ 禁止真实 CloudBase 写入
- ❌ Cleanup ledger 在失败路径不得丢失
- ❌ Smoke Harness 未实际执行时不得标记 AC-29 PASS
- ❌ Trae 不得自行标记任务完成

### GPT 下一步（FIX-R6 证据复审）

1. 读取本文件 + Trae 报告 + 门禁证据 + GPT FIX-R5 裁决
2. 审查 `98764ad` → `ff6d33d` diff（5 files）
3. 核查 9 门禁真实输出（609 root tests）
4. 核查 RF-R6-01：cleanup ledger 生命周期（removeCleanupKeys）
5. 核查 RF-R6-02：真实服务路径测试（5 tests via ProjectService.deleteProject）
6. 核查 RF-R6-03：Smoke Harness 实际执行 + fail-closed 验证
7. 核查 RF-R6-04：SHA 区分 + 部署声明修正
8. 给出验收结论：
   - 通过 → 授权 Codex READ_ONLY 限域审计
   - 驳回 → 生成 FIX-R7 修复包

### Codex 审计范围（GPT 通过后必须执行）

Codex READ_ONLY 限域审计，只检查：
1. cleanup ledger 的 crash-window 与 partial-failure 语义
2. 两阶段 tombstone 与 child create 的并发不变量
3. Preview Smoke Harness 是否真正复用生产逻辑
4. 不重新审计已闭合的其他 workstreams

---

## 历史状态（2026-07-22，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R5 实施完成，等待 GPT 增量审查）

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-TWO-PHASE-DELETE-PREVIEW-ENV`（子任务，GPT FIX_REQUIRED 后 Trae 实施）
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **Risk Level**：HIGH
- **Route**：GPT FIX_REQUIRED → Trae FIX-R5 → GPT 增量审查 → (可能) Codex READ_ONLY 限域审计
- **Base SHA**：`342541d`（FIX-R4 state commit，GPT changes_requested 裁决后）
- **Result SHA**：`6b4b379`（full: `6b4b379d8e280edd023c9242ba577073ff96b12b`）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r5`
- **Worktree**：`d:/360Downloads/Trae 项目/picture-edit/.worktrees/cloudbase-nosql-implement-01-fix-r4`
- **GPT FIX-R4 裁决**：[docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-GPT-REVIEW.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-GPT-REVIEW.md)
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r5-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r5-gate-results.md)
- **R4 门禁证据（已修正）**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r4-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r4-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **readyForPreview**：`false`（必须继续保持，禁止配置 Preview / Production / 合并 main）
- **Codex**：`DEFERRED_UNTIL_FIX_R5_IMPLEMENTED`（GPT 通过 R5 后可能授权限域 READ_ONLY 审计）

### GPT FIX-R4 裁决摘要（FIX_REQUIRED）

GPT 审查 FIX-R4 完成包后给出 `FIX_REQUIRED`，识别 4 项阻断缺陷：

| 缺陷 | 严重度 | RF | 描述 |
|------|--------|-----|------|
| P1-01 | P1 | RF-R5-01 | Tombstone 在删除事务内写入又删除，并发事务无法观察 |
| P1-02 | P1 | RF-R5-02 | "并发"测试实际没有测试并发，只是等待删除完成 |
| P1-03 | P1 | RF-R5-01 | ProjectService 仍使用 tombstone 之前的 storage 快照 |
| P1-04 | P1 | RF-R5-03 | Preview 判定使用 NODE_ENV 推断，未用 VERCEL_ENV |
| P2 | P2 | RF-R5-04 | 证据文件 Result SHA=TODO，AC-37/38/40 PENDING，10 个 AC 错误标 PASS |

GPT 接受为证据通过的 AC：AC-01～AC-08, AC-11, AC-13, AC-15～AC-21, AC-30～AC-34, AC-36, AC-39

### FIX-R5 实施核心结论（4 Required Fixes）

1. **RF-R5-01 — 可见两阶段删除屏障**：
   - **Phase A**（独立事务 `getDb().runTransaction()` 直接调用）：写入 tombstone `{ _id, status: 'deleting', startedAt }` → **提交** → tombstone 对所有并发事务可见
   - **Phase B**（`withCurrentOrNewTransaction`，复用调用方事务或开启新事务）：读取稳定快照（child IDs + storage keys）→ 设置 `project_cleanup_keys` → 删除所有 children → 删除 project → 删除 tombstone（最后一步）
   - Op 公式变更：N+4（R4 单事务）→ N+3（R5 Phase A 独立事务）
   - `assertProjectWritable` 替换 `assertProjectNotDeleting`：检查 project 存在性（`PROJECT_NOT_FOUND`）+ tombstone（`PROJECT_DELETING`）；所有 child create 路径在 `withCurrentOrNewTransaction` 内原子 check+write
   - ProjectService duck-type `getCleanupKeys`/`deleteCleanupKeys`：CloudBase 路径调用 `deleteCascade` 后读取 cleanup keys（无独立 prefetch），消费 Phase B 稳定快照；PostgreSQL 旧路径保持不变
   - Phase B 失败时 Phase A tombstone 存活（正确行为：child creates 继续被阻止）

2. **RF-R5-02 — 确定性交错测试**：
   - Mock 增强：`occReadTracking` 标志 + `readSet` Map 记录文档读取 + `preCommitHook` 在 commit 检查前注入已提交状态变更 + `commit()` OCC 冲突检测
   - 6 个新测试 T1-T5：
     - T1：child tx 读取 project（无 tombstone），preCommitHook 注入 Phase A tombstone → OCC 冲突 → 重试 → child 看到 tombstone → PROJECT_DELETING
     - T2：Phase A 已提交 → 所有 5 条 child create 路径返回 PROJECT_DELETING
     - T3：完整删除完成 → child create 返回 PROJECT_NOT_FOUND（非 PROJECT_DELETING）→ 无孤儿
     - T4：ProjectService.deleteProject → cleanup keys 匹配原始 storage keys → 成功后删除 cleanup keys doc
     - T4b：tombstone 阻止新 asset → cleanup keys 仅含 tombstone 之前的 keys
     - T5：模拟崩溃（deleteCascade 无 ProjectService）→ cleanup keys 存活 → sweeper 读取并恢复

3. **RF-R5-03 — Vercel 权威环境变量**：
   - `isPreviewEnvironment` 改为使用 `VERCEL_ENV`（preview/production）
   - `VERCEL=1` 但 `VERCEL_ENV` 缺失/未知 → 抛出 `VERCEL_ENV_REQUIRED_OR_INVALID`（fail closed）
   - `NODE_ENV` 不再用于 Preview 判定
   - 8 个 VERCEL_ENV 测试替换 5 个 NODE_ENV 测试 + Test 9b（fail-closed）+ Test 9c（P1-04 场景：VERCEL=1 + VERCEL_ENV=preview + NODE_ENV=production → gate 执行）
   - 2 个 contract 测试修正：添加 `VERCEL_ENV: 'production'`

4. **RF-R5-04 — 证据文件修正**：
   - R4 gate evidence 修正：correction banner + 准确 SHA（Result SHA `00ce304`, State Commit `342541d`）+ 10 个 AC 标记为 FAIL/PENDING
   - R5 gate evidence 创建：完整 8 门禁结果 + 测试计数对比 + AC 覆盖矩阵 + 约束检查清单 + 剩余风险

### 8 门禁结果（FIX-R5）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | 0 errors |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 410 tests / 34 files |
| 6 | Root tests | PASS | 604 combined (194 client + 410 server, +11 vs R4) |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |

### 文件变更（11 files: 9 modified + 2 new + 2 new docs）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloudbase.nosql.ts` | 修改 | RF-R5-01: 两阶段删除、assertProjectWritable、getCleanupKeys/deleteCleanupKeys、child creates 包裹 withCurrentOrNewTransaction |
| `cloudbase.nosql.mock.ts` | 修改 | RF-R5-02: occReadTracking + readSet + preCommitHook + commit() OCC 冲突检测 |
| `select.ts` | 修改 | RF-R5-03: isPreviewEnvironment 使用 VERCEL_ENV + fail-closed |
| `ProjectService.ts` | 修改 | RF-R5-01: deleteProject duck-type getCleanupKeys/deleteCleanupKeys，无独立 prefetch |
| `cloudbase.nosql.cascade-boundary.test.ts` | 修改 | RF-R5-02: +6 T1-T5 交错测试，边界数更新为 N+3 |
| `cloudbase.nosql.contract.test.ts` | 修改 | RF-R5-03: +VERCEL_ENV:production 到 2 个测试 |
| `cloudbase.nosql.r2.behavior.test.ts` | 修改 | RF-R5-01: +projects.create() 到 9 个测试，边界注释 N+3 |
| `cloudbase.nosql.tx-atomicity.test.ts` | 修改 | RF-R5-01: +projects.create() 到 2 个测试 |
| `select.preview-isolation.test.ts` | 修改 | RF-R5-03: 8 个 VERCEL_ENV 测试 + Test 9b/9c |
| `fix-r4-gate-results.md` | 修改 | RF-R5-04: correction banner + 准确 SHA + FAIL/PENDING 标记 |
| `fix-r5-gate-results.md` | 新增 | RF-R5-04: 完整 R5 门禁证据 |
| `FIX-R4-GPT-REVIEW.md` | 新增 | GPT FIX_REQUIRED 裁决文件 |
| `FIX-R5-TRAE-REPORT.md` | 新增 | 综合 Trae 实施报告（13 节） |

### AC 覆盖矩阵（40 项）

| AC 范围 | 描述 | R4 Status | R5 Status | 证据 |
|---------|------|-----------|-----------|------|
| AC-01 ~ AC-08 | Transaction Atomicity | PASS | PASS | tx-atomicity.test.ts (8 tests) |
| AC-09 | Tombstone → PROJECT_DELETING | ❌ FAIL | ✅ PASS | RF-R5-01: two-phase delete |
| AC-10 | Snapshot AFTER tombstone | ❌ FAIL | ✅ PASS | RF-R5-01: Phase B post-tombstone |
| AC-11 | 99/100/101 op boundary | PASS | PASS | N+3 formula |
| AC-12 | Deterministic interleaving | ❌ FAIL | ✅ PASS | RF-R5-02: T1-T5 |
| AC-13 | Delete failure → no partial | PASS | PASS | Phase A tombstone survives |
| AC-14 | Cleanup keys match snapshot | ❌ FAIL | ✅ PASS | RF-R5-01: getCleanupKeys |
| AC-15 ~ AC-21 | Storage Consistency | PASS | PASS | storage-fault.test.ts (10 tests) |
| AC-22 | Gate before SDK import | ❌ FAIL | ✅ PASS | RF-R5-03: VERCEL_ENV |
| AC-23 ~ AC-26 | Preview isolation rules | PASS | PASS | validatePreviewIsolation |
| AC-27 | Gate failure → no SDK import | ❌ FAIL | ✅ PASS | RF-R5-03: correct detection |
| AC-28 | Production not blocked | PASS | PASS | VERCEL_ENV=production |
| AC-29 | Pure functions exported | ❌ FAIL | ✅ PASS | RF-R5-03: exported + tested |
| AC-30 ~ AC-34 | Regression | PASS | PASS | gates + tests |
| AC-35 | Test results recorded | ❌ FAIL | ✅ PASS | R5 evidence + R4 corrected |
| AC-36 | No real credentials | PASS | PASS | Mock-only |
| AC-37 | Local SHA = Remote SHA | ❌ FAIL | ✅ PASS | Local HEAD = Remote HEAD = `6b4b379` |
| AC-38 | Worktree clean | PENDING | ✅ PASS | `git status --short` empty after commit |
| AC-39 | readyForPreview false | PASS | PASS | unchanged |
| AC-40 | Status awaiting_gpt_acceptance | PENDING | ✅ PASS | STATE.json: fixR5Status=awaiting_gpt_acceptance |

### 剩余风险

1. Mock-only 行为证据：两阶段删除 + OCC 交错测试基于 Mock SDK，真实 CloudBase 语义可能不同
2. Tombstone 存活：Phase B 失败时 Phase A tombstone 存活（正确行为，但可能需要运维清理工具）
3. Op 公式 N+3：Phase B = cleanup keys (1) + child removes (N) + project remove (1) + tombstone remove (1)
4. project_cleanup_keys 生命周期：Phase B 创建 → ProjectService 读取 → 成功后删除；崩溃时留存供 sweeper（T5 验证）
5. Duck-typed 方法：getCleanupKeys/deleteCleanupKeys 是 CloudBase 基础设施能力，不在冻结的 PersistenceDependencies 接口上
6. VERCEL_ENV fail-closed：VERCEL=1 无 VERCEL_ENV 时抛出，比 R4 更严格
7. OCC 仅 Mock：真实 CloudBase 使用 DATABASE_TRANSACTION_CONFLICT 重试；T1 验证重试路径但冲突本身是 Mock 模拟

### Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`（不得授权 Preview）
- ❌ 禁止合并到 main
- ❌ 禁止配置 Vercel Preview / Production
- ❌ 禁止使用 Production API Key
- ❌ 禁止运行 Production 数据迁移或写入
- ❌ 禁止升级 `@cloudbase/node-sdk`
- ❌ 禁止用 Mock 行为替代真实 SDK 源码契约
- ❌ 禁止修改公开 persistence interface
- ❌ Trae 不得自行标记任务完成
- ❌ Codex = DEFERRED_UNTIL_FIX_R5_IMPLEMENTED（GPT 通过 R5 后可能授权限域审计）

### 最短收尾顺序（更新）

1. Trae 执行 FIX-R3 ✅
2. GPT 增量审查 R3 ✅ → 裁决 `CODEX_REQUIRED`
3. Trae 落盘 GPT 裁决、状态转为 `changes_requested / nextActor=codex` ✅
4. Codex 限定只读事务审查 ✅ → 输出 7 项 Findings
5. Trae 实施 FIX-R4 ✅ → 9 Workstreams A-I，14 files，8/8 gates PASS (593 tests)
6. GPT 验收 FIX-R4 ✅ → 裁决 `FIX_REQUIRED`（4 项阻断缺陷）
7. Trae 实施 FIX-R5 ✅（本轮，4 RFs，11 files，8/8 gates PASS，604 tests +11）
8. **GPT 增量审查 FIX-R5** ⏳（下一步）
9. (可能) Codex 限域 READ_ONLY 审计（两阶段删除、storage snapshot、Vercel Preview）⏳
10. 配置独立 Preview namespace/prefix，执行真实 CloudBase 冒烟测试 ⏳
11. Preview 通过后解除 `readyForPreview=false` ⏳
12. 合并 main，恢复 Production Cron 与持久化验证 ⏳
13. 关闭 PERSIST-001、PROD-CRON-VERIFY、ROUTING-001，完成项目归档 ⏳

### 范围遵守（本轮 docs + code 落盘）

- ✅ 仅修改 FIX-R5 范围内文件（9 production/test files + 2 new evidence/review + 1 new report + state files）
- ✅ 不修改公开 persistence interface（duck-typed 方法绕过冻结接口）
- ✅ 不创建 PR
- ✅ 不授权 Preview 或 Production
- ✅ 不推进任务到 `completed`
- ✅ 不激活下一任务
- ✅ 不自行降低 GPT 阻断缺陷严重度
- ✅ `readyForPreview` 保持 `false`
- ✅ `@cloudbase/node-sdk` 未升级
- ✅ 无真实凭据/网络/部署/CloudBase 写入

### GPT 下一步（FIX-R5 增量审查）

GPT 在新窗口启动后，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态，然后：

1. 读取本文件 + `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-TRAE-REPORT.md` + `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r5-gate-results.md` + `docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-GPT-REVIEW.md`
2. 审查 `342541d` → R5 HEAD diff（11 files）
3. 核查 8 门禁真实输出（client 194 + server 410 = 604 root tests passed，+11 vs R4）
4. 核查 RF-R5-01：两阶段删除（Phase A 独立提交 tx → Phase B 稳定快照）
5. 核查 RF-R5-02：T1-T5 确定性交错测试（OCC + preCommitHook）
6. 核查 RF-R5-03：VERCEL_ENV 判定 + fail-closed
7. 核查 RF-R5-04：R4 证据修正 + R5 证据完整
8. 核查 AC-09, 10, 12, 14, 22, 27, 29 现在为 PASS（R4 FAILs）
9. 核查约束遵守：
   - 公开 persistence interface 未修改
   - `@cloudbase/node-sdk` 未升级
   - 无真实凭据/网络/部署/CloudBase 写入
   - `readyForPreview` 保持 false
   - 未合并 main
10. 给出验收结论：
    - 通过 → 状态推进为 `gpt_evidence_review_pass`，授权配置 Preview namespace/prefix 或限域 Codex READ_ONLY 审计
    - 驳回 → 生成 FIX-R6 修复包，状态改为 `changes_requested / nextActor=trae`

### Codex 审计范围（如果 R5 通过）

GPT 裁决原文："FIX-R5 完成并通过 GPT 增量审查后，建议再进行一次严格限域的 Codex READ_ONLY audit，只检查：

1. 两阶段删除屏障与 child create 冲突语义
2. storage cleanup snapshot 一致性
3. Vercel Preview 判定和 fail-closed 路径

不需要重新审计已经基本闭合的 Workstream A-D 和 G。"

---

## 历史状态（2026-07-22，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4 实施完成，等待 GPT 验收 → GPT 裁决 FIX_REQUIRED）

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-TX-AWARE-ATOMICITY`（子任务，Codex 审计后 Trae 实施）
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **Risk Level**：CRITICAL
- **Route**：R3（Codex 已完成 READ_ONLY 审计 → Trae 实施 FIX-R4 → GPT 验收）
- **Base SHA**：`a858d7f`（FIX-R3 state commit）
- **Result SHA**：`00ce304`（full: `00ce3043f3d5be4d676f0417e2bb5aaa56a1f0e9`）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r4`
- **Worktree**：`d:/360Downloads/Trae 项目/picture-edit/.worktrees/cloudbase-nosql-implement-01-fix-r4`
- **Codex 审计**：[docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-CODEX-AUDIT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-CODEX-AUDIT.md)
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r4-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r4-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **readyForPreview**：`false`（必须继续保持，禁止配置 Preview / Production / 合并 main）

### Codex 审计 Findings（权威缺陷清单）

| ID | 严重度 | 标题 | FIX-R4 Workstream |
|----|--------|------|-------------------|
| CB-AUDIT-P0-01 | P0 | Job 条件更新逃逸外层 UnitOfWork | B |
| CB-AUDIT-P0-02 | P0 | Version/idempotency 开启独立嵌套事务 | C + D |
| CB-AUDIT-P1-01 | P1 | Cascade delete 使用事务外快照 | E |
| CB-AUDIT-P1-02 | P1 | Object/metadata 映射不是失败原子的 | G |
| CB-AUDIT-P1-03 | P1 | 普通 Preview 应用启动路径没有生产隔离硬门禁 | H |
| CB-AUDIT-P2-01 | P2 | SDK contract 测试名称与证明范围过强 | I |
| CB-AUDIT-P2-02 | P2 | jobs.create(...idempotencyKey) 不是原子入口 | D |

### FIX-R4 实施核心结论（9 Workstreams A-I）

1. **Workstream A — 统一事务复用**：新增私有 `withCurrentOrNewTransaction<T>(fn)` helper，复用 `transactionStorage.getStore()` 中的当前 tx，否则开启一个 `getDb().runTransaction()` 并通过 `transactionStorage.run()` 传播。所有嵌套 repository 调用不再创建独立事务。**未修改公开 persistence interface**（Codex 确认可行）。
2. **Workstream B — 修复 Job 条件更新**：`updateIfClaimed` / `updateIfActive` / `claim` / `heartbeat` 在事务内路径使用 `tx.doc(id).get` 校验 lease/status + `tx.doc(id).update` 写入；事务外路径保持原子条件更新（非 read-then-write 竞态）。禁止 `getDb().collection().where().update()` 逃逸外层事务。
3. **Workstream C — 修复 Version 和 idempotency**：`versions.createIdempotent` 和 `jobs.createIdempotent` 使用 `withCurrentOrNewTransaction`，确保 Version/idempotency mapping/Asset/Project activeVersion/Job 最终状态在同一提交边界。外层 commit failure 时无部分提交；conflict retry 时无重复 Version/Job；相同 idempotency key 并发只产生一组结果。`${projectId}__${key}` 编码保持无歧义。
4. **Workstream D — 修复 jobs.create(...idempotencyKey)**：`jobs.create(idempotencyKey)` 委托 `createIdempotent()`，不再保留两次非事务写入路径。
5. **Workstream E — Project deleting/tombstone 屏障**：新增 `project_tombstones` 集合 + `assertProjectNotDeleting()` helper，在所有 Asset/Version/Job/其他 child create 路径写入前检查。`deleteCascade` 先以原子方式标记 tombstone，再取得稳定子记录集合；tombstone 后出现的 child create 必须 fail closed。删除失败时 Project 状态可恢复（tombstone 在事务内回滚）。`project_cleanup_keys` 文档在删除事务内存储 storageKeys，确保 Storage cleanup 集合与稳定删除快照一致。
6. **Workstream F — 100-operation 边界**：统一计算 `project document + all child document operations`。99 PASS / 100 PASS / 101 在任何删除副作用前 fail closed。
7. **Workstream G — Storage / metadata 一致性**：
   - **Upload**：upload 成功 + metadata 失败 → 保留真实 fileID → 尝试补偿删除 → 补偿成功抛出原 metadata 错误 + 记录已清理；补偿失败抛出包含 fileID 和双重失败上下文的错误。不静默留下对象孤儿。
   - **Delete**：逐项检查 SDK `fileList[]` 状态码；只有远端删除成功或明确不存在时才删除 metadata；单项失败保留 metadata 并向调用方返回失败。
   - **Signed URL**：逐项检查 SDK 状态码；单文件失败抛出明确错误；不持久化 signed URL。
   - **Exists**：三态区分（metadata+object / metadata only / object only）；远端对象不存在返回 false；不仅凭 metadata 返回 true；对孤立对象记录明确诊断。
8. **Workstream H — 普通 Preview 服务生产隔离**：`validatePreviewIsolation()` + `isPreviewEnvironment()` 纯函数放入 `select.ts`，在 `selectPersistenceByEnv` 的 SDK 动态 import **之前**执行。Preview 环境必须提供 `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` 和 Preview namespace；缺失时 fail closed（`PRODUCTION_NAMESPACE_REQUIRED`）；trim+toLowerCase 后相等时 fail closed；保留 `prod` 子串检查作为第二层保护；Storage prefix 同样执行 Production equality + `prod` 子串检查。Smoke Harness 和普通应用路径共享相同的安全判断逻辑。
9. **Workstream I — 修正测试声明**：SDK contract 测试 describe 重命名为 "FIX-R4 API surface smoke"，所有测试名称加 "(API surface only)" 后缀；新增 8 个基于已安装 SDK 源码的 transactionId 行为测试（源码检查，无凭据无网络）。真实 CloudBase 服务端行为继续标为 `UNVERIFIED_PENDING_PREVIEW`。

### 8 门禁结果（FIX-R4）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | 0 errors |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 399 tests / 34 files |
| 6 | Root tests | PASS | 593 combined (194 client + 399 server, +68 vs R3) |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |

### 文件变更（14 files, +3394/-198）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloudbase.nosql.ts` | 修改 (+~340 行) | withCurrentOrNewTransaction、tx-aware Job 条件更新、createIdempotent 复用 tx、jobs.create 委托、project_tombstones + assertProjectNotDeleting、project_cleanup_keys、ObjectStore 故障补偿 + 逐项状态码 + 三态 exists |
| `cloudbase.nosql.mock.ts` | 修改 (+~270 行) | runTransactionCount、commitShouldFail、retryOnConflict、uploadShouldFail、saveMetadataShouldFail、deleteMetadataShouldFail、deleteFileStatuses、getTempFileURLStatuses、remoteObjectMissing、project_tombstones + project_cleanup_keys 集合 |
| `select.ts` | 修改 (+~110 行) | validatePreviewIsolation + isPreviewEnvironment 纯函数导出，gate 在 SDK 动态 import 前执行 |
| `ProjectService.ts` | 修改 | deleteProject 将 assets.listByProject 移入 unitOfWork.run，使用 project_cleanup_keys 进行事务后 Storage cleanup |
| `cloudbase.nosql.tx-atomicity.test.ts` | 新增 (269 行, 8 tests) | AC-01~AC-08 P0 事务原子性 |
| `cloudbase.nosql.cascade-boundary.test.ts` | 新增 (325 行, 13 tests) | AC-09~AC-14 tombstone + 100-op 边界 + cleanup keys |
| `cloudbase.nosql.storage-fault.test.ts` | 新增 (272 行, 10 tests) | AC-15~AC-21 Storage fault-injection 矩阵 |
| `select.preview-isolation.test.ts` | 新增 (381 行, 29 tests) | AC-22~AC-29 Preview 隔离 gate |
| `cloudbase.nosql.sdk-contract.test.ts` | 修改 (+130 行) | 重命名为 API surface smoke + 8 源码检查测试 |
| `cloudbase.nosql.contract.test.ts` | 修改 | 2 个 selector 测试更新以适应 Preview 隔离 gate |
| `cloudbase.nosql.r2.behavior.test.ts` | 修改 | 100-op 边界测试计数更新（96 children + 4 overhead = 100） |
| `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-CODEX-AUDIT.md` | 新增 | Codex 审计 findings 权威参考 |
| `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-TRAE-REPORT.md` | 新增 | 综合 Trae 实施报告（12 节） |
| `fix-r4-gate-results.md` | 新增 | 8 门禁证据（含命令和输出） |

### AC 覆盖矩阵（40 项全部 PASS）

| AC 范围 | 描述 | Status | 证据文件 |
|---------|------|--------|---------|
| AC-01 ~ AC-08 | Transaction Atomicity（事务原子性） | PASS | tx-atomicity.test.ts (8 tests) |
| AC-09 ~ AC-14 | Cascade Delete（级联删除） | PASS | cascade-boundary.test.ts (13 tests) |
| AC-15 ~ AC-21 | Storage Consistency（存储一致性） | PASS | storage-fault.test.ts (10 tests) |
| AC-22 ~ AC-29 | Preview Isolation（预览隔离） | PASS | select.preview-isolation.test.ts (29 tests) |
| AC-30 ~ AC-31 | TypeScript typecheck（root + server） | PASS | exit 0 |
| AC-32 | check-lumen-collab | PASS | exit 0, no secrets |
| AC-33 | 现有相关测试全部通过 | PASS | select.test 9 + contract tests + r2.behavior tests |
| AC-34 | 新增 P0/P1 回归测试全部通过 | PASS | 60 new tests across 4 new test files |
| AC-35 | 测试结果记录完整 | PASS | fix-r4-gate-results.md (command + exit code + passed/failed/skipped) |
| AC-36 | 无真实凭据/网络/部署/CloudBase 写入 | PASS | declared |
| AC-37 | Local Result SHA = Remote branch SHA | PASS | 00ce3043f3d5be4d676f0417e2bb5aaa56a1f0e9 |
| AC-38 | 隔离 worktree 无未提交文件 | PASS | git status --porcelain=v1 --untracked-files=all empty |
| AC-39 | readyForPreview 仍为 false | PASS | unchanged |
| AC-40 | 状态 awaiting_gpt_acceptance / nextActor=gpt | PASS | not self-marked complete |

### 剩余风险（GPT 审查时应注意）

1. Mock-only 行为证据：tx retry/100-op/Storage fault 均基于 Mock SDK，真实 CloudBase 语义可能略有差异（但 errs fail-closed）。
2. AC-07 并发幂等测试依赖 Mock commit-time E11000；真实 CloudBase 语义可能略有差异。
3. 100-op 上限是 pre-check + Mock commit-check，errs fail-closed 但可能比真实 CloudBase 更严格。
4. `validatePreviewIsolation` 是纯函数；gate 通过 `select.ts` 路径执行，未通过真实 Vercel Preview 部署验证。
5. 真实 CloudBase transactionId 行为通过 SDK 源码检查验证，未通过运行时调用验证（无凭据）。

### Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`（不得授权 Preview）
- ❌ 禁止合并到 main
- ❌ 禁止配置 Vercel Preview / Production
- ❌ 禁止使用 Production API Key
- ❌ 禁止运行 Production 数据迁移或写入
- ❌ 禁止升级 `@cloudbase/node-sdk`
- ❌ 禁止用 Mock 行为替代真实 SDK 源码契约
- ❌ 禁止修改公开 persistence interface（Codex 已确认无需修改）
- ❌ Trae 不得自行标记任务完成

### 最短收尾顺序（更新）

1. Trae 执行 FIX-R3 ✅
2. GPT 增量审查 R3 ✅ → 裁决 `CODEX_REQUIRED`
3. Trae 落盘 GPT 裁决、状态转为 `changes_requested / nextActor=codex` ✅
4. Codex 限定只读事务审查 ✅ → 输出 7 项 Findings（2 P0 + 3 P1 + 2 P2）
5. Trae 实施 FIX-R4 ✅（本轮，9 Workstreams A-I，14 files +3394/-198，8/8 gates PASS）
6. **GPT 验收 FIX-R4** ⏳（下一步）
7. 配置独立 Preview namespace/prefix，执行真实 CloudBase 冒烟测试 ⏳
8. Preview 通过后解除 `readyForPreview=false` ⏳
9. 合并 main，恢复 Production Cron 与持久化验证 ⏳
10. 关闭 PERSIST-001、PROD-CRON-VERIFY、ROUTING-001，完成项目归档 ⏳

### 范围遵守（本轮 state-only 落盘）

- ✅ 仅落盘 STATE.json + SESSION-HANDOFF.md + 完成包
- ✅ 不修改任何生产代码（生产代码已在 00ce304 提交）
- ✅ 不创建 PR
- ✅ 不授权 Preview 或 Production
- ✅ 不推进任务到 `completed`
- ✅ 不激活下一任务
- ✅ 不自行降低 Codex P0/P1 严重度
- ✅ `readyForPreview` 保持 `false`

### GPT 下一步（FIX-R4 验收）

GPT 在新窗口启动后，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态，然后：

1. 读取本文件 + `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-TRAE-REPORT.md` + `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r4-gate-results.md`
2. 审查 `a858d7f` → `00ce304` diff（14 files, +3394/-198）
3. 核查 8 门禁真实输出（client 194 + server 399 = 593 root tests passed，+68 vs R3）
4. 核查 Codex Findings → 修改文件 → 测试用例映射表（见 Trae 报告 §10）
5. 核查 AC-01 ~ AC-40 全部 PASS（40 项）
6. 核查范围遵守：
   - 公开 persistence interface 未修改（Codex 确认）
   - `@cloudbase/node-sdk` 未升级
   - 无真实凭据/网络/部署/CloudBase 写入
   - `readyForPreview` 保持 false
   - 未合并 main
7. 核查 Workstream A-I 实现质量（tx helper、Job 条件更新、Version/idempotency、jobs.create、tombstone 屏障、100-op 边界、Storage 故障补偿、Preview 隔离、测试声明修正）
8. 给出验收结论：
   - 通过 → 状态推进为 `gpt_evidence_review_pass`，授权配置 Preview namespace/prefix
   - 驳回 → 生成 FIX-R5 修复包，状态改为 `changes_requested / nextActor=trae`

### Codex 升级条件（来自任务卡）

实施过程中遇到以下任意情况，立即停止扩大修改并报告：

1. 必须修改公开 persistence interface → **未触发**（Codex 确认可行）
2. 真实 SDK 对 transaction document update 的行为无法通过本地源码确认 → **未触发**（8 个源码检查测试通过）
3. 删除 tombstone 需要数据迁移或破坏兼容性 → **未触发**（使用 `project_tombstones` 独立集合，无数据迁移）
4. Storage 补偿需要新的外部服务 → **未触发**（使用现有 `deleteFile` API）
5. 无法在不联网情况下建立关键测试 → **未触发**（Mock SDK + SDK 源码检查）
6. 修复涉及超过两个额外核心模块 → **未触发**（仅 cloudbase.nosql.ts + select.ts + ProjectService.ts）
7. 外层 transaction retry 语义与当前 service architecture 根本冲突 → **未触发**（Mock retryOnConflict 测试通过）
8. Trae 连续两轮无法通过同一项 P0 测试 → **未触发**（首轮全部通过）

无 Codex 升级条件触发。

---

## 历史状态（2026-07-22 早些时候，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 GPT 裁决 CODEX_REQUIRED，等待 Codex 只读审查）

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`（主任务），子任务 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT` 已被驳回
- **状态**：`changes_requested / nextActor=codex`
- **Risk Level**：HIGH
- **Route**：R3 GPT 裁决 `CODEX_REQUIRED` → Codex 限定只读事务审查 → Trae 实施 FIX-R4
- **Base SHA**：`87d0ba5`（FIX-R2 state update commit）
- **Result SHA**：`627bd7e`（feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract）
- **State Commit SHA**：`a858d7f`（FIX-R3 state update with result SHA 627bd7e）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r3`
- **GPT 评审**：[docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md)
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **Codex 状态**：`REQUIRED_NOW_FOR_TX_AUDIT_R3`（GPT 已驳回 R3，Codex 限定只读审查必须先于 FIX-R4 实施）
- **readyForPreview**：`false`（必须继续保持，禁止配置 Preview / Production / 合并 main）

### GPT R3 裁决摘要

**Verdict: CODEX_REQUIRED**

- AC-01、AC-02、AC-03、AC-05～AC-12 局部实现和测试证据基本成立
- **AC-04 仅"语法通过"，集成语义失败**（阻断项）

#### P0 阻断缺陷

1. **P0-01：条件 Job 更新逃逸外层事务**
   - `updateIfClaimed()` / `updateIfActive()` 通过 `getDb().collection().where().update()` 绕过 AsyncLocalStorage 事务
   - 在 `UnitOfWork.run()` 内调用时写入立即落到事务外
   - 可能导致 Job `succeeded` + 外层事务 commit 失败 → Asset/Project 指针回滚 → Job 指向不存在结果

2. **P0-02：`versions.createIdempotent()` 创建独立嵌套事务**
   - 仓储方法无条件调用 `getDb().runTransaction()` 而非复用当前事务
   - Version/idempotency 可能在内层事务先行提交
   - 外层事务失败后留下 Version/idempotency/Job/Asset/Project 不一致的部分提交
   - 否定"ONE UnitOfWork"核心业务不变量

#### P1 缺陷

3. **P1-01：项目删除双重预取竞态**
   - `ProjectService` 预取 + `deleteCascade` 事务外重新预取，两个快照之间可能产生新 Asset/Version
   - "new doc orphan is harmless" 注释不成立

#### P2 缺陷（非阻断）

4. **P2-01：SDK contract 测试证明范围被高估**
   - 测试验证 SDK 方法存在但未真正调用事务或验证 `tx.doc().get()` 返回结构
   - 应降级描述为 "API surface smoke test"

### 缺失的关键测试覆盖

1. 外层 UoW 最终提交失败时，Job 不得已是 `succeeded`
2. `versions.createIdempotent()` 在已有外层事务时不得独立提交
3. Job 条件更新、Version idempotency、Asset 和 Project 指针必须全成或全败
4. 删除与 Generation 结果提交并发时，不得产生 DB 或 Storage orphan
5. 删除预取后新增 Asset 的确定性交错测试

### Codex 只读审查指令（READ_ONLY）

- **Task ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-CODEX-TX-AUDIT-R3`
- **Mode**：`READ_ONLY`
- **Risk Level**：`HIGH`
- **Authoritative Range**：Base `87d0ba5` → Result `627bd7e` → State `a858d7f`
- **Files In Scope**：
  - `src/server/infrastructure/persistence/cloudbase.nosql.ts`
  - `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts`
  - `src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts`
  - `src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts`
  - `src/server/infrastructure/persistence/select.ts`
  - `src/server/services/ProjectService.ts`
  - `src/server/services/GenerationService.ts`
  - `src/server/domain/persistence.ts`
- **Mandatory Questions**：7 项（详见 GPT 评审文件 §7）
- **Required Output**：Verdict / Confirmed P0/P1 / Exact functions+lines / Minimum safe design / Required tests / PersistenceDependencies 能否保持冻结 / 显式声明未修改任何文件
- **Stop Conditions**：不修改代码、不创建 commit/PR、不使用生产凭据、不授权 Preview

### FIX-R4 最低修复范围（Trae 实施，必须在 Codex 审查结论返回后启动）

1. **事务感知的 Job 条件更新路径**：无 tx → `where().update`；有 tx → `tx.doc(id).get` 校验 lease/status + 同 tx `doc(id).update`；禁止 `getDb()` 逃逸
2. **禁止 `versions.createIdempotent()` 在已有 UoW 中打开独立事务**：复用当前 tx 或 current-or-new transaction helper
3. **外层 commit failure 回归测试**：强制 commit 抛错；断言 Job 未成功；Version/Asset/idempotency/Project pointer 均无部分提交
4. **解决删除竞态**：deletion lock/tombstone；Storage key 快照在项目进入稳定 deleting 状态后获取；不接受"孤儿无害"
5. **文档修正**：R3 commit 范围（含报告和状态文件）、SDK contract test 描述降级为 API surface smoke test、`a858d7f` 仅 SHA 回填

### Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`（不得授权 Preview）
- ❌ 禁止合并到 main
- ❌ 禁止配置 Vercel Preview / Production
- ❌ 禁止使用 Production API Key
- ❌ 禁止运行 Production 数据迁移或写入
- ❌ Trae 不得在 Codex 审查结论返回前自行启动 FIX-R4 实施
- ❌ Codex 不得修改代码、创建 commit/PR、使用生产凭据

### 最短收尾顺序（更新）

1. Trae 执行 FIX-R3 ✅
2. GPT 增量审查 R3 ✅ → 裁决 `CODEX_REQUIRED`
3. Trae 落盘 GPT 裁决、状态转为 `changes_requested / nextActor=codex` ✅（本轮）
4. **Codex 限定只读事务审查** ⏳（下一步）
5. Trae 实施 FIX-R4（基于 Codex 输出的最小事务设计） ⏳
6. GPT 验收 FIX-R4 ⏳
7. 配置独立 Preview namespace/prefix，执行真实 CloudBase 冒烟测试 ⏳
8. Preview 通过后解除 `readyForPreview=false` ⏳
9. 合并 main，恢复 Production Cron 与持久化验证 ⏳
10. 关闭 PERSIST-001、PROD-CRON-VERIFY、ROUTING-001，完成项目归档 ⏳

### 范围遵守（本轮 docs-only 落盘）

- ✅ 仅落盘 GPT 评审文件 + 状态文件 + 任务文件 + 完成包
- ✅ 不修改任何生产代码
- ✅ 不创建 PR
- ✅ 不授权 Preview 或 Production
- ✅ 不推进任务到 `completed`
- ✅ 不激活下一任务
- ✅ 不在 Codex 审查结论返回前启动 FIX-R4 实施

---

## 历史状态（2026-07-22 早些时候，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 实施完成，等待 GPT 增量审查）

- 日期：2026-07-22
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT`
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`（已被 GPT 驳回，见上方当前状态）
- **Risk Level**：HIGH
- **Route**：R2（Trae 实施 + GPT 增量审查 + 限定 Codex 只读审查）
- **Base SHA**：`87d0ba5`（FIX-R2 state update commit）
- **Result SHA**：`627bd7e`（feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r3`
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **Codex**：`REQUIRED_AFTER_R3_GPT_PASS`（已被 GPT 驳回，Codex 提前到 FIX-R4 之前）
- **readyForPreview**：`false`（保持，禁止配置 Preview / Production）

### R3 实施核心结论（增量报告，不重审 R1/R2 历史）

GPT FIX-R3 任务卡指出 R2 adapter 与真实 CloudBase 事务 API 存在契约偏差。R3 全部修复 AC-01 ~ AC-12：

1. **AC-01**：新增 `unwrapDocumentData<T>(data)` 统一处理 array / single-doc / null；9 处 `.data[0]`/`.data.length` 引用迁移完成。
2. **AC-02**：Mock `tx.collection().doc().get()` 改为返回 `{ data: doc | null }`（单文档/null，非数组），匹配真实 SDK。
3. **AC-03**：SDK 类型拆分为 `DatabaseCollectionRef`（有 where）/ `TransactionCollectionRef`（无 where）/ `DocumentGetResult` / `TransactionDocumentGetResult`；`collection()` 辅助函数返回联合类型，TS 编译时禁止事务内 `where()`。
4. **AC-04**：4 处非事务 `where()` 调用迁移到 `getDb().collection().where()`；事务体仅使用 `collection(coll).doc(id).*`。（**GPT 驳回：语法通过但集成语义失败**）
5. **AC-05**：`deleteCascade` 重写为预取 doc ID + 100-op 上限检查 + 事务内逐个 `doc(id).remove()`；超限 fail closed（生产 + Mock 双重检查）。
6. **AC-06/07/08**：3 个新测试验证 Storage 边界（DB 失败 0 次 delete、成功每对象 1 次、部分失败 cleanupFailures 保留）。
7. **AC-09**：scenario 10 重写，Prod + Preview 共享同一个 `MockCloudBaseState`，仅靠命名空间前缀隔离 DB + Storage。
8. **AC-10**：2 个新测试验证并发幂等（Mock 级别 commit-time E11000 + 适配器级别 createIdempotent）。
9. **AC-11**：8 门禁全绿，525 root tests（194 client + 331 server，相比 R2 +14：7 SDK 契约 + 7 行为测试）。
10. **AC-12**：`readyForPreview=false` 保持不变。
11. **SDK 契约测试**：新增 `cloudbase.nosql.sdk-contract.test.ts`，7 个测试验证**安装版** `@cloudbase/node-sdk@^3.18.3` API 表面（无凭据、无网络）。（**GPT 备注：应降级描述为 API surface smoke test**）

### 8 门禁结果（保留作为参考）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | 0 errors |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 331 tests / 30 files |
| 6 | Root tests | PASS | 525 combined |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |

### 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloudbase.nosql.ts` | 修改 (+250 lines) | unwrapDocumentData、4 类 SDK 类型拆分、9 处 .data[0] 迁移、4 处非事务 where 修复、deleteCascade 重写 |
| `cloudbase.nosql.mock.ts` | 修改 (+171 lines) | tx doc().get() 返回单文档/null、tx collection 类型限制、commit() 100-op 检查 |
| `cloudbase.nosql.r2.behavior.test.ts` | 修改 (+310 lines) | scenario 10 重写 + AC-05/06/07/08/09/10 测试 |
| `cloudbase.nosql.sdk-contract.test.ts` | 新增 (7 tests) | 验证安装版 @cloudbase/node-sdk API 表面 |

### R3 实施剩余风险（GPT 已确认）

1. Mock-only 行为证据：并发幂等、100-op 上限、Storage 边界均基于 Mock SDK，真实 CloudBase 语义可能略有差异。
2. AC-10 适配器级测试依赖 JS 单线程，Mock 级测试才真正触发 commit-time E11000。
3. 100-op 上限是 pre-check + Mock commit-check，errs fail-closed 但可能比真实 CloudBase 更严格。
4. SDK 契约测试触发 `ws` 可选依赖警告（7/7 通过，无功能影响）。

---

## 历史状态（2026-07-21，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2 实施完成，等待 GPT 审计）

- 日期：2026-07-21
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` FIX-R2
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **Risk Level**：HIGH
- **Base SHA**：`f73c937`（R1 实施提交）
- **Result SHA**：`63bd445`（full: `63bd4456ac6959e47faa667d521ebf6d26ee2399`）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r2`
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md)
- **门禁证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`
- **Codex**：REQUIRED_AFTER_R2（GPT 通过 R2 后执行限定只读审查）
- **readyForPreview**：`false`（保持，禁止配置 Preview / Production）

### R2 实施核心结论

GPT FIX-R1 审查发现 8 项缺陷（P0-01~P0-05, P1-01, P1-02, FIX-08）。R2 全部修复：

1. **NOSQL-R2-01**：`git diff f73c937..63bd445` 包含真实代码修改（7 files, +1840/-309），blob SHA 已变化。
2. **NOSQL-R2-02**：所有查询/更新操作符使用 `db.command`（`_.nin`, `_.in`, `_.lte`, `_.or`, `_.and`, `_.set`, `_.remove`），不再使用 raw Mongo 操作符。
3. **NOSQL-R2-03**：`jobs.createIdempotent()` 使用 `runTransaction` + 确定性 `_id=projectId__key` 保证 Job+幂等记录原子创建；并发测试证明仅产生 1 个 Job。
4. **NOSQL-R2-04**：`objects.put()` 保存 `uploadFile()` 返回的 `fileID` 到 `object_metadata` 集合；`get/getSignedUrl/delete/exists` 通过 `resolveFileId()` 解析。
5. **NOSQL-R2-05**：`projects.deleteCascade()` 只删除数据库实体元数据，不调用 `deleteFile`；`object_metadata` 由 `ProjectService.deleteProject()` 在事务提交后清理。
6. **NOSQL-R2-06**：`CLOUDBASE_DATA_NAMESPACE` 前缀所有集合名；`CLOUDBASE_STORAGE_PREFIX` 前缀所有 cloudPath；缺失时 fail closed。
7. **NOSQL-R2-07**：`PERSISTENCE_BACKEND=local|cloudbase-postgres|cloudbase-nosql` 显式选择后端；不再通过 API Key 存在性隐式决定。
8. **NOSQL-R2-08**：14 个行为测试覆盖 GPT 要求的 10 项测试矩阵（事务提交/回滚、并发幂等、并发 claim、终态更新、JobPatch null、Storage 生命周期、deleteCascade 边界、真实 buildUpdateFromPatch、Preview namespace 隔离）。

### 8 门禁结果

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc | PASS | 0 errors |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 317 tests / 29 files |
| 6 | Root tests | PASS | 511 combined |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |

### 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloudbase.nosql.ts` | 修改（完整重写） | ~948 行，所有 R2 修复 |
| `select.ts` | 修改（完整重写） | 194 行，显式 PERSISTENCE_BACKEND |
| `cloudbase.nosql.mock.ts` | 新增 | ~570 行，内存 mock CloudBase SDK |
| `cloudbase.nosql.r2.behavior.test.ts` | 新增 | ~500 行，14 个行为测试 |
| `cloudbase.nosql.contract.test.ts` | 修改（重写） | 313 行，使用真实生产函数 |
| `select.test.ts` | 修改 | 126 行，更新 PERSISTENCE_BACKEND 测试 |
| `package-lock.json` | 修改 | 项目重命名 gemini-image-editor → lumen-ink |

### Stop Conditions（保持）

- `readyForPreview` 保持 `false`
- 禁止合并到 main
- 禁止配置 Vercel Preview / Production
- 禁止使用 Production API Key
- Codex 审查在 GPT 通过 R2 后执行

### GPT 下一步

1. 读取完成包 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`。
2. 核验 `git diff f73c937..63bd445` 包含真实代码修改（NOSQL-R2-01）。
3. 审查 7 个变更文件对照 NOSQL-R2-02 ~ NOSQL-R2-07。
4. 审查 14 个行为测试对照 NOSQL-R2-08 测试矩阵。
5. 若通过，授权 Codex 限定只读审查（范围：`cloudbase.nosql.ts`, `select.ts`, NoSQL 测试, `ProjectService`/`GenerationService` 调用边界, `f73c937..63bd445` diff）。
6. Codex 不得修改代码，除非 R2 仍有阻塞缺陷且用户另行授权。

---

## 历史状态（2026-07-21，LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 实施完成，等待 GPT 审计）

- 日期：2026-07-21
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **Risk Level**：HIGH
- **Trae 报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-TRAE-REPORT.md)
- **PoC 证据**：[docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/poc-gate-p0.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/poc-gate-p0.md)
- **完成包**：`C:\Users\Catcher\Desktop\协作文件夹\lumen-cloudbase-nosql-completion.md`（63,480 字节，已脱敏）
- **Codex**：REQUIRED_AFTER_IMPLEMENTATION（待 GPT 决定是否先交 Codex 审查）

### 实施核心结论

1. **Gate P0 全部通过**：8 项通过条件满足，8 项 Stop Condition 均未触发。
2. **生产 API Key 已创建**：keyId `RmGPjV2rQDOa2kVQj0M9jQ`，keyName `lumen-prod-nosql`，不过期。
3. **CloudBase 环境已就绪**：7 个生产集合 + 2 个唯一索引 + 4 个普通索引已创建。
4. **NoSQL adapter 已实现**：`src/server/infrastructure/persistence/cloudbase.nosql.ts`（~520 行），完整实现 `PersistenceDependencies`。
5. **接口合同零变化**：领域层、services、routes、客户端 API 均未修改。
6. **8 门禁全绿**：194 client + 291 server = 485 root tests PASS；typecheck + build + check-lumen-collab PASS。
7. **AC-15~AC-17 待 Vercel Preview 验证**：用户需在 Vercel Dashboard 配置 `CLOUDBASE_ENV_ID` 和 `CLOUDBASE_API_KEY` 后触发 Preview 部署。

### GPT FIX-R1 审查结论

GPT 于 2026-07-21 给出 `FIX_REQUIRED` 裁决，发现 8 项缺陷：
- P0-01: FIX-R1 实际没有修改适配器代码（blob SHA 未变化）
- P0-02: 使用 raw Mongo 操作符而非 `db.command`
- P0-03: ObjectStore 丢弃 `uploadFile()` 返回的 `fileID`
- P0-04: Job 并发幂等可产生孤儿 Job
- P0-05: `deleteCascade` 双重删除对象 + 破坏责任边界
- P1-01: Preview/Production 隔离未实现
- P1-02: 显式后端选择未实现
- FIX-08: 证据区间不包含所声称的代码修复

R2 已全部修复，详见上方 R2 章节。

---

## 历史状态（2026-07-21，LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01 调查完成，等待 GPT 审议）

- 日期：2026-07-21
- **新增调查任务**：`LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01`（只读调查，无代码改动）
- **状态**：`READY_FOR_GPT_REVIEW`（不进入正式 GPT 验收流程，仅作调查结论）
- **Risk Level**：MEDIUM
- **调查报告**：[docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01-TRAE-REPORT.md](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01-TRAE-REPORT.md)
- **Codex 必要性**：NOT_REQUIRED

### 调查核心结论

1. **可行**：当前 `PersistenceDependencies` 接口可在 CloudBase 文档数据库上等价实现，未触发任何 Stop Condition。
2. **推荐方案 A**：Vercel 直连 + CloudBase Node SDK + 现有 PG Storage HTTP API（保持 ObjectStore 不变）。
3. **关键前提**：CloudBase 文档数据库的多文档事务能力必须可用（实施前必须 PoC 验证）。
4. **改动范围**：1 adapter 文件 + 1 测试文件 + 1 依赖 + `select.ts`/`index.ts` 微调；领域层无感知。
5. **实施任务卡**：已设计 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`，待用户授权启动。

### AC 覆盖矩阵

| AC | 描述 | 结论 |
|----|------|------|
| AC-01 | PersistenceDependencies 接口方法清单 | 完成（7 接口 / 29 方法 + JobExecutor 2 方法） |
| AC-02 | 每个方法在文档数据库中的实现方式 | 完成（含 ObjectStore 保持原 HTTP fetch） |
| AC-03 | 5 个业务不变量如何保证 | 完成（多文档事务 + 唯一索引 + 条件 update + 补偿删除） |
| AC-04 | 集合/主键/唯一索引/普通索引 | 完成（7 集合 + 2 唯一索引 + 多个普通索引） |
| AC-05 | CloudBase Node SDK 依赖状态 | 完成（**未安装**，需新增 `@cloudbase/node-sdk`） |
| AC-06 | Vercel 直连 vs CloudBase HTTP 云函数对比 | 完成（方案 A 推荐；方案 B 受 CloudBase Workflow 60s 限制 fatal blocker） |
| AC-07 | 推荐方案 + 实施任务卡 | 完成（方案 A + `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 任务卡） |
| AC-08 | 不使用 Vercel 本地文件系统 | 合规（ObjectStore 保持 PG Storage HTTP API） |
| AC-09 | 不创建 PostgreSQL / 不升级套餐 | 合规（仅设计文档数据库集合，未创建云资源） |

### Stop Conditions 评估

| Stop Condition | 触发 | 评估 |
|----|------|------|
| #1：SQL join 或 SQL-specific transaction | ❌ | 接口无 SQL 类型；adapter 内部 SQL 特性均有 NoSQL 等价物 |
| #2：腾讯云主账号永久密钥 | ❌ | 子账号 + 环境变量 |
| #3：破坏现有 API 合同 | ❌ | PersistenceDependencies 接口签名不变 |
| #4：改动跨多个核心领域模块 | ❌ | 仅在 `src/server/infrastructure/persistence/` 内 |
| #5：幂等和恢复租约原子性 | ⚠️ | 需 CloudBase 多文档事务支持；实施前必须 PoC 验证 |

### GPT 下一步建议

1. 审查本调查报告，确认推荐方案 A 是否符合用户裁决。
2. 若 GPT 同意，建议用户启动 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 实施任务。
3. 实施前建议先在 CloudBase 控制台执行 5 分钟 PoC，验证多文档事务能力；若失败则回退到方案 B 或继续推进 Track B 收口。
4. `storage-options.md` 需更新决策记录，新增 D-050「持久化方案从 PostgreSQL 切换到 CloudBase 文档数据库」。
5. 完成包已输出到 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`。

---

## 历史状态（2026-07-21，HARDEN-001B GPT 证据审查通过，等待合并后进入 HARDEN-001C）

- 日期：2026-07-21
- **项目主任务（currentTask）**：`HARDEN-001`，当前批次：`HARDEN-001B`（GPT 审查通过，待合并）
- **状态**：`gpt_evidence_review_pass / nextActor=user_or_trae_for_merge`
- **GPT 裁决**：`EVIDENCE_REVIEW_PASS`（无 S0/S1 风险，无阻塞修复，无 Codex 必要）
- **HARDEN-001A 已合并到 main**：fast-forward `e08eb3e..4e720b6`（mergeCommit `4e720b6`）
- **HARDEN-001B 实施提交**：`4483a7c`（分支 `lumen/harden-001b-trae`，已 push 到 origin）
- 主任务文件：`docs/lumen-v2/tasks/active/HARDEN-001.md`
- **当前批次 GPT 验收**：`docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md`
- **当前批次 Trae 报告**：`docs/lumen-v2/reports/HARDEN-001B-TRAE-REPORT.md`
- **当前批次证据**：`docs/lumen-v2/evidence/HARDEN-001B/gate-results.md`
- **并行任务 1（PROD-CRON-VERIFY）**：`active / awaiting_user_evidence / nextActor=user`（未变化，不阻塞 HARDEN-001C）
- **并行任务 2（PERSIST-001，未归档）**：`gpt_evidence_review_pass / nextActor=gpt`（未变化）
- blockedTasks：`["ROUTING-001"]`（HARDEN-001B 合并后仍禁止启动 ROUTING-001；需 HARDEN-001C 也通过 + PROD-CRON-VERIFY 通过）
- `production_cron_registration`：`PENDING_POST_MERGE`（保持，不得提前改 VERIFIED）
- `production_cron_execution`：`NOT_TESTED`（保持，不得提前改 PASS）
- `mergeCompletedHead`：`4e720b6`（HARDEN-001A 已合并到 main；HARDEN-001B 合并后将更新为新 HEAD）
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage

## HARDEN-001B GPT 证据审查通过交接（2026-07-21，GPT → Trae 合并）

### 审查结论摘要

- **Verdict**：`EVIDENCE_REVIEW_PASS`
- **Codex 必要性**：`NOT_REQUIRED`
- **Next Owner**：Trae（合并并立即进入 HARDEN-001C）
- **Required Fixes**：无合并前代码修复要求
- **Stop Conditions**：未触发

### AC 覆盖矩阵（GPT 确认）

| AC | 描述 | GPT 结论 |
|----|------|---------|
| AC-B01 | DEFAULT_DATA_DIR 不引用 /tmp | PASS |
| AC-B02 | deployed 生命周期不读写 Provider 文件 | PASS（附表述修正） |
| AC-B03 | deployed 模式不创建目录 | PASS |
| AC-B04 | Provider Key 不返回前端 | PASS |
| AC-B05 | Provider 错误日志脱敏 | PASS |
| AC-B06 | env-managed 模式 CRUD 不创建 providers.json | PASS |
| AC-B07 | local delete 清理行为 | PASS |
| AC-B08 | VERCEL=1 误配置不再写入 /tmp | PASS |
| DEBT-HARDEN-001A-04 | dist/ 测试重复计数 | RESOLVED |

### GPT 非阻塞说明（已记录到 STATE.json `harden001bGptReviewNonblockNotes`）

1. **AC-B02 表述修正**：测试证明的是 Provider 生命周期方法不操作 fs，不是整个 Node 进程冷启动完全没有 fs 调用（findProjectRoot 模块初始化仍读 package.json，但不涉及 Provider Key/Provider 文件/tmp）
2. **AC-B05 表述修正**：`[object Object]` 是 `mock.calls[0].join(' ')` 测试转换方式观察到的结果，不应表述为已证明所有运行环境原先都无法显示结构化对象；JSON.stringify 修改仍然安全
3. **vitest.config.ts 后续改进**：可改为 `configDefaults.exclude` 展开默认值以减少版本升级维护风险
4. **HARDEN-001C 应补充**：生产 Provider 路由级测试直接断言全部 HTTP 响应均不含真实 apiKey

### Trae 下一步执行清单（按 GPT 指令）

1. ✅ 写入 `docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md`
2. ✅ 更新 `STATE.json` 推进状态
3. ⏳ 将审查状态更新提交到 `lumen/harden-001b-trae`，不得修改生产代码
4. ⏳ 创建正式 PR（base=main, head=lumen/harden-001b-trae），确认实施提交仍为 `4483a7c`，其后仅允许 GPT review/state 文档提交
5. ⏳ 合并到 `main`（禁止 force-push）
6. ⏳ 从合并后的最新 `main` 创建 `lumen/harden-001c-trae` 分支
7. ⏳ 立即实施 HARDEN-001C，不等待 PROD-CRON-VERIFY

### HARDEN-001C 必须关闭的范围

- DEBT-HARDEN-001A-02：真实生产路由 wiring 回归测试
- DEBT-HARDEN-001A-03：Vercel trust proxy / `req.ip` 假设
- Gate D 剩余公开发布安全项（D-034 public-release hardening 剩余项）
- Production flag 切换和回滚文档

### Stop Conditions（合并与 HARDEN-001C 启动期间）

只有出现以下情况才停止并回报 GPT：

- 合并前 branch head 与已审查提交范围不一致
- 新增生产代码变化
- 门禁重新运行出现失败
- 发现真实 Secret、Provider Key 或用户数据进入日志/响应
- HARDEN-001C 必须修改 PERSIST/Cron 状态机
- 认证 wiring 或 trust proxy 无法通过仓库上下文确定

---

## 历史状态（2026-07-21，HARDEN-001B 实施完成，等待 GPT 证据审查）

### 实施摘要

- **任务 ID**：HARDEN-001B-PROVIDER-KEY-MIGRATION（D-011 Provider Key 迁离 `/tmp`）
- **基线 commit**：`4e720b6`（HARDEN-001A 合并到 main 后的 HEAD）
- **分支**：`lumen/harden-001b-trae`
- **风险等级**：Medium
- **推荐路径**：R3，Codex NOT_REQUIRED
- **实施方式**：TDD red→green 模式（先 red，再 green，最小生产代码改动）

### 关键产出

1. **生产代码修改**：`src/server/services/providers/ProviderStore.ts`
   - 移除 `DEFAULT_DATA_DIR` 中的 `process.env.VERCEL ? '/tmp/lumen-ink-data' : ...` 分支（D-011 违规）
   - 修复 `console.error('...', redacted.log)` 序列化 bug → `JSON.stringify(redacted.log)`（AC-B05）
2. **新增测试文件**：`src/server/services/providers/providerKey.lifecycle.test.ts`（12 测试，覆盖 AC-B01~AC-B08 全部 D-011 不变量）
3. **新增配置文件**：`src/server/vitest.config.ts`（根本解决 DEBT-HARDEN-001A-04，排除 dist/ 重复计数）
4. **TDD red → green 证据**：
   - Red: 3 failed | 9 passed（AC-B01 ×2 + AC-B05 ×1）
   - Green: 12 passed（移除 /tmp 分支 + 修复 redacted log 序列化）
5. **8 门禁全绿**：client 194 + server 269 = 463 root tests passed（dist/ 已通过 vitest.config.ts 排除）
6. **DEBT-HARDEN-001A-04 RESOLVED**：通过 `vitest.config.ts` 根本解决，不再需要手动清理 dist/
7. **范围遵守**：
   - 不修改 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置、ROUTING 代码
   - 不修改认证代码（`middleware/auth.ts`、`routes/auth.ts`、`security/authThrottle.ts`、`config/runtime.ts` 全部未变）
   - 仅 1 个生产文件修改（ProviderStore.ts）+ 1 个新测试文件 + 1 个新配置文件 + 报告/证据/状态文件
   - check-lumen-collab PASS（无真实秘密）

### AC 覆盖矩阵

| AC | 描述 | Status |
|----|------|--------|
| AC-B01 | DEFAULT_DATA_DIR 不引用 /tmp（无论 VERCEL 环境变量如何） | PASS |
| AC-B02 | deployed 模式零 fs 操作（existsSync/mkdirSync/readFileSync/writeFileSync） | PASS |
| AC-B03 | deployed 模式 cold start 不创建任何目录或文件 | PASS |
| AC-B04 | Provider Key 不返回前端（apiKey === ''） | PASS |
| AC-B05 | 错误日志脱敏，不泄露 apiKey（PROVIDER_STORE_LOAD_FAILED 可见） | PASS（修复后） |
| AC-B06 | env-managed 模式 CRUD 不创建 providers.json 文件 | PASS |
| AC-B07 | local 模式 delete 清理行为（移除 + 不存在 id 返回 false） | PASS |
| AC-B08 | VERCEL=1 但 isDeployed=false 时不写入 /tmp | PASS |

### 状态推进

- `status`: `ready_for_trae` → `awaiting_gpt_acceptance`
- `nextActor`: `trae` → `gpt`
- `phase`: `harden-001a-implementation` → `harden-001b-implementation`
- `currentTaskBatch`: `HARDEN-001A` → `HARDEN-001B`
- `latestTraeReport`: `docs/lumen-v2/reports/HARDEN-001B-TRAE-REPORT.md`
- `harden001bDebtResolved`: `["DEBT-HARDEN-001A-04"]`
- `lastUpdatedAt`: 2026-07-21
- `lastUpdatedBy`: trae

### GPT 下一步（证据审查）

GPT 在新窗口启动后，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态，然后：

1. 读取本文件 + `docs/lumen-v2/reports/HARDEN-001B-TRAE-REPORT.md` + `docs/lumen-v2/evidence/HARDEN-001B/gate-results.md`
2. 审查 `4e720b6` → 分支 HEAD diff（仅含 1 生产文件修改 + 1 新测试文件 + 1 新配置文件 + 报告/证据/状态文件）
3. 核查 8 门禁真实输出（client 194 + server 269 = 463 root tests passed）
4. 核查 TDD red → green 证据（3 red → 12 green）
5. 核查范围遵守（grep 验证无 PERSIST/Cron/ROUTING/auth 关键词修改）
6. 核查 D-011 不变量（`/tmp` 引用已移除、env-managed 零 fs 操作、Provider Key 不返回前端、日志脱敏）
7. 核查 DEBT-HARDEN-001A-04 根本解决（vitest.config.ts 排除 dist/）
8. 评估是否需要 Codex 窄范围只读安全审计（任务卡允许但当前 NOT_REQUIRED）
9. 给出验收结论：
   - 通过 → 状态推进为下一批次 `HARDEN-001C ready_for_trae / nextActor=trae`
   - 驳回 → 生成 FIX_PACKET，状态改为 `changes_requested / nextActor=trae`

### Stop Conditions 检查

| 条件 | 是否触发 |
|------|---------|
| 出现真实 Secret 泄露 | ❌ 否（check-lumen-collab PASS） |
| 原有生产测试失败 | ❌ 否（463 root tests passed） |
| 修复需要触及 PERSIST/Cron 状态机 | ❌ 否（仅 ProviderStore.ts 修改） |
| 修复需要触及认证代码 | ❌ 否（auth 相关文件全部未变） |
| D-011 不变量被破坏 | ❌ 否（AC-B01~B08 全部 PASS） |

无 Stop Conditions 触发。

### 未归档说明

HARDEN-001B 是 HARDEN-001 三个批次（A/B/C）中的第二个。即使 GPT 验收通过，HARDEN-001 任务整体不归档，需等 C 也通过后才归档。ROUTING-001 仍保持阻塞。

---

## 历史状态（2026-07-21，HARDEN-001A GPT 证据审查通过，等待合并）

### GPT 裁决摘要

- **任务 ID**：HARDEN-001A-AUTH-BOUNDARY（D-012 P0 认证边界）
- **审查 HEAD**：`5f484d9`（基于 `e08eb3e`）
- **审查方式**：证据审查（基于 Trae 提交的完成摘要和验证证据）
- **结论**：`EVIDENCE_REVIEW_PASS_WITH_DEBT`
- **状态推进**：`awaiting_gpt_acceptance / nextActor=gpt` → `gpt_evidence_review_pass / nextActor=user_or_trae_for_merge`
- **风险等级**：Medium（按快速推进裁决降级，原任务卡为 High）
- **Codex 必要性**：`NOT_REQUIRED`

### 4 项非阻塞 debt（已登记到 `docs/ai/TECH_DEBT.md`）

| Debt ID | 标题 | Severity | Resolve Before |
|---------|------|----------|----------------|
| DEBT-HARDEN-001A-01 | AC-A04 在 P0 单工作区中为 NOT_APPLICABLE | P2 | P1 RBAC 任务启动时 |
| DEBT-HARDEN-001A-02 | 增补真实生产路由 wiring 回归测试 | P2 | HARDEN-001C 完成前 |
| DEBT-HARDEN-001A-03 | 明确 Vercel trust proxy / req.ip 假设 | P2 | HARDEN-001C 完成前或合并到 main 后首次生产部署前 |
| DEBT-HARDEN-001A-04 | 后续清理 dist 测试重复计数 | P2 | HARDEN-001B 启动前或 HARDEN-001C 完成前 |

### 不修改生产认证代码

本轮 GPT 裁决明确要求**不修改生产认证代码**：
- `src/server/middleware/auth.ts`（未变）
- `src/server/routes/auth.ts`（未变）
- `src/server/security/authThrottle.ts`（未变）
- `src/server/config/runtime.ts`（未变）

D-034 内部安全底线已在 PERSIST-001 落地并满足 HARDEN-001A 全部 AC，无需任何生产代码改动。

### 下一步（合并流程）

1. **合并 PR #2**：`lumen/harden-001a-trae` → `main`（用户或 Trae 执行）
2. **合并后立即创建 HARDEN-001B 分支**：`lumen/harden-001b-trae`（基于合并后 main HEAD）
3. **HARDEN-001B 范围**：D-011 Provider Key 迁离 `/tmp`；生命周期、日志脱敏、错误路径和清理行为测试
4. **HARDEN-001B 提交格式**：`feat(lumen-v2): HARDEN-001B provider key migration`
5. **PROD-CRON-VERIFY 保持并行**：不阻塞 HARDEN-001B/C
6. **ROUTING-001 继续保持阻塞**：直到 HARDEN-001 与 PROD-CRON-VERIFY 汇合通过

### 合并后状态推进

合并 PR #2 后：
- HARDEN-001A 标记为已合并（但 HARDEN-001 任务整体不归档）
- `currentTaskBatch`：`HARDEN-001A` → `HARDEN-001B`
- `status`：`gpt_evidence_review_pass` → `ready_for_trae`
- `nextActor`：`user_or_trae_for_merge` → `trae`
- 创建分支 `lumen/harden-001b-trae` 开始 HARDEN-001B 实施

### Stop Conditions 检查

| 条件 | 是否触发 |
|------|---------|
| 出现真实认证绕过 | ❌ 否 |
| 出现 Secret 泄露 | ❌ 否（check-lumen-collab PASS） |
| 原有生产测试失败 | ❌ 否（708 root tests passed） |
| 修复需要触及 PERSIST/Cron 状态机 | ❌ 否（无生产代码改动） |

无 Stop Conditions 触发。

---

## 历史状态（2026-07-21，HARDEN-001A 实施完成，等待 GPT 证据审查）

- 日期：2026-07-21
- **项目主任务（currentTask）**：`HARDEN-001`，当前批次：`HARDEN-001A`
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- 主任务文件：`docs/lumen-v2/tasks/active/HARDEN-001.md`
- **当前批次分支**：`lumen/harden-001a-trae`（基于 main `e08eb3e`）
- **当前批次 Trae 报告**：`docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md`
- **当前批次证据**：`docs/lumen-v2/evidence/HARDEN-001A/gate-results.md`
- **并行任务 1（PROD-CRON-VERIFY）**：`active / awaiting_user_evidence / nextActor=user`（未变化）
- **并行任务 2（PERSIST-001，未归档）**：`gpt_evidence_review_pass / nextActor=gpt`（未变化）
- blockedTasks：`["ROUTING-001"]`（HARDEN-001A 通过后仍禁止启动 ROUTING-001；需 HARDEN-001B/C 也通过）
- `production_cron_registration`：`PENDING_POST_MERGE`（保持，不得提前改 VERIFIED）
- `production_cron_execution`：`NOT_TESTED`（保持，不得提前改 PASS）
- `mergeCompletedHead`：`f0e28dd`（保持，PERSIST-001 已合并到 main）
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage

## HARDEN-001A 完成交接（2026-07-21，Trae → GPT）

### 实施摘要

- **任务 ID**：HARDEN-001A-AUTH-BOUNDARY（D-012 P0 认证边界）
- **基线 commit**：`e08eb3e`（POST-MERGE-PARALLEL-ACTIVATION-01 激活 commit）
- **分支**：`lumen/harden-001a-trae`
- **风险等级**：High
- **推荐路径**：R3，但当前阶段 Codex NOT_REQUIRED
- **实施方式**：TDD specification-test 模式（先 red，再 green，无生产代码改动）

### 关键产出

1. **新增测试文件**：`src/server/security/auth.boundary.test.ts`（547 行，33 测试，覆盖 AC-A02 ~ AC-A13）
2. **认证攻击面矩阵**：见 Trae 报告 §4.1，列出全部受保护路由 × 认证规则 × 授权规则 × 期望行为 × 风险
3. **TDD red → green 证据**：
   - Red: 1 failed | 32 passed (fixture bug — supertest IP 格式问题)
   - Green: 33 passed (修正 fixture 预阻塞所有 3 种 IP 格式)
4. **8 门禁全绿**：client 194 + server 514（含新 33）= 708 root tests passed
5. **范围遵守**：
   - 不修改 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置、ROUTING 代码
   - 不修改生产认证代码（`middleware/auth.ts`、`routes/auth.ts`、`security/authThrottle.ts`、`config/runtime.ts` 全部未变）
   - 仅新增测试文件 + 报告 + 证据 + 状态文件
   - check-lumen-collab PASS（无真实秘密）

### 关键发现

PERSIST-001 已落地的 D-034 内部安全底线已满足 HARDEN-001A 任务卡 AC-A02 ~ AC-A13 全部认证边界要求：

- ✅ `createAuthMiddleware` JWT 验证无 fallback（AC-A02/A03/A05/A07）
- ✅ `createLogin` 密码匹配签 JWT，不匹配返回 null（AC-A05/A06）
- ✅ `createAuthThrottle` HMAC-derived IP key + 固定窗口限流（AC-A08/A09）
- ✅ `loadRuntimeConfig` deployed 模式 fail-fast 拒绝短 secret / 默认密码（AC-A06）
- ✅ `redactString` / `redactValue` / `redactError` 凭据脱敏（AC-A10/A11）
- ✅ 路由挂载集中化在 `src/server/index.ts`（AC-A13）
- ✅ 无硬编码默认密码、无 NODE_ENV bypass、无 jwt.decode 路径、无验证失败 fallback

D-012 P0 单工作区模型无 RBAC，因此 AC-A04（403 路径）以文档化形式覆盖，待 P1 RBAC 落地时再补充测试。

### 状态推进

- `status`: `ready_for_trae` → `awaiting_gpt_acceptance`
- `nextActor`: `trae` → `gpt`
- `latestTraeReport`: `docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md`
- `lastUpdatedAt`: 2026-07-21
- `lastUpdatedBy`: trae

### GPT 下一步（证据审查）

GPT 在新窗口启动后，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态，然后：

1. 读取本文件 + `docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md` + `docs/lumen-v2/evidence/HARDEN-001A/gate-results.md`
2. 审查 `e08eb3e` → 分支 HEAD diff（仅含新增测试文件 + 报告/证据/状态文件）
3. 核查 8 门禁真实输出（client 194 + server 514 = 708 root tests passed）
4. 核查 TDD red → green 证据（fixture bug 修正，无生产代码改动）
5. 核查范围遵守（grep 验证无 PERSIST/Cron/ROUTING 关键词）
6. 核查测试 fixture 秘密安全（全部低于 check-lumen-collab 阈值）
7. 评估是否需要 Codex 窄范围只读安全审计（任务卡允许但当前 NOT_REQUIRED）
8. 给出验收结论：
   - 通过 → 状态推进为下一批次 `HARDEN-001B ready_for_trae / nextActor=trae`
   - 驳回 → 生成 FIX_PACKET，状态改为 `changes_requested / nextActor=trae`

### Codex 升级条件（来自任务卡）

本任务涉及认证、权限、JWT 和限流，满足 Codex 高风险使用条件。以下阶段调用一次窄范围 Codex：

- **时机**：Trae 修复完成、GPT 第一轮证据审查后、合并前
- **模式**：只读安全审计
- **范围**：认证边界、权限区分、fallback、限流绕过、Secret 泄露和测试盲区
- **禁止**：代替 Trae 做常规实现、扩大到 HARDEN-001B/C
- **例外**：若 GPT 审查已经发现明确机械问题，先由 Trae 修复，不浪费 Codex 审计额度

### 未归档说明

HARDEN-001A 是 HARDEN-001 三个批次（A/B/C）中的第一个。即使 GPT 验收通过，HARDEN-001 任务整体不归档，需等 B/C 也通过后才归档。ROUTING-001 仍保持阻塞。

---

## 历史状态（2026-07-21，POST-MERGE-PARALLEL-ACTIVATION-01 激活后保留参考）

- 日期：2026-07-21
- **项目主任务（currentTask）**：`HARDEN-001`（`ready_for_trae / nextActor=trae`）
- 主任务文件：`docs/lumen-v2/tasks/active/HARDEN-001.md`（从 backlog/ 激活）
- **并行任务 1（PROD-CRON-VERIFY）**：`active / awaiting_user_evidence / nextActor=user`
- 并行任务文件：`docs/lumen-v2/tasks/active/PROD-CRON-VERIFY.md`（从 backlog/ 激活）
- **并行任务 2（PERSIST-001，未归档）**：`gpt_evidence_review_pass / nextActor=gpt`
- 未归档原因：等 PROD-CRON-VERIFY 通过后才归档到 `tasks/completed/`
- 激活来源：`POST-MERGE-PARALLEL-ACTIVATION-01` 任务卡（GPT 给出，用户授权 R2 路径）
- 激活 commit 范围：仅任务及状态文件（docs/state-only），不含业务代码
- blockedTasks：`["ROUTING-001"]`（HARDEN-001 已移出；ROUTING-001 仍禁止启动）
- `production_cron_registration`：`PENDING_POST_MERGE`（保持，不得提前改 VERIFIED）
- `production_cron_execution`：`NOT_TESTED`（保持，不得提前改 PASS）
- `mergeCompletedHead`：`f0e28dd`（保持，PERSIST-001 已合并到 main）
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage

## A+B 并行激活门禁区分（AC-06）

> 本节明确区分"允许 HARDEN-001 开始"和"禁止 PERSIST-001 正式关闭"两条独立门禁。

### 允许 HARDEN-001 开始（独立门禁，已通过）

- PERSIST-001 已合并到 main（`f0e28dd`），GPT 证据验收 `EVIDENCE_REVIEW_PASS`
- 内部安全底线（D-034）已在 PERSIST-001 落地，HARDEN-001 在此基础上完成公开发布剩余门禁
- HARDEN-001 启动**不依赖** PROD-CRON-VERIFY 通过，也**不依赖** PERSIST-001 归档
- HARDEN-001 实施过程中**禁止**触及 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置
- HARDEN-001 拆为三个独立批次（HARDEN-001A/B/C），每批次独立 PR + 独立 GPT 验收

### 禁止 PERSIST-001 正式关闭（独立门禁，仍开启）

- PERSIST-001 已合并到 main，但**未归档**到 `tasks/completed/`
- 归档前置条件：`PROD-CRON-VERIFY` 通过（`production_cron_*` 字段改为 `VERIFIED`）
- 在 PROD-CRON-VERIFY 通过前：
  - `production_cron_registration` 保持 `PENDING_POST_MERGE`
  - `production_cron_execution` 保持 `NOT_TESTED`
  - `finalClosureFix01DeploymentStatus` 保持 `preview-verified-production-pending-merge`
  - PERSIST-001 任务文件保持 `gpt_evidence_review_pass / nextActor=gpt`
- Trae **不得**在用户证据完整前将 `production_cron_*` 改为 `VERIFIED`

### 并行汇合点

- PROD-CRON-VERIFY 通过 + HARDEN-001 通过 → PERSIST-001 归档 → 解除 ROUTING-001 阻塞
- 任一未通过，ROUTING-001 保持阻塞

## 用户并行动作（PROD-CRON-VERIFY）

用户在 Vercel 中检查最新 main Production Deployment。**注意**：Trae 落盘本激活决策后会产生新的 main commit，因此应验证当时最新 main HEAD 对应的 Production Deployment，不要只固定检查 `f0e28dd` 或 `f8e5f48`。

需提供：

- Production Deployment 为 Ready
- Deployment ID、URL、时间和对应 commit
- Cron Jobs 中存在：
  - Path：`/api/worker/recover`
  - Schedule：`0 0 * * *`
- 一次受控执行结果：
  - HTTP 状态码
  - 脱敏响应 body
  - Function Logs
  - 无鉴权、环境变量及超时错误

自动调度时间为 00:00 UTC，即中国时间 08:00、日本时间 09:00；有 Dashboard Run 或受控手动调用时，不必等待下一次自动调度。

## Trae 下一步（HARDEN-001A 仓库上下文核对与实施）

激活 commit 完成后，立即进入 HARDEN-001A 仓库上下文核对与实施，**不等待** Cron 门禁：

1. 创建分支 `lumen/harden-001a-trae`（基于激活 commit 之后的 main HEAD）
2. 读取 `docs/lumen-v2/specs/07-ACCEPTANCE-PLAN.md` Gate D 认证子项
3. 读取 PERSIST-001 已落地的内部安全底线（D-034）实施位置，避免重复实现
4. 按 TDD 实现 D-012 P0 authentication（未认证、无效凭据、过期凭据、权限不足）
5. 运行 8 门禁 + 安全回归测试
6. 创建 PR，状态推进为 `awaiting_gpt_acceptance / nextActor=gpt`
7. 评估是否需要 Codex 一次有边界的安全审计（参见 HARDEN-001.md Codex 升级条件）

## Stop Conditions（来自任务卡）

出现以下情况立即停止对应分支，不得伪造通过：

- Production Deployment 不是 Ready
- Cron Jobs 中没有目标路径或 schedule 不一致
- 调用出现 401、403、5xx 或超时
- Function Logs 显示缺少环境变量或 Secret
- 需要把真实密钥写入完成包
- HARDEN 修改意外触及 PERSIST/Cron 逻辑
- ROUTING-001 被顺带激活
- 状态文件与任务文件产生互相冲突的事实

---

## 历史状态（2026-07-20，PERSIST-001 合并到 main 后保留参考）

- 当前任务：`PERSIST-001`
- 状态：`gpt_evidence_review_pass / nextActor=gpt`（已合并到 main，等 GPT 确认合并 + 决定下一步推进）
- GPT 证据验收结论：`EVIDENCE_REVIEW_PASS` / `MVP_PASS_WITH_POST_MERGE_GATE`（2026-07-20）
- 合并完成：fast-forward push `76d18f7..f0e28dd` 到 `main`（2026-07-20；非 force-push；main 是 lumen/persist-001-trae 的祖先）
- 当前轮次：`PERSIST-001-FINAL-CLOSURE-FIX-01`（最终修复轮，AC-FIX-01 ~ AC-FIX-10）
- 上一轮：`PERSIST-001-FINAL-CLOSURE`（HEAD `13ea500`，GPT 最终验收给出 FIX-01 修复包）
- 本轮（FIX-01）基线：`13ea500`
- 本轮（FIX-01）HEAD：`1aeec8e`（`feat(lumen-v2): PERSIST-001 FINAL-CLOSURE-FIX-01`）
- 本轮（FIX-01）HEAD backfill：`08818c6`（`docs(lumen-v2): PERSIST-001 FINAL-CLOSURE-FIX-01 HEAD backfill`）
- 本轮（FIX-01）Vercel 部署验证补充 commit：`f0bdbed`（Vercel Dashboard 验证结果归档）
- 分支：`lumen/persist-001-trae`
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- GPT 审查：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（含 FINAL-CLOSURE FIX-01 修复包 + EVIDENCE_REVIEW_PASS 节）
- Trae 报告：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`（含 R2 + FINAL-CLOSURE + FCF1 节）
- 门禁证据：`docs/lumen-v2/evidence/PERSIST-001/gate-results.md`（含 P0 修复轮 2 + FINAL-CLOSURE-Gate + FINAL-CLOSURE-FIX-01-Gate 节）

## GPT 证据验收结论（2026-07-20，EVIDENCE_REVIEW_PASS）

GPT 基于本轮提交的完成摘要和验证证据，给出以下裁决（完整原文已追加到 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`）：

- **总体结论**：`EVIDENCE_REVIEW_PASS`（仅表示本轮 Vercel 验证归档通过，不代表 GPT 已读取 `f0bdbed` 实际 diff 或独立访问 Vercel 控制台）
- **AC-FIX-09**：`PASS`
- **AC-FIX-01**：`PASS`（范围限定为 cron 配置正确 + Vercel 部署接受性；不得被解释为 Production Cron 已注册/触发/端到端验证）
- **reviewVerdict**：`MVP_PASS_WITH_POST_MERGE_GATE`
- **Production Cron 注册与运行**：仍为后续强制门禁，不属于本轮已验证内容
- **Codex 必要性**：`NOT_REQUIRED`（当前为部署证据归档，无高风险条件）
- **Next Owner**：`Trae / User，进入合并决策流程`

### GPT 建议的状态更新（已落盘到 STATE.json）

- `status: gpt_evidence_review_pass`
- `reviewVerdict: MVP_PASS_WITH_POST_MERGE_GATE`
- `nextActor: user_or_trae_for_merge`
- `production_cron_registration: PENDING_POST_MERGE`（保持，不得提前改 VERIFIED）
- `production_cron_execution: NOT_TESTED`（保持，不得提前改 PASS）

### GPT 明确的禁止行为

- 不得在合并前将 `production_cron_registration` / `production_cron_execution` 提前改为 `VERIFIED` 或 `PASS`
- 不得因本次 GPT 验收，把报告中的条件性结论改写为 "Production Cron fully verified"
- 合并到 main 后必须创建独立的 Production Cron 验证任务，不应直接把当前任务中的待验证状态静默改为完成

### GPT 指出的 Diff Risks（非阻塞，需后续留意）

- 本轮声称仅修改文档和状态文件，但变更量 5 files / +578 / -44 对纯归档任务偏大
- 主要风险：STATE.json 可能存在重复字段/旧字段残留；报告可能残留旧 "Production verified" 表述；新完成包替代桌面协作文件后旧路径引用
- 实际 diff 未提交给 GPT 核验，本轮无法独立确认五个文件的具体内容、JSON 可解析性、AC-FIX-01/09 一致性

### GPT 列出的合并后必须补齐的证据（非本轮通过必要条件）

- Production commit hash / Deployment ID / URL / Ready 截图或日志
- Vercel Cron Jobs 中的路径与 schedule
- `/api/worker/recover` 的运行时间和 HTTP 结果 + Function Logs
- 无鉴权、环境变量或超时错误的证明
- 状态字段由 `PENDING_POST_MERGE` 更新为最终状态的 diff

## 合并完成（2026-07-20）

PERSIST-001 已合并到 `main`：

- **合并方式**：fast-forward push（`76d18f7..f0e28dd`，非 force-push）
- **远端 main HEAD**：`f0e28dd`
- **本地 main HEAD**：`f0e28dd`（已同步）
- **合并 commit**：`f0e28dd docs(lumen-v2): PERSIST-001 FINAL-CLOSURE-FIX-01 GPT EVIDENCE_REVIEW_PASS verdict archive`
- **Vercel Production Deployment**：应已触发（需用户在 Vercel Dashboard 确认 Ready）
- **Production Cron 注册**：应在 Production Deployment Ready 后自动注册（需用户验证）
- **PROD-CRON-VERIFY 任务**：已创建 `docs/lumen-v2/tasks/backlog/PROD-CRON-VERIFY.md`（待 GPT 激活）
- **状态字段**：`production_cron_registration` / `production_cron_execution` 保持 `PENDING_POST_MERGE` / `NOT_TESTED`，不得提前改 VERIFIED

### 合并后的状态字段

- `status: gpt_evidence_review_pass`（保持，等 PROD-CRON-VERIFY 通过后才 complete）
- `nextActor: gpt`（让 GPT 确认合并 + 决定下一步）
- `mergeCompletedDate: 2026-07-20`
- `mergeCompletedHead: f0e28dd`
- `prodCronVerifyTask: docs/lumen-v2/tasks/backlog/PROD-CRON-VERIFY.md`

## GPT 下一步（合并确认 + 项目推进）

GPT 在新窗口启动后，需要：

1. **确认合并结果**：
   - 读取 `STATE.json` 确认 `mergeCompletedHead: f0e28dd`
   - 确认远端 `main` 已更新（可通过 `git ls-remote origin main` 或 GitHub 页面）
   - 确认 Vercel Production Deployment 已触发（由用户在 Vercel Dashboard 确认）

2. **决定 PROD-CRON-VERIFY 激活方式**：
   - PROD-CRON-VERIFY 需要用户在 Vercel Dashboard 操作（Trae 无凭据）
   - 建议状态：`awaiting_user_decision / nextActor=user`（用户执行 Production 验证）
   - 或并行推进 HARDEN-001（不依赖 Production Cron 验证）

3. **快速推进项目**（用户明确要求）：
   - 选项 A：激活 PROD-CRON-VERIFY（awaiting_user_decision），等用户验证后再归档 PERSIST-001
   - 选项 B：并行激活 HARDEN-001（安全/可靠/发布），PROD-CRON-VERIFY 作为独立门禁异步等待
   - 选项 C：先激活 ROUTING-001（智能模型路由，前置 PERSIST-001 已满足）
   - GPT 根据风险评估决定优先级

4. **PERSIST-001 归档条件**：
   - PROD-CRON-VERIFY 通过（`production_cron_*` 改为 `VERIFIED`）
   - 才能 PERSIST-001 归档到 `tasks/completed/`
   - 才能正式解除 HARDEN-001 / ROUTING-001 的阻塞

## 本轮修复摘要（FINAL-CLOSURE-FIX-01）

按 GPT 最终验收给出的 FIX-01 修复包，解决 3 类剩余问题，不重做已通过的业务逻辑：

1. **AC-FIX-01 / AC-FIX-02** — `vercel.json` cron schedule 从 `* * * * *`（每分钟）修正为 `0 0 * * *`（每日 00:00 UTC），符合 Vercel Hobby "每天最多 1 次 cron 调用" 限制；`maxDuration: 90` 保留（用户确认 Fluid Compute 已启用，Hobby+Fluid Compute 上限 300s，90s 在上限内）；`worker-recovery.ts` maxRecover 注释更新说明 cron 频率变更和 Fluid Compute 状态。
2. **AC-FIX-03 / AC-FIX-04 / AC-FIX-05** — 修正 FINAL-CLOSURE 状态文件中的 HEAD 占位符（"提交后生成"）、错误文件数（"10 个文件" → "13 个"，"8 个修改" → "11 个修改"）、缺失文件列表（FC.3 补齐 PERSIST-001-TRAE-REPORT.md 和 gate-results.md）；STATE.json / SESSION-HANDOFF / Trae report / gate-results.md 的 HEAD、门禁数量、测试数量完全一致。
3. **AC-FIX-06** — 修正事务测试证据过度表述。不再声称 `cloudbase.transaction.contract.test.ts` 自身断言了 Project pointer 不变。准确引用已有 `src/server/services/GenerationService.p0.test.ts:450-568` 测试 "final updateIfClaimed failure rolls back Asset/Version/Project pointer and deletes result object"，覆盖 Project pointer 不变（line 557）+ result object 补偿删除（line 561）+ Job 无 resultVersionId（line 567）。
4. **AC-FIX-07** — GET 和 POST worker route 测试继续通过（6 tests in `routes/worker.test.ts`），未复制 recovery handler。
5. **AC-FIX-08** — 统一 8 门禁全部 PASS，记录真实输出。清理 dist/ 后真实计数：client 194 tests / 10 files + server 224 tests / 25 files = 418 tests / 35 files combined。
6. **AC-FIX-09** — Vercel 部署验证：由于 Vercel CLI 未在本地认证，由用户通过 Vercel Dashboard 手动验证（步骤见下方）。
7. **AC-FIX-10** — 精确 `git add` 仅提交 6 个 FIX-01 范围内文件；状态推进为 `awaiting_gpt_acceptance / nextActor=gpt`。

## 8 门禁结果（FINAL-CLOSURE-FIX-01）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | — |
| 5 | Server tests | PASS | 224 tests / 25 files |
| 6 | Root tests | PASS | 418 combined (194 client + 224 server) |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

详见 `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 FINAL-CLOSURE-FIX-01-Gate 节。

**测试计数差异说明**：之前 FINAL-CLOSURE-Gate 报告的 "436 tests / 48 files" 包含 `dist/` 编译产物 `.test.js` 文件的重复计数。清理 dist/ 后真实 unique 计数为 224 tests / 25 files。本轮 FIX-01 所有门禁数字均基于清理后的真实计数。

## Vercel 部署验证结果（AC-FIX-09）

**验证方式**：用户手动在 Vercel Dashboard 验证（Trae 无 Vercel 凭据，`.vercel/` 未链接）。

**验证日期**：2026-07-20

**已验证项**：

| 项 | 值 | 状态 |
|----|----|----|
| Vercel 项目 | `lumen-ink` | confirmed |
| Production Branch | `main` | confirmed |
| Preview Branch | `lumen/persist-001-trae`（所有未分配分支） | confirmed |
| Production Domain | `lumen-ink.vercel.app` | confirmed |
| Fluid Compute | Enabled（Settings > Functions） | ✅ PASS |
| Cron Jobs 功能 | Enabled（Settings > Cron Jobs） | ✅ PASS |
| `vercel.json` 解析 | Preview 部署 `Ready`，无构建错误 | ✅ PASS |
| cron 配置语法 | `0 0 * * *` 被 Vercel 接受 | ✅ PASS |
| Preview 分支 | `lumen/persist-001-trae` | confirmed |
| Preview commit | `08818c6` | confirmed |
| Preview 部署状态 | `Ready`（绿色） | ✅ PASS |
| Production cron 注册 | Cron Jobs 页面无注册任务（预期：cron 只在 Production 部署上注册，而 `lumen/persist-001-trae` 是 Preview 分支） | ⏳ PENDING_POST_MERGE |
| Production cron 执行 | 合并到 `main` 触发 Production 部署前不可测 | ⏳ NOT_TESTED |

**为什么 Production cron 注册为 PENDING_POST_MERGE**：

Vercel Cron Jobs 只在 Production Deployment 上注册（按 Vercel 官方文档）。项目 Production Branch 是 `main`，`lumen/persist-001-trae` 是 Preview 分支。push 到 Preview 分支只触发 Preview Deployment，不注册 cron jobs。`Settings > Cron Jobs` 页面因此显示 "Get Started" 教程而非任务列表。

这是 feature/fix 分支的预期行为，**不是配置错误**。Production cron 注册和执行将在 GPT 最终验收通过并合并到 `main` 后验证。

**AC-FIX-09 闭环**：
- 配置正确性：已验证（vercel.json 语法 PASS，Preview 部署 Ready）
- Production 运行时验证：推迟到合并后门禁（见下方"下一阶段强制动作"）
- **不声称** "Production cron verified"；状态为 "Preview deployment verified, Production cron pending merge"

**AC-FIX-01 闭环**：
- `vercel.json` cron 频率符合 Hobby 方案（每日一次）：✅ PASS
- 一次成功的 Vercel 部署状态：✅ PASS（Preview 部署 `08818c6` Ready）

## 下一阶段强制动作（合并到 main 后）

合并 `lumen/persist-001-trae` 到 `main` 后，必须执行以下验证并归档证据：

1. **检查 Production Deployment**
   - 在 Vercel Dashboard > `Deployments` 确认 `main` 分支最新部署状态为 `Ready`
   - 记录 Production Deployment URL（如 `https://lumen-ink.vercel.app`）
   - 记录 Production Deployment ID
   - 记录部署时间和 Build Logs 末尾几行

2. **确认 Vercel Cron Jobs 页面出现对应任务**
   - 进入 `Settings > Cron Jobs`（或侧边栏独立 `Cron Jobs` 菜单）
   - 应看到一条记录：
     - Path: `/api/worker/recover`
     - Schedule: `0 0 * * *`
   - 截图保存为证据，放入 `docs/lumen-v2/evidence/PERSIST-001/`

3. **检查首次调度或受控手动调用结果**
   - 等待下一个 00:00 UTC（08:00 北京时间）观察 cron 自动执行
   - 或通过 Vercel Dashboard 的 "Run" 按钮（如有）手动触发一次
   - 或通过 `curl -H "Authorization: Bearer $CRON_SECRET" https://lumen-ink.vercel.app/api/worker/recover` 手动调用
   - 记录执行时间、HTTP 状态码、响应 body

4. **保存 Production 验证证据**
   - Production Deployment URL
   - Production Deployment ID
   - 部署时间戳
   - Build Logs 末尾片段
   - Cron Jobs 页面截图
   - 首次/手动调用结果
   - 全部归档到 `docs/lumen-v2/evidence/PERSIST-001/vercel-production-verification.md`

5. **更新状态文件**
   - `STATE.json`:
     - `production_cron_registration`: `PENDING_POST_MERGE` -> `VERIFIED`
     - `production_cron_execution`: `NOT_TESTED` -> `VERIFIED`（或 `FAILED` + 错误日志）
     - `finalClosureFix01DeploymentStatus`: `preview-verified-production-pending-merge` -> `production-verified`
   - `SESSION-HANDOFF.md`: 追加 Production 验证结论
   - `docs/lumen-v2/evidence/PERSIST-001/gate-results.md`: 追加 Production Verification 节

**这些动作属于 PERSIST-001 合并后门禁，不阻塞 GPT 最终复审**。GPT 可基于 Preview Ready 结果给出 `MVP_PASS`（带条件：合并后必须完成 Production cron 验证）。

## GPT 下一步（最终复审）

1. 启动新窗口 GPT，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态
2. 读取：
   - 本文件
   - `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` 的 FCF1 节
   - `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 FINAL-CLOSURE-FIX-01-Gate 节
   - FINAL-CLOSURE FIX-01 修复包（已在 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`）
3. 审查 `13ea500` -> HEAD diff（仅 FINAL-CLOSURE-FIX-01 AC-FIX-01~AC-FIX-10 范围，包含 3 个 commit：`1aeec8e` 主修复 + `08818c6` HEAD backfill + 本 Vercel 验证归档 commit）
4. 核查 FIX-01 涉及文件：
   - `vercel.json` - cron schedule `0 0 * * *`，maxDuration 90（AC-FIX-01/02）
   - `src/server/infrastructure/executor/worker-recovery.ts` - maxRecover 注释（AC-FIX-01/02）
   - `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` - FCF1 section（AC-FIX-04/06）
   - `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` - FINAL-CLOSURE-FIX-01-Gate + Vercel Deployment Verification section（AC-FIX-05/09）
   - `docs/lumen-v2/state/STATE.json` - finalClosureFix01 + production_cron_* 字段（AC-FIX-03/05/09）
   - `docs/lumen-v2/state/SESSION-HANDOFF.md` - 本文件（AC-FIX-03/09）
5. 核对统一 8 门禁（全部 PASS，418 tests，dist/ 已清理）
6. 核对状态文件一致性（HEAD、门禁数量、测试数量、部署结果）
7. 核查 Vercel 部署验证结果：
   - Preview 部署 `08818c6` Ready：✅ 已验证
   - Production cron 注册：⏳ PENDING_POST_MERGE（合并到 main 后验证，见"下一阶段强制动作"）
   - Production cron 执行：⏳ NOT_TESTED
8. 直接裁决 `MVP_PASS`（带条件：合并后完成 Production cron 验证）或生成最终修复包

## 范围遵守

- ✅ 只修 FINAL-CLOSURE-FIX-01 AC-FIX-01 ~ AC-FIX-10 范围
- ✅ 未修改 AC-01~08 已通过的生产业务逻辑
- ✅ 未重构 persistence adapter
- ✅ 未启动 ROUTING-001 / HARDEN-001 / PERSIST-002
- ✅ 未改变冻结候选 A（Vercel Hobby + CloudBase PG + PG Storage）方向
- ✅ 未使用真实客户数据
- ✅ 未提交 CloudBase 凭据、service-role token 或未脱敏日志
- ✅ 精确 `git add <path>`，未提交既有无关工作区修改
- ✅ 未调用 Codex
- ✅ 未归档任务，未激活下一任务

## 硬停止条件

仅在以下情况停止并交回用户/GPT：
- 需要付费 / 真实 CloudBase 账号 / 不可逆迁移
- 数据或密钥泄漏
- 必须改变冻结候选 A / Provider / API 方向
- 当前 FIX-01 门禁无法恢复（本轮已恢复，所有 8 门禁 exit 0）
- 修复要求跨越 PERSIST-001 范围

---

## 历史轮次（保留参考）

### FINAL-CLOSURE（2026-07-20，HEAD `13ea500`）

按用户合并执行包「R2：GPT 给出合并修复包 → Trae 一次完成 → GPT 最终证据验收」一次性修复 12 条 AC，不拆分中间审查。GPT 最终验收给出 FIX-01 修复包，要求修正部署方案冲突、状态文件不一致和事务证据过度表述。

详见 `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` 的 FINAL-CLOSURE 节和 `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 FINAL-CLOSURE-Gate 节。

### P0 修复轮 2（2026-07-20，HEAD `af960e3`）

GPT 第二轮 MVP_FAIL 后修复 P0-01A~C / P0-02A / STATE-01。

### P0 修复轮（2026-07-18，HEAD `cf0a080`）

GPT 首轮 MVP_FAIL 后修复 P0-01 ~ P0-04。

### 初始实现（2026-07-18，HEAD `4e3a125`）

PERSIST-001 12 个子任务一次性实现，54 文件变更，+10945/-550。
