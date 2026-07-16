# BASE-001 Trae 实施报告

## 任务元数据

- **任务 ID**: BASE-001
- **执行者**: Trae
- **日期**: 2026-07-16
- **状态**: awaiting_gpt_acceptance
- **仓库**: https://github.com/Catcherog/lumen-ink.git
- **分支**: docs/lumen-v2-repo-collaboration

## 1. 执行摘要

完成工程基线修复：lint 0/0、typecheck 通过、13 个测试通过、build 通过。补充扫描 5 个面板和配置文件。

## 2. Lint 修复

### 2.1 App.tsx - react-hooks/set-state-in-effect + exhaustive-deps

**问题**：
- `loadProviders()` 在 useEffect 中直接调用，触发 `set-state-in-effect`（error）
- 两个 useEffect 缺少 `loadProviders` 依赖（warning x2）

**修复**：
- 第一个 useEffect：内联 fetch 逻辑，使用 `cancelled` 标志和清理函数（React 19 标准模式）
- `loadProviders` 改为 `useCallback`，第二个 useEffect 将其加入依赖数组
- 行为不变：Provider 仍在 token 变更和设置弹窗关闭时加载

### 2.2 ManualWorkflowDialog.tsx - react-hooks/purity

**问题**：`Date.now()` 在 render 中调用（`download` 属性），触发 `purity` 规则（error）

**修复**：使用 `useState(() => Date.now())` 在组件挂载时生成稳定时间戳，render 中引用 `downloadId`

## 3. 测试基础设施

### 3.1 框架

- 安装 vitest 到 client 和 server devDependencies
- 不引入端到端浏览器框架

### 3.2 测试脚本

| 位置 | 脚本 |
|------|------|
| client | `"test": "vitest run"` |
| server | `"test": "vitest run"` |
| root | `"test": "npm run test --prefix src/client && npm run test --prefix src/server"` |

### 3.3 测试文件

**Client** - `src/client/src/utils/image.test.ts`（5 个测试）：
- `validateImageFile` 接受合法 JPEG/PNG/WebP
- `validateImageFile` 拒绝不支持格式
- `validateImageFile` 拒绝超过 20MB 的文件

**Server** - `src/server/services/providers/operationType.test.ts`（8 个测试）：
- GLM 图像模型返回 `generate`
- GLM 视觉模型返回 `chat`
- OpenAI gpt-image-2 返回 `edit`
- OpenAI DALL-E 返回 `generate`
- OpenAI 文本模型返回 `chat`
- Gemini/Seedream 返回 `edit`
- 不支持的类型返回 `edit`

### 3.4 最小重构

- 将 `getProviderOperationType` 从 `ProviderFactory.ts` 提取到 `operationType.ts`
- ProviderFactory 通过 `export { getProviderOperationType }` 保持公开 API 不变
- 行为无变化

## 4. 补充扫描

详见 `docs/lumen-v2/current-state-scan-addendum.md`，覆盖：
- PromptInput、ColorMatchingPanel、LiquifyPanel、CleanupPanel、RemovePeoplePanel
- 3 个 package.json 和 ESLint 配置
- 跨文件重复逻辑汇总
- 关键架构发现

## 5. 验收命令结果

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors, 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | 通过 |
| `npm test --prefix src/client` | 5 passed (1 file) |
| `npx tsc --noEmit -p src/server/tsconfig.json` | 通过 |
| `npm test --prefix src/server` | 8 passed (1 file) |
| `npm test` | 13 passed (2 files) |
| `npm run build` | client + server 均成功 |

## 6. 修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/client/src/App.tsx` | 修改 | lint 修复：effect 内联 fetch + useCallback |
| `src/client/src/components/ManualWorkflowDialog.tsx` | 修改 | lint 修复：Date.now() -> useState |
| `src/client/package.json` | 修改 | 添加 test 脚本 + vitest 依赖 |
| `src/client/src/utils/image.test.ts` | 新增 | validateImageFile 测试 |
| `src/server/package.json` | 修改 | 添加 test 脚本 + vitest 依赖 |
| `src/server/services/providers/operationType.ts` | 新增 | 提取 getProviderOperationType |
| `src/server/services/providers/operationType.test.ts` | 新增 | 操作类型判定测试 |
| `src/server/services/providers/ProviderFactory.ts` | 修改 | 改为从 operationType.ts 导入 |
| `package.json` | 修改 | 添加 root test 脚本 |
| `docs/lumen-v2/current-state-scan-addendum.md` | 新增 | 补充扫描事实表 |

## 7. 未修改项

- 未改变可见产品行为
- 未改 `/api/edit`
- 未改 Prompt 业务文案
- 未隐藏 Provider
- 未修改默认安全配置
- 未升级主版本依赖
- 未创建 AppV2
- 未开始 UI-001 或其他任务
