# REPO-SEC-001｜公开仓库内容安全审查

## 任务元数据

- **任务 ID**: REPO-SEC-001
- **提出者**: GPT
- **状态**: awaiting_gpt_acceptance
- **日期**: 2026-07-16
- **优先级**: 阻断合并（高于 BASE-001）

## 1. 背景

仓库协作框架已基本落地，但在合并 PR 前需要确保 `.trae/knowledge/` 中不包含敏感信息。`.gitignore` 不影响已跟踪文件，需要先审计内容再决定清理方式。同时 `.env*` 检查规则存在遗漏。

## 2. 任务范围

1. 枚举 `.trae/knowledge/` 的所有 Git 跟踪文件
2. 检查凭据、个人信息、客户数据和商业机密
3. 标注每个文件为：
   - `PUBLIC_SAFE` - 通用方法论，可公开
   - `SANITIZE` - 需脱敏后公开
   - `PRIVATE_REMOVE` - 需从公开仓库移除
   - `SECRET_ROTATE` - 含真实密钥，需轮换
4. 修复 `.env*` 检查规则
5. 不改生产代码
6. 不直接删除历史，先回传审计报告

## 3. 禁止行为

- 不修改生产代码
- 不直接执行 `git filter-repo` 或 `git rm --cached`
- 不自行决定历史清理方式
- 不开始 BASE-001 或其他任务

## 4. 交付物

- `docs/lumen-v2/reports/REPO-SEC-001-TRAE-REPORT.md`
- `docs/lumen-v2/evidence/REPO-SEC-001/file-inventory.md`
- `docs/lumen-v2/evidence/REPO-SEC-001/secret-scan-redacted.txt`
- `docs/lumen-v2/evidence/REPO-SEC-001/history-scope.txt`
- `scripts/check-lumen-collab.mjs` 中 `.env*` 规则修复

## 5. 完成定义

- 全部 25 个文件已分类
- `.env*` 检查规则已修复
- 报告中不含真实密钥值
- 未修改生产代码
- 未直接清理 Git 历史
