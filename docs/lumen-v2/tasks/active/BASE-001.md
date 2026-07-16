# Trae Prompt｜BASE-001 工程基线修复

## 0. 必读文件

按顺序读取：

1. `00-PROJECT-MEMORY.md`
2. `11-SCAN-001-REVIEW.md`
3. `09-DECISION-LOG.md`
4. `07-ACCEPTANCE-PLAN.md`
5. `scans/SCAN-001-main-repo-report.md`

确认任务 ID 为 `BASE-001` 后再操作。

## 1. 任务目标

在不改变现有可见产品行为、API 契约和 Provider 输出的前提下：

1. 修复当前 client lint 的 2 个错误和 2 个警告；
2. 为 client、server 和根目录建立可执行的 test 命令；
3. 添加最小但真实的自动化测试；
4. 补齐 SCAN-001 没有逐行核对的面板事实；
5. 输出干净、可重复的工程基线。

## 2. 必须先补充扫描

逐行检查并在 `docs/lumen-v2/current-state-scan-addendum.md` 记录：

- `PromptInput.tsx`
- `ColorMatchingPanel.tsx`
- `LiquifyPanel.tsx`
- `CleanupPanel.tsx`
- `RemovePeoplePanel.tsx`
- client/server/root `package.json`
- ESLint 配置
- 是否已有测试相关依赖或配置

事实表至少包含：

- 参数字段、默认值和取值范围；
- 是否存在独立“应用/提交”按钮；
- Prompt 在哪里生成；
- 调用 `onSubmit` 的位置；
- 是否直接修改全局状态；
- 可复用组件和重复逻辑。

若实际文件名或结构不同，记录真实路径，不要猜测。

## 3. Lint 修复范围

已知问题：

- `App.tsx` effect 内直接 setState；
- `loadProviders` effect 依赖缺失；
- `ManualWorkflowDialog.tsx` render 中调用 `Date.now()`。

要求：

- 修复根因，不允许 eslint-disable、全局降级规则或忽略文件；
- 不改变 Provider 加载时机、登录行为和 Dialog 可见行为；
- 对 `Date.now()` 使用稳定初始化或事件时生成，不在 render 期间制造新值；
- lint 最终必须 0 error、0 warning。

## 4. 最小测试基线

优先使用与 Vite/TypeScript 兼容的轻量方案。不得引入端到端浏览器框架。

### Client 至少 2 个测试

建议覆盖：

- `validateImageFile`：合法 MIME/大小和非法文件；
- 一个纯函数或现有状态转换：上传时重置历史、错误格式化、Provider/模型选项映射等。

### Server 至少 2 个测试

建议覆盖：

- Provider operation type 判定；
- 一个不触发真实外部 API 的 Provider 配置、鉴权或输入校验纯逻辑。

约束：

- 不调用真实模型 API；
- 不读取真实 Key；
- 不依赖网络；
- 测试可在 CI 和 Windows 本地重复；
- 若需为测试导出纯函数，可做最小重构，但不得改变行为。

### 命令要求

- client `npm test`
- server `npm test`
- root `npm test` 统一执行两端
- 测试进程执行完自动退出，不默认 watch

## 5. 明确禁止

- 不创建 `AppV2`；
- 不改布局和视觉；
- 不新增数据库、对象存储或队列；
- 不改 `/api/edit`；
- 不改 Prompt 业务文案；
- 不隐藏 Provider；
- 不修改默认安全配置，本项留给 HARDEN-001；
- 不升级 React、Vite、Tailwind、Express 的主版本；
- 不顺手清理无关代码。

## 6. 验收命令

必须执行并回传完整结果：

```bash
npm run lint --prefix src/client
npx tsc --noEmit -p src/client/tsconfig.json
npm test --prefix src/client
npx tsc --noEmit -p src/server/tsconfig.json
npm test --prefix src/server
npm test
npm run build
```

若实际脚本结构不同，提供等价命令并解释。

## 7. 交付物

- 代码修改；
- `docs/lumen-v2/current-state-scan-addendum.md`；
- 测试文件；
- 根/client/server 测试脚本；
- 按 `templates/TRAE-RETURN-TEMPLATE.md` 输出报告；
- 更新 `SESSION-HANDOFF.md`；
- 不更新冻结产品决策。

## 8. 完成定义

全部满足才可写“待 GPT 验收”：

- lint 0/0；
- 所有 test 通过；
- 所有 typecheck 通过；
- root build 通过；
- 无可见行为变化；
- 补充扫描完整；
- 无真实密钥或客户数据进入提交。
