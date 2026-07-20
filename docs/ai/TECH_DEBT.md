### DEBT-STORAGE-01: STORAGE PoC 契约低于 PERSIST 恢复模型

- Status: OPEN
- Severity: P1
- Introduced By: STORAGE-001
- Context: STORAGE PoC 的实体、Job 状态和 `UnitOfWork`/lease/idempotency 表面足以证明候选 A 可适配，但低于 PERSIST-001 的细粒度状态、原子 claim 与陈旧 worker 拒写要求。
- Risk: 若原样接入业务层，多 worker 重试可能重复生成 Version，或 lease 失效的旧 worker 覆盖新结果；事务实现也可能只在内存 mock 成立。
- Reason Deferred: 不再启动一轮供应商选型返工；用户要求减少非必要审计并让 Trae 在一个扩大包内连续交付。
- Resolve Before: PERSIST-001 Task 3 结束前；业务服务和真实 CloudBase 接线开始前。
- Related Files:
  - src/server/domain/persistence.ts
  - docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md
  - docs/lumen-v2/reviews/STORAGE-001-GPT-REVIEW.md
- Resolution Requirements: 通过 D-040 契约收敛矩阵、两 worker 接管、stale worker 拒写、幂等唯一约束和同事务上下文合约测试；随后改为 RESOLVED。

<!--
  模板用途：技术债登记表，统一维护项目内已确认的技术债。
  来源改造方案章节：第 13 节。
  注意事项：
  - 避免同一个技术债重复记录。
  - 每条必须有明确的风险说明和处理阶段，不写没有处理阶段的永久待办。
  - 不要将纯代码风格偏好升级为重要债务。
  - 不在当前任务中无边界地顺手清债。
-->

# Tech Debt Registry — 光砚 Lumen Ink V2 (picture-edit)

## 格式说明

每条技术债使用以下结构登记：

```markdown
## DEBT-xxx: 简短标题

- Status: OPEN / IN_PROGRESS / RESOLVED
- Severity: P1 / P2  <!-- P0 不应进入技术债，应在当前任务解决 -->
- Introduced By: TASK-xxx  <!-- 或具体来源 -->
- Context: 简要背景。
- Risk: 不处理的潜在影响。
- Reason Deferred: 为何延后处理。
- Resolve Before: MVP / Public Beta / 其他里程碑。
- Related Files:
  - 路径/到/相关文件
```

## 当前条目

### DEBT-REPORT-01: BASE-001 Trae 报告前部测试数不一致（已修复）

- Status: RESOLVED
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 `BASE-001-TRAE-REPORT.md` 第 1 节执行摘要、第 3.3 节测试文件、第 5 节验收命令结果表仍保留首次实施的 13 tests / server 8 passed (1 file)，与第 8.3 节更正说明和 evidence 的 21 tests / server 16 passed (2 files) 不一致。
- Risk: 报告内部矛盾影响验收可追溯性；远端审查者需交叉核对多节才能确定真实测试数。
- Reason Deferred: 首次落库时只更正了第 8.3 节，未回溯前部摘要。
- Resolve Before: BASE-001 验收落库时（2026-07-17 Trae 已修复）。
- Related Files:
  - docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md
  - docs/lumen-v2/evidence/BASE-001/test-results.txt
- Resolution: 2026-07-17 Trae 在验收落库时已将第 1 节执行摘要改为「21 个测试通过（client 5 + server 16）」，第 3.3 节说明更正为「16 个测试，2 个文件」并加注指向第 8.3 节，第 5 节表格同步更新为 16 passed (2 files) / 21 passed (3 files)。

### DEBT-REPORT-02: BASE-001 Trae 报告返工 docs commit 字段缺 SHA（已修复）

- Status: RESOLVED
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 `BASE-001-TRAE-REPORT.md` 任务元数据中「返工 docs commit」字段只写提交标题 `docs(lumen-v2): review BASE-001`，未内嵌精确 SHA，需通过 GitHub commit 页面才能确认 `b015531727714102a68d3dd359ed51c82e9cbec6`。
- Risk: 报告与 commit 的绑定关系不自包含，远端审查者无法在文件内直接核对 SHA。
- Reason Deferred: 首次返工落库时只填了提交标题。
- Resolve Before: BASE-001 验收落库时（2026-07-17 Trae 已修复）。
- Related Files:
  - docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md
- Resolution: 2026-07-17 Trae 在验收落库时已将返工 docs commit 字段改为 `` `b015531727714102a68d3dd359ed51c82e9cbec6` (`docs(lumen-v2): BASE-001 rework evidence and GPT review landing`，…) ``。

### DEBT-STATE-01: GPT 报告描述与 STATE.json 现状差异

- Status: OPEN
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 验收报告「债务」表称 `STATE.latestGptReview` 仍指向 `REPO-SEC-001-GPT-REVIEW.md`，并附 STATE patch 要求修正。但 Trae 落库前核查 `STATE.json` 发现 `latestGptReview` 已指向 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`（在 2026-07-17 返工落库时已更新）。推测 GPT 复核时基于更早的 STATE 快照。
- Risk: 报告描述与仓库现状不一致，可能让后续审查者误以为 STATE 未推进。
- Reason Deferred: 差异已在 `SESSION-HANDOFF.md` 记录便于追溯；STATE 现状正确，无需改动。
- Resolve Before: 无需修复（STATE 现状正确）；差异记录保留至下次 GPT 复核确认。
- Related Files:
  - docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md
  - docs/lumen-v2/state/STATE.json
  - docs/lumen-v2/state/SESSION-HANDOFF.md

### DEBT-EVIDENCE-01: evidence 在非 clean 工作区执行、UTF-16/BOM 编码

- Status: OPEN
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 BASE-001 evidence 在 HEAD 为 `a167343` 但工作区非 clean 的状态下执行；部分结果文件使用 UTF-16/BOM 编码，GitHub diff 以 binary 展示，影响可复现性和 diff 可读性。声明的脏文件不涉及 npm 验收链，不影响结果有效性。
- Risk: 后续任务若同样在脏工作区执行验收命令，可能引入不易察觉的污染；UTF-16/BOM 文件在 PR diff 中不可读，削弱证据可审查性。
- Reason Deferred: BASE-001 evidence 已落库且结果有效，重跑成本高于收益；规则约束后续任务即可。
- Resolve Before: UI-001 及后续所有任务的验收命令执行。
- Related Files:
  - docs/lumen-v2/evidence/BASE-001/
- Resolution Requirements: 后续任务在 clean checkout / git worktree 执行验收命令；结果文件统一 UTF-8 无 BOM；evidence README 声明工作区状态。

### DF-RULES-01: docs/ai/ 三个权威文件未提交到远端分支

- Status: OPEN
- Severity: Process
- Introduced By: 仓库整理（非 Lumen V2 任务）
- Context: GPT 2026-07-17 复核确认远端 `docs/lumen-v2-repo-collaboration` 分支仍无 `docs/ai/` 目录，`COLLABORATION-RULES.md`、`REVIEW_POLICY.md`、`CONFLICT-RESOLUTION.md` 三个权威文件均返回 404。本地工作区存在但 untracked，不能构成仓库权威事实。
- Risk: 远端审查者无法读取协作规则权威入口；新窗口 GPT 启动时引用的路径在远端不可达，影响协作一致性。
- Reason Deferred: `docs/ai/` 由之前会话创建，属仓库整理任务范围，不在 BASE-001 返工 commit 中提交（遵循「隔离当前任务」原则）。
- Resolve Before: 独立 docs-only 整理任务（不阻塞当前 MVP 推进）。
- Related Files:
  - docs/ai/COLLABORATION-RULES.md
  - docs/ai/REVIEW_POLICY.md
  - docs/ai/CONFLICT-RESOLUTION.md
  - docs/ai/（整个目录，含 10+ 文件）
- Resolution Requirements: 另建 docs-only 任务提交 `docs/ai/` 目录到远端分支；提交前执行 `node scripts/check-lumen-collab.mjs` 和人工脱敏检查；不混入任何生产代码或密钥。

### DEBT-HARDEN-001A-01: AC-A04 在 P0 单工作区中为 NOT_APPLICABLE

- Status: OPEN
- Severity: P2
- Introduced By: HARDEN-001A
- Context: D-012 P0 单工作区模型无 RBAC，无 403 路径。HARDEN-001A 任务卡 AC-A04（权限不足返回 403）在当前 P0 阶段以文档化形式覆盖，未补充 403 测试用例。
- Risk: P1 RBAC 落地时若遗漏 403 测试覆盖，可能在多用户/角色权限场景下放行未授权请求。
- Reason Deferred: D-012 明确将 RBAC 推迟到 P1；当前 P0 单工作区模型不涉及跨租户或角色隔离。
- Resolve Before: P1 RBAC 任务启动时。
- Related Files:
  - src/server/security/auth.boundary.test.ts
  - docs/lumen-v2/specs/07-ACCEPTANCE-PLAN.md
  - docs/lumen-v2/reviews/HARDEN-001A-GPT-REVIEW.md
- Resolution Requirements: P1 RBAC 落地时补充 403 路径测试用例；更新 `auth.boundary.test.ts` 或新建 RBAC 专用测试文件；覆盖跨工作区访问、角色权限矩阵、匿名 vs 已认证但无权限边界。

### DEBT-HARDEN-001A-02: 增补真实生产路由 wiring 回归测试

- Status: RESOLVED
- Severity: P2
- Introduced By: HARDEN-001A
- Context: HARDEN-001A 通过 TDD specification-test 模式覆盖 AC-A02 ~ AC-A13，但测试主要验证 middleware/router 工厂级别的认证行为，未增补真实生产路由 wiring（`src/server/index.ts` 路由挂载顺序、middleware 链组合、Express app 端到端）的回归测试。当前 server 514 tests 已覆盖单元/集成层，但缺少路由挂载层的端到端断言。
- Risk: 若 `src/server/index.ts` 路由挂载顺序被误改、middleware 链组合被破坏，单元测试无法捕获；生产部署可能出现「单元测试全绿但路由 404/500」的回归。
- Reason Deferred: HARDEN-001A 范围限定为 D-012 P0 认证边界的 TDD specification-test；路由 wiring 端到端测试属于 HARDEN-001C 公开发布加固范围（Gate D 安全回归测试）。
- Resolve Before: HARDEN-001C 完成前。
- Related Files:
  - src/server/index.ts
  - src/server/security/auth.boundary.test.ts
  - docs/lumen-v2/tasks/active/HARDEN-001.md
- Resolution Requirements: HARDEN-001C 增补真实生产路由 wiring 回归测试，覆盖：路由挂载顺序、middleware 链组合、Express app 端到端认证流；测试应使用真实 `createApp` 或等价入口，而非仅 mock middleware。
- Resolution: 2026-07-21 HARDEN-001C 通过新建 `src/server/security/route.wiring.test.ts`（13 tests）关闭。测试动态 import 真实 `src/server/index.ts` 的 Express app，覆盖 AC-C01~AC-C07：`/api/health` 公开可达、`/api/auth` 无 JWT 可达、5 个受保护路由无 JWT 返回 401、`/api/worker` 无 CRON_SECRET 返回 401/403、未知 `/api` 路径返回 404、health 响应不含敏感字段、生产 app 启用 trust proxy。8 门禁全绿（client 194 + server 292 = 486 root tests）。

### DEBT-HARDEN-001A-03: 明确 Vercel trust proxy / req.ip 假设

- Status: RESOLVED
- Severity: P2
- Introduced By: HARDEN-001A
- Context: AC-A09 测试覆盖了「无 trust proxy 时 X-Forwarded-For 不影响 key」和「有 trust proxy 时分区」，但生产部署中 Vercel 是否启用 trust proxy、`req.ip` 在 Vercel Serverless 下的实际值未在代码或文档中显式声明。`authThrottle.ts` 使用 `req.ip` 派生 HMAC key，若 Vercel 实际行为与假设不一致，可能导致限流被绕过或误锁。
- Risk: Vercel Serverless 下 `req.ip` 行为可能与传统 Express 不同；若 trust proxy 未显式设置，攻击者可通过伪造 X-Forwarded-For 绕过限流；若 trust proxy 设置错误，可能误锁合法用户。
- Reason Deferred: HARDEN-001A 范围限定为认证边界 TDD；Vercel trust proxy 配置属于 HARDEN-001C 公开发布加固范围。
- Resolve Before: HARDEN-001C 完成前或合并到 main 后首次生产部署前。
- Related Files:
  - src/server/security/authThrottle.ts
  - src/server/index.ts
  - src/server/security/auth.boundary.test.ts
- Resolution Requirements: 在 `src/server/index.ts` 或部署文档中显式声明 Vercel trust proxy 配置；在 `authThrottle.ts` 注释中说明 `req.ip` 在 Vercel Serverless 下的预期行为；HARDEN-001C 增补 Vercel 部署环境下的限流回归测试。
- Resolution: 2026-07-21 HARDEN-001C 通过 `src/server/index.ts` 添加 `app.set('trust proxy', 1);`（无条件信任第一跳代理）+ 新建 `src/server/security/trust.proxy.production.test.ts`（3 tests）关闭。生产代码注释明确说明：D-034 / HARDEN-001C (DEBT-HARDEN-001A-03): trust the first proxy hop so `req.ip` reads from `X-Forwarded-For` on Vercel. Without this, every login-failure throttle bucket collapsed to the reverse-proxy IP and the throttle was effectively disabled. AC-C08（trust proxy 非 false）+ AC-C09（设置值类型稳定）全部 PASS。8 门禁全绿（client 194 + server 292 = 486 root tests）。

### DEBT-HARDEN-001A-04: 后续清理 dist 测试重复计数

- Status: RESOLVED
- Severity: P2
- Introduced By: HARDEN-001A
- Context: Gate 5 server tests 报告 `52 files / 514 tests` 包含 `dist/*.js` 编译产物重复计数。PERSIST-001 FINAL-CLOSURE-FIX-01 已清理 dist/ 后真实计数为 `224 tests / 25 files`；但 HARDEN-001A 证据中 `52 files / 514 tests` 仍包含 dist 重复（257 source + 257 dist）。报告与实际 unique 测试数不一致。
- Risk: 报告中测试数虚高，影响验收可追溯性；后续审查者需交叉核对才能确定真实 unique 测试数；可能掩盖测试覆盖率下降。
- Reason Deferred: HARDEN-001A 范围限定为认证边界 TDD；dist/ 清理属于工程基线维护，不在本批次范围。PERSIST-001 已建立 dist/ 清理先例。
- Resolve Before: HARDEN-001B 启动前或 HARDEN-001C 完成前。
- Related Files:
  - src/server/dist/
  - src/server/vitest.config.ts
  - docs/lumen-v2/evidence/HARDEN-001A/gate-results.md
  - docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md
  - docs/lumen-v2/evidence/HARDEN-001B/gate-results.md
- Resolution: 2026-07-21 HARDEN-001B 通过新建 `src/server/vitest.config.ts` 根本解决。`test.exclude` 显式包含 `'**/dist/**'`，使 vitest 不再扫描编译产物。HARDEN-001B 门禁真实计数：27 files / 269 tests（纯源码），无需手动清理 dist/。后续任务无需再依赖手动 `Remove-Item src/server/dist` 维护测试计数准确性。

<!--
  说明：
  - AGENTS.md 第 7 节"禁止行为"列出的是协作规则，不是技术债。
  - Lumen V2 的已知限制（同步请求接近平台上限、持久化缺失、Vercel /tmp 配置丢失、
    默认密码/JWT、UI 暴露模型等）已作为任务 ID 在 docs/lumen-v2/tasks/backlog/ 中
    跟踪（JOB-001 / STORAGE-001 / HARDEN-001 / UI-001 等），不在此重复登记。
  - 当某个 Lumen V2 任务验收为 MVP_PASS_WITH_DEBT 时，GPT 指出的 P1 技术债应
    追加到本文件，并标注 Introduced By 为对应任务 ID。
  - BASE-001 验收为 MVP_PASS_WITH_DEBT 时，GPT 指出的 5 项 P2/Process 债务
    已于 2026-07-17 追加到本文件（DEBT-REPORT-01 / DEBT-REPORT-02 / DEBT-STATE-01
    / DEBT-EVIDENCE-01 / DF-RULES-01）。其中 DEBT-REPORT-01 和 DEBT-REPORT-02
    在 Trae 验收落库时已修复（Status=RESOLVED）。
-->
