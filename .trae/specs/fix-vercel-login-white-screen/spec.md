# 修复 Vercel 部署白屏与登录 500 错误 Spec

## Why

已部署到 `https://glm-image-editor.vercel.app/` 的 GLM 图像编辑器目前打开即白屏，`/api/auth` 返回 500，且浏览器控制台抛出 React error #31（Objects are not valid as a React child）。这导致用户无法完成密码验证，整个应用不可用。

## What Changes

- 修复 Vercel serverless function 无法正确加载后端代码导致的 `/api/auth` 500 错误。
- 统一并增强前后端错误序列化逻辑，确保任何服务端返回的错误对象不会直接被渲染为 React child，消除 React error #31。
- 调整 `vercel.json` 与 `api/index.ts`，使 Vercel 在构建阶段完成服务端 TypeScript 编译并正确解析模块路径。
- 增加本地构建与 Vercel Runtime Logs 验证步骤，确认部署后可正常登录和加载主界面。

## Impact

- Affected specs: `build-gemini-image-editor`（用户认证与部署相关需求）
- Affected code:
  - `vercel.json`
  - `api/index.ts`
  - `src/server/package.json` 与构建配置
  - `src/client/src/components/LoginPage.tsx`
  - `src/client/src/hooks/useEditor.ts`
  - 可选：`src/client/src/App.tsx`

---

## MODIFIED Requirements

### Requirement: Vercel 后端服务可正常处理 `/api/auth`

系统 SHALL 在 Vercel 部署环境下正确启动 Express 后端并响应 `/api/auth` 请求：

- **WHEN** 用户访问 `https://glm-image-editor.vercel.app/` 或提交登录表单
- **THEN** `/api/auth` 返回 200（密码正确）或 401（密码错误），而不是 500
- **THEN** 服务端依赖与 TypeScript 源码在 Vercel 构建阶段被正确编译和打包

#### Scenario: 服务端模块加载失败
- **WHEN** Vercel serverless function 启动时无法找到 `src/server/index.js` 或相关路由模块
- **THEN** 构建配置确保 `src/server` 先被 `tsc` 编译为 `.js`，且 `api/index.ts` 指向正确的构建产物路径

#### Scenario: 环境变量缺失
- **WHEN** `JWT_SECRET`、`AUTH_PASSWORD` 或 `GLM_API_KEY` 未设置
- **THEN** 服务端使用安全的默认值或返回明确的配置错误提示，而不是抛出未处理异常导致 500

---

### Requirement: 登录与全局错误提示安全渲染

系统 SHALL 保证所有错误信息在渲染前均为字符串，避免 React error #31：

- **WHEN** `/api/auth` 返回 500 或其他异常响应
- **THEN** 登录页显示可读的字符串错误信息（如 "服务暂时不可用，请稍后重试"）
- **THEN** 不会将 `{ code, message }` 这类对象直接作为 React child 渲染

#### Scenario: 服务端返回嵌套错误对象
- **WHEN** 错误响应体为 `{ error: { code, message } }` 或 `{ code, message }`
- **THEN** 前端提取最内层的字符串 message 并显示

#### Scenario: 编辑接口返回错误对象
- **WHEN** `/api/edit` 返回的 `error` 字段为对象
- **THEN** `useEditor` 在 dispatch 前将其转换为字符串，避免 `App.tsx` 渲染对象导致白屏

---

## 技术要点

1. **Vercel serverless function 构建**：`vercel.json` 的 `installCommand` 需要先安装 `src/server` 依赖，再执行 `npm run build --prefix src/server`，使 `api/index.ts` 可以引用 `src/server/dist/index.js`（或等效产物）。
2. **模块路径**：`api/index.ts` 应指向服务端构建产物而非未编译的 `.ts` 源文件，避免 `.js` 扩展名解析失败。
3. **错误序列化**：新增辅助函数 `serializeError(err)`，支持 Error、AxiosError、任意对象/数组/原始值的字符串化，优先提取 `message` 字段。
4. **React 错误边界**：`ErrorBoundary` 已存在，可兜底；本次重点在源头避免对象被 setState。
