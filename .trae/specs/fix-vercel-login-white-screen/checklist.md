# Checklist

- [x] `api/index.ts` 引用的是服务端构建产物路径，而不是未编译的 `.ts` 源文件
- [x] `src/server` 能在 Vercel 构建阶段成功执行 `npm run build` 并生成可运行的 `.js` 产物
- [x] `vercel.json` 的 `installCommand` 或 `buildCommand` 包含服务端构建步骤
- [ ] 访问 `https://glm-image-editor.vercel.app/api/auth` 时，正确密码返回 200 + token，错误密码返回 401，不再出现 500（待部署后验证）
- [x] `LoginPage.tsx` 的登录错误提示始终为字符串，能正确显示服务端返回的嵌套错误 message
- [x] `useEditor.ts` 中 `SET_ERROR` 的 payload 始终为字符串，不会因 `response.data.error` 是对象而触发 React error #31
- [x] `App.tsx` 渲染 `state.error` 时做了字符串兜底，防止任何对象误入渲染
- [x] 本地 `npm run build` 与 `npm run dev` 验证通过，`/api/auth` 无 500
- [ ] Vercel Runtime Logs 中 serverless function 启动无模块找不到或类型错误（待部署后验证）
- [ ] 线上 `https://glm-image-editor.vercel.app/` 打开无白屏，登录后正常进入编辑器主界面（待部署后验证）
