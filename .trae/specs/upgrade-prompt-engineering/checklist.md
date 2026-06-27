# Checklist

## 身份锚定首句
- [x] FaceBeautyPanel 的 buildPrompt 输出以身份锚定句开头，包含"面部骨骼结构、眼型、鼻型、唇形、下颌线"
- [x] LiquifyPanel 的 buildPrompt 输出以身份锚定句开头，强调保留骨骼辨识度
- [x] ColorMatchingPanel 的 buildPrompt 输出以身份锚定句开头
- [x] RepairToolPanel 的提示词以身份锚定句开头
- [x] RemoveToolPanel 的提示词以身份锚定句开头
- [x] ExportToolPanel 的提示词以身份锚定句开头

## 摄影术语锚点
- [x] FaceBeautyPanel 风格段包含"85mm f/1.4"和具体胶片型号，不含"韩系高级奶油肌"
- [x] LiquifyPanel 风格段包含具体镜头和布光参数
- [x] ColorMatchingPanel 风格段包含具体镜头、光圈值和胶片型号

## 画质约束尾句
- [x] FaceBeautyPanel 限制段末尾包含"五官端正、手指正确、无畸变、无水印"
- [x] LiquifyPanel 限制段末尾包含画质约束句
- [x] ColorMatchingPanel 限制段末尾包含画质约束句
- [x] RepairToolPanel 提示词末尾包含画质约束句
- [x] RemoveToolPanel 提示词末尾包含画质约束句
- [x] ExportToolPanel 提示词末尾包含画质约束句

## 六段式结构
- [x] FaceBeautyPanel 提示词包含六个分段（身份锚定/保留/修改/光影镜头/风格/限制+画质）
- [x] LiquifyPanel 提示词包含六个分段
- [x] ColorMatchingPanel 提示词包含六个分段
- [x] RepairToolPanel 提示词包含六个分段
- [x] RemoveToolPanel 提示词包含六个分段
- [x] ExportToolPanel 提示词包含六个分段

## 滑块短语后期术语
- [x] smoothingPhrase 在 0-30 范围包含"低频磨皮"或"保留高频纹理"等后期术语
- [x] smoothingPhrase 在 30-60 范围包含"Portraiture"或"中性灰"等后期术语
- [x] faceSlimPhrase 包含"液化"或"推下颌线"等术语
- [x] eyeEnlargePhrase 包含"眼神光"或"眼白微提"等术语

## 构建验证
- [x] TypeScript 编译无错误（tsc -b 通过）
- [x] Vite 前端构建通过（vite build 成功）
