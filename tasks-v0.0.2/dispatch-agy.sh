#!/usr/bin/env bash
# 把 tasks-v0.0.2 里某个任务的 Prompt 块派发给 agy（Google Antigravity CLI）。
#
#   bash tasks-v0.0.2/dispatch-agy.sh T21                 # 真派发
#   bash tasks-v0.0.2/dispatch-agy.sh T21 --dry-run       # 只打印要发出去的 prompt
#   bash tasks-v0.0.2/dispatch-agy.sh T21 --resume <id>   # 首轮超时后接着跑
#   bash tasks-v0.0.2/dispatch-agy.sh T21 --timeout 1200  # 换超时（默认 900s）
#
# 纪律：同一个仓库同一时刻只允许一个 agy 进程（见 README §九）。

set -uo pipefail
export PATH="$PATH:/c/Users/luo/AppData/Local/agy/bin"

ROOT="D:/hermeswork/personal-history-timeline"
LOG="$ROOT/tasks-v0.0.2/dispatch-logs"

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "用法: dispatch-agy.sh <T21..T30> [--dry-run] [--resume <conversation_id>] [--timeout <秒>]" >&2
  exit 2
fi
shift

DRY=0
RESUME=""
TIMEOUT=900
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --resume)  RESUME="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-900}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

FILE=$(ls "$ROOT"/tasks-v0.0.2/"${TASK}"-*.md 2>/dev/null | head -1)
if [ -z "$FILE" ]; then
  echo "找不到任务文件: $ROOT/tasks-v0.0.2/${TASK}-*.md" >&2
  exit 2
fi

# 抽取「## Prompt（可直接粘贴）」下面的第一个代码块
PROMPT=$(awk '
  /^## Prompt（可直接粘贴）/ { f=1; next }
  f && /^```/ { c++; if (c==1) { inblock=1; next } if (c>=2) exit }
  f && inblock { print }
' "$FILE")

if [ -z "$PROMPT" ]; then
  echo "任务文件里没有可用的 Prompt 代码块: $FILE" >&2
  exit 2
fi

if [ "$DRY" = 1 ]; then
  echo "=== $FILE ==="
  echo "$PROMPT"
  exit 0
fi

mkdir -p "$LOG"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$LOG/${TASK}-${STAMP}.json"

cd "$ROOT" || exit 1

if [ -n "$RESUME" ]; then
  agy --output-format json --dangerously-skip-permissions --print-timeout "${TIMEOUT}s" \
      --conversation "$RESUME" --print="$PROMPT" > "$OUT" 2>&1
else
  agy --output-format json --dangerously-skip-permissions --print-timeout "${TIMEOUT}s" \
      --print="$PROMPT" > "$OUT" 2>&1
fi

echo "原始输出: $OUT"
python - "$OUT" <<'PY' 2>/dev/null || tail -30 "$OUT"
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print('status  =', d.get('status'))
print('conv_id =', d.get('conversation_id'))
resp = (d.get('response') or '')
print('--- response (first 4000 chars) ---')
print(resp[:4000] if resp else '(空 — 多半是 print-timeout 撞上了，先查盘再用 --resume 续跑)')
PY
