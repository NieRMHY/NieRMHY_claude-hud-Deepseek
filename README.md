# Claude HUD (DeepSeek 版)

> Fork 自 [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud)，新增 DeepSeek 自定义 ¥ 计费、费用明细展示、总计追踪。

[![License](https://img.shields.io/github/license/jarrodwatts/claude-hud?v=2)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-jarrodwatts%2Fclaude--hud-blue)](https://github.com/jarrodwatts/claude-hud)

---

## 与原版的区别

| 功能 | 原版 | 本 Fork |
|------|------|---------|
| **DeepSeek 计费** | 不支持（显示 $0 或错误 USD） | 通过 `customPricing` 配置自定义 ¥ 定价 |
| **币种** | 仅 USD (`$`) | DeepSeek 用 ¥，Anthropic 保持 `$` |
| **会话费用明细** | 仅在 project 行显示 `Est. ¥X.XX` | 独立行展示 token 明细（`64K入/20K出/2.2M缓存`） |
| **总计** | 不支持 | `📊 ¥XX.XX 总计`，基于 better-ccusage |
| **Wrapper** | 不需要 | `scripts/statusline-wrapper.sh` 合并 HUD + 费用行 |

### 显示效果

```
[deepseek-v4-pro] │ ⏱️ 58m │ Est. ¥0.95 │ Ciallo～(∠・ω< )⌒★
Context ████░░░░░░ 42%
💰 ¥0.95 (118K入/59K出/9.6M缓存)   ⏱️ 2h 54m until reset
📊 ¥81.14 总计
◐ Bash: ... | ✓ Bash ×14 | ✓ Write ×2
```

第 1-2 行：插件原生 | 第 3-4 行：wrapper 注入的费用行 | 第 5+ 行：工具/Agent 活动

---

## 默认 DeepSeek 定价（¥ / 百万 tokens）

| 模型匹配 | 输入 | 缓存命中 | 输出 |
|---------|------|---------|------|
| `deepseek.*flash` | ¥1 | ¥0.02 | ¥2 |
| `deepseek.*pro` | ¥3 | ¥0.025 | ¥6 |
| `deepseek`（兜底） | ¥3 | ¥0.025 | ¥6 |

在 `~/.claude/plugins/claude-hud/config.json` 中覆盖：

```json
{
  "display": { "showCost": true },
  "customPricing": [
    {"pattern": "deepseek.*flash", "inputPerM": 1, "cacheHitPerM": 0.02, "outputPerM": 2, "currency": "¥"},
    {"pattern": "deepseek.*pro",   "inputPerM": 3, "cacheHitPerM": 0.025, "outputPerM": 6, "currency": "¥"}
  ]
}
```

完整示例见 `config-examples/deepseek-config.json`。

---

## 安装

### 依赖

- `bun`（运行插件和 wrapper）
- `better-ccusage`（总计统计）：`bun install -g better-ccusage`

### 步骤

**1. 构建**

```bash
cd 本仓库目录
bun install
bun run build
```

**2. 部署插件**

将 `dist/` 复制到 Claude Code 插件缓存目录，或配置 marketplace 指向本仓库。

**3. 配置 wrapper**

```bash
mkdir -p ~/.claude/plugins/claude-hud
cp config-examples/deepseek-config.json ~/.claude/plugins/claude-hud/config.json
cp scripts/statusline-wrapper.sh ~/.claude/
chmod +x ~/.claude/statusline-wrapper.sh
```

**4. 配置 statusLine**

在 `~/.claude/settings.json` 中：

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /home/<user>/.claude/statusline-wrapper.sh"
  }
}
```

重启 Claude Code。

---

## 新增配置项

原版所有 `config.json` 选项仍然有效。新增字段：

| 键 | 类型 | 说明 |
|----|------|------|
| `customPricing` | array | 第三方模型定价列表 |
| `customPricing[].pattern` | string | 匹配模型名称的正则 |
| `customPricing[].inputPerM` | number | 输入价格（每百万 token） |
| `customPricing[].cacheHitPerM` | number | 缓存命中价格（每百万 token） |
| `customPricing[].outputPerM` | number | 输出价格（每百万 token） |
| `customPricing[].currency` | string | 币种符号（默认 `¥`） |

---

## 源码改动

| 文件 | 改动 |
|------|------|
| `src/cost.ts` | 添加 DeepSeek 定价模式、`isDeepseekModel()` 跳过 native cost、从 config 读自定义定价、`formatUsd()` 支持多币种 |
| `src/render/lines/cost.ts` | 传递 `_currency` 给 `formatUsd()` |
| `scripts/statusline-wrapper.sh` | Wrapper：合并插件 HUD + better-ccusage 费用行 |
| `config-examples/deepseek-config.json` | 含 `customPricing` 的完整配置示例 |

---

## 原版文档

完整的上游文档（HUD 功能、配置参考、排查）见：
- [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud)

---

## 许可

MIT — 见 [LICENSE](LICENSE)。原作版权 (c) 2026 Jarrod Watts。
