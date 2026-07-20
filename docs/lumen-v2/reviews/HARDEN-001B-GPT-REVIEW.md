# HARDEN-001B GPT Review｜Provider Key 安全迁移证据审查

> **审查时间**：2026-07-21（Asia/Shanghai）
> **审查类型**：远端仓库 Diff + 提交证据审查
> **Reviewed Baseline**：`4e720b6`
> **Reviewed Head**：`4483a7c`
> **Verdict**：`EVIDENCE_REVIEW_PASS`
> **Next Owner**：Trae（合并并立即进入 HARDEN-001C）
> **Codex Necessity**：`NOT_REQUIRED`

---

## 1. Verdict

**`EVIDENCE_REVIEW_PASS`**

HARDEN-001B 核心目标 D-011 已满足，可以合并并立即进入 HARDEN-001C。

该结论表示：基于提交到远端分支的代码、测试、状态文件和门禁记录通过；不表示 GPT 在本地独立重跑了全部 463 个测试。

---

## 2. Acceptance Criteria Review

### AC-B01：Provider 配置迁离 `/tmp` — **PASS**

`DEFAULT_DATA_DIR` 已不再根据 `VERCEL` 切换到 `/tmp/lumen-ink-data`，统一指向项目目录下的本地数据路径。D-011 的权威要求是 Production Provider 配置不得依赖 `/tmp`，P0 优先通过环境变量管理；当前实现符合该要求。

### AC-B02：deployed 生命周期不读写 Provider 文件 — **PASS，附证据表述修正**

`load()` 在 deployed 模式进入 `loadFromEnv()`；`loadFromEnv()` 不操作 Provider 文件；`save()` 在 deployed 模式直接返回。CRUD 测试覆盖了 `list/get/getDefault/create/update/delete/setDefault`。

但"整个 cold start 零 fs 操作"的说法过宽：模块加载阶段的 `findProjectRoot()` 仍会调用 `fs.existsSync` 和 `fs.readFileSync` 检查 `package.json`。新增测试是在模块导入完成后才安装 spy，因此证明的是 **Provider 生命周期方法不操作 fs**，不是整个 Node 进程冷启动完全没有 fs 调用。

该问题不违反 D-011，因为这些读取不涉及 Provider 配置、密钥或 `/tmp`，不阻塞合并。

### AC-B03 / AC-B06：deployed 模式不创建目录或 `providers.json` — **PASS**

deployed 分支不会进入 `ensureDataDir()` 或 `save()` 的文件写入路径；测试验证 cold start 和 CRUD 后均没有产生 `providers.json`。

### AC-B04：Provider Key 不返回前端 — **PASS**

`ProviderStore.list()` 删除真实 `apiKey` 并返回空字符串；Provider HTTP 路由又进行第二层 `sanitize()`，覆盖列表、创建、更新和设置默认 Provider 的响应。

### AC-B05：Provider 错误日志脱敏 — **PASS**

损坏的 Provider 文件内容不会进入日志，日志包含稳定错误码 `PROVIDER_STORE_LOAD_FAILED`。

非阻塞说明：Red 阶段测试使用 `mock.calls[0].join(' ')` 转换日志参数，因此 `[object Object]` 是该测试转换方式观察到的结果。当前 `JSON.stringify` 修改仍然安全，但不应将这项证据表述为已证明所有运行环境原先都无法显示结构化对象。

### AC-B07：local delete 清理行为 — **PASS**

测试同时覆盖：

- 已存在 Provider 被从 `providers.json` 删除；
- 不存在 ID 返回 `false`；
- 不存在 ID 时文件内容不变。

### AC-B08：`VERCEL=1` 误配置不再写入 `/tmp` — **PASS**

生产代码已经完全移除 `/tmp` 默认路径；显式 local `dataDir` 仍被正确使用。

### DEBT-HARDEN-001A-04 — **RESOLVED**

新增 `vitest.config.ts` 排除 `dist/**`，服务器门禁从重复扫描源码和构建产物，恢复为纯源码测试计数。

Vitest 官方建议在扩展默认排除项时使用 `configDefaults.exclude`。当前配置已经手工保留 `node_modules` 和 `.git` 并增加 `dist`，不阻塞本轮；后续可改为展开默认值以减少版本升级维护风险。

---

## 3. Diff Risks

1. **无 S0/S1 风险发现。**
2. `findProjectRoot()` 的模块初始化 fs 读取与"全 cold start 零 fs"表述不一致，但不涉及 Provider Key、Provider 文件或 `/tmp`。
3. 日志由对象参数改为 JSON 字符串后，可能降低部分日志平台的结构化字段检索能力；当前未构成安全或功能阻塞。
4. 新测试文件 361 行，相对 19 行生产 Diff 较重，但测试范围仍集中在 Provider 生命周期，没有扩张到 PERSIST、Cron、ROUTING 或认证代码。
5. 完成包提供的是 `/pull/new/lumen/harden-001b-trae` 创建入口，而不是已创建 PR 的正式编号。

---

## 4. Test Coverage Review

提交证据记录：

- Client：194 tests；
- Server：269 tests；
- Root：463 tests；
- 8 个门禁全部 PASS；
- 新增 12 个 Provider 生命周期测试；
- TDD 证据为 3 red → 12 green。

覆盖足以支持 HARDEN-001B 合并。

未执行仓库独立测试重跑：当前审查环境无法克隆远端仓库，且该提交没有 GitHub Actions workflow run。此限制不改变证据审查结论。

---

## 5. Missing Evidence

无阻塞性缺失。

HARDEN-001C 可补充以下非阻塞回归覆盖，不需要返工 HARDEN-001B：

1. 生产 Provider 路由级测试，直接断言全部 HTTP 响应均不含真实 `apiKey`。
2. 明确 AC-B02 的测试名称为"deployed Provider lifecycle performs no fs operations after module initialization"。
3. 评估日志平台是否需要保留对象形式的结构化字段。

---

## 6. Required Fixes

**无合并前代码修复要求。**

禁止为上述非阻塞说明重新开启一轮 HARDEN-001B 修复或 Codex 审计。

---

## 7. Codex Necessity

**`NOT_REQUIRED`**

理由：

- 未发现密钥泄露；
- 未修改鉴权、权限、事务、状态机、重试或 Cron；
- 核心 D-011 不变量通过代码与测试双重验证；
- 当前疑点仅属于测试表述精度和日志格式维护性。

---

## 8. Next Owner

**Trae**

---

## 9. Trae Immediate Execution Steps

1. 将本审查结果写入：`docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md`
2. 更新状态：
   - `reviewVerdict = EVIDENCE_REVIEW_PASS`
   - `harden001bStatus = complete`
   - `harden001bGptReviewVerdict = EVIDENCE_REVIEW_PASS`
   - `latestGptReview = docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md`
   - `status = gpt_evidence_review_pass`
   - `nextActor = user_or_trae_for_merge`
3. 将审查状态更新提交到 `lumen/harden-001b-trae`，不得修改生产代码。
4. 创建正式 PR：
   - Base：`main`
   - Head：`lumen/harden-001b-trae`
   - 必须确认实施提交仍为 `4483a7c`，其后仅允许 GPT review/state 文档提交。
5. 合并到 `main`。禁止 force-push。
6. 从合并后的最新 `main` 创建：`lumen/harden-001c-trae`
7. 立即实施 HARDEN-001C，不等待 PROD-CRON-VERIFY。
8. HARDEN-001C 必须同时关闭：
   - DEBT-HARDEN-001A-02：真实生产路由 wiring 回归；
   - DEBT-HARDEN-001A-03：Vercel trust proxy / `req.ip` 假设；
   - Gate D 剩余公开发布安全项；
   - Production flag 切换和回滚文档。
9. HARDEN-001 整体继续保持 active，直到 C 验收通过；ROUTING-001 继续阻塞。

---

## 10. Stop Conditions

只有出现以下情况才停止并回报 GPT：

- 合并前 branch head 与已审查提交范围不一致；
- 新增生产代码变化；
- 门禁重新运行出现失败；
- 发现真实 Secret、Provider Key 或用户数据进入日志/响应；
- HARDEN-001C 必须修改 PERSIST/Cron 状态机；
- 认证 wiring 或 trust proxy 无法通过仓库上下文确定。

---

**Status: `READY_FOR_TRAE_MERGE_AND_HARDEN_001C`**
