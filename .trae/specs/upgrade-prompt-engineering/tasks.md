# Tasks

- [x] Task 1: 升级 FaceBeautyPanel 提示词体系（修脸面板）
  - [x] SubTask 1.1: 新增 IDENTITY_ANCHOR 常量（身份锚定首句）和 PHOTO_ANCHOR 升级（加入光圈/布光/胶片型号）
  - [x] SubTask 1.2: 升级 PHOTO_ANCHOR，将"85mm人像镜头，柔光箱布光，柯达Portra 400胶片模拟"细化为含光圈值和布光角度的完整摄影参数
  - [x] SubTask 1.3: 升级6个滑块短语函数（skinBrightnessPhrase/smoothingPhrase/faceSlimPhrase/eyeEnlargePhrase/blemishPhrase/sculptLightPhrase），引入后期修图术语
  - [x] SubTask 1.4: 重构 buildPrompt 为六段式结构（身份锚定/保留/修改/光影镜头/风格/限制+画质），去掉模糊词"韩系高级奶油肌"
  - [x] SubTask 1.5: 限制段末尾追加画质约束句（五官端正、手指正确、无畸变、无水印）

- [x] Task 2: 升级 LiquifyPanel 提示词体系（液化面板）
  - [x] SubTask 2.1: 新增 IDENTITY_ANCHOR 常量，强调保留骨骼辨识度
  - [x] SubTask 2.2: 升级 PHOTO_ANCHOR，加入光圈值和布光方式
  - [x] SubTask 2.3: 升级 intensityAdjective 函数，从"轻微/适度/明显/大幅"细化为含液化术语的描述（如"液化轻微推下颌线"）
  - [x] SubTask 2.4: 重构 buildPrompt 为六段式结构
  - [x] SubTask 2.5: 限制段末尾追加画质约束句

- [x] Task 3: 升级 ColorMatchingPanel 提示词体系（调色面板）
  - [x] SubTask 3.1: 新增 IDENTITY_ANCHOR 常量
  - [x] SubTask 3.2: 升级 styleAnchor，将"85mm人像镜头，富士Pro 400H胶片模拟，低饱和高级色调，自然光影"细化为含光圈值和具体布光参数
  - [x] SubTask 3.3: 重构 buildPrompt 为六段式结构，增加光影镜头段
  - [x] SubTask 3.4: 限制段末尾追加画质约束句

- [x] Task 4: 升级 ToolPanel 中三个子面板的提示词（修复/消除/导出）
  - [x] SubTask 4.1: RepairToolPanel 提示词升级为六段式，加入身份锚定和画质约束
  - [x] SubTask 4.2: RemoveToolPanel 提示词升级为六段式，加入身份锚定和画质约束
  - [x] SubTask 4.3: ExportToolPanel 提示词升级为六段式，加入身份锚定和画质约束

- [x] Task 5: 构建验证
  - [x] SubTask 5.1: 运行 TypeScript 编译检查，确保无类型错误
  - [x] SubTask 5.2: 运行 vite build，确保前端构建通过

# Task Dependencies
- Task 5 依赖 Task 1-4 全部完成
- Task 1-4 之间无依赖，可并行执行
