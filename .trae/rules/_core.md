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
| **Skills** | `.trae/skills/` | **仅存放**全局没有的自定义业务 skills |

---

## Skill 选择指引

### 核心原则：优先使用全局 Skills

Trae IDE 已内置 56 个全局 skills，**无需在项目本地重复安装**。本地 `.trae/skills/` 仅存放全局没有的自定义业务 skills。

---

### 开发工作流标准顺序

任何开发任务遵循以下顺序调用 Skills，不要跳步：

```
brainstorming（创意探索，必用）
  ↓
writing-plans（制定计划，多步骤任务必用）
  ↓
test-driven-development（先写测试，写代码前必用）
  ↓
执行开发（三选一）：
  ├─ 有书面计划+跨会话+要审查 → executing-plans
  ├─ 当前会话+多任务有依赖 → subagent-driven-development
  └─ 2+完全独立任务 → dispatching-parallel-agents
  ↓
遇Bug → systematic-debugging（第一层必用）
        ↓ 静态分析解决不了？
        TRAE-debugger（第二层，运行时调试）
  ↓
verification-before-completion（声称完成前必用，先验证再断言）
  ↓
requesting-code-review → TRAE-code-review → receiving-code-review（审查流程）
  ↓
finishing-a-development-branch（收尾集成）
```

---

### 易混淆 Skills 速查

| 场景 | 用这个 | 不要用 |
|------|--------|--------|
| 做海报/出PNG/PDF设计图 | canvas-design | web-dev/frontend-design（它们出代码） |
| 空工作区从零建完整网站/WebApp | web-dev | frontend-design（它用于现有项目） |
| 现有项目写高设计质量组件/页面 | frontend-design | web-dev（它用于从零开始） |
| 已知 note_id 直查单个纪要详情 | lark-note | - |
| 搜妙记、看妙记、上传音视频转妙记 | lark-minutes | - |
| 批量汇总一段时间会议生成周报 | lark-workflow-meeting-summary | - |
| 遇到任何Bug/测试失败 | systematic-debugging | 上来就猜着改 |
| 多轮静态分析仍无法定位问题 | TRAE-debugger | 一遇Bug就启动TRAE-debugger（太重） |

---

## 规则间优先级

当多条规则同时触发时，按以下顺序执行：
1. `_core.md`（始终生效，优先级最高）
2. `_file_management.md`（文件操作前执行，优先于 temp_script）
3. `_temp_script.md`（若涉及临时脚本，在 file_management 之后执行）
4. `_memory.md`（会话启动时执行，优先于 experience）
5. `_experience.md`（任务结束时执行，在 memory 写入之后）
