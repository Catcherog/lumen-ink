# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01

**任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`
**激活来源**：LUMEN-P0-PARALLEL-ACCELERATION-01 任务卡（GPT 授权，2026-07-21）
**风险等级**：HIGH
**Track**：B（与 HARDEN-001 并行）
**当前批次**：FIX-R4（待 Codex 只读审查结论返回后启动）
**状态**：`changes_requested / nextActor=codex`
**Codex 状态**：`REQUIRED_NOW_FOR_TX_AUDIT_R3`
**`readyForPreview`**：`false`（GPT R2 + Codex 通过前禁止配置 Preview / Production）

---

## 任务目标

完成 CloudBase NoSQL 生产适配器的真实代码修复，使其满足 D-040 契约收敛的全部业务不变量。

---

## 历史背景

### FIX-R1（FIX_REQUIRED，2026-07-21）

- **提交**：`1fba413`
- **GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **关键缺陷**：
  - P0-01：`f73c937..1fba413` diff 中 `cloudbase.nosql.ts` 和 `select.ts` 的 blob SHA 未变化，无实际代码修复
  - P0-02：使用 raw Mongo operators 而非 CloudBase `db.command`
  - P0-03：`uploadFile` 返回的 `fileID` 被丢弃
  - P0-04：Job 并发幂等存在孤儿 Job 风险；作用域为 `{ key }` 而非 `{ projectId, key }`
  - P0-05：`deleteCascade` 在事务内调用 Storage `deleteFile`，双重删除
  - P1-01：`CLOUDBASE_DATA_NAMESPACE` / `CLOUDBASE_STORAGE_PREFIX` 未实现
  - P1-02：`PERSISTENCE_BACKEND` 显式选择未实现

### FIX-R2（COMPLETE，2026-07-21）

- **Base SHA**：`f73c937`
- **Result SHA**：`63bd445`
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r2`
- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md`
- **修复范围**：NOSQL-R2-01 ~ NOSQL-R2-08（真实代码修改、db.command、Job 并发幂等、storageKey→fileID 映射、删除责任边界、namespace 隔离、显式 PERSISTENCE_BACKEND、10 场景真实行为测试）
- **8 门禁**：client 194 + server 317 = 511 root tests PASS

### FIX-R3（REJECTED_CODEX_REQUIRED，2026-07-22）

- **子任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT`
- **Base SHA**：`87d0ba5`
- **Result SHA**：`627bd7e`
- **State Commit SHA**：`a858d7f`
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r3`
- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md`
- **GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`
- **GPT 裁决**：`CODEX_REQUIRED`（2026-07-22）
- **8 门禁**：client 194 + server 331 = 525 root tests PASS（仅 Mock/类型/既有测试通过，未覆盖 NoSQL 适配器与服务层组合后的真实事务边界）

#### R3 实施范围（AC-01 ~ AC-12）

1. **AC-01**：`unwrapDocumentData<T>(data)` 统一处理 array / single-doc / null
2. **AC-02**：Mock `tx.collection().doc().get()` 返回单文档/null（非数组）
3. **AC-03**：SDK 类型拆分（DatabaseCollectionRef / TransactionCollectionRef / DocumentGetResult / TransactionDocumentGetResult）
4. **AC-04**：4 处非事务 `where()` 迁移到 `getDb().collection().where()` ⚠️ **GPT 驳回：语法通过但集成语义失败**
5. **AC-05**：`deleteCascade` 重写为预取 doc ID + 100-op 上限检查
6. **AC-06/07/08**：3 个新测试验证 Storage 边界
7. **AC-09**：Prod + Preview 共享同一个 `MockCloudBaseState`
8. **AC-10**：2 个新测试验证并发幂等
9. **AC-11**：8 门禁全绿，525 root tests
10. **AC-12**：`readyForPreview=false` 保持
11. **SDK 契约测试**：7 个测试验证安装版 `@cloudbase/node-sdk@^3.18.3` API 表面（⚠️ GPT 备注：应降级描述为 API surface smoke test）

#### GPT R3 裁决的阻断缺陷

##### P0-01：条件 Job 更新逃逸外层事务

`updateIfClaimed()` / `updateIfActive()` 通过 `getDb().collection().where().update()` 绕过 AsyncLocalStorage 事务。在 `UnitOfWork.run()` 内调用时写入立即落到事务外，可能导致 Job `succeeded` + 外层事务 commit 失败 → Asset/Project 指针回滚 → Job 指向不存在结果。

##### P0-02：`versions.createIdempotent()` 创建独立嵌套事务

仓储方法无条件调用 `getDb().runTransaction()` 而非复用当前事务。Version/idempotency 可能在内层事务先行提交，外层事务失败后留下部分提交。否定"ONE UnitOfWork"核心业务不变量。

##### P1-01：项目删除双重预取竞态

`ProjectService` 预取 + `deleteCascade` 事务外重新预取，两个快照之间可能产生新 Asset/Version。"new doc orphan is harmless" 注释不成立。

##### P2-01：SDK contract 测试证明范围被高估（非阻断）

测试验证 SDK 方法存在但未真正调用事务或验证 `tx.doc().get()` 返回结构。应降级描述为 "API surface smoke test"。

#### GPT R3 缺失的关键测试覆盖

1. 外层 UoW 最终提交失败时，Job 不得已是 `succeeded`
2. `versions.createIdempotent()` 在已有外层事务时不得独立提交
3. Job 条件更新、Version idempotency、Asset 和 Project 指针必须全成或全败
4. 删除与 Generation 结果提交并发时，不得产生 DB 或 Storage orphan
5. 删除预取后新增 Asset 的确定性交错测试

---

## FIX-R4 最低修复范围（Trae 实施，必须在 Codex 审查结论返回后启动）

> **重要**：Trae 不得在 Codex 审查结论返回前自行启动 FIX-R4 实施。

1. **事务感知的 Job 条件更新路径**：
   - 无事务上下文时，可继续使用 `where().update()`
   - 有事务上下文时，必须使用当前 `tx.collection(...).doc(id).get()`，校验 lease/status 后再用同一事务的 `doc(id).update()`
   - 不得通过 `getDb()` 逃逸

2. **禁止 `versions.createIdempotent()` 在已有 UoW 中打开独立事务**：
   - 复用当前事务，或设计明确的 current-or-new transaction helper
   - 保证 Version、idempotency、Asset、Project pointer、Job success 同一提交边界

3. **增加外层 commit failure 回归测试**：
   - 强制最终 commit 抛错
   - 断言 Job 未成功
   - Version、Asset、idempotency、Project pointer 均无部分提交

4. **解决删除竞态**：
   - 至少引入 deletion lock/tombstone，使 Generation/Create child 在同一项目记录上参与事务冲突
   - Storage key 快照必须在项目进入稳定 deleting 状态之后获取
   - 不接受"孤儿无害"的处理

5. **修正文档**：
   - R3 commit 实际不仅含 4 个代码文件，也包含报告和状态文件
   - SDK contract test 的证明范围改为 API surface，不声称验证未执行的事务返回行为
   - `a858d7f` 确实只是结果 SHA 回填提交

---

## Codex 只读审查指令（READ_ONLY）

- **Task ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-CODEX-TX-AUDIT-R3`
- **Mode**：`READ_ONLY`
- **Risk Level**：`HIGH`
- **Objective**：审查 FIX-R3 是否真正满足 CloudBase NoSQL 下的跨仓储原子成功边界，并为 Trae 输出最小 FIX-R4 修复方案。**不得修改、提交或推送代码。**
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
- **Mandatory Questions**（7 项，详见 GPT 评审文件 §7）：
  1. `updateIfClaimed` 在 `UnitOfWork.run` 内通过 `getDb().collection().where().update` 是否逃逸外层事务？
  2. `versions.createIdempotent` 内部 `getDb().runTransaction` 是否造成独立提交？
  3. 外层事务 commit 失败时是否可能留下 `succeeded` Job + 已提交 Version/idempotency + 回滚 Asset/Project？
  4. 如何在不修改冻结 `PersistenceDependencies` 接口前提下实现事务感知的 `updateIfClaimed`/`updateIfActive`？
  5. 如何避免 `createIdempotent` 在已有事务中启动嵌套独立事务？
  6. `ProjectService` Storage key 预取与 `deleteCascade` 子 ID 预取之间是否存在并发 orphan 风险？
  7. 最小 FIX-R4 应新增哪些确定性交错和 commit-failure 测试？
- **Required Output**：Verdict / Confirmed P0/P1 / Exact functions+lines / Minimum safe design / Required tests / PersistenceDependencies 能否保持冻结 / 显式声明未修改任何文件
- **Stop Conditions**：不修改代码、不创建 commit/PR、不使用生产凭据、不授权 Preview

---

## 分支策略

- **FIX-R3 分支**：`lumen/cloudbase-nosql-implement-01-fix-r3`（当前，包含 GPT R3 评审文件落盘）
- **FIX-R2 分支**：`lumen/cloudbase-nosql-implement-01-fix-r2`（保留参考，HEAD `63bd445`）
- **FIX-R1 分支**：`lumen/cloudbase-nosql-implement-01-fix-r1`（保留参考，HEAD `1fba413`）
- **FIX-R4 分支**：`lumen/cloudbase-nosql-implement-01-fix-r4`（待 Codex 审查结论返回后由 Trae 创建）
- 独立 worktree：`.worktrees/cloudbase-nosql-implement-01-fix-r3`

---

## 验收门禁

8 门禁全绿：
1. Client lint：0 errors
2. Client tsc --noEmit：PASS
3. Client tests：PASS
4. Server tsc --noEmit：PASS
5. Server tests：PASS
6. Root tests：PASS
7. Build：PASS
8. check-lumen-collab：PASS（无密钥/Secret/fileID 泄露）

---

## 范围遵守

- 不修改 PERSIST-001 业务逻辑（除 NoSQL adapter 修复外）
- 不修改 `/api/worker/recover`、Cron 配置、ROUTING 代码
- 不修改认证 middleware
- 不混入 HARDEN-001C 分支
- 不创建 Production Deployment
- 不配置 Production NoSQL 环境变量
- 不使用 Production API Key

---

## Stop Conditions

在以下条件满足前，禁止：
- 合并 NoSQL 到 main
- 配置 Vercel Preview NoSQL
- 标记 `READY_FOR_PREVIEW`
- 使用 Production API Key
- 运行 Production 数据迁移或写入
- Trae 在 Codex 审查结论返回前自行启动 FIX-R4 实施
- Codex 修改代码、创建 commit/PR、使用生产凭据、授权 Preview

---

## Review History

### 2026-07-22 — FIX-R3 GPT 裁决

- **Verdict**：`CODEX_REQUIRED`
- **Result SHA**：`627bd7e`
- **State Commit SHA**：`a858d7f`
- **GPT 评审文件**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`
- **关键缺陷**：
  - P0-01：条件 Job 更新逃逸外层事务（`getDb().where().update` 绕过 AsyncLocalStorage 事务）
  - P0-02：`versions.createIdempotent()` 创建独立嵌套事务（无条件 `getDb().runTransaction()`）
  - P1-01：项目删除双重预取竞态
  - P2-01：SDK contract 测试证明范围被高估（非阻断）
- **缺失测试**：外层 commit failure 回归、createIdempotent 嵌套事务隔离、Job/Version/Asset/Project 全成全败、删除并发 orphan、删除预取后新增 Asset 确定性交错
- **下一步**：Codex 限定只读事务审查 → Trae 实施 FIX-R4
- **转为**：`changes_requested / nextActor=codex`（FIX-R4 待 Codex 审查结论返回后启动）

### 2026-07-21 — FIX-R1 GPT 裁决

- **Verdict**：`FIX_REQUIRED`
- **Result SHA**：`1fba413`
- **关键缺陷**：blob SHA 未变化（无实际代码修复）
- **GPT 评审文件**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **转为**：FIX-R2（`changes_requested / nextActor=trae`）

---

## 相关文件

- **FIX-R3 Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md`
- **FIX-R3 证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md`
- **FIX-R3 GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`
- **FIX-R3 完成包**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-COMPLETION-PACKET.md`
- **FIX-R2 Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md`
- **FIX-R1 Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-TRAE-REPORT.md`
- **FIX-R1 GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **PoC 证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/poc-gate-p0.md`
- **CloudBase Env**：`zeh-d7glqc07me2155c61`
- **API Key Name**：`lumen-prod-nosql`（ID `RmGPjV2rQDOa2kVQj0M9jQ`，不过期）
