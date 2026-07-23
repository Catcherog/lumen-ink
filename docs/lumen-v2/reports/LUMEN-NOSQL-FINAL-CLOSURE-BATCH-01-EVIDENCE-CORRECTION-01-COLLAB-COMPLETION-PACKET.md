# picture-edit Collaboration Completion Packet

> ## ⚠️ SUPERSEDED by EVIDENCE-CORRECTION-02 (2026-07-23)
>
> This in-repo copy of the EVIDENCE-CORRECTION-01 completion packet has been **superseded**.
> The following stale values have been corrected by `LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-02`:
>
> - `HEAD = b7ec38d` → `b7ec38d` is **LAST_PRODUCTION_CHANGE_SHA**, not HEAD
> - `a858d7f..HEAD = a858d7f..b7ec38d6b93ce671295e8e641a74d4a8c0dc2fa5` → `a858d7f..<CURRENT_PACKET_HEAD>`
> - `13 commits` in `a858d7f..HEAD` → **14 commits** (verified via `git rev-list --count`)
>
> **Canonical source of truth**:
> - `docs/lumen-v2/reports/LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-02-TRAE-REPORT.md`
> - Desktop: `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md` (rewritten with `CURRENT_PACKET_HEAD`)
>
> The body below is preserved unchanged as a historical record.

**Task**: LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-01
**Project**: picture-edit / lumen-v2
**Owner**: Trae
**Date**: 2026-07-23
**Status**: `awaiting_gpt_acceptance` / `nextActor=gpt` / `readyForPreview=false`
**Risk Level**: HIGH

---

## Objective

修正最终审计范围和证据包，不解锁 Preview，不调用 Codex。本轮采用 docs/evidence-only 修正 — 未修改任何生产代码、测试代码或 mock 代码。

## Trigger

GPT 对 FINAL-CLOSURE-BATCH-01 下达 `FIX_REQUIRED` 裁决，指出：
1. AC-22 FAIL: diff 范围 `b61b6e0..b7ec38d` 排除了 FIX-R8 `0439924`
2. AC-04 NOT_PROVEN: 无真并发不同 snapshot 测试
3. AC-15 FIX_REQUIRED: 使用近似测试数量
4. Mock 无法证明的 SDK/OCC 项被错误标为 VERIFIED
5. idemId/versionId 外泄路径未检查
6. SESSION-HANDOFF.md 大量删除未解释
7. Gate 原始输出未保存

---

## EC-01: LAST_CODEX_AUDITED_SHA

**SHA**: `a858d7f`

**审计依据**: FIX-R4 Codex Audit 报告 (`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4-CODEX-AUDIT.md`) §1 明确记录：
- 适用 Base SHA: `87d0ba5` → Result `627bd7e` → State `a858d7f`（FIX-R3 范围）
- 审计日期: 2026-07-22
- 审计类型: READ_ONLY Codex Transaction Audit
- 7 个 Findings: CB-AUDIT-P0-01/P0-02/P1-01/P1-02/P1-03/P2-01/P2-02

后续所有提交（FIX-R4 `00ce304` → FIX-R8 `0439924` → HEAD `b7ec38d`）均未经 Codex 审计。

**验证**:
- `git merge-base --is-ancestor a858d7f HEAD` → TRUE
- `git merge-base --is-ancestor 043992435e95803fd1f592a7af48abdf95c3d04f HEAD` → TRUE

---

## EC-02: Diff Range Covers 0439924 and b7ec38d

**Diff Range**: `a858d7f..HEAD` (即 `a858d7f..b7ec38d6b93ce671295e8e641a74d4a8c0dc2fa5`)

覆盖 13 个提交：
```
b7ec38d  FINAL-CLOSURE-BATCH-01 (HEAD)
b61b6e0  FIX-R8 state transition
0439924  FIX-R8 concurrency hardening  ← 之前被排除，现已包含
44add08  FIX-R7 SHA backfill
fb7066a  FIX-R7 state transition
2e5df25  FIX-R7 service crash test correction
5d28b32  FIX-R6 state transition
ff6d33d  FIX-R6 cleanup ledger closure
98764ad  FIX-R5 SHA backfill
6b4b379  FIX-R5 two-phase delete + VERCEL_ENV
342541d  FIX-R4 state transition
00ce304  FIX-R4 tx-aware atomicity
47475ad  FIX-R3 review
```

**校正**: 之前使用 `b61b6e0..b7ec38d` 是错误的，因为它排除了 `0439924`（FIX-R8 实施提交）。

---

## EC-03: Complete Production-Code Diff

**文件**: `docs/lumen-v2/evidence/LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-01/production-code-diff.patch`
**大小**: 66,481 bytes
**格式**: 完整 patch（非 --stat）

**生产文件变更** (3 files, +938/-117):
| File | Changes |
|------|---------|
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | 755 lines (SDK type split, unwrapDocumentData, transaction refactor, METADATA_MISSING, IDEMPOTENT_VERSION_INCONSISTENT_STATE, removeCleanupKeys, persistentConflict) |
| `src/server/infrastructure/persistence/select.ts` | 173 lines added (PRODUCTION_STORAGE_PREFIX_REQUIRED, validatePreviewIsolation) |
| `src/server/services/ProjectService.ts` | 127 lines (removeCleanupKeys, METADATA_MISSING handling, completedKeys tracking) |

---

## EC-04: Categorized Diffs

所有 diff 已保存到 `docs/lumen-v2/evidence/LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-01/`:

| Category | Files | +Lines | -Lines | Patch File |
|----------|-------|--------|--------|------------|
| Production | 3 | 938 | 117 | production-code-diff.patch (66KB) |
| Test | 8 | 3,553 | 28 | test-code-diff.patch (165KB) |
| Mock | 1 | 300 | 65 | mock-code-diff.patch (22KB) |
| Config | 2 | 4 | 0 | config-diff.patch (647B) |
| Scripts | 1 | 245 | 0 | scripts-diff.patch (9KB) |
| Docs | 23 | 5,012 | 941 | docs-diff.patch (410KB) |
| **Total** | **38** | **10,052** | **1,151** | |

---

## EC-05: Raw Gate Output

**文件**: `docs/lumen-v2/evidence/LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-01/gate-results.md`

| Gate | Command | Working Dir | Exit Code | Status |
|------|---------|-------------|-----------|--------|
| Server tsc | `cd src/server; npx tsc --noEmit` | src/server | 0 | PASS |
| Server vitest | `cd src/server; npx vitest run` | src/server | 0 | PASS |
| Client tsc | `cd src/client; npx tsc --noEmit` | src/client | 0 | PASS |
| Client vitest | `cd src/client; npx vitest run` | src/client | 0 | PASS |
| Client eslint | `cd src/client; npx eslint .` | src/client | 0 | PASS |
| check-lumen-collab | `node scripts/check-lumen-collab.mjs` | repo root | 0 | PASS |
| readyForPreview=false | STATE.json field | repo root | 0 | PASS |
| Branch != main | `git branch --show-current` | repo root | 0 | PASS |

所有 8/8 门禁 PASS。原始输出（含测试摘要和 check-lumen-collab 输出）已直接保存。

---

## EC-06: Precise Test Counts and New Test Names

### 精确数量（无约数）

| Category | Test Count | File Count |
|----------|-----------|------------|
| Server | 442 | 35 |
| Client | 194 | 10 |
| **Total** | **636** | **45** |

### 13 个新测试 (`cloudbase.nosql.final-closure.test.ts`)

| # | Test Name | AC |
|---|-----------|----|
| 1 | tombstone barrier prevents new Storage keys after Phase A — snapshots are always identical | AC-04 |
| 2 | different snapshots (barrier failure) — existing ledger preserved, second call does not overwrite | AC-04 |
| 3 | two sequential deleteCascade calls — second is idempotent, ledger unchanged | AC-04 |
| 4 | removeCleanupKeys retry exhaustion — error propagates, ledger unchanged | AC-05 |
| 5 | deleteCascade Phase B retry exhaustion — project not partially deleted | AC-05 |
| 6 | runTransaction retries exactly MAX_TX_ATTEMPTS (3) times on persistent conflict | AC-05 |
| 7 | ProjectService.deleteProject treats METADATA_MISSING as probable success, logs warning | AC-06 |
| 8 | METADATA_MISSING key is removed from ledger (AC-07 BLOCKER condition verified) | AC-06/07 |
| 9 | objects.exists() returns false with METADATA_MISSING warning when metadata is missing | AC-06 |
| 10 | createIdempotent throws IDEMPOTENT_VERSION_INCONSISTENT_STATE when version doc is missing | AC-06 |
| 11 | ensureReady failure leaves no DB/Storage side effects, methods throw CLOUDBASE_NOT_READY | AC-10 |
| 12 | createCloudBaseNoSqlPersistence with missing config throws CLOUDBASE_CONFIG_REQUIRED | AC-10 |
| 13 | adapter methods throw CLOUDBASE_NOT_READY when ensureReady was never called | AC-10 |

---

## EC-07: AC-04 Concurrent Different-Snapshot Test

### 现有测试

AC-04 由 `final-closure.test.ts` 中 **3 个测试** + `cascade-boundary.test.ts` 中 **5 个测试** (T1-T5) 覆盖:

1. **Test 1** (正面): tombstone barrier 阻止 Phase A 后新 Storage keys → 保证两个并发 deleteCascade 看到相同 snapshot
2. **Test 2** (故障注入): 通过直接注入 mock state 模拟 barrier 失效 → 验证 AC-01 fix (`if (!existingLedger)`) 保留第一个调用的 ledger
3. **Test 3** (幂等): 顺序 deleteCascade 第二次为 no-op

### 评估: 非真并发

**现有测试不是真正的并发执行测试。** 它们使用:
- **Mock state injection** (Test 2): 直接操作 `MockCloudBaseState` 模拟不同 snapshot
- **preCommitHook** (T1-T5): 确定性单线程模拟并发提交顺序

### 已证明 vs 未证明

**已证明**:
- ✅ tombstone barrier 在正常条件下阻止不同 snapshot (Test 1)
- ✅ 如果 snapshot 不同 (barrier 失效), 第一个调用的 ledger 被保留 (Test 2 — AC-01 fix)
- ✅ 顺序幂等 re-delete 安全 (Test 3)
- ✅ OCC retry 在事务冲突下保留 ledger ownership (T1-T5)

**未证明**:
- ❌ 两个 deleteCascade 在真正并行线程中运行 (JavaScript 单线程, 但真实 CloudBase SDK 可能有不同并发语义)
- ❌ 真实 CloudBase SDK 的事务隔离级别和 snapshot 一致性保证

### 建议: DEFERRED_TO_FINAL_CODEX

真并发验证需要:
1. 真实 CloudBase SDK 并行事务 — **被 Stop Conditions 阻止** (无真实 CloudBase 写入)
2. 更复杂的 Mock 模拟线程调度 — **超出 evidence-only 修正范围**

**AC-04 不需要生产接口变更，不构成结构性阻塞。**

---

## EC-08: Mock-Unverifiable SDK/OCC Assumptions

以下两项之前被错误标为 VERIFIED，现更正为 `ASSUMPTION_TO_VERIFY`:

| # | Assumption | 之前 | 更正后 | 原因 |
|---|------------|------|--------|------|
| A-01 | 真实 CloudBase SDK 自动重试 DATABASE_TRANSACTION_CONFLICT | VERIFIED | **ASSUMPTION_TO_VERIFY** | Mock 的 retryOnConflict/persistentConflict 只验证 adapter 重试行为, 不验证真实 SDK 重试次数、冲突分类或 callback 语义 |
| A-02 | 真实事务读取进入 OCC read set (snapshot isolation) | VERIFIED | **ASSUMPTION_TO_VERIFY** | Mock 的 occReadTracking 只验证 adapter 先读后写, 不验证真实 SDK 提供 snapshot isolation |

**Mock 证明的**: adapter 在假定 SDK 合同下的行为（重试次数、OCC 模式、ledger 保留）
**Mock 未证明的**: 真实 SDK 的实际重试次数、冲突分类、callback 语义、事务隔离级别

这些必须由 Codex READ_ONLY 审计对照真实 SDK 文档验证, 或通过真实 CloudBase 环境集成测试验证（被 Stop Conditions 阻止）。

---

## EC-09: idemId/versionId Exposure Check

### 错误消息中的标识符

`cloudbase.nosql.ts` 中以下错误消息含 `idemId` 和/或 `versionId`:

**Line 919-921** (createIdempotent for versions):
```typescript
throw new Error(
  `IDEMPOTENT_VERSION_INCONSISTENT_STATE: idempotency record ${idemId} ` +
  `references version ${recheckDoc.versionId} but the version document is missing.`
);
```

**Line 1088** (createIdempotent for jobs):
```typescript
throw new Error(`IDEMPOTENCY_RESOLVE_FAILED: ${idemId}`);
```

### idemId 格式

`idemId` = `${projectId}__${idempotencyKey}` (内部复合 ID, 非凭据)
`versionId` = 版本文档的 UUID

### 外泄路径

Routes catch 块 (`projects.ts`, `jobs.ts`, `worker.ts`):
```typescript
} catch (err) {
  if (isDomainError(err)) {
    sendDomainError(res, err);  // 安全 — 使用 redactError()
    return;
  }
  res.status(500).json({
    message: err instanceof Error ? err.message : 'unknown error',  // ⚠️ 外泄路径
  });
}
```

`IDEMPOTENT_VERSION_INCONSISTENT_STATE` 和 `IDEMPOTENCY_RESOLVE_FAILED` 是 plain `Error`（非 `DomainError`），会走 `err.message` 分支返回给客户端。

### 风险评估

| 因素 | 评估 |
|------|------|
| 是否凭据? | **否** — projectId + idempotencyKey, 非 API key/token/password |
| 是否在 SENSITIVE_PATTERNS? | **否** — D-034 只匹配 data-uri/Bearer/JWT/sk-/URL 凭据/长 base64 |
| 是否在 SENSITIVE_KEYS? | **否** — D-034 只匹配 apikey/secret/password/token 等 |
| 是否通过 API 响应外泄? | **是** — routes catch 块返回 `err.message` |
| 风险级别 | **低** — 内部 ID, 非凭据; 但可能帮助攻击者枚举 project ID |

### 建议: DEFERRED_TO_FINAL_CODEX

本轮不改代码 (evidence-only)。Codex 审计应验证:
- 是否应将 `IDEMPOTENT_VERSION_INCONSISTENT_STATE` 和 `IDEMPOTENCY_RESOLVE_FAILED` 包装为 `DomainError`
- 是否应在 routes catch 块对非 DomainError 也应用 `redactError()`

如 Codex 要求修复, 可将 errorCode 设为 `IDEMPOTENCY_CONFLICT`（已有脱敏 publicMessage: "请求冲突，请勿重复提交"）。

---

## EC-10: SESSION-HANDOFF.md Deletion Explanation

### 实际 numstat

```
65      934     docs/lumen-v2/state/SESSION-HANDOFF.md
```

- **新增**: 65 行
- **删除**: 934 行

**注意**: GPT verdict 提到"约 1866 行删除" — 实际删除是 **934 行**, 非 1866。数字 1866 可能是对 `--stat` 输出的误读。

### 解释: 有意渐进压缩

934 行删除是**有意的, 非误删**。SESSION-HANDOFF.md 在 8 次提交中渐进压缩:

```
b7ec38d  FINAL-CLOSURE-BATCH-01 (最终压缩为 65 行精简格式)
b61b6e0  FIX-R8 state transition
fb7066a  FIX-R7 state transition
5d28b32  FIX-R6 state transition
98764ad  FIX-R5 SHA backfill
6b4b379  FIX-R5 implementation
342541d  FIX-R4 state transition
47475ad  FIX-R3 review (原始详细内容 ~952 行)
```

### 删除内容

被删除的 934 行是 **FIX-R3 时代的详细交接内容**, 包括:
- FIX-R3 实施核心结论
- 8 门禁结果表
- 文件变更表
- 详细风险清单

### 替代内容

65 行新增是**精简 FINAL-CLOSURE 格式**, 聚焦于:
- 当前状态: ready_for_final_gpt_review / nextActor=gpt
- AC-07 BLOCKER 登记
- Stop Conditions
- Codex 范围定义

### 历史保留

**无历史丢失。** 完整内容保留在:
1. **Git log**: `git log --oneline a858d7f..HEAD -- docs/lumen-v2/state/SESSION-HANDOFF.md`
2. **Per-round Trae Reports**: `docs/lumen-v2/reports/` 下各轮报告
3. **Per-round gate evidence**: `docs/lumen-v2/evidence/` 下各轮 gate 结果
4. **STATE.json**: 从 FIX-R1 到 FINAL-CLOSURE 的完整状态跟踪

**结论**: 有意压缩, 非误删。无需恢复。

---

## EC-11: Precise AC Matrix

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | PASS | concurrent Phase B preserves first call's ledger via OCC retry (2 tests) |
| AC-02 | PASS | concurrent removeCleanupKeys no resurrection via OCC retry (3 tests) |
| AC-03 | PASS | METADATA_MISSING in objects.delete/exists; ProjectService treats as probable success (4 tests) |
| AC-04 | PASS_WITH_LIMITATION | tombstone barrier + different snapshots via mock injection + sequential idempotent (3 tests). NOT true concurrency — DEFERRED_TO_FINAL_CODEX |
| AC-05 | PASS | retry exhaustion: removeCleanupKeys + Phase B + runTransaction 3 retries (3 tests) |
| AC-06 | PASS | METADATA_MISSING probable success + ledger cleared + exists() false + IDEMPOTENT_VERSION_INCONSISTENT_STATE (4 tests) |
| AC-07 | PASS_REGISTERED_BLOCKER | METADATA_MISSING clears ledger verified. BLOCKER registered, not self-resolved |
| AC-08 | DEFERRED_TO_FINAL_CODEX | Real SDK retry callback — Mock-proven only (A-01) |
| AC-09 | DEFERRED_TO_FINAL_CODEX | Real OCC read-set — Mock-proven only (A-02) |
| AC-10 | PASS | ensureReady failure no side effects + missing config + not ready (3 tests) |
| AC-11 | PASS | unwrapDocumentData<T>() + SDK types split |
| AC-12 | PASS | transaction interface no where() — fails at TypeScript stage |
| AC-13 | PASS | deleteCascade pre-fetches IDs + 100-op limit check + fail-closed |
| AC-14 | PASS | Storage deleteFile not called if DB tx fails; cleanup after DB commit |
| AC-15 | PASS | Storage cleanup failures preserve retry info; no inconsistent state |
| AC-16 | PASS | Preview/Production tests share Mock with data/Storage isolation |
| AC-17 | PASS | Concurrent idempotent transactions: single Job + idempotent record; zero orphans |
| AC-18 | PASS | NoSQL adapter handles different return structures via unwrapDocumentData<T>() |
| AC-19 | PASS | @cloudbase/node-sdk contract tests added without credentials |
| AC-20 | PASS | deleteCascade uses if (!existingLedger) check; OCC retry preserves first call's snapshot |
| AC-21 | PASS | removeCleanupKeys uses runTransaction() for atomic read-modify-write |
| AC-22 | PASS | Diff range corrected: a858d7f..HEAD covers FIX-R8 0439924 and HEAD b7ec38d |
| AC-23 | PASS | validatePreviewIsolation requires PRODUCTION_STORAGE_PREFIX; fail-closed |
| AC-24 | PASS | persistentConflict flag tests retry exhaustion (not consumed after one attempt) |
| AC-25 | PASS | Line 919-921: silent fallback replaced with IDEMPOTENT_VERSION_INCONSISTENT_STATE throw |
| AC-26 (idemId/versionId) | DEFERRED_TO_FINAL_CODEX | Internal IDs in error messages; leak path via routes; NOT credentials |

---

## EC-12: Repository State Verification

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Local HEAD | b7ec38d | b7ec38d6b93ce671295e8e641a74d4a8c0dc2fa5 | ✅ |
| Remote HEAD | b7ec38d | b7ec38d6b93ce671295e8e641a74d4a8c0dc2fa5 | ✅ |
| Local = Remote | TRUE | TRUE | ✅ |
| Worktree status | clean | clean (empty porcelain) | ✅ |
| Branch | lumen/nosql-final-closure-batch-01-trae | lumen/nosql-final-closure-batch-01-trae | ✅ |
| Branch != main | TRUE | TRUE | ✅ |
| readyForPreview | false | false (STATE.json line 164) | ✅ |

---

## Stop Conditions Compliance

| Condition | Status |
|-----------|--------|
| 不调用 Codex | ✅ 未调用 |
| 不合并 main | ✅ 在 lumen/nosql-final-closure-batch-01-trae 分支 |
| 不部署 | ✅ 未部署 |
| 不执行真实 CloudBase 写入 | ✅ 未执行 |
| 不切换 readyForPreview=true | ✅ 保持 false |
| 不重写已有 Git 历史 | ✅ 未重写 |
| AC-04 不需要生产接口变更 | ✅ 测试已存在, 不构成结构性阻塞 |

---

## Modified Files (This Round)

| File | Type | Description |
|------|------|-------------|
| `docs/lumen-v2/reports/LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01-EVIDENCE-CORRECTION-01-TRAE-REPORT.md` | new | 证据校正报告 |
| `docs/lumen-v2/evidence/.../gate-results.md` | new | 原始 gate 输出 |
| `docs/lumen-v2/evidence/.../production-code-diff.patch` | new | 完整生产代码 diff |
| `docs/lumen-v2/evidence/.../test-code-diff.patch` | new | 测试代码 diff |
| `docs/lumen-v2/evidence/.../mock-code-diff.patch` | new | Mock 代码 diff |
| `docs/lumen-v2/evidence/.../config-diff.patch` | new | 配置 diff |
| `docs/lumen-v2/evidence/.../scripts-diff.patch` | new | 脚本 diff |
| `docs/lumen-v2/evidence/.../docs-diff.patch` | new | 文档 diff |
| `docs/lumen-v2/state/STATE.json` | modified | evidenceCorrection01 字段 |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | modified | 证据校正章节 |

**未修改任何生产代码、测试代码或 mock 代码。**

---

## Next Steps

1. **GPT 证据复审** EVIDENCE-CORRECTION-01 Trae 报告
2. **GPT 验证** 12 项 EC 是否全部满足
3. **GPT 通过后** → 生成限域 Codex READ_ONLY 审计提示词
4. **Codex 审计范围**: `a858d7f..HEAD` production-code diff
5. **Codex 重点审计项**:
   - 真实 CloudBase SDK 重试/OCC 语义 (A-01, A-02)
   - 真并发不同 snapshot 安全性 (AC-04)
   - idemId/versionId 外泄路径 (EC-09)
   - AC-07 BLOCKER: METADATA_MISSING clears ledger
   - removeCleanupKeys read-modify-write atomicity
   - Tombstone barrier concurrency invariants

**readyForPreview 保持 false。未合并 main。未部署。未调用 Codex。**
