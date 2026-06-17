---
alwaysApply: true
description: 项目核心规则 — 文件结构、AI工作流、三层体系、Skill选择指引
---
# 核心规则

> **生效模式**：始终生效（每次会话自动加载，无需判定）

---

## 文件结构

```
项目根目录/
├── .trae/              ← AI 配置（rules/ skills/ knowledge/）
├── src/                ← 代码（.js .ts .py .ps1 .sh 等）
├── docs/               ← 文档（.md .txt 等）
├── public/             ← 静态资源（.png .jpg .svg .pdf 等）
└── README.md           ← 仅构建工具要求的配置文件可放根目录
```

**禁止**：根目录散落文件、跨目录混放、嵌套超过3层。

---

## AI 工作流

```
进入项目
  ↓
读 .trae/knowledge/  → 理解项目是什么（业务、术语、架构）
  ↓
读 .trae/rules/       → 了解怎么做事（约束、规范、流程）
  ↓
匹配场景             → 调用对应 skill
```

---

## 三层体系

| 层 | 位置 | 职责 |
|----|------|------|
| **Knowledge** | `.trae/knowledge/` | 告诉 AI「这个项目是什么」 |
| **Rules** | `.trae/rules/` | 告诉 AI「在这个项目里怎么做事」 |
| **Skills** | `.trae/skills/` | 告诉 AI「用什么工具做事」 |

---

## Skill 选择指引

| 场景 | 推荐选择 | 原因 |
|------|---------|------|
| 飞书简单查询 | `lark-unified` | 快速入口，无需深度知识 |
| 飞书深度操作 | 对应独立 `lark-*` skill | 有 reference 文档、工作流、错误恢复 |
| 腾讯云开发 | `cloudbase` | 唯一选择 |
| 小红书内容 | `xiaohongshu` | 唯一选择 |
| Word 文档 | `word-doc-editor` | 唯一选择 |
| 搜索新 skill | `find-skills` | 唯一选择 |

---

## 规则间优先级

当多条规则同时触发时，按以下顺序执行：
1. `_core.md`（始终生效，优先级最高）
2. `_file_management.md`（文件操作前执行，优先于 temp_script）
3. `_temp_script.md`（若涉及临时脚本，在 file_management 之后执行）
4. `_memory.md`（会话启动时执行，优先于 experience）
5. `_experience.md`（任务结束时执行，在 memory 写入之后）
