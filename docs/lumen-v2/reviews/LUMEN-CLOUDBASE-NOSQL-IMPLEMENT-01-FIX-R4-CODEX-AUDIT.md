# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4 — Codex Authoritative Audit

**任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R4`
**审计来源**：用户任务描述（FIX-R3 GPT 评审文件为空，用户直接提供 Codex Findings 作为权威清单）
**审计类型**：READ_ONLY Codex Transaction Audit
**审计日期**：2026-07-22
**适用 Base SHA**：`87d0ba5` → Result `627bd7e` → State `a858d7f`（FIX-R3 范围）
**实施分支**：`lumen/cloudbase-nosql-implement-01-fix-r4`（基于 `47475ad`）

---

## 1. Authoritative Findings

以下 Findings 由 Codex 输出，作为 FIX-R4 的权威缺陷清单。Trae 实施必须关闭所有 P0/P1 项，并修正 P2 项的测试声明范围。

### CB-AUDIT-P0-01：Job 条件更新逃逸外层 UnitOfWork

**严重度**：P0（阻断）
**位置**：`src/server/infrastructure/persistence/cloudbase.nosql.ts`
- `updateIfClaimed()`（原 811-831 行）
- `updateIfActive()`（原 836-855 行）
- 同类 `claim()`（原 867-894 行）
- 同类 `heartbeat()`（原 899-916 行）

**缺陷**：上述方法通过 `getDb().collection(COLLECTIONS.jobs).where(query).update(update)` 绕过 AsyncLocalStorage 中的当前 transaction。在 `UnitOfWork.run()` 内调用时，写入立即落到事务外，破坏原子提交边界。

**真实 SDK 行为验证**：
- `node_modules/@cloudbase/database/src/transaction/index.ts` 第 55 行：`Transaction.collection()` 返回的 `CollectionReference` 携带 `_transactionId`
- `node_modules/@cloudbase/database/src/document.ts` 第 247 行：`DocumentReference.update()` 的请求参数包含 `transactionId: this._transactionId`
- `node_modules/@cloudbase/database/src/collection.ts` 第 89-91 行：`CollectionReference.add()` 当 `_transactionId` 存在时附加到请求

**结论**：`getDb().collection()` 创建无 `_transactionId` 的 CollectionReference，导致 `where().update()` 不参与当前事务。修复必须使用 `collection(COLLECTIONS.jobs).doc(id)` 路径（携带 transactionId）进行读-校验-写。

### CB-AUDIT-P0-02：Version/idempotency 开启独立嵌套事务

**严重度**：P0（阻断）
**位置**：`src/server/infrastructure/persistence/cloudbase.nosql.ts`
- `versions.createIdempotent()`（原 611-666 行）
- `jobs.createIdempotent()`（原 719-784 行）

**缺陷**：上述方法无条件调用 `getDb().runTransaction(async (tx) => {...})`。在 `UnitOfWork.run()` 内调用时，内层事务独立提交，外层事务失败后留下已提交的 Version/idempotency mapping/Job。

**真实 SDK 行为验证**：
- `node_modules/@cloudbase/database/src/transaction/index.ts` 第 98-153 行：`runTransaction` 每次调用创建新的 `Transaction` 实例并独立 `init()` / `commit()`，无嵌套复用机制
- 第 146-148 行：仅当 `error.code === DATABASE_TRANSACTION_CONFLICT.code` 时重试，重试整个 callback

**结论**：CloudBase SDK 不支持事务复用。修复必须在 adapter 内部实现 current-or-new transaction helper，复用 AsyncLocalStorage 中的当前 transaction；不存在时才调用 `getDb().runTransaction()`。

### CB-AUDIT-P1-01：Cascade delete 使用事务外快照

**严重度**：P1（阻断）
**位置**：
- `src/server/infrastructure/persistence/cloudbase.nosql.ts` — `projects.deleteCascade()`（原 530-577 行）
- `src/server/services/ProjectService.ts` — `deleteProject()`（原 300-327 行）

**缺陷**：
1. `deleteCascade()` 在事务外使用 `getDb().collection(collName).where({ projectId: id }).get()` 预取子记录 ID
2. `ProjectService.deleteProject()` 在调用 `deleteCascade()` 前又预取 `assets.listByProject()` 获取 storageKeys
3. 两次预取之间可能新增 Asset/Version/Job；"new doc orphan is harmless" 注释不成立
4. 缺少 tombstone 屏障，删除期间 child create 路径不 fail closed

**结论**：修复必须引入 tombstone 屏障，删除开始前原子标记 Project 为 deleting；所有 child create 路径在写入前检查 tombstone；稳定子记录集合在 tombstone 屏障后取得。

### CB-AUDIT-P1-02：Object/metadata 映射不是失败原子的

**严重度**：P1（阻断）
**位置**：`src/server/infrastructure/persistence/cloudbase.nosql.ts` — `objects` 实现（原 956-1008 行）

**缺陷**：
1. **Upload**：`objects.put()` 先 `uploadFile()` 后 `saveFileMetadata()`；metadata 失败时留下对象孤儿
2. **Delete**：`objects.delete()` 不检查 SDK `fileList[]` 中每一项状态码；API 返回成功即假定所有对象删除成功
3. **Signed URL**：`objects.getSignedUrl()` 不检查 SDK 状态码；单文件失败未抛错
4. **Exists**：`objects.exists()` 仅检查 metadata，不检查远端对象存在性；无法区分"metadata 存在但对象不存在"

**结论**：修复必须实现补偿删除（upload 成功 + metadata 失败时）、per-item 状态码检查（delete/signedURL）、远端对象存在性检查（exists）。

### CB-AUDIT-P1-03：普通 Preview 应用启动路径没有生产隔离硬门禁

**严重度**：P1（阻断）
**位置**：`src/server/infrastructure/persistence/select.ts`（原 96-175 行）

**缺陷**：
1. 部署模式 + `cloudbase-nosql` backend 路径仅调用 `validateCloudBaseNoSqlConfig()` 检查必填字段
2. 缺少 `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` 检查
3. 缺少 Preview namespace 与 Production namespace 经 `trim().toLowerCase()` 归一化后的相等性检查
4. 缺少 `prod` 子串防线（namespace 和 storage prefix 均缺）
5. 缺少 Preview storage prefix 与 Production storage prefix 相等性检查
6. 无 Smoke Harness 存在（仓库内未找到相关文件）

**结论**：修复必须将 Production 隔离门禁放入普通 selector 初始化路径，在 SDK import 前执行；抽取无副作用纯函数供 selector 和未来 Smoke Harness 共用。

### CB-AUDIT-P2-01：SDK contract 测试名称与证明范围过强

**严重度**：P2（非阻断，需修正声明）
**位置**：`src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts`

**缺陷**：测试名称声称验证 SDK transaction 行为，实际仅验证 API 表面（方法存在、可调用）。未真正调用 transaction、未验证 `tx.doc().get()` 返回结构、未验证 transactionId 传播。

**结论**：修正测试名称为 "API surface smoke test"；新增基于安装版 SDK 源码或可控 fake transport 的 transactionId 行为测试；真实服务端行为标为 `UNVERIFIED_PENDING_PREVIEW`。

### CB-AUDIT-P2-02：jobs.create(...idempotencyKey) 不是原子入口

**严重度**：P2（非阻断，需修复）
**位置**：`src/server/infrastructure/persistence/cloudbase.nosql.ts` — `jobs.create()`（原 687-703 行）

**缺陷**：当 `input.idempotencyKey` 存在时，`jobs.create()` 执行两次非事务写入（Job + idempotency mapping）。第二次写入失败会留下孤儿 Job。

**结论**：二选一修复：
1. 带 idempotencyKey 时委托 `createIdempotent()`；或
2. 明确拒绝该参数，强制调用 `createIdempotent()`

不得继续保留两次非事务写入路径。

---

## 2. SDK Source Verification (Authoritative)

以下结论基于 `node_modules/@cloudbase/database/src/` 和 `node_modules/@cloudbase/node-sdk/types/db.d.ts` 的实际源码验证，作为 FIX-R4 实施的 SDK 行为依据。

### 2.1 Transaction ID 传播机制

| 调用路径 | 是否携带 transactionId | 源码位置 |
|---------|----------------------|---------|
| `db.collection(name).add()` | 否（非事务） | collection.ts:89-91 |
| `db.collection(name).doc(id).get/update/set/remove` | 否（非事务） | document.ts:247 |
| `tx.collection(name).add()` | 是 | collection.ts:55, 89-91 |
| `tx.collection(name).doc(id).get/update/set/remove` | 是 | document.ts:57, 247 |
| `db.collection(name).where(query).update()` | 否（非事务） | query.ts |

**关键结论**：`getDb().collection().where().update()` 永远不携带 transactionId。即使在 `unitOfWork.run()` callback 内调用，写入也立即落到事务外。

### 2.2 Transaction 重试语义

| 行为 | 源码位置 |
|------|---------|
| 默认重试 3 次 | transaction/index.ts:100 `times: number = 3` |
| 仅冲突错误触发重试 | transaction/index.ts:146 `error.code === ERRORS.DATABASE_TRANSACTION_CONFLICT.code` |
| 重试时重新执行整个 callback | transaction/index.ts:147 `runTransaction.bind(this)(callback, --times)` |
| 未捕获错误自动 rollback | transaction/index.ts:121-129 |
| init 失败直接抛出（不重试） | transaction/index.ts:117-119 |

**关键结论**：
1. transaction callback 可能被重试执行多次（默认 3 次）。callback 必须是幂等的或能正确处理重试。
2. 重试期间，前一次 callback 的所有副作用（包括 `tx.collection().add()` 写入）都会被 rollback，不会留下部分提交。
3. **但是**：callback 内如果调用了 `getDb().runTransaction()`（嵌套事务），内层事务的 commit 是独立的，外层 rollback 不会撤销内层 commit。这就是 P0-02 的根本原因。

### 2.3 Transaction doc().get() 返回结构

| 上下文 | 返回结构 | 源码位置 |
|--------|---------|---------|
| 非事务 `db.collection().doc().get()` | `{ data: unknown[] }`（数组） | document.ts:340-345 |
| 事务 `tx.collection().doc().get()` | `{ data: unknown \| null }`（单文档或 null） | document.ts:346-348 |

**关键结论**：FIX-R3 的 `unwrapDocumentData<T>()` helper 正确处理了两种返回结构。FIX-R4 实施时继续使用此 helper。

### 2.4 Transaction 集合能力限制

| 操作 | 非事务 `db.collection()` | 事务 `tx.collection()` |
|------|------------------------|----------------------|
| `add()` | ✅ | ✅ |
| `doc(id)` | ✅ | ✅ |
| `doc(id).get/update/set/remove` | ✅ | ✅ |
| `where()` | ✅ | ❌（类型层面已禁止） |
| `count()` | ✅ | ❌（类型层面已禁止） |

**关键结论**：事务内无法使用 `where().update()` 进行条件更新。P0-01 的修复必须改为 `doc(id).get()` + 内存校验 + `doc(id).update()` 的读-校验-写模式。

---

## 3. Codex Escalation Assessment

对任务描述中"Codex Escalation Conditions"的逐项评估：

| 条件 | 是否触发 | 评估依据 |
|------|---------|---------|
| 1. 必须修改公开 persistence interface | 否 | Tombstone 通过独立的内部 `project_tombstones` 集合实现，不修改 `Project` 接口 |
| 2. 真实 SDK 对 transaction document update 的行为无法通过本地源码确认 | 否 | 已通过 `node_modules/@cloudbase/database/src/` 源码确认（见 §2） |
| 3. 删除 tombstone 需要数据迁移或破坏兼容性 | 否 | 独立 tombstone 集合与现有文档并存，无 schema 变更 |
| 4. Storage 补偿需要新的外部服务 | 否 | 补偿使用现有 `app.deleteFile()` API |
| 5. 无法在不联网情况下建立关键测试 | 否 | Mock 基础设施可扩展支持 fault injection |
| 6. 修复涉及超过两个额外核心模块 | 否 | 仅修改 persistence 层现有文件（cloudbase.nosql.ts, select.ts, cloudbase.nosql.mock.ts, 测试文件） |
| 7. 外层 transaction retry 语义与当前 service architecture 根本冲突 | 否 | SDK 冲突重试默认 3 次；补偿逻辑仅在所有重试耗尽后运行 |
| 8. Trae 连续两轮无法通过同一项 P0 测试 | 待定 | 实施期间监控 |

**结论**：无 Codex escalation 触发，继续按 FIX-R4 任务描述实施。

---

## 4. Implementation Strategy (Workstream Mapping)

| Workstream | 对应 Finding | 修改文件 | 新增测试 |
|-----------|------------|---------|---------|
| A: 统一事务复用 | P0-01, P0-02 基础 | cloudbase.nosql.ts | transaction.test.ts |
| B: Job 条件更新 | P0-01 | cloudbase.nosql.ts | transaction.test.ts |
| C: Version/idempotency | P0-02 | cloudbase.nosql.ts | transaction.test.ts |
| D: jobs.create(idempotencyKey) | P2-02 | cloudbase.nosql.ts | transaction.test.ts |
| E: Tombstone 屏障 | P1-01 | cloudbase.nosql.ts, ProjectService.ts | cascade.test.ts |
| F: 100-op 边界 | P1-01 | （仅测试） | cascade.test.ts |
| G: Storage 一致性 | P1-02 | cloudbase.nosql.ts, cloudbase.nosql.mock.ts | storage.test.ts |
| H: Preview 隔离 | P1-03 | select.ts | preview-isolation.test.ts |
| I: 测试声明修正 | P2-01 | cloudbase.nosql.sdk-contract.test.ts | （重命名 + 新增） |

---

## 5. Frozen Constraints (实施期间必须保持)

- `readyForPreview=false`
- 不配置 Preview 凭据
- 不执行真实 CloudBase API 或 Storage 写入
- 不创建 Vercel / CloudBase 部署
- 不合并主线
- 不修改冻结的公开 persistence interface（`persistence.ts`）
- 不升级 `@cloudbase/node-sdk`
- 不用 Mock 行为替代真实 SDK 源码契约

---

## 6. References

- 任务描述：用户消息（FIX-R4 READY_FOR_TRAE_EXECUTION）
- FIX-R3 任务卡：`docs/lumen-v2/tasks/active/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01.md`
- FIX-R3 GPT 评审：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`（空文件，本审计替代）
- SDK 源码：
  - `src/server/node_modules/@cloudbase/database/src/transaction/index.ts`
  - `src/server/node_modules/@cloudbase/database/src/collection.ts`
  - `src/server/node_modules/@cloudbase/database/src/document.ts`
- 冻结接口：`src/server/domain/persistence.ts`

---

**审计状态**：COMPLETE
**Trae 实施授权**：用户任务描述 `Status: READY_FOR_TRAE_EXECUTION`
**下一步**：Workstream A — 实现 `withCurrentOrNewTransaction` helper
