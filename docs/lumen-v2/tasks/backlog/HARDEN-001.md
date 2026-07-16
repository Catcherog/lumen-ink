# Trae Prompt｜HARDEN-001 安全、可靠性与发布

## 目标

完成 P0 上线前安全门禁：

- Production secret fail-fast；
- 删除默认密码、JWT 和加密 Key fallback；
- CORS allowlist；
- 登录限流；
- 上传 MIME、大小、像素和解码校验；
- Provider Key 不返回前端；
- health 脱敏；
- edit/detect 日志脱敏；
- Provider 配置迁离 `/tmp`；
- 项目删除和资产清理；
- 安全回归测试；
- Production flag 切换和回滚文档。

## 验收

对照 `07-ACCEPTANCE-PLAN.md` Gate D。  
任何 S0/S1 不得作为已知限制放行。
