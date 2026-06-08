#!/usr/bin/env bash
# Wrapper: plugin HUD + DeepSeek cost lines
export PATH="$HOME/.bun/bin:$PATH"

# Save stdin (can only be read once)
stdin=$(cat)

# --- Run marketplace plugin for HUD lines ---
cols=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')
export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 ))

plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
  | tail -1 | cut -f2-)

hud_lines=$(echo "$stdin" | /home/niermhy/.bun/bin/bun --env-file /dev/null "${plugin_dir}dist/index.js" 2>/dev/null)

# --- Calculate DeepSeek cost lines ---
BETTER_CCUSAGE="$HOME/.bun/bin/bun $HOME/.bun/install/global/node_modules/better-ccusage/dist/index.js"
session_cache_file="$HOME/.claude/ccusage-sessions.json"
blocks_cache_file="$HOME/.claude/ccusage-blocks.json"
cache_max_age=300

# Extract current session ID from stdin transcript_path
session_id=$(echo "$stdin" | jq -r '.transcript_path // ""' 2>/dev/null | xargs basename 2>/dev/null | sed 's/\.jsonl$//')
# Handle agent sub-sessions (agent-xxx format)
if [ -z "$session_id" ] || [ "$session_id" = "null" ]; then
  session_id=""
fi

# Refresh sessions cache
needs_refresh=1
if [ -f "$session_cache_file" ]; then
  cache_mtime=$(stat -c %Y "$session_cache_file" 2>/dev/null)
  now=$(date +%s)
  if [ $(( now - cache_mtime )) -lt $cache_max_age ]; then
    needs_refresh=0
  fi
fi

if [ "$needs_refresh" -eq 1 ]; then
  $BETTER_CCUSAGE session --json 2>/dev/null > "$session_cache_file.tmp" 2>/dev/null
  if [ -s "$session_cache_file.tmp" ]; then
    mv "$session_cache_file.tmp" "$session_cache_file"
  fi
  # Also refresh blocks for time remaining
  $BETTER_CCUSAGE blocks --json 2>/dev/null > "$blocks_cache_file.tmp" 2>/dev/null
  if [ -s "$blocks_cache_file.tmp" ]; then
    mv "$blocks_cache_file.tmp" "$blocks_cache_file"
  fi
fi

cost_line1=""
cost_line2=""

if [ -f "$session_cache_file" ]; then
  # Pricing in jq
  PRICE_JQ='
    def price_for($model):
      if $model | test("flash"; "i") then
        {input: 1, cacheHit: 0.02, output: 2}
      elif $model | test("pro"; "i") then
        {input: 3, cacheHit: 0.025, output: 6}
      else
        {input: 3, cacheHit: 0.025, output: 6}
      end;

    def breakdown_cost($bd):
      price_for($bd.modelName) as $p |
      ($bd.inputTokens / 1000000 * $p.input) +
      ($bd.cacheReadTokens / 1000000 * $p.cacheHit) +
      ($bd.outputTokens / 1000000 * $p.output);
  '

  # Calculate TOTAL cost (sum all sessions)
  total_cost=$(jq -r "
    $PRICE_JQ
    [.sessions[]? | .modelBreakdowns[]? | breakdown_cost(.)] | add // 0 | . * 100 | round | . / 100
  " "$session_cache_file" 2>/dev/null)
  total_cost=${total_cost:-0}

  # Calculate current SESSION cost (match by sessionId)
  if [ -n "$session_id" ]; then
    read session_cost session_in session_out session_cache <<< \
      $(jq -r "
        $PRICE_JQ
        .sessions | map(select(.sessionId == \"$session_id\")) as \$sessions |
        if (\$sessions | length) > 0 then
          (\$sessions[0].modelBreakdowns | map(breakdown_cost(.)) | add // 0 | . * 100 | round | . / 100) as \$sc |
          (\$sessions[0].inputTokens // 0) as \$si |
          (\$sessions[0].outputTokens // 0) as \$so |
          (\$sessions[0].cacheReadTokens // 0) as \$sca |
          \"\(\$sc) \(\$si) \(\$so) \(\$sca)\"
        else
          \"0 0 0 0\"
        end
      " "$session_cache_file" 2>/dev/null)
  else
    # Fallback: use the last session with tokens
    read session_cost session_in session_out session_cache <<< \
      $(jq -r "
        $PRICE_JQ
        .sessions | map(select(.totalTokens > 0)) | last // {} as \$s |
        if \$s then
          (\$s.modelBreakdowns | map(breakdown_cost(.)) | add // 0 | . * 100 | round | . / 100) as \$sc |
          (\$s.inputTokens // 0) as \$si |
          (\$s.outputTokens // 0) as \$so |
          (\$s.cacheReadTokens // 0) as \$sca |
          \"\(\$sc) \(\$si) \(\$so) \(\$sca)\"
        else
          \"0 0 0 0\"
        end
      " "$session_cache_file" 2>/dev/null)
  fi

  session_cost=${session_cost:-0}
  session_in=${session_in:-0}
  session_out=${session_out:-0}
  session_cache=${session_cache:-0}

  # Token breakdown
  if [ "$session_cache" -ge 1000000 ]; then
    cache_str="$(echo "scale=1; $session_cache / 1000000" | bc 2>/dev/null || echo "0")M缓存"
  elif [ "$session_cache" -ge 1000 ]; then
    cache_str="$(echo "scale=0; $session_cache / 1000" | bc 2>/dev/null || echo "0")K缓存"
  else
    cache_str="${session_cache}缓存"
  fi

  if [ "$session_in" -ge 1000 ]; then
    in_str="$(echo "scale=0; $session_in / 1000" | bc 2>/dev/null || echo "0")K入"
  else
    in_str="${session_in}入"
  fi

  if [ "$session_out" -ge 1000 ]; then
    out_str="$(echo "scale=0; $session_out / 1000" | bc 2>/dev/null || echo "0")K出"
  else
    out_str="${session_out}出"
  fi

  # Time remaining (from blocks cache)
  time_str=""
  if [ -f "$blocks_cache_file" ]; then
    end_time=$(jq -r '([.blocks[] | select(.isActive == true)] | last // empty).endTime // ""' "$blocks_cache_file" 2>/dev/null)
    if [ -n "$end_time" ] && [ "$end_time" != "null" ] && [ "$end_time" != "" ]; then
      end_epoch=$(date -d "${end_time}" +%s 2>/dev/null || echo "0")
      now_epoch=$(date +%s)
      diff_secs=$(( end_epoch - now_epoch ))
      if [ "$diff_secs" -gt 0 ]; then
        hours=$(( diff_secs / 3600 ))
        mins=$(( (diff_secs % 3600) / 60 ))
        time_str="⏱️  ${hours}h ${mins}m until reset"
      else
        time_str="⏱️  resetting…"
      fi
    fi
  fi

  cost_line1="💰 ¥${session_cost} (${in_str}/${out_str}/${cache_str})"
  [ -n "$time_str" ] && cost_line1="${cost_line1}   ${time_str}"

  cost_line2="📊 ¥${total_cost} 总计"
fi

# --- Merge output ---
# Insert cost lines after the Context line (line 2 of plugin output)
line_num=0
while IFS= read -r line; do
  echo "$line"
  line_num=$((line_num + 1))
  if [ $line_num -eq 2 ]; then
    [ -n "$cost_line1" ] && echo "$cost_line1"
    [ -n "$cost_line2" ] && echo "$cost_line2"
  fi
done <<< "$hud_lines"
