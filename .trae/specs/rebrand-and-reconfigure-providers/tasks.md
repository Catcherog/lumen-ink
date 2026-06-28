# Tasks

- [x] Task 1: 扩展 OpenAI Provider 的 GPT 模型列表
  - **Priority**: high
  - **Depends On**: None
  - **Description**:
    - 修改 [types.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/shared/types.ts) 中 `PROVIDER_MODELS.openai`，补充 GPT 相关模型，覆盖文生图/图生图/图像理解三类能力
    - 建议列表（保留现有项，新增文生图变体）：
      - `gpt-image-2` — GPT Image 2（图生图编辑） ✏️ `capabilities: ['edit']`（保留）
      - `gpt-image-2` 文生图变体 — GPT Image 2（文生图） 🎨 `capabilities: ['generation']`（新增；若 OpenAI API 文生图与编辑共用同一 model id，则在 label 上区分用途，value 保持 `gpt-image-2`，capabilities 标注 `generation`）
      - `gpt-4o` — GPT-4o（图像理解） 💬 `capabilities: ['chat']`（保留）
      - `dall-e-3` — DALL·E 3（文生图） 🎨 `capabilities: ['generation']`（保留）
    - 同步检查 [OpenAIProvider.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/services/providers/OpenAIProvider.ts) 的 `generate()` 默认 model 与 `edit()` 默认 model 是否需要调整（当前 generate 默认 `dall-e-3`、edit 默认 `gpt-image-2`，保持不变即可）
  - **Acceptance Criteria Addressed**: GPT 模型扩展 Scenario
  - **Validation**:
    - 在 API 设置新建 OpenAI 类型 Provider，默认模型下拉应显示上述 4 个选项，每个带能力图标
    - 切换类型到 openai 时，默认模型自动选中第一个

- [x] Task 2: 重构 ProviderStore 默认 Provider 播种逻辑
  - **Priority**: high
  - **Depends On**: None（可与 Task 1 并行）
  - **Description**:
    - 修改 [ProviderStore.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/services/providers/ProviderStore.ts)：
      - 将 `migrateFromEnv()` 重构为 `seedDefaults()`：当 `this.providers` 为空（providers.json 缺失或为空）时，创建两个预置 Provider：
        1. 即梦 / Seedream：`type: 'seedream'`, `name: '即梦 Seedream'`, `defaultModel: 'doubao-seedream-4-5-251128'`, `baseUrl: 'https://ark.cn-beijing.volces.com/api/v3'`, `enabled: true`, `isDefault: true`，apiKey 从 `SEEDREAM_API_KEY`/`VOLC_API_KEY` 环境变量读取（有则 encrypt，无则空字符串）
        2. GPT / OpenAI：`type: 'openai'`, `name: 'GPT OpenAI'`, `defaultModel: 'gpt-image-2'`, `baseUrl: ''`(使用 OpenAIProvider 内置默认), `enabled: true`, `isDefault: false`，apiKey 从 `OPENAI_API_KEY` 环境变量读取（有则 encrypt，无则空字符串）
      - 移除旧逻辑中「GLM_API_KEY 存在则自动创建 GLM Provider」「GEMINI_API_KEY 存在则自动创建 Gemini Provider」的自动创建行为
      - 保留 `ensureDefault()` 逻辑不变
      - `load()` 中调用由 `this.migrateFromEnv()` 改为 `this.seedDefaults()`
    - 同步更新 [src/server/.env.example](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/.env.example) 与 [.env.example](file:///d:/360Downloads/Trae%20项目/picture-edit/.env.example)：
      - 将 `SEEDREAM_API_KEY` 与 `OPENAI_API_KEY` 列为推荐配置项（附获取链接说明）
      - `GLM_API_KEY` / `GEMINI_API_KEY` 标注为「可选，仅当手动新增对应 Provider 时作为环境变量回退」
  - **Acceptance Criteria Addressed**: 默认 Provider 预置播种 Scenario、即梦为默认 Provider Scenario、Provider 环境变量迁移逻辑 Scenario
  - **Validation**:
    - 删除 providers.json 后启动服务，GET `/api/providers` 返回恰好 2 个 Provider，Seedream `isDefault: true`
    - 设置 `SEEDREAM_API_KEY` 环境变量后重启，对应 Provider `hasApiKey: true`
    - 仅设置 `GLM_API_KEY` 时，不自动创建 GLM Provider 条目

- [x] Task 3: 重置存量 providers.json
  - **Priority**: high
  - **Depends On**: Task 2
  - **Description**:
    - 备份现有 [src/server/data/providers.json](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/data/providers.json) 为 `providers.json.bak`（保留用户旧 Gemini Key 加密数据以便恢复）
    - 删除 providers.json，使下次服务启动时 `seedDefaults()` 创建两个新默认 Provider
    - 验证启动后 API 设置弹窗显示「即梦 Seedream（默认）」+「GPT OpenAI」两个 Provider
  - **Acceptance Criteria Addressed**: 存量 providers.json 重置 Scenario
  - **Validation**:
    - `providers.json.bak` 存在且包含旧数据
    - 重启后 providers.json 仅含 2 个新默认 Provider
    - 主页 Provider 选择器自动选中「即梦 Seedream」

- [x] Task 4: 应用品牌更名
  - **Priority**: high
  - **Depends On**: None（可与 Task 1/2 并行）
  - **Description**:
    - 使用用户选定的品牌名（默认「岚影工坊」）替换三处「GLM 图像编辑器」：
      - [index.html](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/index.html) 第 7 行 `<title>`
      - [App.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/App.tsx) 第 176 行 Header `<h1>`
      - [LoginPage.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/components/LoginPage.tsx) 第 44 行 `<h1>`
    - 不改动 package.json 内部包名 `gemini-image-editor`（技术标识，不对外可见）
    - 不改动 ProviderStore 中 `findProjectRoot` 的 `pkg.name === 'gemini-image-editor'` 判断（保持项目根识别）
  - **Acceptance Criteria Addressed**: 应用品牌名称 Scenario
  - **Validation**:
    - 全代码库 grep `GLM 图像编辑器` / `GLM图像编辑器` 在 src 下无匹配（.bak 备份与 specs 文档除外）
    - 浏览器标签、登录页、主界面 Header 均显示新品牌名

- [x] Task 5: 端到端验证
  - **Priority**: high
  - **Depends On**: Task 1, Task 2, Task 3, Task 4
  - **Description**:
    - 启动前后端服务，完整验证：
      1. 全新状态打开 API 设置 → 看到「即梦 Seedream（默认，⭐）」+「GPT OpenAI」两个 Provider
      2. 主页 Provider 选择器自动选中即梦，模型为 `doubao-seedream-4-5-251128`
      3. 新建 OpenAI 类型 Provider → 默认模型下拉显示 4 个 GPT 模型选项，带能力图标
      4. 浏览器标签、登录页、Header 均显示新品牌名（如「岚影工坊」），无「GLM 图像编辑器」残留
      5. 即梦 Provider 未填 Key 时显示「未设置」橙色徽章；填入 Key 保存后显示「已设置」绿色徽章
  - **Acceptance Criteria Addressed**: 全部 Scenario
  - **Validation**:
    - 人工走查 5 步流程，交互通顺、状态一致、无报错

# Task Dependencies
- Task 3 depends on Task 2
- Task 5 depends on Task 1, Task 2, Task 3, Task 4
- Task 1, Task 2, Task 4 可并行
