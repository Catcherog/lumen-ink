# SESSION HANDOFF｜窗口交接

## 当前状态

- 日期：2026-07-18
- 当前任务：`PERSIST-001`
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`
- 前置验收：STORAGE-001 `MVP_PASS_WITH_DEBT`
- PERSIST 基线：`6eaec9464dccbe5c14a5cd1d40419595cb496f37`
- PERSIST HEAD：`ceaa9dbf2d5bc7c7607971a9d4e8ab64435483b4`（+ 本提交证据/state）
- 冻结方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- 当前任务文件：`docs/lumen-v2/tasks/active/PERSIST-001.md`
- 实施计划：`docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- Trae 报告：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`
- 证据目录：`docs/lumen-v2/evidence/PERSIST-001/`

## Trae 实施结果

PERSIST-001 在 `lumen/persist-001-trae` 单分支内连续执行 12 个子任务，全部 8 条门禁通过。

### 核心产出

1. **D-040 契约收敛**（Tasks 1-3）：完整 Project/Asset/Version/GenerationJob 字段 + 9 阶段 Job 状态机 + `(projectId, idempotencyKey)` 唯一性 + lease/heartbeat/原子 claim + stale worker 拒写 + 同事务上下文。接口再次冻结（D-042）。
2. **CloudBase/local/mock adapter**：`cloudbase-mock.ts` + `local.ts` 通过同一最终合约。
3. **ProjectService + GenerationService**（Tasks 4-5）：原子成功边界（Object upload → DB 事务 → 条件完成；失败补偿删除孤儿对象）；`executeJob` 生命周期；`createJob` 幂等；`cancelJob`/`retryJob`；两 worker 接管 + stale worker 拒绝。
4. **认证 Project/Job API**（Task 6）：`createProjectsRouter`/`createJobsRouter`/`mountProjectJobsRoutes`；`Idempotency-Key` 必需；DomainError → HTTP 映射；storageKey 脱敏。
5. **/api/edit 受控兼容层**（Task 7）：V2 返回 `Deprecation: true` + `Link` header + 202 Accepted。
6. **客户端**（Tasks 8-9）：`api/projects.ts` typed wrappers + `useProject` hook（轮询契约）+ `VersionStrip` + `JobStatusPanel` + `LegacyHistoryImport`。
7. **内部安全底线**（D-034 Tasks 5-7）：runtime secret fail-fast + durable auth throttle + CORS allowlist + 7-step image validation + allowlist redaction。
8. **Legacy history 显式导入**（Task 10）：inspect → export → import with confirmation（D-009 落地）。
9. **E2E 失败矩阵**（Task 11）：13 server tests + 18 client tests 覆盖全矩阵。

### 8 门禁结果

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | — |
| 5 | Server tests | PASS | 198 tests / 20 files |
| 6 | Root tests | PASS | 392 combined |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets |

### 范围遵守

- ✅ 单任务/单分支/单验收周期
- ✅ D-040 契约收敛完成，接口再次冻结
- ✅ 未启动 ROUTING / STORAGE-002 / PERSIST-002
- ✅ 未改变冻结的 Provider/API/存储决策
- ✅ 保留工作区既有无关修改
- ✅ 未提交密钥、真实客户数据或未脱敏证据
- ✅ 普通阶段未暂停或请求 GPT 中间验收
- ✅ 未遇到硬停止条件

## GPT 验收指引

### 启动入口

读取 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md`（固定模板），按模板启动新窗口。

### 验收范围

- 审查 diff：`git diff 6eaec946..HEAD`（54 文件，+10945/-550）
- 核查关键行为：原子成功边界、幂等、lease/heartbeat、补偿、脱敏、图片验证
- 运行 8 门禁独立验证
- 风险驱动验收：只审查当前 diff 和关键行为，不重复审计已验收的 UI-001/FLOW-001/STORAGE-001 截图

### 验收输出

- 通过：写入 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（结论 `MVP_PASS` 或 `MVP_PASS_WITH_DEBT`）；归档 PERSIST-001 至 `tasks/completed/`；从 `tasks/backlog/` 激活下一任务（ROUTING-001 或 HARDEN-001）；更新 STATE.json。
- 驳回：生成 `FIX_PACKET`（含 P0 blockers 清单、违规验收条件、最低修复要求、验证命令）；STATE.json 改为 `changes_requested / nextActor=trae`。

## 范围边界

- 不启动 ROUTING、完整公开发布 HARDEN、多工作区 IAM、Preview、图层或非关键 UI 优化。
- GitHub 不得作为运行时数据库、对象存储或 Job 状态存储。
- CloudBase Workflow 不执行当前 80—100 秒 Provider 调用；CloudRun/R2 仅未来选项。
- 只使用合成图和脱敏日志；保留工作区既有无关修改。

## 给 GPT 的启动指令

读取 `AGENTS.md`、`STATE.json`、本文件和 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md`。确认 `PERSIST-001 / awaiting_gpt_acceptance / nextActor=gpt` 后，按风险驱动验收流程审查当前 diff 和 8 门禁，写入 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`。
