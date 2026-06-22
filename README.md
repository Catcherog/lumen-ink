# GLM 图像编辑器

基于 React + TypeScript + Express 的多 Provider AI 图像编辑工作台，支持修脸、调色/追色、液化、穿帮修复、路人去除与导出等工具。

## 功能概览

- **专业修图工作台**：左侧工具栏、中央大图画布、右侧面板三栏布局，支持响应式适配。
- **多 Provider 管理**：支持 OpenAI、GLM（智谱）、即梦、自定义四种 Provider 类型，API Key 后端加密存储。
- **修图工具**：
  - **修脸**：肤色提亮、磨皮、瘦脸、大眼、去瑕疵、立体光影，含自然/精致/高定三档预设。
  - **调色/追色**：支持上传参考图或纯文字描述进行追色。
  - **液化**：小脸、下颌线收紧、鼻翼缩小、人中缩短、肩部收窄、身形微调。
  - **修复**：自动修复或手动框选/涂抹区域修复背景穿帮。
  - **消除**：自动识别或手动框选去除路人/杂物。
  - **导出**：结果下载、在新标签页打开原图、1:1/适应/全屏缩放、Before/After 对比。
- **提示词模板库**：按工具过滤，一键填入参数面板。
- **操作历史**：每步编辑生成历史节点，保存到 localStorage，支持回退。

## 环境要求

- Node.js 18+
- npm 9+

## 本地运行

1. 安装依赖：

```bash
npm install
npm install --prefix src/client
npm install --prefix src/server
```

2. 复制环境变量模板并填写：

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

- `GLM_API_KEY`：智谱 AI API Key（用于默认 GLM Provider）。
- `AUTH_PASSWORD`：登录密码。
- `JWT_SECRET`：JWT 签名密钥（可选，未设置时会使用默认密钥）。
- `PROVIDER_ENCRYPTION_KEY`（可选）：Provider API Key 加密密钥，建议设置 32 字节以上随机字符串。
- `DEFAULT_PROVIDER_ID`（可选）：强制指定默认 Provider ID。

3. 同时启动前端和后端：

```bash
npm run dev
```

或分别启动：

```bash
npm run dev:client
npm run dev:server
```

前端默认运行在 `http://localhost:5173`，后端默认运行在 `http://localhost:3001`。

## 添加 Provider

1. 登录后，点击页面右上角 **API 设置** 按钮打开设置弹窗。
2. 点击 **添加 Provider**，填写表单：
   - **名称**：Provider 显示名称。
   - **类型**：OpenAI / GLM / 即梦 / 自定义。
   - **API Key**：对应平台的 API Key。
   - **默认模型**：例如 `cogview-4-250304`、`gpt-image-2`、`dall-e-3`。
   - **Base URL**（可选）：自定义接口地址。
3. 保存后，Provider 会出现在顶部 **Provider 选择器** 中。
4. 在列表中可启用/禁用、设为默认、编辑或删除 Provider。

> 启动时如果环境变量中存在 `GLM_API_KEY`，系统会自动创建一个默认的 GLM Provider，保证旧版调用方式兼容。

## 使用新修图工具

1. 在左侧工具栏选择工具：**修脸、调色、液化、修复、消除、导出**。
2. 右侧面板会切换为对应工具的参数面板。
3. 上传图片（中央画布区域）。
4. 调整参数后点击 **应用**，系统会通过当前选中的 Provider 调用模型并展示结果。
5. 结果支持下载、对比、回退到历史步骤等操作。

## 构建

```bash
npm run build
```

该命令会依次执行：

```bash
npm run build --prefix src/client
npm run build --prefix src/server
```

构建产物：

- 前端：`src/client/dist/`
- 后端：`src/server/dist/`

## 项目结构

```
.
├── src/client/      # React 前端
├── src/server/      # Express 后端
├── src/shared/      # 共享类型定义
├── api/             # Vercel serverless function 入口
├── .env.example     # 环境变量模板
└── README.md        # 本文件
```
