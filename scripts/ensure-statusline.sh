#!/usr/bin/env bash
# SessionStart hook: 确保 ~/.claude/settings.json 有指向本插件 wrapper 的 statusLine
# 触发链: plugin.json hooks → hooks/hooks.json → SessionStart → 本脚本
# 适用场景: cc-switch 等工具覆盖 settings.json 后自动恢复 statusLine

set -e

claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
wrapper_target="$claude_dir/statusline-wrapper.sh"
settings="$claude_dir/settings.json"
wrapper_source="${CLAUDE_PLUGIN_ROOT:-}/scripts/statusline-wrapper.sh"

# wrapper 未部署时从插件目录复制（首次启动即装即用）
if [ -f "$wrapper_source" ] && [ ! -f "$wrapper_target" ]; then
  cp "$wrapper_source" "$wrapper_target"
  chmod +x "$wrapper_target"
fi

[ -f "$wrapper_target" ] || exit 0

# 修正 settings.json 的 statusLine 字段
python3 - "$settings" "$wrapper_target" <<'PY'
import json, sys
path, wrapper = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

expected = {"type": "command", "command": f"bash {wrapper}"}
if data.get("statusLine") != expected:
    data["statusLine"] = expected
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
PY
