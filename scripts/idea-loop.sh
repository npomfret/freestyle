#!/usr/bin/env bash
# Feed idea-prompt.md to the Gemini CLI in a loop. Each iteration runs fully
# non-interactive: YOLO approval so it can use the shell, web search, and
# write files without prompting. Cheap model (flash-lite) by default.
#
# Usage:
#   scripts/idea-loop.sh                 # loop forever
#   scripts/idea-loop.sh 5               # run 5 iterations
#   MODEL=gemini-2.5-flash scripts/idea-loop.sh
#   SLEEP_SECS=30 scripts/idea-loop.sh
#   SANDBOX=1 scripts/idea-loop.sh       # run shell tools inside gemini's sandbox
#                                        # (will likely break `npm run search` —
#                                        # the sandbox image lacks your node/nvm)
#
# Stop with Ctrl-C.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROMPT_FILE="$ROOT/idea-prompt.md"
LOG_DIR="$ROOT/tmp/logs/idea-loop"
MODEL="${MODEL:-gemini-2.5-flash-lite}"
SLEEP_SECS="${SLEEP_SECS:-5}"

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

case "${1:-}" in
  -h|--help) usage 0 ;;
  "")         MAX_ITERS=0 ;;
  *)
    if [[ "$1" =~ ^[0-9]+$ ]]; then
      MAX_ITERS="$1"
    else
      echo "bad argument: '$1' (expected a positive integer or --help)" >&2
      usage 2
    fi
    ;;
esac

SANDBOX_FLAG=()
if [[ "${SANDBOX:-0}" == "1" ]]; then
  SANDBOX_FLAG=(--sandbox)
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi
if ! command -v gemini >/dev/null 2>&1; then
  echo "gemini CLI not on PATH" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

iter=0
while true; do
  iter=$((iter + 1))
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOG_DIR/run-$ts.log"

  echo "[$ts] iteration $iter — model=$MODEL — log=$log"

  # --approval-mode=yolo     auto-approve shell, web search, file writes
  # --skip-trust             trust this workspace for the session
  # --output-format text     plain text final answer on stdout
  # -m                       cheap model
  # -p                       non-interactive; prompt body piped from idea-prompt.md
  set +e
  gemini \
    --approval-mode=yolo \
    --skip-trust \
    ${SANDBOX_FLAG[@]+"${SANDBOX_FLAG[@]}"} \
    --output-format text \
    -m "$MODEL" \
    -p "$(cat "$PROMPT_FILE")" \
    >"$log" 2>&1
  rc=$?
  set -e

  if [[ $rc -eq 0 ]]; then
    echo "[$(date +%H:%M:%S)] iteration $iter done (exit 0)"
  else
    echo "[$(date +%H:%M:%S)] iteration $iter failed (exit $rc) — see $log" >&2
    # 53 = turn-limit; everything else is a real failure but we keep looping
    # rather than abort the whole run.
  fi

  if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then
    break
  fi

  sleep "$SLEEP_SECS"
done
