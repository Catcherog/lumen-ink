# SESSION HANDOFF｜窗口交接

## 当前状态

- 日期：2026-07-18
- 当前任务：`PERSIST-001`
- 状态：`ready_for_trae / nextActor=trae`
- 前置验收：STORAGE-001 `MVP_PASS_WITH_DEBT`
- STORAGE 审查目标：`abcc103394f86b87ae37af1bd6172f984e9d46e6`
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- 当前任务文件：`docs/lumen-v2/tasks/active/PERSIST-001.md`
- 实施计划：`docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- 连续执行入口：`docs/lumen-v2/prompts/INTERNAL-FAST-TRACK-TRAE.md`

## GPT 验收结果

- STORAGE-001 已归档至 `tasks/completed/`，`storage-options.md` 已写入 `decision: frozen`。
- 官方资料确认：Vercel Hobby 300 秒；Private Blob/签名 URL；Postgres 走 Marketplace；CloudBase PG Storage 私有 Bucket/签名 URL；CloudBase Workflow 单节点 60 秒；个人版参考 19.9 元/月。
- GPT 独立运行新增合约：1 file / 6 tests passed；最终统一 8 门禁全部 exit 0：client lint 0 errors、client/server typecheck、client 104、server 34、root 138、build、安全扫描。
- server/root 的 34/138 是 build 后忽略目录内编译测试副本也被 Vitest 发现的当前计数；Trae build 前的源测试计数 28/132 同样为全绿。该计数差异不改变验收结论，PERSIST 最终证据应固定 clean/build 顺序并明确测试发现范围。
- 验收报告：`docs/lumen-v2/reviews/STORAGE-001-GPT-REVIEW.md`。

## D-040 契约收敛门

STORAGE PoC 的职责边界继续冻结，但精确签名是简化形态。PERSIST Tasks 1—3 必须先通过红→绿测试完成一次性收敛：

1. 完整 Project/Asset/Version/GenerationJob 字段和九阶段真实 Job 状态；
2. `(projectId, idempotencyKey)` Job 唯一性与每个 `jobId` 最多一个成功 Version；
3. worker/lease token 原子 claim、heartbeat、条件完成和过期接管；
4. stale worker 在 lease 失效后不可发布 Version 或 Job succeeded；
5. 同一数据库事务上下文保证 Asset → Version → Job succeeded；
6. CloudBase、local、mock adapter 通过同一最终合约。

该收敛属于已授权 PERSIST 范围，不是停止条件；完成后再次冻结接口。

## Trae 一次性执行范围

在一个任务 ID、一个分支、一个最终验收周期内连续执行：

1. PERSIST Task 1：状态/冻结门 + D-040 契约差距红测；
2. PERSIST Tasks 2—3：领域状态机、最终契约、CloudBase/local/mock adapter 与合约绿测；
3. PERSIST Tasks 4—11：Project/V0、GenerationService、API、客户端恢复/版本 UI、legacy history、失败矩阵；
4. 快速计划 Tasks 5—7：secret fail-fast、持久登录限流、CORS、图片校验、health/provider/log 脱敏；
5. PERSIST Task 12：统一失败/恢复矩阵、8 门禁、报告、证据和一次回传。

普通内部阶段不暂停、不请求 GPT 验收。只在以下硬条件停止：

- 需要真实 CloudBase 账号开通、付费、凭据或不可逆迁移；
- 候选 A 无法满足 D-040 原子语义；
- 数据丢失、错误成功 Version、stale worker 写入、密钥/图片泄漏或权限绕过；
- 完整门禁失败且两次有界恢复仍无法关闭；
- 必须改变已冻结的 Provider/API/存储供应商决策。

没有真实凭据时继续完成 mock/contract、SQL schema/迁移、生产 adapter 注入式测试；不得把密钥写入仓库、聊天、CLI 参数或 `.env`。

## 范围边界

- 不启动 ROUTING、完整公开发布 HARDEN、多工作区 IAM、Preview、图层或非关键 UI 优化。
- GitHub 不得作为运行时数据库、对象存储或 Job 状态存储。
- CloudBase Workflow 不执行当前 80—100 秒 Provider 调用；CloudRun/R2 仅未来选项。
- 只使用合成图和脱敏日志；保留工作区既有无关修改。
- GPT 未 commit/push。Trae 先精确提交本轮 GPT 控制面文件，再创建 `lumen/persist-001-trae`。

## 给 Trae 的启动指令

读取 `AGENTS.md`、`STATE.json`、本文件和 `docs/lumen-v2/prompts/INTERNAL-FAST-TRACK-TRAE.md`。确认 `PERSIST-001 / ready_for_trae / nextActor=trae` 与 `decision: frozen` 后，按连续入口执行，不重新拆包，不在普通阶段交接。
