# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01

**任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`
**激活来源**：LUMEN-P0-PARALLEL-ACCELERATION-01 任务卡（GPT 授权，2026-07-21）
**风险等级**：HIGH
**Track**：B（与 HARDEN-001 并行）
**当前批次**：FIX-R2
**状态**：`changes_requested / nextActor=trae`
**Codex 状态**：`REQUIRED_AFTER_R2`
**`readyForPreview`**：`false`（GPT R2 + Codex 通过前禁止配置 Preview / Production）

---

## 任务目标

完成 CloudBase NoSQL 生产适配器的真实代码修复，使其满足 D-040 契约收敛的全部业务不变量。本轮（FIX-R2）针对 FIX-R1 GPT 裁决（`FIX_REQUIRED`，2026-07-21）发现的 5 个 P0 阻塞和 2 个 P1 缺陷进行真实代码修复。

---

## 历史背景

- **FIX-R1 提交**：`1fba413`（已 push 到 origin）
- **FIX-R1 GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **FIX-R1 裁决**：`FIX_REQUIRED`（2026-07-21）
- **关键缺陷**：
  - P0-01：`f73c937..1fba413` diff 中 `cloudbase.nosql.ts` 和 `select.ts` 的 blob SHA 未变化，无实际代码修复
  - P0-02：使用 raw Mongo operators 而非 CloudBase `db.command`
  - P0-03：`uploadFile` 返回的 `fileID` 被丢弃
  - P0-04：Job 并发幂等存在孤儿 Job 风险；作用域为 `{ key }` 而非 `{ projectId, key }`
  - P0-05：`deleteCascade` 在事务内调用 Storage `deleteFile`，双重删除
  - P1-01：`CLOUDBASE_DATA_NAMESPACE` / `CLOUDBASE_STORAGE_PREFIX` 未实现
  - P1-02：`PERSISTENCE_BACKEND` 显式选择未实现

---

## FIX-R2 必修范围（NOSQL-R2-01 ~ NOSQL-R2-08）

### NOSQL-R2-01：重新建立真实代码审查区间

- 从 `f73c937` 或当前 NoSQL 分支 HEAD 创建新修复提交
- 新完成包必须给出明确的 `Base SHA` 和 `Result SHA`
- `git diff Base..Result` 必须包含：
  - `src/server/infrastructure/persistence/cloudbase.nosql.ts`
  - `src/server/infrastructure/persistence/select.ts`
  - 真实新增/修改测试

### NOSQL-R2-02：使用 CloudBase `db.command`

- 初始化后保存 command：`const command = db.command;`
- 所有查询和 patch 必须使用 CloudBase command objects：
  - `_.nin(...)` 替代 `{ $nin: ... }`
  - `_.in(...)` 替代 `{ $in: ... }`
  - `_.lte(...)` 替代 `{ $lte: ... }`
  - `_.or(...)` 替代 `$or: [...]`
  - `_.set(...)` 替代 `$set: {...}`
  - `_.remove()` 替代 `$unset: {...}`
- 禁止继续直接发送 raw Mongo operators

### NOSQL-R2-03：修复 Job 并发幂等

- 保证 Job 和 idempotency 映射原子创建：
  - 选项 A：在 repository 内部执行 `runTransaction`
  - 选项 B：先原子占用唯一 idempotency 记录，再创建 Job
  - 选项 C：使用确定性 Job ID / reservation 状态
- 唯一索引：`(projectId, idempotencyKey)`
- 验收证明并发 N≥2 时：
  - `generation_jobs` 数量 = 1
  - `job_idempotency` 数量 = 1
  - 所有调用返回同一个 `job.id`
  - `executor enqueue` 次数 = 1

### NOSQL-R2-04：建立 storageKey → fileID 映射

- 必须明确选择一种模型：
  - 选项 A：Asset 增加/复用字段保存真实 CloudBase fileID
  - 选项 B：建立 object metadata collection
  - 选项 C：通过 envId + cloudPath 可靠构造并验证 fileID
- 禁止丢弃 `uploadFile()` 返回值
- `get/delete/exists/getSignedUrl` 必须使用有效 `fileID`
- `signedUrlTtlSeconds` 落实到 `maxAge`
- `exists` 只吞明确 not-found

### NOSQL-R2-05：恢复删除责任边界

- `projects.deleteCascade()` 只删除数据库元数据
- 禁止在数据库 transaction callback 内调用：
  - `uploadFile`
  - `deleteFile`
  - `downloadFile`
  - `getTempFileURL`
- 对象清理继续由 `ProjectService.deleteProject()` 在元数据事务提交后执行
- 对象删除失败记录在 `cleanupFailures`

### NOSQL-R2-06：实现环境隔离

- 至少实现：
  - `CLOUDBASE_DATA_NAMESPACE`：所有集合名统一加 namespace
  - `CLOUDBASE_STORAGE_PREFIX`：所有 cloudPath 统一加 storage prefix
- Preview 与 Production 配置缺失时 fail closed
- 不允许 Preview 默认使用 Production namespace

### NOSQL-R2-07：实现显式后端选择

- 引入：
  - `PERSISTENCE_BACKEND=local`
  - `PERSISTENCE_BACKEND=cloudbase-postgres`
  - `PERSISTENCE_BACKEND=cloudbase-nosql`
- Production 未配置或值非法时 fail closed
- 不得再通过 API Key 是否存在来隐式决定后端

### NOSQL-R2-08：增加真实行为测试

最低测试矩阵：

| 场景                              | 要求                       |
| ------------------------------- | ------------------------ |
| 跨 repository transaction commit | 全部提交                     |
| callback throw rollback         | 全部回滚                     |
| 并发 Job idempotency              | 仅一个 Job                  |
| 并发 claim                        | 仅一个 worker 成功            |
| terminal Job update             | 返回 null，不回退              |
| JobPatch null                   | 使用 `command.remove()`    |
| Storage lifecycle               | put/get/url/delete 全链路   |
| deleteProject DB failure        | Storage 不得提前删除           |
| deleteProject Storage failure   | 元数据已删，cleanupFailures 有值 |
| Preview namespace               | 不可读取 Production 数据       |

真实 CloudBase 集成测试可以作为独立、受控 Gate，不要求纳入每次普通单元测试。

---

## 分支策略

- **FIX-R2 分支**：`lumen/cloudbase-nosql-implement-01-fix-r2`（从 `f73c937` 创建）
- **FIX-R1 分支**：`lumen/cloudbase-nosql-implement-01-fix-r1`（保留参考，HEAD `1fba413`）
- 独立 worktree：`.worktrees/cloudbase-nosql-implement-01-fix-r2`

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

---

## Review History

### 2026-07-21 — FIX-R1 GPT 裁决

- **Verdict**：`FIX_REQUIRED`
- **Result SHA**：`1fba413`
- **关键缺陷**：blob SHA 未变化（无实际代码修复）
- **GPT 评审文件**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **转为**：FIX-R2（`changes_requested / nextActor=trae`）

---

## 相关文件

- **FIX-R1 Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-TRAE-REPORT.md`
- **FIX-R1 证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r1-gate-results.md`
- **FIX-R1 GPT 评审**：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R1-GPT-REVIEW.md`
- **PoC 证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/poc-gate-p0.md`
- **CloudBase Env**：`zeh-d7glqc07me2155c61`
- **API Key Name**：`lumen-prod-nosql`（ID `RmGPjV2rQDOa2kVQj0M9jQ`，不过期）
