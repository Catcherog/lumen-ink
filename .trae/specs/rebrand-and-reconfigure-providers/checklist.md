# Checklist

## 默认 Provider 预置
- [x] 删除 providers.json 后启动服务，GET `/api/providers` 返回恰好 2 个 Provider
- [x] 播种的 2 个 Provider 为「即梦 Seedream」与「GPT OpenAI」
- [x] Seedream Provider 的 `isDefault` 为 true，OpenAI 为 false
- [x] 两个 Provider 均为 `enabled: true`
- [x] 设置 `SEEDREAM_API_KEY` 环境变量后，Seedream Provider `hasApiKey: true`
- [x] 设置 `OPENAI_API_KEY` 环境变量后，OpenAI Provider `hasApiKey: true`
- [x] 仅设置 `GLM_API_KEY` 时，不自动创建 GLM Provider 条目（旧 migrateFromEnv 行为已移除）
- [x] 主页 Provider 选择器自动选中即梦 Seedream，模型为 `doubao-seedream-4-5-251128`

## GPT 模型扩展
- [x] `PROVIDER_MODELS.openai` 包含 GPT Image 2（图生图编辑）、GPT Image 2（文生图）、GPT-4o（图像理解）、DALL·E 3（文生图）等选项
- [x] 每个模型选项标注能力图标（🎨文生图 / ✏️图生图 / 💬图像理解）
- [x] 新建/编辑 OpenAI Provider 时，默认模型下拉显示完整 GPT 模型列表
- [x] 切换 Provider 类型到 openai 时，默认模型自动选中列表第一项

## 存量数据重置
- [x] 旧 providers.json 已备份为 `providers.json.bak`
- [x] providers.json 重置后仅含 2 个新默认 Provider
- [x] 备份文件 `providers.json.bak` 保留，可手动恢复旧 Gemini Key

## 品牌更名
- [x] `src/client/index.html` 的 `<title>` 已替换为新品牌名
- [x] `src/client/src/App.tsx` Header `<h1>` 已替换为新品牌名
- [x] `src/client/src/components/LoginPage.tsx` 登录页 `<h1>` 已替换为新品牌名
- [x] 全代码库 grep `GLM 图像编辑器` / `GLM图像编辑器` 在 src 下无匹配（.bak 与 specs 文档除外）
- [x] package.json 内部包名 `gemini-image-editor` 保持不变（技术标识）
- [x] ProviderStore `findProjectRoot` 的 `pkg.name === 'gemini-image-editor'` 判断保持不变

## 端到端验证
- [x] 全新状态打开 API 设置 → 看到两个预置 Provider，即梦为默认（⭐）
- [x] 即梦 Provider 未填 Key 时显示「未设置」橙色徽章
- [x] 填入 Key 保存后显示「已设置」绿色徽章
- [x] 浏览器标签、登录页、Header 均显示新品牌名，无「GLM 图像编辑器」残留
- [x] 完整流程无 404 / 红色错误提示
