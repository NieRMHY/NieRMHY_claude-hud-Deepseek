#!/usr/bin/env bash
# SessionStart hook: cc-switch 等工具覆盖 settings.json 后自动恢复 statusLine
# 由 plugin.json hooks → hooks/hooks.json → SessionStart 触发
#
# 工作机制（幂等）：
#   - settings.json 有 statusLine → 备份到 $claude_dir/.claude-hud-statusline.json
#   - settings.json 没有 statusLine 但有备份 → 从备份恢复
#   - 都没有 → 跳过（首次使用需用户主动跑 /claude-hud:setup 配置一次）

set -e

claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$claude_dir/settings.json"
backup="$claude_dir/.claude-hud-statusline.json"

python3 - "$settings" "$backup" <<'PY'
import json, os, sys
settings, backup = sys.argv[1], sys.argv[2]

try:
    with open(settings) as f:
        d = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    d = {}

current = d.get("statusLine")

if current:
    with open(backup, "w") as f:
        json.dump(current, f)
elif os.path.exists(backup):
    with open(backup) as f:
        sl = json.load(f)
    d["statusLine"] = sl
    with open(settings, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
PY
