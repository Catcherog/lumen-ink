# STORAGE-001 GPT 验收报告

- 验收日期：2026-07-18（Asia/Shanghai）
- 审查分支：`lumen/storage-001-trae`
- 审查 commit：`abcc103394f86b87ae37af1bd6172f984e9d46e6`
- 结论：`MVP_PASS_WITH_DEBT`
- 验收方式：风险驱动审查修订 diff、CloudBase mock 合约与官方主源；独立重跑新增 6 用例。未重复 FLOW-001 视觉证据和未变更的原 STORAGE PoC。

## 验收结论

冻结候选 A：**Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage**。

同时冻结以下边界：

1. GitHub 仅保存源码、规格、脱敏证据和小型合成 fixture，不得承担运行时数据库、对象存储或 GenerationJob 状态存储。
2. 当前不升级 Vercel Pro；Hobby Function 300 秒上限覆盖当前 80—100 秒 Provider 调用，但 PERSIST-001 必须实现真实 Job 状态、幂等、恢复与 best-effort 取消，不得把同步 HTTP 请求当作唯一事实源。
3. CloudBase Workflow 单节点 60 秒，不用于当前 Provider 长调用；CloudBase CloudRun 只保留为未来容量/长任务升级选项，本轮不部署。
4. Cloudflare R2 仅作为未来 S3 迁移备选，不再构成当前账号门槛。
5. 本轮不创建 CloudBase 真实环境、不索取或写入密钥、不连接生产数据；真实环境开通和凭据配置仍由用户执行。

## 已确认项

- 三个完整候选均覆盖数据库、私有对象存储/签名 URL、恢复、删除、本地替代、成本和回滚；固定权重评分为 A=83、B=78、C=82，A 通过资格线并符合当前账号/预算方向。
- 官方资料支持本轮关键事实修订：Vercel Hobby 300 秒、Private Blob 与签名 URL、Postgres 转 Marketplace；CloudBase PG Storage 支持私有 Bucket 与 `createSignedUrl`，Workflow 单节点上限 60 秒，个人版参考价 19.9 元/月。
- `cloudbase-mock.ts` 未接入生产路径、不读凭据；6 个合成用例覆盖字段映射、事务回滚、签名 URL、级联删除、lease 过期和幂等防重。
- GPT 独立执行新增合约：`npm test --prefix src/server -- domain/cloudbase-mock.contract.test.ts`，1 file / 6 tests passed，exit 0。
- GPT 最终重新执行统一 8 门禁，全部 exit 0：client lint 0 errors；client/server typecheck；client 104；server 34；root 138；build；协作/公开仓库安全扫描。server/root 当前计数包含 `npm run build` 生成到忽略目录的编译测试副本；Trae 在 build 前记录的 28/132 仍对应源测试集合，二者均无失败。
- `abcc103` 仅包含 STORAGE-001 修订范围；既有工作区无关修改未混入该提交。

## P1 技术债：PERSIST 契约收敛

当前 `src/server/domain/persistence.ts` 是 STORAGE PoC 的简化接口：实体字段和 Job 状态粒度低于 PERSIST 设计；lease/idempotency helper 也仍是具体 mock 扩展而非稳定仓储语义。它足以证明候选 A 可适配，但不能原样充当最终生产闭环契约。

本问题不否定供应商选择，也不再触发一轮 STORAGE 返工。按 D-040，PERSIST-001 的首个执行门必须在同一任务内完成一次契约收敛并用合约测试锁定，之后才接生产 CloudBase adapter 和业务服务。收敛至少覆盖：

- Project/Asset/Version/GenerationJob 的完整字段与细粒度真实状态；
- `(projectId, idempotencyKey)` Job 唯一性与 `jobId` Version 唯一性；
- 带 worker/lease token 的原子 claim、heartbeat、条件完成与过期接管；
- 事务回调使用同一事务上下文，证明 Asset → Version → Job succeeded 的提交顺序；
- 旧 worker 在 lease 失效后不得写入成功结果；失败/取消不得暴露成功 Version。

## 状态裁决

- STORAGE-001：`MVP_PASS_WITH_DEBT`，归档至 `tasks/completed/`。
- `storage-options.md` 写入 `decision: frozen`。
- 激活扩大执行包 `PERSIST-001 / ready_for_trae / nextActor=trae`。
- Trae 在一个任务 ID、一个分支、一个最终验收周期内连续执行：契约收敛 → CloudBase 生产适配 → PERSIST Tasks 2—11 → 内部安全 Task 5—7 → PERSIST Task 12 最终证据。
- 除硬停止条件外，中间不做普通阶段交接；不得启动 ROUTING、完整公开发布 HARDEN、多工作区 IAM、Preview 或非关键 UI 优化。
