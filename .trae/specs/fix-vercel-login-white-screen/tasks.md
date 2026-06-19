# Tasks

- [x] Task 1: 修复 Vercel serverless function 导致 `/api/auth` 500 的问题
  - [x] SubTask 1.1: 检查并修正 `api/index.ts` 的模块引用路径，使其指向 `src/server` 的编译产物
  - [x] SubTask 1.2: 确认 `src/server/tsconfig.json` 输出目录合理（如 `dist/`），且 `include` 覆盖所有路由/中间件
  - [x] SubTask 1.3: 更新 `src/server/package.json` 的 `build` 脚本，确保 `tsc` 能成功编译
  - [x] SubTask 1.4: 更新 `vercel.json`，在 `installCommand` 或 `buildCommand` 中加入 `npm run build --prefix src/server`
  - [x] SubTask 1.5: 在 `src/server/index.ts` 中为关键环境变量（`JWT_SECRET`、`AUTH_PASSWORD`、`GLM_API_KEY`）添加缺失时的安全兜底或明确错误响应

- [x] Task 2: 消除前端 React error #31（错误对象被渲染为 React child）
  - [x] SubTask 2.1: 在 `src/client/src/components/LoginPage.tsx` 中增强 `catch` 分支，支持 `{ code, message }` / `{ error: { code, message } }` 等嵌套结构，并始终将错误信息转为字符串
  - [x] SubTask 2.2: 在 `src/client/src/hooks/useEditor.ts` 中统一错误序列化，确保 `SET_ERROR` 的 payload 为字符串
  - [x] SubTask 2.3（可选但建议）: 在 `src/client/src/App.tsx` 渲染 `state.error` 处增加字符串断言或转换，防止任何遗留对象导致白屏
  - [x] SubTask 2.4: 创建/复用一个轻量错误序列化工具函数（如 `src/client/src/utils/error.ts`），在 LoginPage 与 useEditor 中复用

- [ ] Task 3: 本地验证与重新部署
  - [x] SubTask 3.1: 本地运行 `npm run build` 与 `npm run dev`，确认 `/api/auth` 能返回 200/401，无 500
  - [ ] SubTask 3.2: 提交并推送代码，触发 Vercel 重新部署（当前沙箱无法访问 GitHub，等待用户确认推送方式）
  - [ ] SubTask 3.3: 打开 Vercel Runtime Logs，确认 serverless function 启动无模块加载错误
  - [ ] SubTask 3.4: 访问 `https://glm-image-editor.vercel.app/`，输入密码测试登录，确认无白屏、无 React error #31

# Task Dependencies

- Task 2 可与 Task 1 并行开发（前端错误处理不依赖后端构建）
- Task 3 依赖 Task 1 与 Task 2 完成
