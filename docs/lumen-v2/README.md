# 光砚 V2｜GitHub 协作中枢

本目录是光砚 V2 的公开、可审计、跨窗口协作记忆。任何新对话都不依赖历史聊天，而是从本目录恢复状态。

## 入口

1. `../../AGENTS.md`
2. `state/STATE.json`
3. `START-HERE.md`
4. `state/PROJECT-MEMORY.md`
5. 当前 active task

## 当前阶段

- 已通过：`SCAN-001`
- 当前任务：`BASE-001`
- 下一执行者：Trae
- Production V2 feature flag：关闭

以 `state/STATE.json` 为准；本段只作人类阅读入口。

## 目录

```text
docs/lumen-v2/
├── START-HERE.md
├── REPO-CONFIG.json
├── SECURITY-PUBLIC-REPO.md
├── CONTRIBUTION-WORKFLOW.md
├── state/          # 当前状态、项目记忆、决策、变更和交接
├── specs/          # 产品、UI、PRD、技术与验收规格
├── tasks/
│   ├── active/     # 只能有一个正式 active task
│   ├── backlog/
│   └── completed/
├── reports/        # Trae 每轮实现报告
├── reviews/        # GPT 每轮验收报告
├── evidence/       # 脱敏测试、日志、截图和测量证据
├── prompts/        # 新窗口启动词
├── templates/      # 回传和验收模板
├── references/     # 公开安全的参考图与资料
└── prototype/      # 低保真原型
```

## 不在仓库中保存的内容

真实密钥、客户图片、生产数据和隐私内容必须留在受控系统中。仓库仅记录结构、决策、脱敏证据和可公开代码。
