# Tasks

## Phase 1: MVP — 最小可用版本

- [x] Task 1: 初始化项目结构
  - [x] SubTask 1.1: 创建 React + Vite + TypeScript 前端项目
  - [x] SubTask 1.2: 创建 Express + TypeScript 后端项目
  - [x] SubTask 1.3: 配置 Tailwind CSS
  - [x] SubTask 1.4: 配置 concurrently 同时运行前后端
  - [x] SubTask 1.5: 创建 .env.example 文件（含 GEMINI_API_KEY 占位）

- [x] Task 2: 后端 API 代理
  - [x] SubTask 2.1: 创建 Express 服务器入口
  - [x] SubTask 2.2: 实现 POST /api/edit 端点（接收图片+指令，调用 Gemini API）
  - [x] SubTask 2.3: 封装 Gemini API 调用服务（支持模型参数）
  - [x] SubTask 2.4: 实现错误处理（429/5xx/超时）
  - [x] SubTask 2.5: 配置 CORS 和静态文件服务

- [x] Task 3: 前端图像上传组件
  - [x] SubTask 3.1: 实现拖拽上传区域
  - [x] SubTask 3.2: 实现图片预览和尺寸信息显示
  - [x] SubTask 3.3: 实现图片 Base64 编码工具函数
  - [x] SubTask 3.4: 实现文件大小和格式校验

- [x] Task 4: 前端编辑指令输入与提交
  - [x] SubTask 4.1: 实现编辑指令输入框
  - [x] SubTask 4.2: 实现提交按钮和 loading 状态
  - [x] SubTask 4.3: 实现与后端 /api/edit 的请求对接
  - [x] SubTask 4.4: 实现结果图片展示

- [x] Task 5: 结果下载
  - [x] SubTask 5.1: 实现下载按钮（Base64 转 Blob 下载为 PNG）
  - [x] SubTask 5.2: 实现原图/结果切换显示

## Phase 2: 核心功能

- [x] Task 6: 多轮对话式编辑
  - [x] SubTask 6.1: 设计编辑历史状态管理（Context + Reducer）
  - [x] SubTask 6.2: 实现多轮对话上下文构建（contents 数组拼接）
  - [x] SubTask 6.3: 实现编辑历史时间线侧边栏
  - [x] SubTask 6.4: 实现历史节点点击查看大图
  - [x] SubTask 6.5: 实现上下文长度限制（最多保留 10 轮）

- [x] Task 7: 参考图上传
  - [x] SubTask 7.1: 实现参考图上传区域（最多 14 张）
  - [x] SubTask 7.2: 实现参考图缩略图展示和删除
  - [x] SubTask 7.3: 后端支持多图发送给 Gemini API
  - [x] SubTask 7.4: 实现参考图与编辑指令的组合发送

- [x] Task 8: 提示词模板库
  - [x] SubTask 8.1: 创建提示词模板数据文件（面部精修/背景替换/调色/风格迁移四类）
  - [x] SubTask 8.2: 实现模板选择面板 UI
  - [x] SubTask 8.3: 实现模板点击填入编辑指令输入框
  - [x] SubTask 8.4: 模板内容融入知识库的摄影术语锚点技法

- [x] Task 9: Before/After 对比
  - [x] SubTask 9.1: 实现左右对比视图
  - [x] SubTask 9.2: 实现滑块拖动对比
  - [x] SubTask 9.3: 实现对比模式切换按钮

## Phase 3: 生产化

- [x] Task 10: 模型切换
  - [x] SubTask 10.1: 实现模型选择器 UI（下拉菜单）
  - [x] SubTask 10.2: 后端支持模型参数透传
  - [x] SubTask 10.3: 实现免费额度用尽提示
  - [x] SubTask 10.4: 实现"升级 API 额度"引导

- [x] Task 11: 用户认证
  - [x] SubTask 11.1: 实现密码输入页面
  - [x] SubTask 11.2: 实现 JWT token 签发和验证中间件
  - [x] SubTask 11.3: 前端 token 存储和请求拦截
  - [x] SubTask 11.4: 预留用户表和权限字段

- [x] Task 12: 编辑历史持久化
  - [x] SubTask 12.1: 实现编辑历史本地存储（localStorage）
  - [x] SubTask 12.2: 实现历史记录列表页面
  - [x] SubTask 12.3: 实现从历史记录恢复编辑会话

- [x] Task 13: 响应式布局优化
  - [x] SubTask 13.1: 实现三栏→两栏→单栏的响应式断点
  - [x] SubTask 13.2: 实现平板端侧边抽屉
  - [x] SubTask 13.3: 实现移动端底部面板

# Task Dependencies

- Task 2 依赖 Task 1（需要项目结构先建好）
- Task 3/4/5 依赖 Task 1（前端项目结构）
- Task 6 依赖 Task 4（需要基础编辑功能先完成）
- Task 7 依赖 Task 4（需要基础编辑请求流程先跑通）
- Task 8 依赖 Task 4（需要编辑指令输入框先完成）
- Task 9 依赖 Task 5（需要有结果图片才能做对比）
- Task 10 依赖 Task 2（需要后端 API 先跑通）
- Task 11 依赖 Task 2（需要后端服务先运行）
- Task 12 依赖 Task 6（需要编辑历史数据结构先定义）
- Task 13 可与 Phase 2 并行开发
