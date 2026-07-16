# 光砚 V2 GitHub 协作包 v1.2

## 用途

`repo-overlay/` 内的目录结构可直接合入光砚 `picture-edit` 仓库根目录。它将原附件式协作包改造成仓库驱动的跨窗口记忆系统。

## 合入方式

1. 在仓库创建分支：`docs/lumen-v2-repo-collaboration`。
2. 将 `repo-overlay/` 中的全部内容复制到仓库根目录。
3. 将 `docs/lumen-v2/REPO-CONFIG.json` 和 `state/STATE.json` 中的仓库 URL 替换为实际公开地址。
4. 检查现有根目录是否已有 `AGENTS.md`；若有，合并规则，不要直接覆盖。
5. 人工审查 `docs/lumen-v2/references/` 中的图片，确认无客户数据、密钥和隐私。
6. 执行：

```bash
node scripts/check-lumen-collab.mjs
```

7. 提交 PR，使用 `.github/PULL_REQUEST_TEMPLATE/lumen-v2-task.md`。

## 第一次启用后的状态

- 当前任务：BASE-001
- nextActor：Trae
- GPT 不再读取附件包，改为读取仓库。

## 新窗口

- GPT：`docs/lumen-v2/prompts/NEW-WINDOW-GPT.md`
- Trae：`docs/lumen-v2/prompts/NEW-WINDOW-TRAE.md`
- 用户总控：`docs/lumen-v2/prompts/NEW-WINDOW-USER.md`

## 当前限制

本包没有直接推送到 GitHub。需要仓库写权限或由本地 Trae/用户提交。合入后，公开仓库可以作为 GPT 的只读事实源；直接由 GPT push 仍取决于新窗口是否具备 GitHub 写入连接。
