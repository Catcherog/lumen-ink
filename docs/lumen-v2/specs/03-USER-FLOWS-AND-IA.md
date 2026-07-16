# 03｜用户流程、信息架构与状态机

## 1. 一级信息架构

```text
光砚 Pro
├── 项目
│   ├── 最近项目
│   ├── 新建项目
│   └── 项目设置
├── 编辑工作区
│   ├── 人物
│   ├── 色彩
│   ├── 清理
│   ├── 局部
│   └── 导出
├── 版本与审阅
│   ├── 原图
│   ├── 生成版本
│   ├── 已采用版本
│   └── 导出记录
└── 高级设置
    ├── 模型策略
    ├── Provider 管理
    ├── 隐私与存储
    └── 诊断信息
```

## 2. 核心流程 A：首次使用

1. 打开产品，显示“上传照片 / 使用示例 / 最近项目”。
2. 上传后自动创建项目和原始版本。
3. 系统读取尺寸、方向、人物数量和基础质量；不在 P0 自动修改。
4. 默认进入“人物 > 自然精修”预设。
5. 右侧显示保护项、5 档参数、预计耗时和“生成预览”。
6. 生成完成后创建 V1，底部版本条高亮。
7. 用户进入对比，选择采用、继续修改或恢复原图。

## 3. 核心流程 B：局部修复

1. 选择“局部”或“清理”。
2. 画布进入蒙版模式，用户涂抹/框选区域。
3. 右侧选择移除、修复或替换，并填写补充要求。
4. 生成新版本，保留父版本和区域信息。
5. 对比时缩放与平移同步。

P0 可先保留现有矩形区域选择；P1 再增加画笔和智能对象选择。

## 4. 核心流程 C：失败恢复

1. 创建任务后立即返回 `jobId`。
2. UI 显示阶段：排队、上传、分析、生成、后处理、保存。
3. 供应商失败时显示错误类别和可操作建议。
4. 用户可重试当前模型、切换自动路由或取消。
5. 刷新页面后根据项目未完成任务恢复状态。
6. 失败任务不得创建“成功版本”。

## 5. 核心流程 D：确认与导出

1. 在版本条选择一个版本。
2. 点击“标记采用”。
3. 进入导出，选择尺寸、格式、质量、色彩空间和是否保留 EXIF。
4. 生成导出任务并显示进度。
5. 记录导出文件、时间和来源版本。

## 6. 编辑器状态机

```text
EMPTY
  └─ upload → READY
READY
  ├─ change recipe → DIRTY
  ├─ select version → REVIEWING
  └─ delete asset → EMPTY
DIRTY
  ├─ generate → SUBMITTING
  ├─ reset → READY
  └─ select version → REVIEWING
SUBMITTING
  ├─ job accepted → GENERATING
  └─ validation failed → ERROR
GENERATING
  ├─ success → REVIEWING
  ├─ fail → ERROR
  └─ cancel → READY
REVIEWING
  ├─ modify recipe → DIRTY
  ├─ approve → APPROVED
  ├─ restore parent → REVIEWING
  └─ export → EXPORTING
ERROR
  ├─ retry → SUBMITTING
  ├─ change route → DIRTY
  └─ dismiss → READY
```

## 7. 错误分类

| 错误码 | 用户文案 | 可执行动作 |
|---|---|---|
| INPUT_UNSUPPORTED | 图片格式或尺寸不支持 | 重新上传/自动转换 |
| AUTH_REQUIRED | 登录已过期 | 重新登录 |
| PROVIDER_QUOTA | 当前模型额度不足 | 自动切换/打开高级设置 |
| PROVIDER_TIMEOUT | 模型响应超时 | 重试/切换速度优先 |
| SAFETY_BLOCKED | 内容不符合供应商规则 | 修改图片或要求 |
| IDENTITY_DRIFT | 结果与原人物差异过大 | 降低强度/增强身份锁定 |
| STORAGE_FAILED | 结果保存失败 | 重试保存，保留临时结果 |
| NETWORK_OFFLINE | 网络中断 | 恢复网络后继续 |
| UNKNOWN | 未知错误 | 复制诊断 ID / 重试 |

## 8. 路由原则

用户不直接选择模型，先选择策略：

- 质量优先；
- 均衡；
- 速度优先。

系统依据任务类型、输入尺寸、是否有人脸、是否有蒙版、输出分辨率、历史成功率和成本进行路由。高级用户可以锁定 Provider，但系统必须给出能力不匹配提示。
