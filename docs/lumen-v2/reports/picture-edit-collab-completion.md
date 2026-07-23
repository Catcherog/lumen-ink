# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R9 协作完成包（含 RF-R9-01/02/03 补充）

> **本文件供 Web GPT 审查（无本地仓库读取能力）**。Trae 已完成 FIX-R9 全部修复 + RF-R9-01/02/03 补充（闭合 GPT 对原始 FIX-R9 的 FIX_REQUIRED），现提交 GPT 证据复审。

---

## 0. RF-R9-01/02/03 补充摘要（本轮重点）

GPT 对原始 FIX-R9 下发 `FIX_REQUIRED` verdict，要求 3 项闭合 C-01 的工作（H-01/M-01 已 PASS，不重写）：

| RF | 要求 | 状态 |
|----|------|------|
| RF-R9-01 | 使用 SDK 派生类型（非手写镜像） | **PASS** |
| RF-R9-02 | 补齐顶层失败合同（8 测试） | **PASS** |
| RF-R9-03 | 更新证据包 | **PASS** |

### RF-R9-01 证据（GPT 明确要求列出）

- **SDK 类型**：`IDeleteFileResult`（deleteFile 成功分支）、`IGetFileUrlResult`（getTempFileURL 成功分支）
- **Import 位置**：`src/server/infrastructure/persistence/cloudbase.nosql.ts` 第 44 行：
  ```typescript
  import type { IDeleteFileResult, IGetFileUrlResult } from '@cloudbase/node-sdk';
  ```
- **派生方式**：联合类型 `DeleteFileReturn = IDeleteFileResult | SdkStorageTopLevelError`；`GetTempFileURLReturn = IGetFileUrlResult | SdkStorageTopLevelError`。**成功分支 IS SDK 类型**（非 Pick 镜像、非手写副本）——SDK 类型漂移会在编译期触发错误。
- **`statusMessage` 运行时字段**：SDK 类型不声明，使用 safe cast `(item as { statusMessage?: string }).statusMessage ?? ''`。
- **`SdkStorageTopLevelError` 联合分支原因**：SDK TypeScript 类型声明 `fileList` 为必填，但运行时后端 API 失败时 SDK 返回裸 `res`（顶层 `code`/`message`，无 `fileList`）。源码证据：`@cloudbase/node-sdk@3.18.3` `src/storage/index.ts` 第 163-174 行（deleteFile）+ 第 231-239 行（getTempFileURL）。

### RF-R9-02 证据（GPT 明确要求列出）

- **顶层错误判定逻辑**：`isSdkTopLevelError()` 类型守卫：
  ```typescript
  function isSdkTopLevelError(res: unknown): res is SdkStorageTopLevelError {
    return (
      typeof res === 'object' &&
      res !== null &&
      !Array.isArray((res as { fileList?: unknown }).fileList)
    );
  }
  ```
  `fileList` 缺失或非数组 → 顶层错误；`message` 内容不影响判定（fail-closed regardless of message text）。
- **4 处判定点更新**：put 补偿删除（抛 `COMPENSATION_DELETE_FAILED: STORAGE_TOPLEVEL_ERROR`）、getSignedUrl（抛 `STORAGE_TOPLEVEL_ERROR`）、delete（抛 `STORAGE_TOPLEVEL_ERROR`，metadata + ledger 保留）、exists（返回 `false` + `console.warn`，fail-closed 不抛）。
- **新增测试名称**（8 个，在 `cloudbase.nosql.storage.contract.r9.test.ts` describe block `"FIX-R9 RF-R9-02: SDK top-level failure contract (fail-closed)"`）：

| # | 测试名 |
|---|--------|
| 1 | `delete throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure (STORAGE_REQUEST_FAIL), metadata preserved` |
| 2 | `delete throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure (SYS_ERR), different code still fails closed` |
| 3 | `delete top-level failure with different message still fails closed (message does not affect fail-closed)` |
| 4 | `getSignedUrl throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure, metadata preserved` |
| 5 | `getSignedUrl top-level failure with different message still fails closed (message does not affect fail-closed)` |
| 6 | `put compensation delete: top-level failure from deleteFile preserves orphaned file` |
| 7 | `exists returns false when SDK returns top-level failure (fail-closed, no throw, metadata preserved)` |
| 8 | `deleteProject: top-level failure on object delete does NOT remove cleanup ledger` |

- **5 项合同断言全部通过**：

| 要求 | 测试 | 状态 |
|------|------|------|
| 顶层失败绝不视为成功 | 1-8 | PASS |
| 不删除 metadata | 1, 4, 7, 8 | PASS |
| 不删除 cleanup ledger | 8 | PASS |
| 返回/抛出稳定领域错误 | 1-6（抛 `STORAGE_TOPLEVEL_ERROR`）；7（返回 false + warn） | PASS |
| `message` 不影响 fail-closed | 3, 5 | PASS |

### RF-R9-03 证据（GPT 明确要求列出）

- **SDK 类型**：`IDeleteFileResult`、`IGetFileUrlResult`（见 RF-R9-01）
- **Import 位置**：`cloudbase.nosql.ts` 第 44 行（见 RF-R9-01）
- **顶层错误判定逻辑**：`isSdkTopLevelError()` 类型守卫（见 RF-R9-02）
- **新增测试名称**：8 个（见 RF-R9-02）
- **Server 测试总数**：462（vs 原始 R9 454，+8 RF-R9-02）
- **SHA 口径（EVIDENCE-CORRECTION-04 校正）**：
  - `RF_IMPLEMENTATION_SHA=48f2f56`（承载代码+测试的 feat 提交）
  - `RF_EVIDENCE_COMMIT_SHA=0f0d0ae`（Trae Report + gate evidence + state 的 docs 提交）
  - `SHA_BACKFILL_COMMIT_SHA=e1a2576`（纯 SHA 回填 docs 提交）
  - `CURRENT_REVIEW_HEAD`：捕获于仓库外桌面完成包（**不写入 Git 跟踪文件**，避免 SHA 回填循环）
  - **先前错误声明已校正**：此前声称 "Local/Remote HEAD=0f0d0ae" 是错误的——0f0d0ae 是证据提交 SHA，不是当前 HEAD
- **WORKTREE_CLEAN=true**（已确认，git status --porcelain 为空）
- **RF_IMPLEMENTATION_FILES_CHANGED=2**（`cloudbase.nosql.ts`、`cloudbase.nosql.storage.contract.r9.test.ts`，均在 commit 48f2f56）— 此前混淆 "worktree clean" 与 "仅 2 个修改文件" 的表述已校正
- **`readyForPreview=false`**：已确认（STATE.json `cloudbaseNoSqlImplement.readyForPreview`）

---

## 1. 任务概述

| Field | Value |
|-------|-------|
| Task ID | `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R9-STORAGE-CONTRACT-METADATA-LEDGER` |
| Status | `awaiting_gpt_acceptance` |
| Next Actor | `gpt` |
| Risk Level | HIGH |
| Route | R2_BATCHED_AUDIT |
| Base SHA | `939e9e9` |
| Implementation SHA (original R9) | `e55b84d` (e55b84de13c08c0bdbd2307111e7f488f785bea0) |
| RF Implementation SHA (48f2f56) | `48f2f56`（代码+测试 feat 提交）|
| RF Evidence Commit SHA (0f0d0ae) | `0f0d0ae`（docs 提交：report+evidence+state）|
| SHA Backfill Commit (e1a2576) | `e1a2576`（纯 SHA 回填 docs 提交）|
| CURRENT_REVIEW_HEAD | 仓库外桌面完成包捕获（不写入跟踪文件）|
| Branch | `lumen/cloudbase-nosql-implement-01-fix-r9` |
| Defects Source | GPT `FIX_REQUIRED` verdict on LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 |
| Defects Resolved | C-01 (Critical), H-01 (High), M-01 (Medium) |
| RF Supplement | RF-R9-01/02/03 (GPT FIX_REQUIRED on original R9) |
| AC-07 BLOCKER | **RESOLVED** via H-01 fix (no regression in RF-R9-01/02/03) |
| readyForPreview | `false` (unchanged) |
| Date | 2026-07-23 |

---

## 2. GPT Verdict 历史

### 2.1 原始 FIX_REQUIRED（覆盖 FINAL-CLOSURE-BATCH-01 + EVIDENCE-CORRECTION-02）

发现 3 项正确性缺陷：C-01 (Critical) / H-01 (High) / M-01 (Medium)。要求修复后用真实 SDK 响应形状完成无凭据回归，方可进入 Preview。

### 2.2 RF-R9-01/02/03 FIX_REQUIRED（针对原始 FIX-R9）

GPT 对原始 FIX-R9 下发 `FIX_REQUIRED`，明确要求（不重写 H-01/M-01）：

- **RF-R9-01**：使用 SDK 派生类型（`Awaited<ReturnType<...>>` 或 SDK 导出类型或 Pick + `satisfies` 约束），不得只保留手写镜像
- **RF-R9-02**：补齐顶层 `code`/`message` 失败合同测试（5 项断言：fail-closed、不删 metadata、不删 ledger、稳定领域错误、message 无关性）
- **RF-R9-03**：更新证据包明确列出 SDK 类型、import、顶层错误判定逻辑、新测试名称、server 测试总数、HEAD、worktree clean、readyForPreview=false

**Codex Necessity**：当前不调用 Codex。Trae 完成 RF-R9-01/02/03 后由 GPT 复审；通过后再执行一次限域 READ_ONLY Codex 总审计。

---

## 3. 修复详情

### 3.1 C-01 (Critical) — CloudBase Storage 成功码类型建模错误

**根因**：生产适配器把 `deleteFile()` 和 `getTempFileURL()` 的 `code` 声明为 `number`，以 `code !== 0` 判定失败。实际 `@cloudbase/node-sdk@3.18.3` 类型将 `code` 定义为字符串，成功值为 `"SUCCESS"`（官方文档确认）。

**原始 FIX-R9 修复**：
1. `CloudBaseApp` 接口 `code: number` → `code: string`
2. 4 处判定点改为 `code !== 'SUCCESS'` + fileID 匹配
3. Mock 对齐字符串合同

**RF-R9-01 补充修复**（本轮）：
1. 直接 import SDK 公开类型：`import type { IDeleteFileResult, IGetFileUrlResult } from '@cloudbase/node-sdk';`（`cloudbase.nosql.ts` 第 44 行）
2. 新增联合类型：`DeleteFileReturn = IDeleteFileResult | SdkStorageTopLevelError`；`GetTempFileURLReturn = IGetFileUrlResult | SdkStorageTopLevelError`
3. 成功分支 IS SDK 类型（非手写镜像）—— SDK 类型漂移在编译期触发错误
4. `statusMessage` 运行时字段使用 safe cast（SDK 类型不声明此字段）

**RF-R9-02 补充修复**（本轮）：
1. 新增 `isSdkTopLevelError()` 类型守卫（`fileList` 缺失或非数组 → 顶层错误）
2. 4 处判定点更新顶层错误处理：
   - `put()` 补偿删除：抛 `COMPENSATION_DELETE_FAILED: STORAGE_TOPLEVEL_ERROR`
   - `getSignedUrl()`：抛 `STORAGE_TOPLEVEL_ERROR`
   - `delete()`：抛 `STORAGE_TOPLEVEL_ERROR`（metadata + ledger 保留）
   - `exists()`：返回 `false` + `console.warn`（fail-closed 不抛）

**验证来源**：
- `@cloudbase/node-sdk@3.18.3` 类型定义 `IDeleteFileResult.fileList[].code: string`、`IFileUrlInfo.code: string`
- `@cloudbase/node-sdk@3.18.3` 源码 `src/storage/index.ts` 第 163-174 行（deleteFile）+ 第 231-239 行（getTempFileURL）确认运行时顶层错误形状
- 腾讯官方文档明确 `item.code === "SUCCESS"` 判定成功
- 12 个原始合约测试 + 8 个 RF-R9-02 顶层失败合同测试 = 20 个测试覆盖

### 3.2 H-01 (High) — METADATA_MISSING 清除 ledger 且无 fileID 恢复

**根因**：`objects.delete()` 抛 METADATA_MISSING 后，ProjectService 将 key 加入 completedKeys 并从 ledger 删除。ledger 只存 storageKey 不存 fileID，远端对象永久失去清理所有权。

**修复**（原始 R9，RF-R9-01/02/03 无回归）：
1. 新增 `project_unresolved_metadata` 集合
2. 新增 `markUnresolvedMetadata(id, keys)` duck-typed 方法（upsert 语义）
3. METADATA_MISSING keys 不再进入 completedKeys，改为 push 到 `unresolvedMetadataMissing` 数组
4. ledger 保留 METADATA_MISSING keys
5. `DeleteProjectResult` 接口新增 `unresolvedMetadataMissing: string[]` 字段

**AC-07 FINAL_CODEX_BLOCKER RESOLVED**：METADATA_MISSING keys 持久化到 `project_unresolved_metadata` 集合，ledger 保留，远端对象清理所有权可恢复。

### 3.3 M-01 (Medium) — ledger 更新失败被吞掉

**根因**：`removeCleanupKeys()` 失败被捕获后吞掉，方法仍返回 `{ deleted: true, cleanupFailures=[] }`。调用方无信号重试。

**修复**（原始 R9，RF-R9-01/02/03 无回归）：
1. `DeleteProjectResult` 接口新增 `ledgerUpdateFailed: boolean` 字段
2. `removeCleanupKeys()` 失败时设置 `ledgerUpdateFailed = true`
3. 调用方收到 `ledgerUpdateFailed=true` 时有明确信号重试

**注意**：本修复提供 caller-driven retry 信号，未实现持久化后台 replayer。GPT verdict 接受此方案。

---

## 4. 文件变更清单（含 RF-R9-01/02/03）

| 文件 | 类型 | 变更说明 |
|------|------|----------|
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | modified | CloudBaseApp 接口 `code:string`；4 处判定点 fileID 匹配 + SUCCESS 检查；`markUnresolvedMetadata` 方法；`project_unresolved_metadata` 集合；**RF-R9-01**: SDK 类型 import + 联合类型 + `isSdkTopLevelError()` 守卫 + 4 处顶层错误处理 + 2 处 statusMessage safe cast |
| `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts` | modified | `code:number` → `code:string` 对齐；`deleteFileStatuses`/`getTempFileURLStatuses` `Record<string,string>`；默认 `code='SUCCESS'` |
| `src/server/services/ProjectService.ts` | modified | `unresolvedMetadataMissing` + `ledgerUpdateFailed` 字段；METADATA_MISSING → `unresolvedMetadataMissing`；duck-typed `markUnresolvedMetadata` 调用 |
| `src/server/infrastructure/persistence/cloudbase.nosql.storage.contract.r9.test.ts` | new + RF-R9-02 modified | 12 原始合约测试 + **RF-R9-02**: +8 顶层失败合同测试（新 describe block） |
| `src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts` | modified | 3 个测试更新（H-01/M-01 行为变更） |
| `src/server/infrastructure/persistence/cloudbase.nosql.final-closure.test.ts` | modified | 2 个测试更新（H-01；AC-07 BLOCKER RESOLVED） |
| `src/server/infrastructure/persistence/cloudbase.nosql.storage.fault.test.ts` | modified | 3 个数字状态码 → 字符串码 |
| `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r9-gate-results.md` | new | 完整 RF-R9-01/02/03 gate evidence |
| `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R9-TRAE-REPORT.md` | modified | 追加 §12 RF-R9-01/02/03 Supplement |
| `docs/lumen-v2/state/STATE.json` | modified | fixR9 字段更新（gateResult 462, scope, filesChanged, remainingRisks） |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | modified | FIX-R9 section 重写（RF-R9-01/02/03） |

---

## 5. 测试覆盖

### 5.1 原始合约测试（12 个）— `cloudbase.nosql.storage.contract.r9.test.ts`

| # | 测试名 | 覆盖缺陷 |
|---|--------|----------|
| 1 | getSignedUrl succeeds when SDK returns code="SUCCESS" with matching fileID | C-01 |
| 2 | delete succeeds when SDK returns code="SUCCESS" with matching fileID | C-01 |
| 3 | delete throws OBJECT_DELETE_PARTIAL when SDK returns empty fileList | C-01 |
| 4 | getSignedUrl throws when SDK returns empty fileList | C-01 |
| 5 | delete throws OBJECT_DELETE_PARTIAL when SDK returns mismatched fileID | C-01 |
| 6 | getSignedUrl throws when SDK returns mismatched fileID | C-01 |
| 7 | delete throws OBJECT_DELETE_PARTIAL when SDK returns string failure code, metadata preserved | C-01 |
| 8 | getSignedUrl throws SIGNED_URL_FAILED when SDK returns string failure code | C-01 |
| 9 | put compensation delete uses string SUCCESS contract: failure preserves orphaned file | C-01 |
| 10 | createProject: signed URL failure after commit returns error but project is persisted | C-01 |
| 11 | removeCleanupKeys failure sets ledgerUpdateFailed=true | M-01 |
| 12 | removeCleanupKeys success sets ledgerUpdateFailed=false | M-01 |

### 5.2 RF-R9-02 新增测试（8 个）— 顶层失败合同

见 §0 RF-R9-02 证据表。

### 5.3 现有测试更新（5 个）

| 文件 | 测试 | 变更原因 |
|------|------|----------|
| `cascade-boundary.test.ts` | "treats METADATA_MISSING as probable success" | H-01: 改为 "persists METADATA_MISSING to unresolved record, preserves ledger" |
| `cascade-boundary.test.ts` | crash-window Phase 1 | M-01: 新增 `expect(result1.ledgerUpdateFailed).toBe(true)` |
| `cascade-boundary.test.ts` | crash-window Phase 2 | H-01: 完全重写，METADATA_MISSING keys 进入 unresolvedMetadataMissing，ledger 保留 |
| `final-closure.test.ts` | "treats METADATA_MISSING as probable success" | H-01: 改为 "persists METADATA_MISSING to unresolved record, logs warning" |
| `final-closure.test.ts` | "METADATA_MISSING key is removed from ledger (AC-07 BLOCKER)" | H-01: 改为 "METADATA_MISSING key is NOT removed from ledger (H-01 FIX)"；AC-07 RESOLVED |

### 5.4 测试数量

- Server tests: 462（vs 原始 R9 454，+8 RF-R9-02 顶层失败合同测试）
- Client tests: 194 (unchanged)
- Total: 656 root tests

---

## 6. 门禁结果（RF-R9-01/02/03 完整 8 门禁）

| # | 门禁 | 命令 | 结果 | 计数 |
|---|------|------|------|------|
| 1 | Server tsc | `npx tsc --noEmit -p src/server/tsconfig.json` | PASS | 0 errors |
| 2 | Server tests | `npx vitest run`（from `src/server/`） | PASS | 462 tests / 36 files |
| 3 | Client tsc | `npx tsc --noEmit -p src/client/tsconfig.json` | PASS | 0 errors |
| 4 | Client tests | `npx vitest run`（from `src/client/`） | PASS | 194 tests / 10 files |
| 5 | check-lumen-collab | `node scripts/check-lumen-collab.mjs` | PASS | no secrets |
| 6 | readyForPreview | STATE.json `cloudbaseNoSqlImplement.readyForPreview` | PASS | `false` (unchanged) |
| 7 | No merge to main | `git rev-parse --abbrev-ref HEAD` | PASS | `lumen/cloudbase-nosql-implement-01-fix-r9` |
| 8 | git diff --check | `git diff --check` | PASS | exit 0 |

**8/8 PASS**

---

## 7. AC 覆盖矩阵

| AC ID | 状态 | 证据 |
|-------|------|------|
| C-01 | PASS | 4 处判定点 `code !== 'SUCCESS'` + fileID 匹配；12 原始合约测试 + 8 RF-R9-02 顶层失败测试 = 20 总；Mock 对齐；installed SDK types + official docs 确认字符串 SUCCESS；**RF-R9-01**: 返回类型派生自 `IDeleteFileResult`/`IGetFileUrlResult` import（非手写镜像） |
| RF-R9-01 | PASS | SDK 类型 `IDeleteFileResult`/`IGetFileUrlResult` import 自 `@cloudbase/node-sdk`；联合类型 `DeleteFileReturn`/`GetTempFileURLReturn`；成功分支 IS SDK 类型；`statusMessage` safe cast |
| RF-R9-02 | PASS | 8 新顶层失败测试；`isSdkTopLevelError()` 守卫；4 判定点更新；5 合同断言全通过 |
| RF-R9-03 | PASS | SDK 类型、import、顶层错误逻辑、8 测试名、server 总数 462、HEAD、worktree clean、readyForPreview=false 全部记录 |
| H-01 | PASS | METADATA_MISSING keys 持久化到 `project_unresolved_metadata`；ledger 保留；3 cascade-boundary + 2 final-closure 测试更新；**RF-R9-01/02/03 无回归** |
| M-01 | PASS | `removeCleanupKeys` 失败设置 `ledgerUpdateFailed=true`；2 合约测试验证 true/false 信号；**RF-R9-01/02/03 无回归** |
| AC-07 | **RESOLVED** | 原 FINAL_CODEX_BLOCKER；H-01 修复确保 METADATA_MISSING keys 不再清除 ledger；远端对象清理所有权通过 `project_unresolved_metadata` 集合保留；**RF-R9-01/02/03 无回归** |

---

## 8. Stop Conditions（持续生效）

- `readyForPreview = false` 不变
- 不合并 main
- 不执行真实 CloudBase 写入
- 不部署 Preview / Production
- 不使用真实 Secret
- PersistenceDependencies 接口不变（`markUnresolvedMetadata` 是 duck-typed，不在冻结接口上）
- AC-07 BLOCKER 已由 H-01 修复，但需 GPT 验收确认（不自行判定通过）
- 不升级 `@cloudbase/node-sdk`
- 字符串 SUCCESS 合同通过 installed SDK types + official docs 验证，非运行时调用（无凭据）
- **RF-R9-01/02/03**: 不重写 H-01/M-01（已 PASS）；无客户端代码变更；无新服务

---

## 9. 残留风险

1. **Mock-only 行为证据**：字符串 SUCCESS 合同的测试基于 Mock；真实 CloudBase SDK 字符串状态码通过 installed SDK types + official docs 验证，未运行时调用（无凭据）
2. **`project_unresolved_metadata` 集合是新的**：真实 CloudBase 集合创建 + 索引行为未验证，待 Preview
3. **`ledgerUpdateFailed` 信号需要调用方重试逻辑**：未实现持久化后台 replayer（caller-driven retry only）；GPT verdict 接受此方案
4. **`markUnresolvedMetadata` 是 duck-typed**：不在冻结 PersistenceDependencies 接口上
5. **真实 CloudBase OCC + 字符串状态码行为待 Preview 验证**
6. **`getTempFileURL`/`deleteFile` 空/不匹配 fileList 抛 OBJECT_NOT_FOUND/OBJECT_DELETE_PARTIAL**：真实 SDK 对部分失败可能返回不同形状
7. **RF-R9-01**: `SdkStorageTopLevelError` 是 adapter-local 接口；若未来 SDK 版本将顶层错误形状加入 TypeScript 类型，应替换为 SDK 类型
8. **RF-R9-02**: 顶层错误测试通过 `vi.spyOn` + `as never` cast 注入运行时形状；真实 SDK 顶层错误形状通过 SDK 源码检查验证，非运行时调用
9. **RF-R9-02**: `exists()` fail-closed 在顶层错误时返回 `false`（视为不存在）而非抛出；`console.warn` 记录事件供运维
10. **RF-R9-01**: `statusMessage` 运行时字段通过 safe cast 访问；若 SDK 在运行时移除 `statusMessage`，幂等检查会将所有非 SUCCESS 码视为失败（更严格，非 fail-open）

---

## 10. Codex 审计范围（GPT 通过后激活）

**模式**：READ_ONLY（不修改）

**范围**：
1. C-01 字符串 SUCCESS 合同 4 处判定点（put 补偿删除、getSignedUrl、objects.delete、objects.exists）+ fileID 匹配 + 空/不匹配 fileList 处理
2. **RF-R9-01**: SDK 派生类型（`IDeleteFileResult`/`IGetFileUrlResult` import + 联合类型 + `isSdkTopLevelError` 守卫 + `statusMessage` safe cast）
3. **RF-R9-02**: 顶层失败合同（8 测试 + 5 断言：fail-closed、metadata 保留、ledger 保留、稳定领域错误、message 无关性）
4. H-01 `project_unresolved_metadata` 集合 + `markUnresolvedMetadata` 方法 + ledger 保留逻辑 + AC-07 BLOCKER 解决方案
5. M-01 `ledgerUpdateFailed` 信号 + 调用方 retry 合同
6. `markUnresolvedMetadata` duck-typed 调用的并发安全性（read-modify-write，非事务）

---

## 11. 取代关系

| 被取代任务 | 取代原因 |
|-----------|----------|
| FINAL-CLOSURE-BATCH-01 | GPT FIX_REQUIRED 发现 C-01/H-01/M-01，FIX-R9 修复 |
| EVIDENCE-CORRECTION-02 | docs-only SHA 校正工作仍有效，但被 FIX-R9 生产代码变更取代 |
| EVIDENCE-CORRECTION-01 | 已被 EVIDENCE-CORRECTION-02 取代（历史记录） |

---

## 12. GPT 下一步行动

1. 证据复审本完成包 §0 RF-R9-01/02/03 补充摘要 + Trae Report §12 + gate evidence 文件
2. 验证 SDK 派生类型是否满足 RF-R9-01（`IDeleteFileResult`/`IGetFileUrlResult` import + 联合类型 + 编译期漂移检测）
3. 验证顶层失败合同是否满足 RF-R9-02（8 测试 + 5 项合同断言：fail-closed、metadata 保留、ledger 保留、稳定领域错误、message 无关性）
4. 验证证据包是否满足 RF-R9-03（SDK 类型、import、顶层错误逻辑、新测试名称、server 总数 462、HEAD、worktree clean、readyForPreview=false）
5. 验证 H-01/M-01 无回归（原始 R9 PASS 保持不变）
6. 通过后激活 Codex 限域 READ_ONLY 总审计（范围：FIX-R9 4 处判定点 + SDK 派生类型 + isSdkTopLevelError + markUnresolvedMetadata + ledgerUpdateFailed 信号）
7. Codex 通过后方可考虑解锁 Preview（仍需用户决策 + 真实 CloudBase 字符串状态码 + OCC 行为验证）

---

## 13. Trae 角色边界声明

- Trae 已完成 RF-R9-01/02/03 补充修复，状态保持 `awaiting_gpt_acceptance`
- Trae **未自行验收**，**未自行判定 AC-07 通过**（已由 H-01 修复，但需 GPT 确认）
- Trae **未合并 main**，**未部署**，**未执行真实 CloudBase 写入**
- `readyForPreview` 保持 `false`
- 生产代码修改与任务 ID `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R9` 一一对应
- RF-R9-01/02/03 不重写 H-01/M-01（已 PASS）

---

**EVIDENCE PROVIDED BY TRAE; NOT YET INDEPENDENTLY VERIFIED.**
