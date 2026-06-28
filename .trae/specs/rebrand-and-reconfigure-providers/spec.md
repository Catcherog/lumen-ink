1默认即梦就行

2**光砚 这个好**

3另外我想确认一下我的API key没有暴露风险吧

# 高端化品牌重塑与默认 Provider 重构 Spec

## Why

当前应用名为「GLM 图像编辑器」，但项目实际定位是面向个人写真后期的高端 AI 影像精修工坊，且 GLM 仅作文生图备选、主修图链路依赖即梦/Seedream 与 GPT Image 2，旧名称已与实际能力错位。同时当前 API 设置的默认 Provider 由 `migrateFromEnv()` 按 GLM→Gemini→Seedream 顺序从环境变量自动创建，用户首次打开看到的是 GLM+Gemini（且 Gemini 被设为默认），与「以即梦为主、GPT 为辅」的实际工作流不符，需要预置两个开箱即用的默认接口。此外 OpenAI Provider 的模型列表偏薄，需补充 GPT 相关模型以覆盖文生图/图生图/图像理解全链路。

## What Changes

* **预置两个默认 Provider**：首次加载（providers.json 缺失或为空）时，自动播种「即梦 / Seedream（默认）」+「GPT / OpenAI」两个 Provider，不依赖环境变量即可出现；环境变量 `SEEDREAM_API_KEY` / `OPENAI_API_KEY` 若存在则自动填入 Key。

* **即梦为默认**：播种时 Seedream `isDefault: true`，OpenAI `isDefault: false`；移除旧逻辑中「GLM 先创建即为默认」「Gemini 自动创建」的行为。

* **保留环境变量回退**：GLM\_API\_KEY / GEMINI\_API\_KEY 仍可作为 Key 填入对应类型 Provider，但不再自动创建 Provider 条目。

* **新增 GPT 模型**：在 `PROVIDER_MODELS.openai` 中补充 GPT Image 2 文生图变体等 GPT 相关模型，覆盖文生图/图生图/图像理解。

* **重置存量 providers.json**：现有 providers.json 为旧 migrateFromEnv 自动生成（GLM+Gemini，Gemini 默认），与目标状态冲突。实施时将备份并重置该文件，触发新的两默认播种。GLM Key 仍在 `.env`，可随时通过 UI 重新添加。

* **应用更名**：将「GLM 图像编辑器」替换为新品牌名（见下方候选），涉及浏览器标题、顶部 Header、登录页标题三处。

## Impact

* Affected code:

  * [src/shared/types.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/shared/types.ts) — `PROVIDER_MODELS.openai` 模型列表

  * [src/server/services/providers/ProviderStore.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/services/providers/ProviderStore.ts) — `migrateFromEnv()` 重构为 `seedDefaults()`

  * [src/server/.env.example](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/.env.example) 与 [.env.example](file:///d:/360Downloads/Trae%20项目/picture-edit/.env.example) — 默认 Provider 提示文案

  * [src/client/index.html](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/index.html) — `<title>`

  * [src/client/src/App.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/App.tsx) — Header `<h1>`

  * [src/client/src/components/LoginPage.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/components/LoginPage.tsx) — 登录页 `<h1>`

  * [src/server/data/providers.json](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/data/providers.json) — 备份后重置

* 不改动：加密存储逻辑、ProviderFactory、各 Provider 类实现、API 路由结构、UI 交互逻辑（fix-provider-ui-logic 已完成）。

## 品牌名候选（请评估选定一个）

候选延续项目既有「新中式暗调电影感」审美与「紫韵浮岚」设计哲学，强调高端影像精修工坊定位：

| # | 候选名                               | 含义与气质                                                                | 推荐度       |
| - | --------------------------------- | -------------------------------------------------------------------- | --------- |
| 1 | **岚影工坊**（Lanying Atelier）         | 「岚」承接「紫韵浮岚」的雾岚意境，「影」直指摄影/影像；工坊（Atelier）体现匠人精修定位。与现有设计哲学一脉相承，东方含蓄且专业。 | ★★★★★（推荐） |
| 2 | **墨韵影像**（Moyun Imaging）           | 「墨韵」呼应水墨美学，「影像」明确行业归属。雅致、专业、东方。                                      | ★★★★      |
| 3 | **光砚**（Guangyan / Light Inkstone） | 「光」=摄影之光，「砚」=水墨之器，两字极简。禅意、极简、高端。                                     | ★★★★      |
| 4 | **境象**（Jingxiang）                 | 「境」=意境/境界，「象」=万象/影像。哲学、大气。                                           | ★★★★      |

**默认推荐**：`岚影工坊` — 与「紫韵浮岚」设计哲学形成命名呼应，同时「工坊」清晰传达高端精修定位，避免「编辑器」带来的工具感。实施时将使用用户选定的名称；若用户未特别指定，按「岚影工坊」执行。

## ADDED Requirements

### Requirement: 默认 Provider 预置播种

系统 SHALL 在 Provider 数据文件缺失或为空时，自动创建两个预置 Provider，无需用户配置或环境变量即可在 API 设置中看到。

#### Scenario: 全新环境首次打开 API 设置

* **WHEN** 用户在全新部署（无 providers.json）后首次打开 API 设置弹窗

* **THEN** 列表中存在恰好两个 Provider：「即梦 / Seedream」与「GPT / OpenAI」

* **AND** Seedream Provider 的 `isDefault` 为 true，OpenAI 为 false

* **AND** 两个 Provider 均为 `enabled: true`

* **AND** 若 `SEEDREAM_API_KEY` 环境变量存在，则 Seedream 的 API Key 已填入；否则显示「未设置」

* **AND** 若 `OPENAI_API_KEY` 环境变量存在，则 OpenAI 的 API Key 已填入；否则显示「未设置」

#### Scenario: 即梦为默认 Provider

* **WHEN** 预置播种完成后

* **THEN** 主页 Provider 选择器自动选中「即梦 / Seedream」

* **AND** 模型选择器显示 Seedream 的默认模型 `doubao-seedream-4-5-251128`

### Requirement: GPT 模型扩展

系统 SHALL 在 OpenAI Provider 类型的可选模型列表中提供覆盖文生图、图生图编辑、图像理解三类能力的 GPT 模型选项。

#### Scenario: 新建/编辑 OpenAI Provider 时选择模型

* **WHEN** 用户在 API 设置中选择 Provider 类型为 OpenAI

* **THEN** 默认模型下拉框包含 GPT Image 2（图生图编辑）、GPT Image 2（文生图）、GPT-4o（图像理解）、DALL·E 3（文生图）等选项

* **AND** 每个选项标注对应能力图标（🎨文生图 / ✏️图生图 / 💬图像理解）

## MODIFIED Requirements

### Requirement: 应用品牌名称

应用面向用户的所有可见名称 SHALL 统一为用户选定的高端品牌名（默认「岚影工坊」），不再使用「GLM 图像编辑器」。

#### Scenario: 浏览器标签与页面标题

* **WHEN** 用户在浏览器中打开应用

* **THEN** 浏览器标签页标题显示新品牌名（如「岚影工坊」）

#### Scenario: 顶部 Header 与登录页

* **WHEN** 用户进入登录页或主界面

* **THEN** 登录页大标题与主界面顶部 Header 标题均显示新品牌名

* **AND** 全代码库不再出现「GLM 图像编辑器」字样（package.json 内部包名 `gemini-image-editor` 作为技术标识可保留，不对外可见）

### Requirement: Provider 环境变量迁移逻辑

`ProviderStore` SHALL 使用 `seedDefaults()` 替代旧的 `migrateFromEnv()` 作为默认 Provider 播种入口，且不再自动创建 GLM/Gemini Provider 条目。

#### Scenario: 环境变量存在但无 Provider 数据

* **WHEN** `SEEDREAM_API_KEY` 或 `OPENAI_API_KEY` 环境变量已设置，且 providers.json 不存在

* **THEN** 播种的对应 Provider 自动填入该环境变量作为 API Key

* **AND** 不因 `GLM_API_KEY` 存在而自动创建 GLM Provider 条目

#### Scenario: 存量 providers.json 重置

* **WHEN** 实施过程执行重置步骤

* **THEN** 旧 providers.json 先备份为 `providers.json.bak`，再删除

* **AND** 下次服务启动时 `seedDefaults()` 创建两个新默认 Provider

* **AND** 备份文件保留，用户可手动恢复旧 Gemini Key

