# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R1 GPT Review

**审查日期**：2026-07-21
**审查方式**：基于用户提交的统一完成包及 GitHub 上对应 SHA 的实际文件内容
**Base SHA**：`f73c937`
**Result SHA**：`1fba413`
**Verdict**：`FIX_REQUIRED`

---

## Overall Verdict

- **CloudBase NoSQL FIX-R1**：`FIX_REQUIRED`
- **Codex**：暂不执行。先由 Trae 完成 NoSQL R2 修复，再进行限定只读 Codex 审查。
- **NoSQL 继续保持 `readyForPreview=false`**，禁止配置 Preview / Production。

`.worktrees/` 修正已核验：`bea26e1` 仅修改 `.gitignore`，加入 `.worktrees/` 忽略规则，没有扩大两个待审分支的代码范围。

本裁决同时基于用户提交的统一完成包及 GitHub 上对应 SHA 的实际文件内容。

---

## 核心发现

### P0-01：FIX-R1 实际没有修改适配器代码

报告声明：

> FIX-01～FIX-07 代码改动已落盘到 `cloudbase.nosql.ts`、`select.ts` 和 contract tests。

但实际核验：

- `cloudbase.nosql.ts` 在 Base `f73c937` 的 blob SHA 为 `aa010ca1...`
- Result `1fba413` 中同一文件的 blob SHA 仍为 `aa010ca1...`
- `select.ts` 在 Base 的 blob SHA 为 `c53981e2...`
- Result 中仍为 `c53981e2...`

因此，`f73c937..1fba413` 不是一个包含 FIX-R1 代码修复的审查区间。`1fba413` 本身仅修改了 `STATE.json` 的完成包路径。

这会直接导致 FIX-08 证据包不成立。

---

### P0-02：CloudBase 查询与更新操作符实现错误

当前代码使用原始 MongoDB 形式：

```ts
status: { $nin: ... }
$or: [...]
leaseExpiresAt: { $lte: ... }
$set: {...}
$unset: {...}
```

CloudBase Node SDK 官方接口要求通过 `db.command` 构造操作符：

- `_.nin(...)`
- `_.in(...)`
- `_.lte(...)`
- `_.or(...)`
- `_.set(...)`
- `_.remove()`

当前 contract tests 只是复制了一份相同的 `$set/$unset` 本地函数进行断言，没有调用生产实现，也没有连接真实 CloudBase。

因此测试通过不能证明这些查询和更新会在 CloudBase 正常执行。

---

### P0-03：ObjectStore 没有保存或使用 uploadFile 返回的 fileID

当前 `put()`：

```ts
await getApp().uploadFile({
  cloudPath: key,
  fileContent: Buffer.from(bytes),
});
```

返回结果被直接丢弃。之后 `get()`、`delete()`、`getSignedUrl()` 却把普通 `storageKey` 当作 `fileID` 使用。

CloudBase 官方文档明确说明：

- `uploadFile` 返回唯一 `fileID`
- 建议保存该 `fileID`
- `downloadFile` 等后续操作需要传入 `fileID`，示例为 `cloud://...`

这意味着当前最基本的流程存在失败风险：

```text
put(storageKey)
→ getSignedUrl(storageKey)
```

`ProjectService.createProject()` 正是上传后立即执行该流程。

---

### P0-04：Job 并发幂等仍可能产生孤儿 Job

`GenerationService.createJob()` 没有在外部 UnitOfWork 中调用 `createIdempotent()`；原子性必须由 repository 方法自身提供。

当前实现顺序是：

1. 查询 idempotency
2. 创建 `generation_jobs`
3. 创建 `job_idempotency`
4. 若第 3 步触发 E11000，回查并返回赢家 Job

两个并发请求可能同时通过第一步，并各自创建一个 Job。第二个请求在写 idempotency 时失败后虽然返回赢家 Job，但其先前创建的 Job 不会被删除或回滚。

结果：

- API 表面返回幂等结果
- 数据库中仍可能保留一个无 idempotency 映射的孤儿 Job
- sweeper 可能拾取并执行该重复 Job

此外，实现查询只使用 `{ key }`，不是完成包宣称的 `{ projectId, key }` 作用域。

这是并发与业务不变量级阻塞问题。

---

### P0-05：Project 删除发生双重对象删除，并破坏既定责任边界

`ProjectService` 的设计明确规定：

1. 事务内只删除元数据
2. 提交后由 Service best-effort 删除对象
3. 对象删除失败记录在 `cleanupFailures`

但 NoSQL `projects.deleteCascade()` 在事务内直接调用 Storage `deleteFile()`，随后 Service 提交后又删除一次。

这带来两个问题：

- **双重删除**
- **不可回滚外部副作用**：对象已经删除后，如果数据库事务失败，元数据仍存在，但文件已不存在

而统一完成包声称 FIX-05 已改为"repository 只负责元数据，对象由 ProjectService 负责"，与实际代码完全不一致。

---

### P1-01：Preview / Production 隔离没有实现

完成包声称支持：

- `CLOUDBASE_DATA_NAMESPACE`
- `CLOUDBASE_STORAGE_PREFIX`
- Preview / Production 独立命名空间

实际 `CloudBaseNoSqlOptions` 只有：

- envId
- apiKey
- signedUrlTtlSeconds

选择器中也没有 namespace 或 storage prefix。

若 Preview 与 Production 使用同一 CloudBase Env，即使配置不同 API Key，仍会访问相同集合名和相同存储路径。

---

### P1-02：显式后端选择没有实现

完成包宣称：

```text
PERSISTENCE_BACKEND=cloudbase-nosql
```

但实际选择逻辑是：

```ts
if (env.CLOUDBASE_API_KEY) {
  return createCloudBaseNoSqlPersistence(...)
}
```

即通过凭据是否存在隐式决定后端，并且在 PostgreSQL 和 NoSQL 同时配置时强制优先 NoSQL。测试甚至明确把这种隐式优先级作为预期行为。

这不是 FIX-07 所要求的显式后端选择。

---

## Acceptance Criteria Review

| FIX                       | 结论          | 说明                                                                 |
| ------------------------- | ----------- | ------------------------------------------------------------------ |
| FIX-01 事务传播               | **PARTIAL** | AsyncLocalStorage 已存在，但部分条件更新直接使用 `getDb()`，绕过事务 collection helper |
| FIX-02 Job 幂等             | **FAIL**    | 并发下可残留孤儿 Job，作用域也不是 `projectId + key`                              |
| FIX-03 CloudBase commands | **FAIL**    | 使用 raw Mongo 操作符而非 `db.command`                                    |
| FIX-04 Storage            | **FAIL**    | 丢弃 fileID，后续错误地用 storageKey 代替 fileID                              |
| FIX-05 删除责任               | **FAIL**    | Repository 与 Service 双重删除；事务内产生不可回滚 Storage 副作用                    |
| FIX-06 环境隔离               | **FAIL**    | namespace / storage prefix 未实现                                     |
| FIX-07 显式选择               | **FAIL**    | `PERSISTENCE_BACKEND` 未实现                                          |
| FIX-08 Evidence           | **FAIL**    | Base→Result 区间不包含所声称的代码修复                                          |

---

## Test Coverage Review

当前 22 个 contract tests 主要覆盖：

- 复制版 JobPatch builder
- 配置字段校验
- factory shape
- selector 分支

没有覆盖关键风险：

- AsyncLocalStorage 下多个 repository 是否使用同一 transaction
- transaction rollback
- 并发相同 idempotency key
- 第二个请求是否留下孤儿 Job
- lease claim 并发互斥
- terminal status 单调性
- `db.command` 实际表达
- upload → URL → download → delete 的 fileID 生命周期
- Project 删除仅在事务提交后清理 Storage
- Preview / Production namespace 隔离

所以"485 tests PASS"只能证明现有测试集通过，不能证明 NoSQL 适配器满足核心业务不变量。

---

## Required Fixes — NoSQL R2

### NOSQL-R2-01：重新建立真实代码审查区间

从 `f73c937` 或当前 NoSQL 分支 HEAD 创建新修复提交。

新完成包必须给出：

```text
Base SHA: 1fba413 或明确的新基线
Result SHA: <包含实际代码修改的新 SHA>
```

且 `git diff Base..Result` 必须包含：

- `cloudbase.nosql.ts`
- `select.ts`
- 真实新增/修改测试

### NOSQL-R2-02：使用 CloudBase `db.command`

初始化后保存 command：

```ts
const command = db.command;
```

所有查询和 patch 必须使用 CloudBase command objects，不得继续直接发送 `$nin/$in/$lte/$or/$set/$unset`。

### NOSQL-R2-03：修复 Job 并发幂等

必须保证 Job 和 idempotency 映射原子创建。可选实现：

- 在 repository 内部执行 `runTransaction`
- 或先原子占用唯一 idempotency 记录，再创建 Job
- 或使用确定性 Job ID / reservation 状态

验收必须证明并发 N≥2 时：

```text
generation_jobs 数量 = 1
job_idempotency 数量 = 1
所有调用返回同一个 job.id
executor enqueue 次数 = 1
```

唯一索引应符合冻结业务语义：

```text
(projectId, idempotencyKey)
```

### NOSQL-R2-04：建立 storageKey → fileID 映射

必须明确选择一种模型：

- Asset 增加/复用字段保存真实 CloudBase fileID
- 或建立 object metadata collection
- 或通过 envId + cloudPath 可靠构造并验证 fileID

不能继续丢弃 `uploadFile()` 返回值。

### NOSQL-R2-05：恢复删除责任边界

`projects.deleteCascade()` 只删除数据库元数据。

禁止在数据库 transaction callback 内调用：

- uploadFile
- deleteFile
- downloadFile
- getTempFileURL

对象清理继续由 `ProjectService.deleteProject()` 在元数据事务提交后执行。

### NOSQL-R2-06：实现环境隔离

至少实现：

```text
CLOUDBASE_DATA_NAMESPACE
CLOUDBASE_STORAGE_PREFIX
```

要求：

- 所有集合名统一加 namespace
- 所有 cloudPath 统一加 storage prefix
- Preview 与 Production 配置缺失时 fail closed
- 不允许 Preview 默认使用 Production namespace

### NOSQL-R2-07：实现显式后端选择

引入：

```text
PERSISTENCE_BACKEND=local
PERSISTENCE_BACKEND=cloudbase-postgres
PERSISTENCE_BACKEND=cloudbase-nosql
```

Production 未配置或值非法时 fail closed。

不得再通过 API Key 是否存在来隐式决定后端。

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

## Missing Evidence

1. FIX-R1 实际代码提交 SHA。
2. CloudBase command 的真实执行证据。
3. Storage fileID 全生命周期证据。
4. 并发幂等后无孤儿 Job 的集合计数。
5. Preview / Production namespace 隔离证明。
6. 唯一索引实际定义及字段顺序。
7. 删除失败与事务回滚组合测试。

---

## Codex Necessity

**Codex REQUIRED_AFTER_R2**

原因是该任务涉及：

- 跨集合事务
- 并发幂等
- lease 状态机
- 外部 Storage 补偿
- Preview / Production 数据隔离
- Token 与环境权限边界

但 Codex 应在 Trae 修复完成后执行，而不是现在。

限定审查范围：

```text
cloudbase.nosql.ts
select.ts
NoSQL adapter tests
ProjectService / GenerationService 与 adapter 的调用边界
Base..Result 新 diff
```

Codex 不得修改代码，除非 Trae R2 后仍存在明确阻塞且用户另行授权。

---

## Next Owner

**Trae**

执行顺序：

1. NoSQL 状态改为 `changes_requested / nextActor=trae`。
2. 保持 `readyForPreview=false`。
3. 执行 `LUMEN-CLOUDBASE-NOSQL-FIX-R2`。
4. 输出代码实际发生变化的新 Result SHA。
5. 重新提交 GPT 证据审查。
6. GPT 通过后再执行限定 Codex 只读审查。

## Stop Conditions

在以下条件满足前，禁止：

- 合并 NoSQL 到 main
- 配置 Vercel Preview NoSQL
- 标记 `READY_FOR_PREVIEW`
- 使用 Production API Key
- 运行 Production 数据迁移或写入

**Status：NOSQL_FIX_R2_REQUIRED**
