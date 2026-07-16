# Trae Prompt｜VERSION-001 项目、资产与不可变版本

> 前置条件：`STORAGE-001` 方案已冻结。

## 目标

实现 Project、Asset、Version：

- 上传创建 Project、原图 Asset 和 V0；
- 成功生成创建子 Version；
- 底部版本条显示真实版本；
- 查看、对比、激活和标记采用；
- 刷新恢复；
- 版本不可变；
- 删除项目级联清理；
- 旧 `edit_history` 先备份，再显式导入可恢复条目。

## 禁止

- 不把 history 改名冒充 Version；
- 不静默丢弃旧数据；
- 不自动导入失效 URL；
- 不在本轮做异步 Job 或模型路由。

## 交付

- 数据模型和迁移；
- Repository/Storage 实现；
- 删除测试；
- 刷新恢复测试；
- 版本对比截图；
- 容量与失败策略。
