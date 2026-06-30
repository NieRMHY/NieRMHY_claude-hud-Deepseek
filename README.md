# Claude HUD (Fork)

> Fork 自 [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud)。所有核心功能、文档、版权属于原作者，本仓库 main 分支与上游保持同步。

## 本 Fork 的改动

仅新增一个 SessionStart hook，用于自动维持 `~/.claude/settings.json` 的 `statusLine` 配置：

| 文件 | 改动 |
|------|------|
| `.claude-plugin/plugin.json` | 新增 `"hooks": "./hooks/hooks.json"` 字段 |
| `hooks/hooks.json` | 注册 SessionStart 事件 |
| `scripts/ensure-statusline.sh` | 备份/恢复 statusLine（幂等） |

其他所有文件与上游 main 完全一致。

## 为什么需要这个 hook

第三方配置管理工具（如 cc-switch）切换 provider 时会用其内部 db 覆盖 `~/.claude/settings.json`，丢失 `statusLine` 字段，导致 HUD 不显示。

SessionStart hook 在每次 Claude Code 启动时：

- 当前 `settings.json` 有 `statusLine` → 备份到 `~/.claude/.claude-hud-statusline.json`
- 当前没有 `statusLine` 但有备份 → 从备份恢复
- 都没有 → 跳过（首次使用需用户主动跑 `/claude-hud:setup`）

## 归档分支

[`archive/deepseek-billing`](https://github.com/NieRMHY/NieRMHY_claude-hud-Deepseek/tree/archive/deepseek-billing)（tag: [`v0.1.0-deepseek-billing`](https://github.com/NieRMHY/NieRMHY_claude-hud-Deepseek/releases/tag/v0.1.0-deepseek-billing)）保留了早期带 DeepSeek ¥ 计费模块的版本：

- `scripts/statusline-wrapper.sh` 合并 HUD + better-ccusage 费用行
- `src/cost.ts` 加 DeepSeek 定价逻辑
- `config-examples/deepseek-config.json` customPricing 示例
- 中文 README

由于改用中转站统一计费，本地计费模块归档不再维护。

## 文档

完整功能介绍、配置参考、排查指南请参考上游仓库：[jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud)。

## 许可

MIT — 见 [LICENSE](LICENSE)。原作版权 (c) 2026 Jarrod Watts。
