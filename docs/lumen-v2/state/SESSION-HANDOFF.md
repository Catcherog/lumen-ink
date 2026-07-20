# SESSION HANDOFF｜窗口交接

## 当前状态

- 日期：2026-07-20
- 当前任务：`PERSIST-001`
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`
- GPT 第二轮结论：`MVP_FAIL`（仅 P0-01 与 P0-02 仍 REJECTED；P0-03 / P0-04 ACCEPTED）
- 第二轮审查基线：`4e3a1253145b74aa30278ec201208d1baae28f28`
- 第二轮审查 HEAD：`cf0a08014f052ab31233dd15cd5662adf45a6639`
- 第二轮 FIX_PACKET：`PERSIST001-P0-01A` ~ `P0-01C` + `PERSIST001-P0-02A` + `PERSIST001-STATE-01`
- 本轮修复 HEAD：待 `feat(lumen-v2): PERSIST-001 P0 fix round 2 (FIX_PACKET P0-01A~C, P0-02A, STATE-01)` 提交后生成
- 分支：`lumen/persist-001-trae`
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- GPT 审查：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`
- Trae 报告：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`（含 R2 节）
- 门禁证据：`docs/lumen-v2/evidence/PERSIST-001/gate-results.md`（含 P0 修复轮 2 节）

## 本轮修复摘要（P0 round 2）

按第二轮 FIX_PACKET 修复 5 项问题（P0-03 / P0-04 首轮已 ACCEPTED，本轮未触碰）：

1. **P0-01A** — `pg ^8.13.1` 加入 `src/server/package.json` `dependencies`、`@types/pg ^8.11.10` 加入 `devDependencies`；删除冗余 `src/server/types/pg.d.ts` ambient shim；新增 `cloudbase.ensureReady.test.ts`（3 tests）验证部署模式 `ensureReady()` 启动加载 `pg` 不抛 `PG_MODULE_REQUIRED`。
2. **P0-01B** — `cloudbase.ts` 重写 CloudBase PG Storage 上传/下载/删除/exists/签名 URL，对齐官方 OpenAPI（`https://<envId>.api.tcloudbasegateway.com/v1/storages/object/<bucketId>/<objectName>`）；`select.ts` 用 `envId` + `bucketId` 替代 `storageBucket`；新增 `cloudbase.http.contract.test.ts`（16 tests）覆盖 URL、方法、`Authorization: Bearer <service-role>`、`Content-Type`、raw bytes body 与响应解析合同。
3. **P0-01C** — 新增 `worker-recovery.ts`（纯函数 `recoverPendingJobs`，无模块状态）+ `routes/worker.ts`（`POST /api/worker/recover`，`CRON_SECRET` 常量时间比较 Bearer 鉴权，未设置时 503）+ `vercel.json` crons 每分钟调用；`src/server/index.ts` 挂载 `createWorkerRouter`；新增 `worker-recovery.test.ts`（6 tests）验证 queued / lease-expired Job 在新实例恢复 + 并发恢复只有一个胜出 + `maxRecover` 上限。
4. **P0-02A** — `cloudbase.ts` 引入 `AsyncLocalStorage<PoolClient>`，`UnitOfWork.run` 内 Repository 方法自动复用当前事务 client；外层调用仍各自 `connect()`；新增 `cloudbase.transaction.contract.test.ts`（4 tests）验证 4 写入 + BEGIN + COMMIT 共享同一 client、抛错时 ROLLBACK 在同一 client、事务外调用各自独立 client、嵌套 UoW 复用外层 client。
5. **STATE-01** — STATE.json 推进到 `awaiting_gpt_acceptance / nextActor=gpt`；本文件重写为第二轮修复后状态；Trae report 追加 R2 节；gate evidence 追加 P0 修复轮 2 节。

## 验证矩阵（关键）

- 部署模式实际加载 `pg` 并执行 `ensureReady`，不抛 `PG_MODULE_REQUIRED`
- PG Storage URL、方法、认证头、请求体、响应解析全部通过 fetch 合同测试
- 同一事务中的四类写入（Asset / Version / Project pointer / Job 条件 succeeded）共享同一 PoolClient
- 最终 `updateIfClaimed(succeeded)` 失败时 UoW ROLLBACK，Asset/Version 无新增、activeVersion 不变、Job 非 succeeded、result object 被补偿删除
- queued Job 在新 worker 实例中恢复
- lease-expired Job 在新 worker 实例中接管，旧 worker `updateIfClaimed` 返回 null 不可发布
- 并发恢复只有一个胜出（`JOB_NOT_CLAIMED_BY_CALLER` 分类为 skipped）
- 统一 8 门禁全部 exit 0
- `git diff --check`（仅 P0 修复轮 2 触及的文件）通过
- GPT 第二轮 FIX_PACKET 提到的「GitHub Actions 或等效 clean-checkout 独立验证」由 GPT 在第三轮验收时执行

## 8 门禁结果（P0 修复轮 2）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | — |
| 5 | Server tests | PASS | 424 tests / 46 files |
| 6 | Root tests | PASS | 618 combined (194 client + 424 server) |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

详见 `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 R2-Gate 节。

## GPT 下一步（第三轮验收）

按第二轮 FIX_PACKET 状态裁决：「Trae 完成修复后，由 Codex 执行一次只读事务与部署接线 AUDIT，再交 Web GPT 第三轮验收」。

但本轮修复已将代码与合同测试全部就位，**GPT 也可选择先直接对当前 diff 进行第三轮代码审查**，再决定是否仍需 Codex AUDIT。建议路径：

1. 启动新窗口 GPT，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态
2. 读取：
   - 本文件
   - `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` 的 R2 节
   - `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 R2-Gate 节
   - 第二轮 FIX_PACKET（已在 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md` 第二轮节）
3. 审查 `cf0a08` → HEAD diff（仅 P0-01A/B/C + P0-02A + STATE-01 范围）
4. 核查关键行为：
   - P0-01A：`pg` 已是运行时依赖；`ensureReady()` 不抛 `PG_MODULE_REQUIRED`
   - P0-01B：CloudBase PG Storage HTTP API 与官方 OpenAPI 对齐（URL / 方法 / Bearer / Content-Type / raw bytes / 响应解析）
   - P0-01C：`recoverPendingJobs` 是纯函数；queued + lease-expired Job 在新实例恢复；旧 worker 不可发布；`CRON_SECRET` 常量时间比较
   - P0-02A：4 类写入共享同一 PoolClient（AsyncLocalStorage）；最终条件失败时 UoW ROLLBACK + result object 补偿删除
   - STATE-01：STATE.json / SESSION-HANDOFF / Trae report / gate evidence 状态一致
5. 运行 8 门禁独立验证（GitHub Actions 或本地 clean checkout）
6. 写入 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（第三轮节）
7. 通过则交 Codex 执行只读事务 + 部署接线 AUDIT（按 FIX_PACKET 状态裁决要求）；驳回则生成明确缺陷并退回 `changes_requested / nextActor=trae`

## 范围遵守

- ✅ 只修 `PERSIST001-P0-01A` ~ `P0-01C` + `PERSIST001-P0-02A` + `PERSIST001-STATE-01`
- ✅ 未启动 ROUTING-001 / HARDEN-001 / PERSIST-002
- ✅ 未改变冻结候选 A、Provider 或公开 API 方向
- ✅ 未使用真实客户数据
- ✅ 未提交 CloudBase 凭据、service-role token 或未脱敏日志
- ✅ 精确 `git add <path>`，未提交既有无关工作区修改（包括 `.trae/specs/fix-result-viewer-ux-and-layout/spec.md` 等无关文件）
- ✅ P0-03 / P0-04 在首轮已 ACCEPTED，本轮未触碰
- ✅ 未归档任务，未激活下一任务

## 硬停止条件

仅在以下情况停止并交回用户/GPT：
- 需要付费 / 真实 CloudBase 账号 / 不可逆迁移
- 数据或密钥泄漏
- 必须改变冻结候选 A / Provider / API 方向
- 当前 FIX_PACKET 门禁无法恢复（本轮已恢复，所有 8 门禁 exit 0）
