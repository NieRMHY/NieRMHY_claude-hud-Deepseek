# CLAUDE.md

本仓库是 **fork**：`jarrodwatts/claude-hud` → `NieRMHY/NieRMHY_claude-hud-Deepseek`，marketplace 名 **`claude-hud-mhy`**。这是插件开发的主目录；`/home/niermhy/claude_settings/plugins/claude-hud/` 只是配置存档副本，改代码一律在本仓库。

## Fork 独有改动（相对 upstream/main）

`main` 与 upstream/main 保持同步（发版时随上游更新），相对上游只多下面几处 fork 独有改动，目标有二：① 自动维持 statusLine（防 cc-switch 覆盖）；② 简体中文 HUD 措辞偏好：

| 文件 | 改动 | 同步上游后必须检查 |
|------|------|--------------------|
| `.claude-plugin/plugin.json` | `name` 改 `claude-hud-mhy`；新增 `"hooks": "./hooks/hooks.json"`；description 标注 fork | 上游每次发版 bump version 且**不带 hooks 字段**，merge 后常被覆盖，需手动补回 |
| `.claude-plugin/marketplace.json` | `name` 改 `claude-hud-mhy`（避免与上游 marketplace 重名冲突） | merge 可能被还原成 `claude-hud` |
| `hooks/hooks.json` | 新增 SessionStart hook → `bash ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-statusline.sh` | 上游没有 `hooks/` 目录，merge 不受影响 |
| `scripts/ensure-statusline.sh` | 新增：备份/恢复 statusLine（fork 唯一逻辑独有文件） | 上游 `scripts/` 只有 `clean-dist.mjs` |
| `src/i18n/zh-Hans.ts` | `label.tokens` / `format.tok` 译作 `token`（上游为"词元"） | 上游改翻译时可能被 merge 覆盖，需改回 `token` |

### ensure-statusline.sh 机制（幂等）

解决 cc-switch 切换 provider 时用其 SQLite db 覆盖 `~/.claude/settings.json`、丢失 `statusLine` 字段的问题。每次 SessionStart 触发：

| settings.json 当前 | 备份 `~/.claude/.claude-hud-statusline.json` | 行为 |
|---|---|---|
| 有 statusLine | 任意 | 备份当前值 |
| 无 statusLine | 存在 | 从备份恢复 |
| 无 statusLine | 不存在 | 跳过（首次需用户跑 `/claude-hud:setup`） |

## 同步上游（维护主流程）

上游有更新时：

```bash
cd /home/niermhy/workspace/project/project_myself/Claude_Code_plugins/NieRMHY_claude-hud-Deepseek
git fetch upstream
git merge upstream/main
# 合并后立即检查 fork 独有改动是否还在：
git diff upstream/main -- .claude-plugin/ hooks/ scripts/ensure-statusline.sh src/i18n/zh-Hans.ts
grep '"hooks"' .claude-plugin/plugin.json || echo '需手动补回 "hooks": "./hooks/hooks.json"'
grep '"token"' src/i18n/zh-Hans.ts || echo '需把 label.tokens / format.tok 改回 token（上游译作"词元"）'
# 若 plugin.json / marketplace.json 的 name 被还原，改回 claude-hud-mhy

npm ci && npm run build        # 重新编译 dist/
git add -A && git commit -m "sync: 同步上游 <版本> + 保留本地改动"
git push origin main
```

用户侧更新：在 Claude Code 里跑 `/plugin update claude-hud@claude-hud-mhy`。

> 上游发版只改代码，`hooks/` 与 `scripts/ensure-statusline.sh` 上游不存在，merge 不会冲突；但 `plugin.json` / `marketplace.json` 上游同样维护，会被 merge 覆盖回官方值（丢 `hooks` 字段、name 还原），`src/i18n/zh-Hans.ts` 的 token 措辞改动也可能被上游翻译更新覆盖，**这三个文件是每次同步的必查项**。

## 本地开发与测试

```bash
npm ci                # 装依赖（或 bun install）
npm run build         # 编译 dist/（node scripts/clean-dist.mjs && tsc）
npm test              # build + node --test
npm run test:stdin    # 用样例 stdin 跑一次渲染，快速验证

# 手动喂数据调试渲染
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

改完想在本机立即生效（用 main 内容覆盖已安装插件的 cache 目录）：

```bash
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
find "$PLUGIN_DIR" -mindepth 1 -delete
git archive main | tar -x -C "$PLUGIN_DIR"
chmod +x "$PLUGIN_DIR/scripts/"*.sh
# 重启 Claude Code 验证
```

## 运行时文件位置

| 路径 | 说明 |
|------|------|
| `~/.claude/plugins/cache/claude-hud-mhy/claude-hud/<version>/` | 插件运行副本（cache，版本号随发版变化） |
| `~/.claude/plugins/claude-hud/config.json` | 用户显示配置，独立于插件目录，插件更新不覆盖 |
| `~/.claude/.claude-hud-statusline.json` | hook 自动生成的 statusLine 备份 |
| `~/.claude/hud-statusline.sh` | statusline 入口脚本（部署副本，源自配置存档目录） |
| `/home/niermhy/claude_settings/plugins/claude-hud/` | 配置存档/分发副本（换机部署用，非开发） |
| vault 开发记录 | `AI/Claude Code/plugin 开发/claude-hud 开发记录.md` |

## 踩坑记录

1. **cc-switch 覆盖 settings.json 丢 statusLine**：cc-switch 切 provider 时用其 SQLite db（`~/.cc-switch/cc-switch.db` 的 `providers.settings_config`）覆盖 settings.json，该字段无 statusLine。已由 SessionStart hook 自动备份/恢复，不修改 cc-switch db。若 HUD 消失，先看 `~/.claude/.claude-hud-statusline.json` 是否存在。
2. **同步上游后 hooks 字段丢失**：上游 plugin.json 无 hooks 字段，每次 merge 必查（见同步流程）。
3. **插件 scope 变 project 导致 `/claude-hud:` 命令不识别**：插件被注册为 `scope: project` 时，切到其他工作目录命令就失效。用 `/plugin marketplace add` + `/plugin install` 重装，让 Claude Code 自己管理 scope。
4. **marketplace 名冲突**：fork 与上游 marketplace 都叫 `claude-hud` 会冲突，fork 固定用 `claude-hud-mhy`。
5. **`/plugin update` 拉错内容（无 hooks）——必须先 `/plugin marketplace update`**：插件是从 marketplace 克隆（`~/.claude/plugins/marketplaces/claude-hud-mhy/`）拉取的，克隆陈旧时 update 会拉到旧内容。本机曾因 marketplace 克隆停在 0.3.0 的旧 commit，装出的插件 plugin.json 无 hooks、`hooks/` 不存在，**SessionStart hook 从未生效**。正确发布/更新流程：bump version → push fork main → 用户先 `/plugin marketplace update` 再 `/plugin update`；更新后验证 cache 目录 plugin.json 含 `"hooks"` 字段。网络不通时，marketplace 克隆可用 `git fetch <本地开发仓库路径> main && git reset --hard FETCH_HEAD` 绕过网络手动更新。
6. **双插件并存时 hud-launcher.sh 按版本抢显示**：`~/.claude/hud-launcher.sh` 按版本号选最高 cache 目录，上游 claude-hud 与 fork 并存时版本高的会被选中（如上游 0.6.0 > fork 0.5.1，HUD 显示上游内容、fork 的 hooks/token 改动看不到）。本机已卸载上游插件只保留 fork。排查 HUD 实际用哪个插件：`ls ~/.claude/plugins/cache/*/claude-hud/*/`，并模拟 launcher 的版本排序取最大。

---

以下为上游 claude-hud 的开发参考（随 upstream 保持同步，勿在此记录 fork 独有内容）。

## Project Overview

Claude HUD is a Claude Code plugin that displays a real-time multi-line statusline. It shows context health, tool activity, agent status, and todo progress.

## Build Commands

```bash
npm ci               # Install dependencies
npm run build        # Build TypeScript to dist/

# Test with sample stdin data
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → render lines → stdout → Claude Code displays
           ↘ transcript_path → parse JSONL → tools/agents/todos
```

**Key insight**: The statusline is invoked by Claude Code after each interaction (new assistant message, `/compact` finishing, permission-mode changes, vim-mode toggles), debounced at 300ms — not on a fixed polling loop. Each invocation:
1. Receives JSON via stdin (model, context, tokens - native accurate data)
2. Parses the transcript JSONL file for tools, agents, and todos
3. Renders multi-line output to stdout
4. Claude Code displays all lines

### Data Sources

**Native from stdin JSON** (accurate, no estimation):
- `model.display_name` - Current model
- `context_window.current_usage` - Token counts
- `context_window.context_window_size` - Max context
- `transcript_path` - Path to session transcript

**From transcript JSONL parsing**:
- `tool_use` blocks → tool name, input, start time
- `tool_result` blocks → completion, duration
- Running tools = `tool_use` without matching `tool_result`
- `TodoWrite` calls → todo list
- `Task` calls → agent info

**From config files**:
- MCP count from `~/.claude/settings.json` (mcpServers)
- Hooks count from `~/.claude/settings.json` (hooks)
- Rules count from CLAUDE.md files

**From Claude Code stdin rate limits**:
- `rate_limits.five_hour.used_percentage` - 5-hour subscriber usage percentage
- `rate_limits.five_hour.resets_at` - 5-hour reset timestamp
- `rate_limits.seven_day.used_percentage` - 7-day subscriber usage percentage
- `rate_limits.seven_day.resets_at` - 7-day reset timestamp

### File Structure

```
src/
├── index.ts             # Entry point
├── stdin.ts             # Parse Claude's JSON input
├── transcript.ts        # Parse transcript JSONL
├── config-reader.ts     # Read MCP/rules configs
├── config.ts            # Load/validate user config
├── auth.ts              # Auth/account state (model-scoped weekly usage)
├── model-source.ts      # Resolve which model source a usage window belongs to
├── git.ts               # Git status (branch, dirty, ahead/behind)
├── cost.ts              # Cost estimation (native stdin cost preferred)
├── effort.ts            # Thinking effort parsing
├── external-usage.ts    # External usage snapshot fallback / balance_label
├── speed-tracker.ts     # Output speed tracking
├── context-cache.ts     # Context/usage caching across invocations
├── memory.ts            # System memory stats
├── claude-config-dir.ts # Resolve the Claude config directory
├── constants.ts         # Shared constants
├── debug.ts             # Debug logging
├── extra-cmd.ts         # Run an optional user command for a custom label
├── version.ts           # Plugin version handling
├── i18n/                # HUD label translations (en, zh-Hans)
├── utils/               # Shared helpers
├── types.ts             # TypeScript interfaces
└── render/
    ├── index.ts             # Main render coordinator
    ├── session-line.ts      # Compact mode: single line with all info
    ├── tools-line.ts        # Tool activity (opt-in)
    ├── skills-mcp-line.ts   # Skills & MCP activity (opt-in)
    ├── agents-line.ts       # Agent status (opt-in)
    ├── todos-line.ts        # Todo progress (opt-in)
    ├── colors.ts            # ANSI color helpers
    ├── width.ts             # Terminal width / CJK-aware measurement
    ├── format-reset-time.ts # Usage reset time formatting
    └── lines/
        ├── index.ts         # Barrel export
        ├── project.ts       # Model bracket + project + git (+ advisor)
        ├── identity.ts      # Context bar
        ├── usage.ts         # Usage bar (merged with context by default)
        ├── environment.ts   # Config counts (opt-in)
        ├── advisor.ts       # Advisor model label (opt-in)
        ├── cost.ts          # Session cost display
        ├── prompt-cache.ts  # Prompt cache countdown
        ├── memory.ts        # Memory usage display
        ├── session-time.ts  # Session duration / timestamps
        ├── session-tokens.ts # Session token totals
        ├── added-dirs.ts    # /add-dir workspace directories
        └── label-align.ts   # Label column alignment
```

### Output Format (default expanded layout)

```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

Lines 1-2 always shown. Additional lines are opt-in via config:
- Tools line (`showTools`): ◐ Edit: auth.ts | ✓ Read ×3
- Skills/MCP lines (`showSkills` / `showMcp`): active Skill invocations and MCP servers; when the Skills line is enabled, Skill-tool entries are suppressed from the tools line
- Agents line (`showAgents`): ◐ explore [haiku]: Finding auth code
- Todos line (`showTodos`): ▸ Fix authentication bug (2/5)
- Environment line (`showConfigCounts`): 2 CLAUDE.md | 4 rules
- Advisor label (`showAdvisor`): inlined on the project line, e.g. `Advisor: Opus 4.7`

### Context Thresholds

| Threshold | Color | Action |
|-----------|-------|--------|
| <70% | Green | Normal |
| 70-85% | Yellow | Warning |
| >85% | Red | Show token breakdown |

## Plugin Configuration

The plugin manifest is in `.claude-plugin/plugin.json` (metadata + `hooks` field pointing to `./hooks/hooks.json`; the hooks field and `claude-hud-mhy` name are fork-local, see the fork section above).

**StatusLine configuration** must be added to the user's `~/.claude/settings.json` via `/claude-hud:setup`.

The setup command adds an auto-updating command that finds the latest installed version at runtime.

Note: `statusLine` is NOT a valid plugin.json field. It must be configured in settings.json after plugin installation. In this fork, the SessionStart hook auto-backs-up / restores it against cc-switch overwrites.

## Dependencies

- **Runtime**: Node.js 18+ or Bun
- **Build**: TypeScript 5, ES2022 target, NodeNext modules
