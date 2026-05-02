#!/usr/bin/env bash
# Pipeline driver: generate ideas, triage them, enhance them, purge them.
# Each iteration picks one action by priority:
#   1) purge   if total > THRESHOLD             and pro or codex available
#   2) triage  if untriaged ≥ TRIAGE_THRESHOLD  and any non-pro available
#   3) enhance if any unreviewed ideas          and pro or codex available
#   4) generate                                  with cheapest non-pro family
#                  (throttled when total > THRESHOLD and no purge runner free)
#   5) sleep
#
# Markers track progress through the cheap pipeline stages:
#   <!-- triaged: YYYY-MM-DD (score=N/8) -->   passed cheap achievability cut
#   <!-- reviewed: YYYY-MM-DD -->              enhanced by codex or gemini-pro
# Purge has no marker: every run re-evaluates every idea against the current bar
# (rubric.md). Surviving ideas are kept untouched; failures are deleted.
#
# Usage:
#   scripts/loop.sh                       # loop forever
#   scripts/loop.sh 5                     # at most 5 iterations
#   THRESHOLD=40 scripts/loop.sh          # ideas count that fires a purge / throttles generate
#   TRIAGE_THRESHOLD=5 scripts/loop.sh    # untriaged ideas required to fire a triage
#   SLEEP_SECS=30 scripts/loop.sh         # sleep between productive iterations
#   IDLE_SLEEP_SECS=3600 scripts/loop.sh  # sleep when quota is genuinely exhausted
#   ERROR_RETRY_SECS=60 scripts/loop.sh   # sleep when the quota fetch itself fails
#   MAX_RUN_SECS=1800 scripts/loop.sh     # hard cap on a single CLI invocation
#   SANDBOX=1 scripts/loop.sh             # run gemini tools inside its sandbox
#                                         # (will likely break `npm run search` —
#                                         # the sandbox image lacks your node/nvm)
#
# Stop with Ctrl-C.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IDEAS_DIR="$ROOT/ideas"
IDEA_PROMPT="$ROOT/idea-prompt.md"
PURGE_PROMPT="$ROOT/purge-prompt.md"
CODEX_PROMPT="$ROOT/codex-prompt.md"
TRIAGE_PROMPT="$ROOT/triage-prompt.md"
LOG_DIR="$ROOT/tmp/logs/loop"
SLEEP_SECS="${SLEEP_SECS:-30}"
IDLE_SLEEP_SECS="${IDLE_SLEEP_SECS:-3600}"
ERROR_RETRY_SECS="${ERROR_RETRY_SECS:-60}"
MAX_RUN_SECS="${MAX_RUN_SECS:-1800}"
THRESHOLD="${THRESHOLD:-40}"
# Triage runs once at least this many fresh (un-triaged, un-reviewed) ideas pile up.
# Triage is a batch operation, so running it on 1–2 files is silly; let some accumulate.
TRIAGE_THRESHOLD="${TRIAGE_THRESHOLD:-5}"

usage() {
  # Print the leading comment block (everything from line 2 up to the first
  # non-comment line) with the leading `# ` stripped.
  awk 'NR==1 {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' "$0"
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

[[ -f "$IDEA_PROMPT"   ]] || { echo "missing $IDEA_PROMPT"   >&2; exit 1; }
[[ -f "$PURGE_PROMPT"  ]] || { echo "missing $PURGE_PROMPT"  >&2; exit 1; }
[[ -f "$CODEX_PROMPT"  ]] || { echo "missing $CODEX_PROMPT"  >&2; exit 1; }
[[ -f "$TRIAGE_PROMPT" ]] || { echo "missing $TRIAGE_PROMPT" >&2; exit 1; }
[[ -d "$IDEAS_DIR"     ]] || { echo "missing $IDEAS_DIR"     >&2; exit 1; }
command -v gemini >/dev/null || { echo "gemini CLI not on PATH" >&2; exit 1; }
command -v codex  >/dev/null || { echo "codex CLI not on PATH" >&2; exit 1; }
command -v jq     >/dev/null || { echo "jq not on PATH"        >&2; exit 1; }

mkdir -p "$LOG_DIR"

# --- diagnostic lifecycle logging -------------------------------------------
# Track where the loop is so an EXIT trap can show why it stopped.
# All diagnostic lines go to stderr with a [loop pid=PID] prefix so they're
# easy to grep and won't be confused with regular iteration output.
LOOP_STAGE="starting"
LOOP_ITER=0
log_loop() { echo "[loop pid=$$ $(date +%H:%M:%S)] $*" >&2; }

on_exit() {
  local rc=$?
  log_loop "EXIT trap fired — exit_code=$rc iter=$LOOP_ITER stage='$LOOP_STAGE'"
}
on_signal() {
  local sig="$1"
  log_loop "SIGNAL $sig received — iter=$LOOP_ITER stage='$LOOP_STAGE'"
  exit 130
}
trap on_exit EXIT
trap 'on_signal INT'  INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP'  HUP

log_loop "starting loop (pid=$$ MAX_ITERS=$MAX_ITERS SLEEP_SECS=$SLEEP_SECS IDLE_SLEEP_SECS=$IDLE_SLEEP_SECS THRESHOLD=$THRESHOLD MAX_RUN_SECS=$MAX_RUN_SECS)"
# ----------------------------------------------------------------------------

# One-time startup snapshot: print human-readable quota for every provider so
# you can see at a glance what capacity the loop is starting with. Failures
# are non-fatal — the loop will retry per-iteration anyway.
{
  echo "=== gemini quota ==="
  npm --prefix "$ROOT" run --silent gemini-quota || echo "(gemini quota fetch failed)"
  echo
  echo "=== codex quota ==="
  npm --prefix "$ROOT" run --silent codex-quota || echo "(codex quota fetch failed)"
  echo "===================="
} >&2

count_ideas() {
  find "$IDEAS_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' '
}

# Count idea files that have not yet been reviewed by codex (no marker comment).
# Pipefail-safe: grep -L can exit non-zero in edge cases (e.g. xargs propagates
# a per-file grep status), so we tolerate that with `|| true` and let wc decide.
count_unreviewed_ideas() {
  local out
  out="$(find "$IDEAS_DIR" -maxdepth 1 -type f -name '*.md' -print0 \
    | xargs -0 grep -L -e '<!-- codex-reviewed:' -e '<!-- reviewed:' 2>/dev/null || true)"
  if [[ -z "$out" ]]; then
    echo 0
  else
    printf '%s\n' "$out" | wc -l | tr -d ' '
  fi
}

# Print the path of the first un-reviewed idea file (or empty string if none).
first_unreviewed_idea() {
  find "$IDEAS_DIR" -maxdepth 1 -type f -name '*.md' -print0 \
    | xargs -0 grep -L -e '<!-- codex-reviewed:' -e '<!-- reviewed:' 2>/dev/null \
    | head -n 1 \
    || true
}

# Count idea files that have never been triaged or reviewed (fresh from generate).
# Same pipefail-safe pattern as count_unreviewed_ideas.
count_untriaged_ideas() {
  local out
  out="$(find "$IDEAS_DIR" -maxdepth 1 -type f -name '*.md' -print0 \
    | xargs -0 grep -L -e '<!-- triaged:' -e '<!-- reviewed:' -e '<!-- codex-reviewed:' 2>/dev/null || true)"
  if [[ -z "$out" ]]; then
    echo 0
  else
    printf '%s\n' "$out" | wc -l | tr -d ' '
  fi
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

# Run an external CLI, returning its exit status as our own.
#
# IMPORTANT: do not toggle `set -e`/`set +e` inside this function. `set -e` is
# shell-global, not function-scoped — flipping it back on before `return $rc`
# clobbers the caller's `set +e` and causes the script to exit the moment the
# CLI returns non-zero, before the caller can capture `$?`. The caller already
# wraps the call in `set +e ... rc=$? ... set -e`; we just need to let the last
# command's exit status propagate naturally.
run_gemini() {
  local model="$1"
  local prompt_file="$2"
  local log="$3"

  # Detach stdin from the parent TTY: the bundled gemini CLI installs a keypress
  # handler on stdin even in -p mode, and a stray byte from the inherited terminal
  # can fire it mid-request, abort the call, and leave the Node process hanging in
  # raw mode. </dev/null closes that vector.
  #
  # MAX_RUN_SECS caps the whole invocation as a belt-and-braces against any other
  # cause of hangs. SIGTERM first, then SIGKILL ten seconds later if it ignores it.
  local timeout_prefix=()
  if command -v timeout >/dev/null 2>&1; then
    timeout_prefix=(timeout --kill-after=10s "${MAX_RUN_SECS}s")
  fi

  "${timeout_prefix[@]+"${timeout_prefix[@]}"}" gemini \
    --approval-mode=yolo \
    --skip-trust \
    ${SANDBOX_FLAG[@]+"${SANDBOX_FLAG[@]}"} \
    --output-format text \
    -m "$model" \
    -p "$(cat "$prompt_file")" \
    </dev/null >"$log" 2>&1
}

run_codex() {
  local prompt_file="$1"
  local log="$2"

  # Same TTY/timeout precautions as run_gemini. codex exec is the headless mode.
  # --full-auto = workspace-write sandbox + auto-approve commands.
  # --skip-git-repo-check because the loop runs anywhere; codex defaults to refusing
  # outside a git repo, but this repo is already a git repo, so it's a no-op safety net.
  #
  # -C "$IDEAS_DIR" pins the workspace-write sandbox to ideas/ so codex physically
  # cannot create source files, scaffold projects, or modify anything outside ideas/
  # — even when its prompt-level "Hard rule" misfires. Reads are still global, so it
  # can still see ../rubric.md, ../README.md, and run `npm --prefix .. run search ...`.
  local timeout_prefix=()
  if command -v timeout >/dev/null 2>&1; then
    timeout_prefix=(timeout --kill-after=10s "${MAX_RUN_SECS}s")
  fi

  "${timeout_prefix[@]+"${timeout_prefix[@]}"}" codex exec \
    --full-auto \
    --skip-git-repo-check \
    --color never \
    -C "$IDEAS_DIR" \
    "$(cat "$prompt_file")" \
    </dev/null >"$log" 2>&1
}

iter=0
while true; do
  iter=$((iter + 1))
  LOOP_ITER=$iter
  LOOP_STAGE="iter-start"
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOG_DIR/run-$ts.log"

  n="$(count_ideas)"
  unreviewed="$(count_unreviewed_ideas)"
  untriaged="$(count_untriaged_ideas)"

  # Fetch the gemini quota snapshot once for this iteration.
  # gemini-quota's stderr flows straight through — errors are visible immediately.
  LOOP_STAGE="quota-fetch (gemini)"
  set +e
  snapshot="$(npm --prefix "$ROOT" run --silent gemini-quota -- --json)"
  fetch_rc=$?
  set -e
  log_loop "iter=$iter gemini quota fetch rc=$fetch_rc snapshot_bytes=${#snapshot}"

  if [[ $fetch_rc -ne 0 || -z "$snapshot" ]]; then
    echo "[$ts] iteration $iter — gemini quota fetch failed (rc=$fetch_rc) — retrying in ${ERROR_RETRY_SECS}s" >&2
    if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then break; fi
    sleep "$ERROR_RETRY_SECS"
    continue
  fi

  # Probe codex availability. Don't fail the iteration if codex is down — just skip enhance.
  # CODEX_MIN_REMAINING gates how much window headroom we demand before spending codex
  # quota on an enhance pass. Default 50 keeps a healthy reserve for interactive use.
  CODEX_MIN_REMAINING="${CODEX_MIN_REMAINING:-50}"
  LOOP_STAGE="quota-fetch (codex)"
  set +e
  npm --prefix "$ROOT" run --silent codex-quota -- --available "--min-remaining=$CODEX_MIN_REMAINING" >/dev/null
  codex_rc=$?
  set -e
  CODEX_AVAILABLE=0
  [[ "$codex_rc" -eq 0 ]] && CODEX_AVAILABLE=1
  log_loop "iter=$iter codex quota rc=$codex_rc available=$CODEX_AVAILABLE unreviewed=$unreviewed"

  PRO_MODEL="$(pick_model_from "$snapshot" "" "pro")"
  FLASH_MODEL="$(pick_model_from "$snapshot" "" "flash")"
  NON_PRO_MODEL="$(pick_model_from "$snapshot" "pro" "")"

  ACTION=""
  MODEL=""
  ENHANCE_RUNNER=""
  PURGE_RUNNER=""

  # 1. Purge fires when the total ideas count exceeds THRESHOLD and any advanced
  #    runner is free. Purge is a quality gate (no top-N cap): every run re-grades
  #    every idea against the current bar in `rubric.md`/`purge-prompt.md`,
  #    deletes failures, and leaves survivors untouched. Prefer gemini-pro (best
  #    at multi-file grading); fall back to codex when pro is exhausted. Pro is
  #    reserved for purge first; only if purge isn't triggered does enhance get pro.
  if [[ "$n" -gt "$THRESHOLD" ]]; then
    if [[ -n "$PRO_MODEL" ]]; then
      ACTION="purge"; PURGE_RUNNER="pro"; MODEL="$PRO_MODEL"
    elif [[ "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="purge"; PURGE_RUNNER="codex"
    fi
  fi

  # 2. Triage — cheap batch cull of obviously-broken fresh ideas, before any
  #    advanced-model quota gets spent enhancing them. Prefers flash (better
  #    judgment than flash-lite) but falls back to whatever non-pro is available.
  if [[ -z "$ACTION" && "$untriaged" -ge "$TRIAGE_THRESHOLD" ]]; then
    triage_model="$FLASH_MODEL"
    [[ -z "$triage_model" ]] && triage_model="$NON_PRO_MODEL"
    if [[ -n "$triage_model" ]]; then
      ACTION="triage"
      MODEL="$triage_model"
    fi
  fi

  # 3. Enhance — share the per-idea polish evenly between codex and gemini-pro.
  #    Both are "advanced" reviewers; strict alternation balances quota burn across them
  #    so neither gets exhausted while the other sits idle. State persists in
  #    tmp/last-enhancer; if the preferred runner has no capacity this iteration, fall
  #    through to whichever does.
  if [[ -z "$ACTION" && "$unreviewed" -gt 0 ]]; then
    ENHANCER_STATE="$ROOT/tmp/last-enhancer"
    last_enhancer=""
    [[ -f "$ENHANCER_STATE" ]] && last_enhancer="$(cat "$ENHANCER_STATE" 2>/dev/null || true)"
    preferred="codex"
    [[ "$last_enhancer" == "codex" ]] && preferred="pro"

    if [[ "$preferred" == "pro" && -n "$PRO_MODEL" ]]; then
      ACTION="enhance"; ENHANCE_RUNNER="pro"; MODEL="$PRO_MODEL"
    elif [[ "$preferred" == "codex" && "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="enhance"; ENHANCE_RUNNER="codex"
    elif [[ "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="enhance"; ENHANCE_RUNNER="codex"
    elif [[ -n "$PRO_MODEL" ]]; then
      ACTION="enhance"; ENHANCE_RUNNER="pro"; MODEL="$PRO_MODEL"
    fi
  fi

  # 4. Generate with the highest-remaining non-pro gemini family.
  #    Self-throttle: if the directory is already over threshold and no purge
  #    runner is free (pro empty AND codex tight), don't pour more in. Idle
  #    until pro/codex recovers and purge can drain.
  if [[ -z "$ACTION" && -n "$NON_PRO_MODEL" ]]; then
    if [[ "$n" -gt "$THRESHOLD" && -z "$PRO_MODEL" && "$CODEX_AVAILABLE" -ne 1 ]]; then
      : # skip generate — over threshold with no purge runner free
    else
      ACTION="generate"
      MODEL="$NON_PRO_MODEL"
    fi
  fi

  if [[ -z "$ACTION" ]]; then
    # Nothing to do. Print a summary so the reason is visible.
    summary="$(jq -r '.families | map("\(.family)=\(.remainingPercent)%") | join("  ")' <<<"$snapshot")"
    codex_summary="codex=$([[ "$CODEX_AVAILABLE" -eq 1 ]] && echo available || echo unavailable) untriaged=$untriaged unreviewed=$unreviewed"
    if [[ "$n" -gt "$THRESHOLD" ]]; then
      echo "[$ts] iteration $iter — backlog $n > $THRESHOLD with no purge runner (pro empty, codex tight); generate skipped to self-throttle (gemini: $summary; $codex_summary) — sleeping ${IDLE_SLEEP_SECS}s" >&2
    else
      echo "[$ts] iteration $iter — nothing to do (gemini: $summary; $codex_summary) — sleeping ${IDLE_SLEEP_SECS}s" >&2
    fi
    if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then break; fi
    sleep "$IDLE_SLEEP_SECS"
    continue
  fi

  PROMPT_FILE="$IDEA_PROMPT"
  case "$ACTION" in
    purge)   PROMPT_FILE="$PURGE_PROMPT" ;;
    triage)  PROMPT_FILE="$TRIAGE_PROMPT" ;;
    enhance) PROMPT_FILE="$CODEX_PROMPT" ;;
  esac

  if [[ "$ACTION" == "enhance" ]]; then
    runner_label="$ENHANCE_RUNNER"
    [[ "$ENHANCE_RUNNER" == "pro" ]] && runner_label="$MODEL"
    echo "[$ts] iteration $iter — $ACTION ($unreviewed/$n unreviewed) with $runner_label — log=$log"
  elif [[ "$ACTION" == "purge" ]]; then
    runner_label="$PURGE_RUNNER"
    [[ "$PURGE_RUNNER" == "pro" ]] && runner_label="$MODEL"
    echo "[$ts] iteration $iter — $ACTION ($n ideas) with $runner_label — log=$log"
  elif [[ "$ACTION" == "triage" ]]; then
    echo "[$ts] iteration $iter — $ACTION ($untriaged/$n untriaged) with $MODEL — log=$log"
  else
    echo "[$ts] iteration $iter — $ACTION ($n ideas) with $MODEL — log=$log"
  fi

  LOOP_STAGE="$ACTION-running"
  set +e
  if [[ "$ACTION" == "enhance" && "$ENHANCE_RUNNER" == "codex" ]]; then
    log_loop "iter=$iter calling codex (enhance unreviewed=$unreviewed log=$log)"
    run_codex "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "enhance" ]]; then
    log_loop "iter=$iter calling gemini-pro (enhance model=$MODEL unreviewed=$unreviewed log=$log)"
    run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "purge" && "$PURGE_RUNNER" == "codex" ]]; then
    log_loop "iter=$iter calling codex (purge n=$n log=$log)"
    run_codex "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "purge" ]]; then
    log_loop "iter=$iter calling gemini-pro (purge model=$MODEL n=$n log=$log)"
    run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  else
    log_loop "iter=$iter calling gemini ($ACTION model=$MODEL n=$n log=$log)"
    run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  fi
  rc=$?
  set -e
  LOOP_STAGE="$ACTION-returned (rc=$rc)"
  log_loop "iter=$iter $ACTION returned rc=$rc"

  after="$(count_ideas)"
  after_unreviewed="$(count_unreviewed_ideas)"
  after_untriaged="$(count_untriaged_ideas)"
  if [[ $rc -eq 0 ]]; then
    case "$ACTION" in
      enhance) echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; unreviewed $unreviewed → $after_unreviewed)" ;;
      triage)  echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; untriaged $untriaged → $after_untriaged; $n → $after files)" ;;
      *)       echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; $n → $after)" ;;
    esac
  else
    echo "[$(date +%H:%M:%S)] iteration $iter $ACTION failed (exit $rc; $n → $after) — see $log" >&2
  fi

  # Persist enhance alternation regardless of success: a failing run still
  # shifts the next iteration to the other runner, so persistent failures get
  # round-robin'd out instead of pinning the loop to one model.
  if [[ "$ACTION" == "enhance" ]]; then
    mkdir -p "$ROOT/tmp"
    echo "$ENHANCE_RUNNER" > "$ROOT/tmp/last-enhancer"
  fi

  if [[ "$MAX_ITERS" -gt 0 && "$iter" -ge "$MAX_ITERS" ]]; then
    log_loop "iter=$iter reached MAX_ITERS=$MAX_ITERS — breaking"
    break
  fi

  LOOP_STAGE="sleep-$SLEEP_SECS"
  log_loop "iter=$iter sleeping ${SLEEP_SECS}s before iter=$((iter+1))"
  sleep "$SLEEP_SECS"
  log_loop "iter=$iter sleep done"
done
log_loop "while-loop exited normally"
