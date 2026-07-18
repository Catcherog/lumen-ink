# SESSION HANDOFF｜窗口交接

> 当前快照；历史见 `CHANGELOG.md`。

## 当前状态

- 日期：2026-07-18
- 当前任务：`STORAGE-001`
- 状态：`awaiting_gpt_acceptance / nextActor=gpt`（用户授权 GPT 进行技术判断；Trae 修订完成，等 GPT 验收冻结）
- 分支：`lumen/storage-001-trae`（基于 `lumen/flow-001-trae`）
- Trae 报告：`docs/lumen-v2/reports/STORAGE-001-TRAE-REPORT.md`（含修订章节）
- 选型报告：`docs/lumen-v2/storage-options.md`（推荐候选 A：Vercel Hobby + CloudBase PG + CloudBase PG Storage，83/100 vs 82/100 vs 78/100）
- PoC 证据：
  - `docs/lumen-v2/evidence/STORAGE-001/poc-result.md`（原 3 合约测试通过）
  - `docs/lumen-v2/evidence/STORAGE-001/cloudbase-mock-poc-result.md`（**新增**：CloudBase mock adapter PoC 6 用例全部通过）
- 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`
- 冻结状态：**未冻结**。本文件不写 `decision: frozen`。GPT 验收通过后由 GPT 写入冻结并更新 STATE.json 激活 PERSIST-001。

## STORAGE-001 修订背景（2026-07-18）

用户重新打开 STORAGE-001 局部选型修订，明确决策方向：

- 首选架构：**Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage**（候选 A）。
- 当前不注册 Cloudflare，不升级 Vercel Pro。
- GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储。
- 当前仍只允许执行 STORAGE-001 修订；禁止启动 PERSIST-001。
- 不得自行写入 `decision: frozen`，修订完成后交回 GPT 验收冻结。

## STORAGE-001 提交记录

| 顺序 | Commit | 说明 |
|------|--------|------|
| 0 | `37c381d` | `docs(lumen-v2): accept FLOW-001 and start internal fast track` |
| 1 | `d59abbd` | `docs(lumen-v2): STORAGE-001 compare two complete stacks` |
| 2 | `13342b0` | `feat(lumen-v2): STORAGE-001 persistence contract PoC` |
| 3 | `d85bae2` | `feat(lumen-v2): STORAGE-001 decision and PoC`（原 Task 3 状态推进 + 8 门禁证据） |
| 4 | (待提交) | `docs(lumen-v2): revise STORAGE-001 for CloudBase`（修订：新增候选 A + CloudBase mock PoC + 事实修正 + 状态推进） |

## STORAGE-001 修订 8 条门禁（全部 EXIT=0）

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | exit 0 |
| `npm test --prefix src/client` | 4 files / **104 passed** |
| `npx tsc --noEmit -p src/server/tsconfig.json` | exit 0 |
| `npm test --prefix src/server` | 5 files / **28 passed**（含 6 个新 CloudBase mock 测试） |
| `npm test` | 9 files / **132 passed**（104 client + 28 server） |
| `npm run build` | exit 0，client + server 构建成功 |
| `node scripts/check-lumen-collab.mjs` | exit 0，"Lumen collaboration state and basic public-repo safety checks passed." |

证据文件：`docs/lumen-v2/evidence/STORAGE-001/gate-*.txt`。

## STORAGE-001 修订范围遵守

- ✅ 仅执行 STORAGE-001 修订，未启动 PERSIST-001。
- ✅ 严格保留工作区无关修改：精确 `git add <path>`。
- ✅ 保留已冻结的 `PersistenceDependencies` 和 `JobExecutor` 接口表面不变。
- ✅ CloudBase 本轮不创建真实环境，不索取或写入密钥，不连接生产数据。
- ✅ 不修改生产 Provider、上传、Job 或 Version 运行路径。
- ✅ 不使用 CloudBase 可视化 Workflow 执行 80—100s Provider 调用（单节点 60s 限制）。
- ✅ 未写 `decision: frozen`。

## 修订内容摘要

### 一、修正过时事实（详见 `storage-options.md` §1.1）

- 删除「Vercel Blob 仅支持公开 URL」结论；记录其目前支持私有 Blob 和签名 URL。
- 删除「Vercel Pro 是 80—100s 任务的技术必需条件」；Hobby 当前上限为 300 秒。
- 删除「Vercel Postgres 包含在 Pro」；记录 Vercel Postgres 已停止，新项目需 Marketplace 数据库。
- 修正 Workflow 计费信息，不再写「Beta 期间免费」。
- 补记最终 STORAGE 提交 `d85bae2`。
- 修正本文件与 `docs/ai/PROJECT_STATE.md` 中过时状态。

### 二、新增首选候选 A 并评估（详见 `storage-options.md` §2、§4）

候选 A：**Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage**。

能力映射：

- Project/Asset/Version/GenerationJob/AuthThrottle：CloudBase PostgreSQL。
- ObjectStore：CloudBase PG 私有 bucket。
- getSignedUrl：CloudBase createSignedUrl。
- UnitOfWork：PostgreSQL 事务。
- JobExecutor：现有 Vercel Node Function。
- 任务恢复：数据库 Job 状态 + lease/heartbeat + 幂等键 + 显式 retry。
- 图片处理：继续使用现有 Node.js/Sharp，不迁移到 Edge Runtime。
- 本地开发：现有 LocalPersistence adapter，不要求联网或真实账号。

评分矩阵（100 分固定权重）：

| 候选 | 总分 | 资格线 |
|------|------|--------|
| A. Vercel Hobby + CloudBase PG + CloudBase PG Storage | **83** | ✓ |
| B. Vercel Hobby + Marketplace Postgres + Vercel Private Blob | 78 | ✓ |
| C. Supabase all-in-one | 82 | ✓ |

### 三、明确边界（详见 `storage-options.md` §3）

- GitHub 仅用于源码、规格、脱敏证据和小型合成 fixture。
- CloudBase 本轮不创建真实环境，不索取或写入密钥，不连接生产数据。
- 不修改生产 Provider、上传、Job 或 Version 运行路径。
- 不使用 CloudBase 可视化 Workflow 执行 80—100s Provider 调用（单节点 60s 限制）。
- CloudBase CloudRun 仅登记为未来容量/长任务升级选项，本轮不部署。

### 四、PoC 与测试（详见 `cloudbase-mock-poc-result.md`）

- 新建 `src/server/infrastructure/persistence/cloudbase-mock.ts`：CloudBase mock adapter PoC，实现冻结的 `PersistenceDependencies` 接口，内部维护 PG-style snake_case 行结构 + camelCase 双向 mapper + PoC-only helper（lease/heartbeat/idempotency）。
- 新建 `src/server/domain/cloudbase-mock.contract.test.ts`：6 个测试用例覆盖 6 个必需场景：
  1. repository CRUD 与字段映射（camelCase ↔ snake_case 双向 round-trip）。
  2. UnitOfWork 事务失败不产生部分 Version/Job 成功状态。
  3. 私有对象签名 URL 适配（含 expiry 与确定性 signature）。
  4. 项目删除清理元数据和对象（级联删除）。
  5. Job lease 过期后可以安全重试（leaseSeconds TTL + 第二个 worker 安全接管）。
  6. 同一 idempotencyKey 不产生重复 Version。
- 测试结果：6 tests passed in 9ms（不要求 CloudBase 账号作为前置条件）。
- 不接入生产路径；只更新设计映射和 mock 合约。

### 五、决策材料（详见 `storage-options.md` §4、§6）

- 重算固定 100 分矩阵，比较 A/B/C 三方案，Cloudflare R2 保留为未来 S3 迁移备选但不再是当前账号门槛。
- 成本按阶段表达：
  - 当前非商业内部 PoC：Vercel Hobby + CloudBase 免费试用/个人额度。
  - CloudBase 个人版参考 19.9 元/月；实际以账号地区和控制台报价为准。
  - 若转为商业用途：重新审查 Vercel Pro 和 CloudBase 正式环境费用。
- 不再使用「固定 $20—25/月」结论。

## GPT 验收指引

按变更风险驱动验收，建议聚焦：

1. 修订 diff：`storage-options.md` 全面重写、`cloudbase-mock.ts` 新增、`cloudbase-mock.contract.test.ts` 新增 6 用例。
2. 事实修正记录（`storage-options.md` §1.1）：5 项过时结论的修正是否准确。
3. 边界声明（`storage-options.md` §3）：GitHub / CloudBase / 生产路径 / 接口冻结 4 类边界是否完整。
4. 评分矩阵（`storage-options.md` §4）：A=83 / B=78 / C=82 的逐项打分是否合理。
5. CloudBase mock adapter PoC（`cloudbase-mock-poc-result.md`）：6 个必需场景是否完整覆盖。
6. 8 条门禁结果（见上表）：真实退出码与测试数。

无需重审 FLOW-001 视觉证据（已冻结）；未变更的 FLOW-001 文件不重审；本轮不重审原 STORAGE-001 PoC（已冻结）。

## 仍需 GPT 冻结的事项

1. 是否接受候选 A（Vercel Hobby + CloudBase PG + CloudBase PG Storage）为冻结方案。
2. 是否确认 GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储的硬边界。
3. 是否确认 CloudBase CloudRun 仅作为未来容量/长任务升级选项，本轮不部署。
4. 是否确认 Cloudflare R2 保留为未来 S3 迁移备选，不再是当前账号门槛。
5. GPT 验收通过后由 GPT 写入 `decision: frozen` 到 `storage-options.md`，并更新 `STATE.json` 为 `PERSIST-001 / ready_for_trae / nextActor=trae`，解除 PERSIST-001 阻塞。

## 下一步

1. GPT 验收 → 写入 `decision: frozen` → STATE.json 推进至 `PERSIST-001 / ready_for_trae / nextActor=trae` → 解除 PERSIST-001 阻塞。
2. GPT 未冻结前，PERSIST-001 保持阻塞；任何窗口不得提前实施 PERSIST-001。
3. 冻结后执行 `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 4—8（PERSIST-001 主体）+ Task 5—7（内部安全底线）。

---

## 历史快照（FLOW-001 已归档）

- FLOW-001 验收 commit：`7fca3f5`（已 push，含 `7601274`）
- 分支：`lumen/flow-001-trae`
- Trae 报告：`docs/lumen-v2/reports/FLOW-001-TRAE-REPORT.md`（已追加 §15 第二轮 R2 返工记录）
- GPT 验收报告：`docs/lumen-v2/reviews/FLOW-001-GPT-REVIEW.md`（第三轮 `MVP_PASS`）

## GPT 第三轮验收结论（FLOW-001）

- 结论：`MVP_PASS`。
- P0-01-R2：URL-only SET_RESULT 已清空旧 base64；真实复现与四类结果状态测试通过。
- P0-02-VERIFY-R2：真实文件输入添加、Prompt/history/request payload 数量一致性测试通过；19/18 计数已纠正。
- GPT 独立 8 条门禁全部 `EXIT_CODE=0`：client 104、server 16、root 120，lint/typecheck/build/安全扫描通过。
- 未发现新 P0/P1；FLOW-001 已归档，STORAGE-001 已激活；PERSIST-001 继续阻塞。

## 范围边界

- 仅修 STORAGE-001 选型材料与新增 CloudBase mock PoC；
- 未修改生产 Provider、上传、Job 或 Version 运行路径；
- 未修改 `/api/edit` 协议、Provider 实现、存储协议；
- 未启动 PERSIST-001。

## 后续加速方向（已确认，尚未激活）

用户已确认：FLOW-001 通过后，STORAGE-001 仍单独完成方案比较、PoC 与 GPT/用户冻结；冻结后激活扩大执行包 `PERSIST-001`，一次交付原 VERSION-001 与 JOB-001 的项目、不可变版本和可恢复生成闭环。设计、任务包与实施计划已落盘，但当前不得提前实施。

## 内部稳定版加速包（用户已批准）

- 目标：优先达到 3 人内部团队稳定使用；非必要 S2/S3 统一登记后延，不阻塞主线。
- 当前唯一可执行任务仍为 `STORAGE-001 / awaiting_gpt_acceptance / nextActor=gpt`。
- 连续执行入口：`docs/lumen-v2/prompts/INTERNAL-FAST-TRACK-TRAE.md`。
- 冻结前执行：`INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 0—3；Task 0 只落地 FLOW GPT 控制面，Task 1—3 完成 STORAGE 选型、PoC、稳定契约和验收包。
- 冻结后执行：仅当 GPT 更新 STATE 为 `PERSIST-001 / ready_for_trae / nextActor=trae`，才执行既有 PERSIST Task 1—11、快速计划 Task 5—7、最后执行 PERSIST Task 12 统一证据交接。
- 禁止提前启动 ROUTING、完整公开发布 HARDEN、多工作区 IAM、Preview 或非关键 UI 优化。
- GPT 本轮只完成规格与计划落盘，未修改生产代码、未提交、未 push；由 Trae 精确选择本轮控制面文件提交，保留工作区既有无关修改。
