#!/usr/bin/env bash
# Generate ideas, periodically purge. Each iteration:
#   1) count idea files in ideas/
#   2) check Gemini quota
#   3) if count > THRESHOLD and pro quota available  → purge with pro
#      else if any non-pro family has quota          → generate with cheapest
#      else                                          → sleep
#
# Usage:
#   scripts/loop.sh                 # loop forever
#   scripts/loop.sh 5               # at most 5 iterations
#   THRESHOLD=40 scripts/loop.sh    # backlog size that triggers a purge
#   SLEEP_SECS=30 scripts/loop.sh   # sleep between productive iterations
#   IDLE_SLEEP_SECS=3600 scripts/loop.sh  # sleep when quota is genuinely exhausted
#   ERROR_RETRY_SECS=60 scripts/loop.sh   # sleep when the quota fetch itself fails
#   SANDBOX=1 scripts/loop.sh       # run shell tools inside gemini's sandbox
#                                   # (will likely break `npm run search` —
#                                   # the sandbox image lacks your node/nvm)
#
# Stop with Ctrl-C.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IDEAS_DIR="$ROOT/ideas"
IDEA_PROMPT="$ROOT/idea-prompt.md"
PURGE_PROMPT="$ROOT/purge-prompt.md"
LOG_DIR="$ROOT/tmp/logs/loop"
SLEEP_SECS="${SLEEP_SECS:-30}"
IDLE_SLEEP_SECS="${IDLE_SLEEP_SECS:-3600}"
ERROR_RETRY_SECS="${ERROR_RETRY_SECS:-60}"
THRESHOLD="${THRESHOLD:-40}"

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

case "${1:-}" in
  -h|--help) usage 0 ;;
  "")        MAX_ITERS=0 ;;
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

[[ -f "$IDEA_PROMPT"  ]] || { echo "missing $IDEA_PROMPT"  >&2; exit 1; }
[[ -f "$PURGE_PROMPT" ]] || { echo "missing $PURGE_PROMPT" >&2; exit 1; }
[[ -d "$IDEAS_DIR"    ]] || { echo "missing $IDEAS_DIR"    >&2; exit 1; }
command -v gemini >/dev/null || { echo "gemini CLI not on PATH" >&2; exit 1; }
command -v jq     >/dev/null || { echo "jq not on PATH"        >&2; exit 1; }

mkdir -p "$LOG_DIR"

count_ideas() {
  find "$IDEAS_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' '
}

# Pick the highest-remaining model from a quota snapshot, optionally filtering by family.
# Prints model id (e.g. gemini-2.5-pro) on stdout, or nothing if no family qualifies.
# stderr from jq (if any) flows through unredirected.
#   $1 — quota snapshot JSON
#   $2 — comma-separated families to exclude (e.g. "pro")
#   $3 — comma-separated families to require (e.g. "pro"); empty = any
pick_model_from() {
  local snapshot="$1"
  local exclude="$2"
  local require="$3"
  jq -r \
    --arg exclude "$exclude" \
    --arg require "$require" \
    '
      def split_csv: if . == "" then [] else split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)) end;
      ($exclude | split_csv) as $exclude
      | ($require | split_csv) as $require
      | { "flash-lite": "gemini-2.5-flash-lite",
          "flash":      "gemini-2.5-flash",
          "pro":        "gemini-2.5-pro" } as $map
      | .families
      | map(select($map[.family] != null))
      | map(select(.remainingPercent >= 5))
      | map(select(.family as $f | ($exclude | index($f)) == null))
      | map(select(.family as $f | ($require | length) == 0 or ($require | index($f)) != null))
      | sort_by(-.remainingPercent)
      | (.[0] // empty)
      | $map[.family]
    ' <<<"$snapshot"
}

run_gemini() {
  local model="$1"
  local prompt_file="$2"
  local log="$3"
  set +e
  gemini \
    --approval-mode=yolo \
    --skip-trust \
    ${SANDBOX_FLAG[@]+"${SANDBOX_FLAG[@]}"} \
    --output-format text \
    -m "$model" \
    -p "$(cat "$prompt_file")" \
    >"$log" 2>&1
  local rc=$?
  set -e
  return $rc
}

iter=0
while true; do
  iter=$((iter + 1))
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOG_DIR/run-$ts.log"

  n="$(count_ideas)"

  # Fetch the quota snapshot once for this iteration.
  # gemini-quota's stderr flows straight through — errors are visible immediately.
  set +e
  snapshot="$(npm --prefix "$ROOT" run --silent gemini-quota -- --json)"
  fetch_rc=$?
  set -e

  if [[ $fetch_rc -ne 0 || -z "$snapshot" ]]; then
    echo "[$ts] iteration $iter — quota fetch failed (rc=$fetch_rc) — retrying in ${ERROR_RETRY_SECS}s" >&2
    if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then break; fi
    sleep "$ERROR_RETRY_SECS"
    continue
  fi

  ACTION=""
  MODEL=""

  # Prefer purge when the backlog is over threshold and pro is available.
  if [[ "$n" -gt "$THRESHOLD" ]]; then
    MODEL="$(pick_model_from "$snapshot" "" "pro")"
    [[ -n "$MODEL" ]] && ACTION="purge"
  fi

  # Otherwise generate with the highest-remaining non-pro family.
  if [[ -z "$ACTION" ]]; then
    MODEL="$(pick_model_from "$snapshot" "pro" "")"
    [[ -n "$MODEL" ]] && ACTION="generate"
  fi

  if [[ -z "$ACTION" ]]; then
    # Quota is genuinely exhausted — print the snapshot summary so you can see why.
    summary="$(jq -r '.families | map("\(.family)=\(.remainingPercent)%") | join("  ")' <<<"$snapshot")"
    if [[ "$n" -gt "$THRESHOLD" ]]; then
      echo "[$ts] iteration $iter — backlog $n > $THRESHOLD but no usable quota ($summary) — sleeping ${IDLE_SLEEP_SECS}s" >&2
    else
      echo "[$ts] iteration $iter — no usable quota in any family ($summary) — sleeping ${IDLE_SLEEP_SECS}s" >&2
    fi
    if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then break; fi
    sleep "$IDLE_SLEEP_SECS"
    continue
  fi

  PROMPT_FILE="$IDEA_PROMPT"
  [[ "$ACTION" == "purge" ]] && PROMPT_FILE="$PURGE_PROMPT"

  echo "[$ts] iteration $iter — $ACTION ($n ideas) with $MODEL — log=$log"

  set +e
  run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  rc=$?
  set -e

  after="$(count_ideas)"
  if [[ $rc -eq 0 ]]; then
    echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; $n → $after)"
  else
    echo "[$(date +%H:%M:%S)] iteration $iter $ACTION failed (exit $rc; $n → $after) — see $log" >&2
  fi

  if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then break; fi

  sleep "$SLEEP_SECS"
done
