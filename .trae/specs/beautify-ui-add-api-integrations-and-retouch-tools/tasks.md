# Tasks

## Phase 1: UI 骨架与布局升级

- [x] Task 1: 搭建专业修图工作台布局
  - [x] SubTask 1.1: 在 `App.tsx` 中实现三栏 Grid 布局（左侧工具栏 56px/200px、中央画布、右侧面板 320px）
  - [x] SubTask 1.2: 创建 `Toolbar` 组件，包含工具图标与标签：修脸、调色、液化、修复、消除、导出
  - [x] SubTask 1.3: 创建 `ParamPanel` 组件，根据选中工具渲染不同参数区
  - [x] SubTask 1.4: 重构 `ResultViewer` 为大图画布组件，支持原图/结果/对比视图
  - [x] SubTask 1.5: 实现响应式适配（<1024px 工具栏折叠、右侧面板变抽屉）
  - [x] SubTask 1.6: 引入 `lucide-react` 统一图标，调整颜色主题为专业暗色/浅色可选
  - [x] **Validation**: 在 1920px、1440px、1024px、768px 宽度下截图检查布局无错位

- [x] Task 2: Header 与全局状态重构
  - [x] SubTask 2.1: 在 Header 中新增 Provider 选择器（代替单一模型选择器）
  - [x] SubTask 2.2: 在 Header 中添加“API 设置”入口
  - [x] SubTask 2.3: 扩展 `useEditor` hook，新增 `selectedTool`、`selectedProvider` 状态
  - [x] SubTask 2.4: 调整编辑历史面板位置到左侧工具栏下方或右侧抽屉
  - [x] **Validation**: 切换工具和 Provider 时状态正确，URL 不刷新

---

## Phase 2: API Provider 管理

- [x] Task 3: Provider 数据模型与存储
  - [x] SubTask 3.1: 在 `src/shared/types.ts` 中定义 `ProviderConfig`、`ProviderType`、`ProviderModel` 类型
  - [x] SubTask 3.2: 创建后端 `src/server/services/providers/` 目录与 `ProviderStore` 类
  - [x] SubTask 3.3: 实现 Provider CRUD API：`GET /api/providers`、`POST /api/providers`、`PUT /api/providers/:id`、`DELETE /api/providers/:id`
  - [x] SubTask 3.4: API Key 加密存储（使用 `crypto` 模块 AES-256-GCM），明文不落地前端
  - [x] SubTask 3.5: 启动时从环境变量 `GLM_API_KEY` 自动生成默认 GLM Provider，保证兼容
  - [x] **Validation**: 调用 CRUD API 后 `data/providers.json` 中 key 为密文，返回列表不含 key

- [x] Task 4: Provider 前端设置页
  - [x] SubTask 4.1: 创建 `ApiSettingsPage` 组件，展示 Provider 列表
  - [x] SubTask 4.2: 实现添加/编辑 Provider 表单（名称、类型、API Key、Base URL、默认模型）
  - [x] SubTask 4.3: 实现启用/禁用、删除、设为默认操作
  - [x] SubTask 4.4: 添加表单校验（类型必填、key 非空时校验长度）
  - [x] **Validation**: 用户可成功添加一个 OpenAI Provider 并保存，刷新后列表仍存在

- [x] Task 5: 多 Provider 后端代理
  - [x] SubTask 5.1: 定义 `ImageProvider` 接口：`generate(params)`、`edit(params)`、`chat(params)`
  - [x] SubTask 5.2: 将现有 GLM 逻辑重构为 `GLMProvider` 实现
  - [x] SubTask 5.3: 新增 `OpenAIProvider` 实现，支持 `gpt-image-2` 等模型
  - [x] SubTask 5.4: 实现 `ProviderFactory`，根据 `providerId` 加载配置并返回对应实现
  - [x] SubTask 5.5: 修改 `POST /api/edit`，读取 `providerId` 并路由到对应 Provider
  - [x] SubTask 5.6: 统一错误映射：401→Key 无效、429→额度用尽、5xx→服务不可用
  - [x] **Validation**: 切换 Provider 后 `/api/edit` 返回正确图片，错误提示符合映射规则

---

## Phase 3: 专业修图工具

- [x] Task 6: 扩展提示词模板库
  - [x] SubTask 6.1: 在 `promptTemplates.ts` 中新增分类：追色、液化塑形、穿帮修复、路人去除
  - [x] SubTask 6.2: 为每个新分类编写至少 3 条模板，融入摄影术语锚点与防御词
  - [x] SubTask 6.3: 模板数据结构增加 `tool` 字段，用于关联左侧工具
  - [x] SubTask 6.4: `TemplatePanel` 支持按工具过滤模板
  - [x] **Validation**: 选择“追色”工具时，右侧模板面板只显示追色相关模板

- [x] Task 7: 人脸美化工具
  - [x] SubTask 7.1: 创建 `FaceBeautyPanel` 组件，包含参数滑块：肤色提亮、磨皮强度、瘦脸、大眼、去瑕疵、立体光影
  - [x] SubTask 7.2: 实现“自然 / 精致 / 高定”三档预设按钮
  - [x] SubTask 7.3: 根据参数生成提示词（强调保留本人特征、韩系奶油肌、不要塑料皮）
  - [x] SubTask 7.4: 点击“应用”调用 `/api/edit` 并展示结果
  - [x] **Validation**: 调整参数后生成的提示词包含对应强度描述，结果返回正常

- [x] Task 8: 液化塑形工具
  - [x] SubTask 8.1: 创建 `LiquifyPanel` 组件，包含开关+强度滑块：小脸、下颌线收紧、鼻翼缩小、人中缩短、肩部收窄、身形微调
  - [x] SubTask 8.2: 生成强调“轻微、自然、保持本人特征”的提示词
  - [x] SubTask 8.3: 调用 `/api/edit` 并加入历史记录
  - [x] **Validation**: 启用“小脸”并设置强度后，提示词中出现“轻微小脸”等描述

- [x] Task 9: 追色工具
  - [x] SubTask 9.1: 创建 `ColorMatchingPanel` 组件，包含参考图上传区和补充描述输入框
  - [x] SubTask 9.2: 上传参考图后显示缩略图，支持删除
  - [x] SubTask 9.3: 生成四层结构提示词（保留/修改/风格/限制）
  - [x] SubTask 9.4: 支持仅文字描述追色（无参考图）
  - [x] **Validation**: 上传参考图后调用 `/api/edit` 时 referenceImages 包含参考图

- [x] Task 10: 背景穿帮修复工具
  - [x] SubTask 10.1: 创建 `CleanupPanel` 组件，含“自动修复”和“手动选择”两种模式
  - [x] SubTask 10.2: 在大图画布上实现 Canvas 2D 选区/涂抹辅助（矩形+笔刷）
  - [x] SubTask 10.3: 将选区坐标和描述一起发送给后端（作为提示词补充）
  - [x] SubTask 10.4: 生成“只修复选定区域、保持其他不变”的提示词
  - [x] **Validation**: 在画布上框选区域后提交，提示词包含区域描述

- [x] Task 11: 路人去除工具
  - [x] SubTask 11.1: 创建 `RemovePeoplePanel` 组件，含“自动识别路人”和“手动框选”
  - [x] SubTask 11.2: 复用画布选区组件框选路人
  - [x] SubTask 11.3: 生成“去除指定人物并用周围环境自然填充”的提示词
  - [x] SubTask 11.4: 对于自动识别，后端先返回候选区域供确认（本期可 mock 或调用图像理解模型）
  - [x] **Validation**: 框选路人后调用 `/api/edit`，提示词明确指示去除该区域人物

---

## Phase 4: 结果预览与收尾

- [x] Task 12: 操作历史增强
  - [x] SubTask 12.1: 历史记录新增 `tool` 和 `params` 字段
  - [x] SubTask 12.2: 左侧历史面板显示步骤节点图标与操作名
  - [x] SubTask 12.3: 点击历史节点回退到该步骤状态
  - [x] SubTask 12.4: localStorage 持久化历史记录
  - [x] **Validation**: 连续执行“人脸美化→追色→液化”三步后，历史面板显示三步，点击第一步可回退

- [x] Task 13: 结果预览增强
  - [x] SubTask 13.1: 画布支持 1:1 / 适应屏幕 / 全屏 三种缩放
  - [x] SubTask 13.2: Before/After 对比支持滑块拖动和左右分屏两种模式
  - [x] SubTask 13.3: 添加下载 PNG 和“在新标签页打开原图”按钮
  - [x] SubTask 13.4: 加载状态显示进度指示（非静止 spinner）
  - [x] **Validation**: 生成结果后切换三种缩放、两种对比模式均正常

- [x] Task 14: 文档与配置更新
  - [x] SubTask 14.1: 更新 `.env.example`，添加 Provider 相关变量说明
  - [x] SubTask 14.2: 更新 README，说明如何添加 Provider 和使用新修图工具
  - [x] SubTask 14.3: 运行 `npm run build` 检查前后端编译无错误
  - [x] **Validation**: `npm run build` 成功，无 TypeScript 类型错误

---

# Task Dependencies

- Task 2 依赖 Task 1
- Task 4 依赖 Task 3
- Task 5 依赖 Task 3
- Task 7/8/9/10/11 依赖 Task 1、Task 2、Task 5
- Task 6 可与 Task 1 并行
- Task 12 依赖 Task 7/8/9/10/11
- Task 13 依赖 Task 1
- Task 14 依赖所有开发任务
