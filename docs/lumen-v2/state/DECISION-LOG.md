# 09｜决策日志

| ID | 日期 | 状态 | 决策 | 原因 | 影响 |
|---|---|---|---|---|---|
| D-001 | 2026-07-16 | 冻结 | V2 主线为摄影工作室内部 Pro 工作台 | 当前多身份造成信息架构冲突 | P0 不做客户营销入口 |
| D-002 | 2026-07-16 | 冻结 | Pro 与 Preview 分离 | 权限、复杂度、成本与隐私不同 | Preview 推迟至 P1 |
| D-003 | 2026-07-16 | 冻结 | 默认隐藏 Provider/模型 | 产品应屏蔽底层模型复杂度 | 顶栏改为项目与工作状态 |
| D-004 | 2026-07-16 | 冻结 | 最终只保留“生成预览”主操作 | 消除“应用/提交”双 CTA | FLOW-001 完成迁移 |
| D-005 | 2026-07-16 | 冻结 | 人像参数改为 5 档 | 模型不能兑现百分比精度 | Recipe 保存语义档位 |
| D-006 | 2026-07-16 | 冻结 | P0 使用不可变版本链而非图层 | 降低复杂度并保证恢复 | 底部版本条为核心 |
| D-007 | 2026-07-16 | 冻结 | IndexedDB 只能作缓存/原型，不能作为 3 人工作区唯一真相；正式方案由 STORAGE-001 决定 | 产品目标包含多人使用、恢复和审计 | VERSION/JOB 前必须完成技术选型 |
| D-008 | 2026-07-16 | 冻结 | P0 每次默认生成单结果 | 控制成本并减少选择负担 | 二次候选由用户再次生成 |
| D-009 | 2026-07-16 | 冻结 | 旧 history 不静默自动迁移 | 元数据无法保证图片可恢复 | 先备份，只读查看，显式导入 |
| D-010 | 2026-07-16 | 冻结 | V2 flag 只在本地和 Preview 开启；Production 默认关闭 | 防止未验收界面进入正式环境 | P0 验收后再切换 |
| D-011 | 2026-07-16 | 冻结 | Production Provider 配置不依赖 `/tmp`；P0 优先环境变量 | `/tmp` 不持久且动态 Key 无用户隔离 | 动态工作区 Key 随存储方案落地 |
| D-012 | 2026-07-16 | 冻结 | P0 保留单工作区认证，但取消默认凭据并限流 | 3 人团队可先控制范围，避免提前建设 IAM | 多用户与角色权限进入 P1 |
| D-013 | 2026-07-16 | 冻结 | UI 改造前先执行 BASE-001 | 当前 lint 失败且无测试 | UI-001 的前置门禁 |
| D-014 | 2026-07-16 | 冻结 | UI-001 仅做外壳和兼容适配，不在本轮实现单一 CTA | 单一 CTA 依赖 EditRecipe 和面板状态收敛 | FLOW-001 才执行按钮收敛 |
| D-015 | 2026-07-16 | 冻结 | 不允许用伪进度百分比表示生成过程 | 当前无真实阶段数据 | JOB-001 仅展示真实状态 |
| D-016 | 2026-07-16 | 冻结 | `AppV2` 通过 feature flag 与 Legacy 并存，旧代码暂不删除 | 降低改版回滚风险 | P0 放行后再清理 Legacy |
| D-017 | 2026-07-16 | 冻结 | REPO-SEC-001 Option A：不重写 Git 历史，仅 `git rm --cached` + `.gitignore` | 未发现真实凭据泄露；2 个 PRIVATE_REMOVE 文件仅含内部经营计划 | 接受旧提交中文件的剩余风险；23 个 PUBLIC_SAFE 文件仍保持跟踪 |
| D-018 | 2026-07-17 | 冻结 | BASE-001 验收结论 `MVP_PASS_WITH_DEBT`：5 项 P2/Process 债务登记到 `docs/ai/TECH_DEBT.md`，不在 UI-001 顺手修复 | 工程基线 7 条验收命令全部 EXIT_CODE=0；原 P0/P1 缺陷已修复；剩余 P2 债务不阻塞 MVP 推进 | UI-001 阻塞解除；`docs/ai/` 目录未提交到远端分支的问题由独立 docs-only 任务处理；后续任务在 clean checkout 执行验收命令、结果文件统一 UTF-8 |
| D-019 | 2026-07-17 | 冻结 | UI-001 保留旧 `ParamPanel` 与“应用/提交”按钮作为 FLOW-001 临时兼容区，不提前收敛为单一 CTA | 单一 CTA 依赖 EditRecipe 和面板状态收敛，UI-001 只做外壳；提前假收敛会制造虚假完成状态 | 右侧面板顶部显示临时债务提示条；FLOW-001 负责移除旧按钮并引入“生成预览” |
| D-020 | 2026-07-17 | 冻结（2026-07-17 P0 返工后修订） | V2 任务栏使用独立 `V2TaskId` 展示选择状态，与底层 `RetouchTool` 解耦；UI-001 不通过标签切换底层工具，真实「任务 → 工具 / Recipe」映射由 FLOW-001 实现 | UI-001 目标为结构外壳，工具路由与参数语义在 FLOW-001 实现；首轮实现让 TaskRail 调用 `setTool` 越界，被 GPT 验收 P0 驳回；返工后引入 `V2TaskId` 解耦 | 任务栏点击仅做 V2 展示高亮，不影响 `state.selectedTool`；ParamPanel 标题保持“修脸”不变；FLOW-001 为每个 V2TaskId 分配真实工具与配方 |
| D-021 | 2026-07-17 | 冻结 | UI-001 首轮 GPT 验收结论为 `MVP_FAIL`，只返工 2 项关键 P0：顶栏真实入口、任务栏展示态解耦 | commit `9dd2835` 的基线验证与视觉外壳通过，但存在空按钮及越界工具路由/双高亮；PR/CI 缺口降为非阻塞流程提醒 | UI-001 进入 `changes_requested`；FLOW-001 继续阻塞；返工不得提前实现 Recipe 或单一生成 CTA |
| D-022 | 2026-07-17 | 冻结 | UI-001 P0 返工方案：顶栏对比/导出接入 `ResultViewer` 真实能力 + 任务栏引入 `V2TaskId` 与 `RetouchTool` 解耦 | FIX_PACKET 要求「接入真实能力」+「独立 V2 展示选择状态」；不能用 DOM 查询、伪事件、空回调或“即将支持”弹窗假实现；不能越界改 `selectedTool` | `ResultViewer` 新增受控 `viewMode` props（兼容 Legacy）；`EditorHeader` 新增 `canCompare`/`canExport` 禁用态；`TaskRail` 移除 `setTool` 调用，改用 `V2TaskId`；D-020 同步修订；不实现 FLOW-001 范围内的内容 |
| D-023 | 2026-07-17 | 冻结 | UI-001 二轮 GPT 验收仍为 `MVP_FAIL`，仅保留 `UI001-P0-01-R2`：统一导出能力判定与 handler 支持类型 | commit `1f43d1f` 已关闭任务栏 P0，8 条门禁全通过；但纯文本结果会启用“导出”而 handler 无文本分支，仍是合法状态下的空入口 | UI-001 回到 `changes_requested / nextActor=trae`；仅修该直接回归，FLOW-001 继续阻塞 |
| D-024 | 2026-07-17 | 冻结 | UI-001 R2 返工方案：`canExport` 采用 FIX_PACKET 推荐的最小方案，仅当存在 `resultImage` 或 `resultImageUrl` 时启用“导出”；不实现文本导出 | 能力判定必须与 `handleExport` 实际支持类型 1:1 对齐；实现文本导出会越界扩展 UI-001 范围（UI-001 只做外壳，文本导出能力属于后续任务） | `AppV2.tsx` 删除 `hasResult`，`canExport = !!(state.resultImage \|\| state.resultImageUrl)`；4 种状态定向验证通过；UI-001 进入 `awaiting_gpt_acceptance / nextActor=gpt`；若后续任务要求支持文本结果导出，需在对应任务规格中显式声明并由该任务实现 |
| D-025 | 2026-07-17 | 冻结 | UI-001 第三轮验收 `MVP_PASS`；FLOW-001 采用同一任务 ID 的端到端扩大执行包，后续 GPT 使用变更风险驱动验收 | R2 唯一 P0 已关闭且 8 条门禁全绿；重复审计未变更视觉证据只增加往返，不提升风险覆盖 | UI-001 归档；FLOW-001 一次完成 Recipe、编译器、单 CTA、请求接线、测试和证据；未变更的已冻结证据不重复验收 |
| D-026 | 2026-07-17 | 冻结 | FLOW-001 落地 V2_TASK_TOOL_MAP：V2TaskId 与 RetouchTool 1:1 映射；`project` 任务 `tool=null` 不发起编辑；`subject=face`、`color=color`、`cleanup=repair`、`local=liquify`、`export=export` | UI-001 D-020 已将任务栏展示态与底层工具解耦，但真实路由推迟到 FLOW-001；本轮端到端扩大执行包要求"任务到 Recipe/工具的真实映射"在同一任务 ID 落地 | `EditRecipe.tool` 由 `V2_TASK_TOOL_MAP[taskId]` 派生，作为 `submitEdit` 的 `options.tool`；`V2_TASK_EDITABLE.project=false` 使 project 任务 CTA 禁用；测试覆盖六任务全部映射与 `defaultRecipe.tool` 一致性 |
| D-027 | 2026-07-17 | 冻结 | FLOW-001 Prompt 编译器 v1 输出自然语言中文 Prompt，未引入结构化 JSON；版本化字段 `version=1` + 首行 `# lumen-prompt v1` 显式标记 | 现有 Provider（Seedream / Gemini / OpenAI / GLM）均接受自然语言 Prompt，结构化 JSON 需 Provider 适配层，超出 FLOW-001 范围；版本化字段为 v2 演进留口 | 编译器为纯函数，同一 Recipe 恒定输出；保护项全分支（开启"保留 X" / 关闭"不要求保留 X"）、portrait 全档位短语、补充要求 trim、参考图与区域条件输出，均由 59 用例测试覆盖；v2 演进方向：结构化 JSON + Provider-specific 适配 |
| D-028 | 2026-07-18 | 冻结 | FLOW-001 首轮 GPT 验收 `MVP_FAIL`，仅返工 URL 当前结果数据源一致性与 V2 参考图真实链路两个 P0 | 92 tests 与工程门禁全绿，但 URL-only 结果后二次提交旧 base64；参考图只存在类型和单测赋值，真实 V2 UI 不可达 | FLOW-001 进入 `changes_requested / nextActor=trae`；STORAGE-001 继续阻塞；返工不得扩大到存储、任务或版本实现 |
| D-029 | 2026-07-18 | 冻结 | 用户确认 STORAGE-001 保持独立决策门；方案冻结后将 VERSION-001 与 JOB-001 合并为一次“项目版本与可恢复生成闭环”扩大执行包 | Version 创建、Job 成功事务、失败不污染版本、资产清理和刷新恢复共享同一一致性边界；拆分会产生临时接口与重复迁移 | 合并任务 ID 为 `PERSIST-001`；原 VERSION/JOB 已标记 superseded；FLOW 与 STORAGE 未通过前不得激活 |
| D-030 | 2026-07-18 | 冻结 | FLOW-001 P0 返工方案：P0-01 `canSubmit` 仅要求 `state.currentImage` 与 `submitEdit` 实际输入 1:1 对齐；P0-02 恢复 `ReferenceImages` 唯一入口并同步 `state.referenceImages` ↔ `recipe.auxiliary.referenceImageCount` ↔ 编译 Prompt ↔ `submitEdit` payload | FIX_PACKET 要求能力判定与请求实际支持的输入类型对齐；参考图入口必须在 V2 UI 可达，三层数据必须一致；不修改 `/api/edit` 协议或 `useEditor` reducer，避免越界 | `ContextPanel` 新增 `hasUrlOnlyResult` 与琥珀色提示；`handleReferenceImagesChange` 同步计数；`AppV2.handleGeneratePreview` 加防御检查与显式 `referenceImages` 传递；19 个回归用例（6 P0-01 + 11 P0-02 + 2 端到端）；8 条门禁全绿（110 tests）；状态 `awaiting_gpt_acceptance / nextActor=gpt` |
| D-031 | 2026-07-18 | 冻结 | FLOW-001 第二轮验收 `MVP_FAIL`；P0-01 必须从真实 reducer 状态验证，允许最小修改 `useEditor` reducer 维护当前输入不变量 | URL-only 响应后实际状态为旧 `currentImage` base64 与新 `currentImageUrl` 并存，现有 `!!currentImage` 判定和防御检查均会放行；现有测试错误构造为 `currentImage=null` | FLOW-001 回到 `changes_requested / nextActor=trae`；P0-02 生产接线保留，只补真实添加与请求 payload 回归；STORAGE-001 / PERSIST-001 继续阻塞 |
| D-032 | 2026-07-18 | 冻结 | FLOW-001 R2 返工方案：`useEditor.SET_RESULT` 重写为三种结果显式分支（base64 / URL-only / text-only），URL-only 时清空旧 base64；新建 `useEditor.test.ts` 真实复现 + payload 一致性测试；`ContextPanel.test.tsx` 补真实添加流程 | 第二轮 FIX_PACKET 要求从状态源头维护"当前画布输入"不变量，不得仅增加表面布尔判断；要求真实覆盖添加流程与 `submitEdit`/`/api/edit` payload 一致性，纠正 19/18 计数 | `SET_RESULT` 三分支：base64 结果 currentImage=新 base64 + currentImageUrl=同时返回 URL 或 null；URL-only 结果 currentImage=null + currentImageUrl=新 URL；text-only 保留既有 canvas。`useEditor.test.ts` 9 用例 + `ContextPanel.test.tsx` 1 用例 = R2 新增 10 用例；累计 P0 相关 28 用例（首轮 18 + R2 10）；8 条门禁全绿（client 104 / server 16 / root 120）；状态 `awaiting_gpt_acceptance / nextActor=gpt` |

| D-033 | 2026-07-18 | 冻结 | FLOW-001 第三轮验收 `MVP_PASS`，激活 STORAGE-001 技术选型 | commit `7fca3f5` 关闭 URL-only 旧 base64 状态错位和参考图有效回归缺口；GPT 独立 8 条门禁全绿，未发现新 P0/P1 | FLOW-001 归档；STORAGE-001 进入 `ready_for_trae / nextActor=trae`；PERSIST-001 继续阻塞，方案冻结前不得实施 |

| D-034 | 2026-07-18 | 冻结 | 内部稳定版优先采用“STORAGE 快速决策门 → PERSIST 连续扩大执行包 + 内部安全底线”的加速路径，非必要问题统一延期 | 用户明确选择优先让 3 人内部团队稳定使用；通过减少交接和延后 ROUTING/公开发布优化提速，同时保留数据一致性、恢复、删除和凭据安全硬门 | STORAGE 仍保留冻结门但压缩为两个方案与合成 PoC；PERSIST 加入最小内部安全单元；S0/S1 不得延期；完整 HARDEN 与 ROUTING 后移 |

| D-035 | 2026-07-18 | 提议（待用户冻结） | STORAGE-001 推荐候选 1：Vercel + Cloudflare R2 + Vercel Workflow；评分 84/100 vs Supabase 82/100；Vercel Blob 因不满足「私有对象/签名 URL」硬条件被拒绝 | 保留现有 Node.js/Express/Sharp 栈；Vercel Workflow 是两候选中唯一 durable execution；Edge Function 不支持 sharp；80—100s Provider 调用在 Pro 800s maxDuration 内有充足余量 | `account_gate: user`、`decision_authority: user`；待用户决策 Cloudflare 账号 + Vercel Pro 升级 + 月度预算 + Workflow Beta 风险 + 不可逆迁移审批；`storage-options.md` 未写 `decision: frozen`；PERSIST-001 继续阻塞 |

| D-036 | 2026-07-18 | 冻结 | STORAGE-001 冻结持久化与执行器稳定接口契约（9 个接口）：`ProjectRepository` / `AssetRepository` / `VersionRepository` / `JobRepository` / `ObjectStore` / `UnitOfWork` / `AuthThrottleRepository` / `PersistenceDependencies` / `JobExecutor` | PERSIST-001 必须消费这些接口不变；本地 PoC 已证明合约可实现（适配器重建恢复 + 级联删除 + UoW 回滚 + ObjectStore 缺失键行为，3 合约测试通过） | 接口签名不得在 PERSIST-001 期间重命名/删除/扩宽；新增字段必须可选且不破坏现有合约测试；生产 adapter（Vercel Postgres + R2 / Supabase）在 `src/server/infrastructure/persistence/` 与 `src/server/infrastructure/executor/`注册 |

| D-037 | 2026-07-18 | 冻结 | 用户重新打开 STORAGE-001 局部选型修订；首选架构为候选 A：**Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage**；当前不注册 Cloudflare、不升级 Vercel Pro；GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储；Cloudflare R2 保留为未来 S3 迁移备选 | 用户授权 GPT 进行技术判断；原候选 1（Vercel + Cloudflare R2 + Vercel Workflow）的账号门槛当前不满足；CloudBase 个人版参考 19.9 元/月；Hobby Function 300s 覆盖 80—100s Provider 调用 | GPT 于 `abcc103` 风险验收后冻结候选 A；PERSIST-001 激活；真实 CloudBase 环境开通与凭据配置仍由用户执行 |

| D-038 | 2026-07-18 | 冻结 | STORAGE-001 修订边界声明：GitHub 仅用于源码、规格、脱敏证据和小型合成 fixture；CloudBase 本轮不创建真实环境、不索取或写入密钥、不连接生产数据；不使用 CloudBase Workflow 执行 80—100s Provider 调用（单节点 60s）；CloudBase CloudRun 仅登记为未来选项 | 用户明确边界；生产路径修改超出 STORAGE 选型范围 | PERSIST 实施遵守同样安全边界；如需 CloudRun/R2/商业化，重新评估并显式决策 |

| D-039 | 2026-07-18 | 冻结 | STORAGE-001 事实修正：Vercel Blob 支持私有 Blob + 签名 URL；Hobby 300s 覆盖当前长调用；Postgres 走 Marketplace；Workflow 按 Steps + Storage + Functions 计费；最终修订 commit `abcc103` | GPT 使用 2026-07-18 官方主源复核 | 候选 B 重新纳入评估；Pro 不再是当前硬门槛；本轮不使用 Vercel Workflow |

| D-040 | 2026-07-18 | 冻结 | 候选 A 与抽象职责边界冻结，但 D-036 的 PoC 级精确签名由 PERSIST 首门一次性收敛 | PoC 实体/Job 状态、事务上下文、lease 所有权与幂等表面低于 PERSIST 恢复模型；退回新一轮 STORAGE 不改变供应商结论 | PERSIST Tasks 1—3 先以红→绿测试锁定完整字段、唯一约束、两 worker 接管、stale worker 拒写和同事务上下文；随后再次冻结 |
| D-041 | 2026-07-18 | 冻结 | STORAGE-001 验收 `MVP_PASS_WITH_DEBT`，激活 PERSIST-001 扩大执行包 | 官方主源支持关键事实，CloudBase mock 6 用例独立通过，无供应商选择 P0；用户要求减少非必要审计和增加 Trae 单次执行量 | STORAGE 归档；PERSIST `ready_for_trae / nextActor=trae`；契约收敛、生产适配、核心闭环与内部安全底线连续执行 |

| D-042 | 2026-07-18 | 冻结 | PERSIST-001 D-040 契约收敛完成：完整 Project/Asset/Version/GenerationJob 字段 + 9 阶段 Job 状态机 + `(projectId, idempotencyKey)` 唯一性 + lease/heartbeat/原子 claim + stale worker 拒写 + 同事务上下文；接口再次冻结 | PoC 级简化签名低于 PERSIST 恢复模型；红→绿测试锁定完整字段、约束和语义 | `PersistenceDependencies`（7 repositories + ObjectStore + UnitOfWork）+ `JobExecutor` 接口签名不得在后续任务中重命名/删除/扩宽；新增字段必须可选且不破坏现有合约测试 |

| D-043 | 2026-07-18 | 冻结 | PERSIST-001 原子成功边界：Object upload → DB 事务 → 条件完成；失败时补偿删除孤儿对象；metadata 级联删除事务化，object 删除 best-effort | 保证不会出现"错误成功 Version"或"孤儿对象"；失败不污染已有结果 | `ProjectService.createProject` 和 `GenerationService.executeJob` 均遵守此边界；补偿失败记录 diagnosticId 但不回滚 metadata |

| D-044 | 2026-07-18 | 冻结 | PERSIST-001 内部安全底线（D-034）落地：runtime secret fail-fast + durable auth throttle (HMAC-derived key) + CORS allowlist + 7-step image validation + allowlist redaction | S0/S1 安全要求不得延期；3 人内部团队稳定使用需要基本安全边界 | `loadRuntimeConfig` 部署模式 fail-fast；`createAuthMiddleware`/`createLogin`/`createAuthRouter` 工厂模式；`validateImageBytes` 7-step；`redactError` allowlist + 5 sensitive patterns |

| D-045 | 2026-07-18 | 冻结 | PERSIST-001 legacy history 显式导入而非静默迁移（D-009 落地） | 旧 `edit_history` 元数据无法保证图片可恢复；静默迁移会造成数据丢失假象 | `inspectLegacyHistory` 只读 → `exportLegacyBackup` JSON 下载 → `importRecoverableEntries` 逐条确认 + 失败恢复 + 备份保留 |

| D-046 | 2026-07-18 | 冻结 | PERSIST-001 首轮 GPT 验收 `MVP_FAIL`，仅返工 CloudBase/执行器生产接线、原子条件成功、取消/lease 竞态、冻结输入版本四个 P0 | 8 门禁全绿但风险反例证明 failed/cancelled Job 可留下或创建成功 Version；部署入口仍为 local + no-op executor，候选 A 未形成可运行闭环 | PERSIST-001 进入 `changes_requested / nextActor=trae`；ROUTING/HARDEN 继续阻塞；返工不得扩大到其他任务 |
| D-047 | 2026-07-21 | 冻结 | HARDEN-001A GPT 证据审查裁决 `EVIDENCE_REVIEW_PASS_WITH_DEBT`，不扩大修复范围，立即进入 HARDEN-001B | TDD 全绿（33 测试覆盖 AC-A02~A13），D-034 内部安全底线已满足全部 AC，8 门禁全绿（client 194 + server 514 = 708 root tests）；4 项非阻塞 P2 debt 已登记（AC-A04 NOT_APPLICABLE / 真实生产路由 wiring 回归测试 / Vercel trust proxy 假设 / dist 测试重复计数） | HARDEN-001A `gpt_evidence_review_pass / nextActor=user_or_trae_for_merge`；合并 PR #2 后立即创建 `lumen/harden-001b-trae` 分支；PROD-CRON-VERIFY 保持并行不阻塞；ROUTING-001 继续保持阻塞；HARDEN-001 整体不归档，需 B/C 也通过 |
| D-048 | 2026-07-21 | 冻结 | HARDEN-001B D-011 Provider Key 迁离 `/tmp`：移除 `DEFAULT_DATA_DIR` 中 `process.env.VERCEL ? '/tmp/lumen-ink-data' : ...` 硬编码分支；修复 `redacted.log` 序列化 bug（`console.error` 输出 `[object Object]` → `JSON.stringify`）；新建 `src/server/vitest.config.ts` 根本解决 DEBT-HARDEN-001A-04（dist/ 测试重复计数） | D-034 已在 PERSIST-001 落地 env-managed 模式（deployed 模式从环境变量重建，无 fs 写入），但 `ProviderStore.ts` 仍残留 `/tmp` 硬编码分支违反 D-011；TDD red→green 模式确保最小生产代码改动；12 测试覆盖 AC-B01~B08 全部 D-011 不变量；8 门禁全绿（client 194 + server 269 = 463 root tests，dist/ 已通过 vitest.config.ts 排除） | HARDEN-001B `awaiting_gpt_acceptance / nextActor=gpt`；不修改 PERSIST-001 业务逻辑、Cron 配置、认证代码；DEBT-HARDEN-001A-04 标记为 RESOLVED；HARDEN-001 整体不归档，需 C 也通过；PROD-CRON-VERIFY 保持并行；ROUTING-001 继续保持阻塞 |
| D-049 | 2026-07-21 | 冻结 | HARDEN-001B GPT 证据审查裁决 `EVIDENCE_REVIEW_PASS`，无 S0/S1 风险，无阻塞修复，无 Codex 必要，可合并并立即进入 HARDEN-001C | AC-B01~B08 全部 PASS；DEBT-HARDEN-001A-04 RESOLVED；4 项非阻塞说明已登记到 STATE.json `harden001bGptReviewNonblockNotes`（AC-B02 表述修正 / AC-B05 表述修正 / vitest.config.ts 后续改进 / HARDEN-001C 应补充生产 Provider 路由级测试）；Codex NOT_REQUIRED（未发现密钥泄露，未修改鉴权/权限/事务/状态机/重试/Cron，核心 D-011 不变量通过代码与测试双重验证） | HARDEN-001B `gpt_evidence_review_pass / nextActor=user_or_trae_for_merge`；Trae 合并 PR 后创建 `lumen/harden-001c-trae` 分支立即实施 HARDEN-001C（必须关闭 DEBT-HARDEN-001A-02/03 + Gate D 剩余公开发布安全项 + Production flag 切换和回滚文档）；HARDEN-001 整体不归档，需 C 也通过；PROD-CRON-VERIFY 保持并行不阻塞；ROUTING-001 继续保持阻塞 |
| D-050 | 2026-07-21 | 冻结 | HARDEN-001C 公开发布加固实施完成：通过 TDD red→green 关闭 GPT 任务卡指定的全部范围（DEBT-HARDEN-001A-02 真实生产路由 wiring 回归测试 + DEBT-HARDEN-001A-03 Vercel trust proxy / req.ip 假设 + Gate D 剩余公开发布安全项日志脱敏 + Production flag 切换和回滚文档） | GPT 审查任务卡要求 HARDEN-001C 必须同时关闭 4 项范围；TDD red→green 模式确保最小生产代码改动；3 个生产文件修改（index.ts trust proxy + projects.ts redactError + detect.ts redactString）+ 3 个新测试文件（route.wiring 13 + trust.proxy 3 + log.redaction 7 = 23 tests）+ 1 个新 runbook 文档；DEBT-HARDEN-001A-02/03 RESOLVED；不修改 PERSIST-001 业务逻辑/Cron/认证 middleware；Codex NOT_REQUIRED | HARDEN-001C `awaiting_gpt_acceptance / nextActor=gpt`；8 门禁全绿（client 194 + server 292 = 486 root tests，+23 vs HARDEN-001B 463）；AC-C01~AC-C14 全部 PASS；HARDEN-001 整体不归档，需 GPT 证据审查通过后才归档并解除 ROUTING-001 阻塞；PROD-CRON-VERIFY 保持并行；ROUTING-001 继续保持阻塞 |

## 新增决策格式

```text
ID：D-XXX
日期：
提出者：
状态：提议 / 冻结 / 废弃
问题：
候选方案：
最终决策：
理由：
影响范围：
回滚条件：
```
