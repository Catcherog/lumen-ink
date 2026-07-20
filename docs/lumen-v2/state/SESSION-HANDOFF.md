# SESSION HANDOFF｜窗口交接

## 当前状态

- 日期：2026-07-20
- 当前任务：`PERSIST-001`
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`
- 当前轮次：`PERSIST-001-FINAL-CLOSURE`（合并执行包，单次最终验收）
- 第二轮 GPT 结论：`MVP_FAIL`（P0-03 / P0-04 ACCEPTED；P0-01 / P0-02 仍 REJECTED）
- 第二轮修复 HEAD：`af960e3`（在分支 `lumen/persist-001-trae`）
- 本轮（FINAL-CLOSURE）基线：`af960e3`
- 本轮（FINAL-CLOSURE）HEAD：待 `feat(lumen-v2): PERSIST-001 FINAL-CLOSURE (AC-01~AC-12)` 提交后生成
- 分支：`lumen/persist-001-trae`
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- GPT 审查：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（含第二轮 FIX_PACKET）
- Trae 报告：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`（含 R2 + FINAL-CLOSURE 节）
- 门禁证据：`docs/lumen-v2/evidence/PERSIST-001/gate-results.md`（含 P0 修复轮 2 + FINAL-CLOSURE-Gate 节）

## 本轮修复摘要（FINAL-CLOSURE）

按用户合并执行包「R2：GPT 给出合并修复包 → Trae 一次完成 → GPT 最终证据验收」一次性修复 12 条 AC，不拆分中间审查：

1. **AC-01 ~ AC-04** — `domain/persistence.ts` 新增 `JobPatch` 类型显式允许 `null`，表达三态语义（absent=保留 / present-null=写 NULL / present-value=写新值）；`cloudbase.ts` 引入 `JOB_PATCH_FIELDS` + `buildJobPatchSet()` 动态构造 SET 子句替代 `COALESCE($N, col)`；`local.ts` / `cloudbase-mock.ts` 同步切换到 `JobPatch` 签名并实现 `applyJobPatch` 三态处理；新增 `cloudbase.lease.contract.test.ts`（5 tests）覆盖 claim → 多阶段 status-only patch → lease 字段保持 / heartbeat 续租 / cancel 显式清空 / stale worker 拒绝。
2. **AC-05 / AC-06** — `cloudbase.transaction.contract.test.ts` 追加 1 个回归测试：用 `STALE_TOKEN` 触发 `updateIfClaimed` 返回 0 行，断言 ROLLBACK 在同一 PoolClient 上发出、COMMIT 未发出、Asset/Version/Project/Job 四类写入共享同一 client。
3. **AC-07 / AC-08** — `routes/worker.ts` 重构出共享 `recoverHandler`，同时注册 `router.get('/recover')` 与 `router.post('/recover')`，Vercel Cron（GET）与人工触发（POST）走同一条恢复代码；新增 `routes/worker.test.ts`（6 tests）覆盖 GET 200 / POST 200 / GET 401（missing + wrong Bearer）/ GET 503（CRON_SECRET 未配置）/ GET 500（recoverPendingJobs 抛出）。
4. **AC-09** — `worker-recovery.ts` 修正 `maxRecover` 注释从「Hobby maxDuration of 300s」改为「90s」并对齐 `vercel.json` 实际 `maxDuration: 90`；`vercel.json` 维持冻结 Hobby 配置（maxDuration 90s、crons 每分钟、Hobby 支持档位），未升级为 Pro 假设。
5. **AC-10** — STATE.json / SESSION-HANDOFF / Trae report / gate evidence 同步更新到实际 HEAD 与测试计数（194 client + 436 server = 630 root tests / 58 test files）。
6. **AC-11** — 统一 8 门禁全部 exit 0 通过（client lint / client tsc / client tests / server tsc / server tests / root tests / build / check-lumen-collab）。
7. **AC-12** — 精确 `git add` 只提交 FINAL-CLOSURE 范围内文件；未触碰既有无关工作区修改；未启动 ROUTING-001 / HARDEN-001 / PERSIST-002。

## 验证矩阵（关键）

- `claim(token-A)` → 多次 `updateIfClaimed(status-only patch)` → lease_token / lease_expires_at / worker_id 保持不变（AC-01）
- 阶段迁移后原 token 仍可 heartbeat 成功（AC-02）
- `updateIfActive` 显式传 `null` 清空 worker_id / lease_token / lease_expires_at（AC-03）
- cancel 后 stale worker 的 heartbeat 与 `updateIfClaimed` 均失败（AC-04）
- 最终 Job 条件失败时 ROLLBACK 在同一 PoolClient 发出、Asset/Version/Project pointer 无残留、result object 被补偿删除（AC-05 / AC-06）
- 授权 GET `/api/worker/recover` 命中真实 handler 返回 200（AC-07）
- 错误/缺失 CRON_SECRET 返回 401；未配置返回 503；recoverPendingJobs 抛出返回 500（AC-08）
- `vercel.json` Hobby 配置（maxDuration 90 / crons 每分钟）与 `worker-recovery.ts` 注释一致（AC-09）
- STATE / SESSION-HANDOFF / Trae report / gate evidence 与实际 HEAD 和测试数一致（AC-10）
- 统一 8 门禁全部 PASS（AC-11）
- 无范围扩张和无关文件提交（AC-12）

## 8 门禁结果（FINAL-CLOSURE）

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | — |
| 5 | Server tests | PASS | 436 tests / 48 files |
| 6 | Root tests | PASS | 630 combined (194 client + 436 server) |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

详见 `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 FINAL-CLOSURE-Gate 节。

## GPT 下一步（最终证据验收）

按用户合并执行包「后续验收策略」：只做一次最终验收，不重复审查已通过的模块。

1. 启动新窗口 GPT，按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板加载状态
2. 读取：
   - 本文件
   - `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` 的 FINAL-CLOSURE 节
   - `docs/lumen-v2/evidence/PERSIST-001/gate-results.md` 的 FINAL-CLOSURE-Gate 节
   - 第二轮 FIX_PACKET（已在 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md` 第二轮节）
3. 审查 `af960e3` → HEAD diff（仅 FINAL-CLOSURE AC-01~AC-12 范围）
4. 核查高风险测试证据：
   - `cloudbase.lease.contract.test.ts`（AC-01~04 lease 生命周期 + 三态 patch 语义）
   - `cloudbase.transaction.contract.test.ts`（AC-05/06 同一 PoolClient + ROLLBACK 反例）
   - `routes/worker.test.ts`（AC-07/08 GET+POST 共享 handler + 200/401/503/500）
5. 核对统一 8 门禁（全部 PASS，630 tests）
6. 核对状态文件一致性
7. 直接裁决 `MVP_PASS` 或生成最后一个最小修复包

**Codex 升级条件**（默认不调用）：仅当最终 diff 中仍包含难以从证据判断的真实 PostgreSQL 事务或并发问题、或用户要求独立仓库运行验证时，再决定是否进行一次 Codex 汇总验证。

## 范围遵守

- ✅ 只修 FINAL-CLOSURE AC-01 ~ AC-12 范围
- ✅ 未启动 ROUTING-001 / HARDEN-001 / PERSIST-002
- ✅ 未改变冻结候选 A（Vercel Hobby + CloudBase PG + PG Storage）方向
- ✅ 未使用真实客户数据
- ✅ 未提交 CloudBase 凭据、service-role token 或未脱敏日志
- ✅ 精确 `git add <path>`，未提交既有无关工作区修改
- ✅ P0-03 / P0-04 业务逻辑未重新修改（首轮 ACCEPTED）
- ✅ 未在中途请求 Codex 或 GPT 分项复审
- ✅ 未归档任务，未激活下一任务

## 硬停止条件

仅在以下情况停止并交回用户/GPT：
- 需要付费 / 真实 CloudBase 账号 / 不可逆迁移
- 数据或密钥泄漏
- 必须改变冻结候选 A / Provider / API 方向
- 当前 FINAL-CLOSURE 门禁无法恢复（本轮已恢复，所有 8 门禁 exit 0）
- 修复要求跨越 PERSIST-001 范围
