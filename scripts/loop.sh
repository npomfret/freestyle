#!/usr/bin/env bash
# Pipeline driver: generate ideas, triage them, enhance them, purge them.
# Each iteration picks one action by priority:
#   1) purge   if reviewed > THRESHOLD          and pro or codex available
#   2) triage  if 1-raw count ≥ TRIAGE_THRESHOLD and pro or codex available
#   3) enhance if any 2-triaged ideas           and pro or codex available
#   4) generate                                  with cheapest non-pro family
#                  (throttled when total > THRESHOLD and no purge runner free)
#   5) sleep
#
# Model routing:
#   generate            → flash / flash-lite (cheap; volume work)
#   triage / enhance    → pro or codex, alternating via tmp/last-advanced
#                         (flash judgment too unreliable for these stages)
#   purge               → pro preferred, codex fallback (multi-file grading)
#
# Pipeline state lives on the file system — `ls ideas/` shows the workflow:
#   ideas/1-raw/        ← fresh from generate, awaiting triage
#   ideas/2-triaged/    ← passed triage, awaiting enhance
#   ideas/3-reviewed/   ← enriched by enhance, eligible for purge
# Each stage's success path moves the file to the next subdir; failures rm.
# Purge re-evaluates ideas/3-reviewed/ every run (no per-file memory).
#
# Usage:
#   scripts/loop.sh                       # loop forever
#   scripts/loop.sh 5                     # at most 5 iterations
#   THRESHOLD=25 scripts/loop.sh          # 3-reviewed count that fires purge
#                                         # (purge enforces the same number as a hard
#                                         # cap, culling the worst-scoring overflow);
#                                         # also caps total before generate self-throttles
#   TRIAGE_THRESHOLD=5 scripts/loop.sh    # 1-raw count required to fire a triage
#   SLEEP_SECS=30 scripts/loop.sh         # sleep between productive iterations
#   IDLE_SLEEP_SECS=3600 scripts/loop.sh  # sleep when quota is genuinely exhausted
#   ERROR_RETRY_SECS=60 scripts/loop.sh   # sleep when the quota fetch itself fails
#   MAX_RUN_SECS=1800 scripts/loop.sh     # hard cap on a single CLI invocation
#   CODEX_MIN_PRIMARY=40 scripts/loop.sh  # minimum % remaining in codex's 5h window
#                                         # before the loop will use codex this iter
#   CODEX_MIN_SECONDARY=30 scripts/loop.sh # minimum % remaining in codex's 7d window
#                                         # — set lower to lean on codex harder, higher
#                                         # to preserve weekly headroom for interactive use
#   SANDBOX=1 scripts/loop.sh             # run gemini tools inside its sandbox
#                                         # (will likely break `npm run search` —
#                                         # the sandbox image lacks your node/nvm)
#
# Stop with Ctrl-C.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IDEAS_DIR="$ROOT/ideas"
RAW_DIR="$IDEAS_DIR/1-raw"
TRIAGED_DIR="$IDEAS_DIR/2-triaged"
REVIEWED_DIR="$IDEAS_DIR/3-reviewed"
IDEA_PROMPT="$ROOT/idea-prompt.md"
PURGE_PROMPT="$ROOT/purge-prompt.md"
CODEX_PROMPT="$ROOT/codex-prompt.md"
TRIAGE_PROMPT="$ROOT/triage-prompt.md"
LOG_DIR="$ROOT/tmp/logs/loop"
SLEEP_SECS="${SLEEP_SECS:-30}"
IDLE_SLEEP_SECS="${IDLE_SLEEP_SECS:-3600}"
ERROR_RETRY_SECS="${ERROR_RETRY_SECS:-60}"
MAX_RUN_SECS="${MAX_RUN_SECS:-1800}"
THRESHOLD="${THRESHOLD:-25}"
# Triage runs once at least this many fresh (un-triaged, un-reviewed) ideas pile up.
# Triage is a batch operation, so running it on 1–2 files is silly; let some accumulate.
TRIAGE_THRESHOLD="${TRIAGE_THRESHOLD:-5}"
# Codex availability is gated per rate-limit window. Both must clear or the loop
# refuses to invoke codex this iteration.
#   primary   = 5h rolling window  (short-term burst)
#   secondary = 7d rolling window  (long-term cap; exhausting it blocks codex
#                                   for days even when primary is full)
CODEX_MIN_PRIMARY="${CODEX_MIN_PRIMARY:-40}"
CODEX_MIN_SECONDARY="${CODEX_MIN_SECONDARY:-30}"

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

mkdir -p "$LOG_DIR" "$RAW_DIR" "$TRIAGED_DIR" "$REVIEWED_DIR"

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
# are non-fatal — the loop will retry per-iteration anyway. The codex banner
# also echoes the per-window gate so the operator sees the effective decision
# (e.g. "primary=100% secondary=0% min=primary≥40% secondary≥30% → no capacity").
{
  echo "=== gemini quota ==="
  npm --prefix "$ROOT" run --silent gemini-quota || echo "(gemini quota fetch failed)"
  echo
  echo "=== codex quota ==="
  npm --prefix "$ROOT" run --silent codex-quota || echo "(codex quota fetch failed)"
  echo
  echo "loop uses codex when 5h-primary ≥ ${CODEX_MIN_PRIMARY}% AND 7d-secondary ≥ ${CODEX_MIN_SECONDARY}%"
  npm --prefix "$ROOT" run --silent codex-quota -- \
    --available \
    "--min-primary=$CODEX_MIN_PRIMARY" \
    "--min-secondary=$CODEX_MIN_SECONDARY" 2>&1 || true
  echo "===================="
} >&2

# Pipeline state is now the directory: 1-raw / 2-triaged / 3-reviewed.
# Counts are simple file enumerations — no marker greps, no pipefail dance.
# Each stage's fire-condition reads its own input subdir:
#   triage  reads RAW_DIR     fires when count_raw      ≥ TRIAGE_THRESHOLD
#   enhance reads TRIAGED_DIR fires when count_triaged  > 0
#   purge   reads REVIEWED_DIR fires when count_reviewed > THRESHOLD
count_in() {
  find "$1" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' '
}
count_ideas()    { echo $(( $(count_in "$RAW_DIR") + $(count_in "$TRIAGED_DIR") + $(count_in "$REVIEWED_DIR") )); }
count_raw()      { count_in "$RAW_DIR"; }
count_triaged()  { count_in "$TRIAGED_DIR"; }
count_reviewed() { count_in "$REVIEWED_DIR"; }

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
  raw="$(count_raw)"
  triaged="$(count_triaged)"
  reviewed="$(count_reviewed)"

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
  # Per-window thresholds: the call only counts as available if BOTH the 5h primary
  # window and the 7d secondary window meet their minimums (see CODEX_MIN_* defaults
  # at the top of this script). When secondary is exhausted, the API will reject
  # codex calls even if primary is full — gating on both prevents wasted invocations.
  LOOP_STAGE="quota-fetch (codex)"
  set +e
  npm --prefix "$ROOT" run --silent codex-quota -- \
    --available \
    "--min-primary=$CODEX_MIN_PRIMARY" \
    "--min-secondary=$CODEX_MIN_SECONDARY" >/dev/null
  codex_rc=$?
  set -e
  CODEX_AVAILABLE=0
  [[ "$codex_rc" -eq 0 ]] && CODEX_AVAILABLE=1
  log_loop "iter=$iter codex quota rc=$codex_rc available=$CODEX_AVAILABLE raw=$raw triaged=$triaged reviewed=$reviewed"

  PRO_MODEL="$(pick_model_from "$snapshot" "" "pro")"
  NON_PRO_MODEL="$(pick_model_from "$snapshot" "pro" "")"

  ACTION=""
  MODEL=""
  TRIAGE_RUNNER=""
  ENHANCE_RUNNER=""
  PURGE_RUNNER=""

  # 1. Purge fires when the 3-reviewed/ count exceeds THRESHOLD and any advanced
  #    runner is free. Purge only re-evaluates 3-reviewed/ — raw and triaged are
  #    mid-pipeline and aren't ready for the full 45/70 bar yet. It's a quality
  #    gate (no top-N cap): every run re-grades every reviewed idea against the
  #    current bar in `rubric.md`/`purge-prompt.md`, deletes failures, leaves
  #    survivors untouched. Prefer gemini-pro (best at multi-file grading); fall
  #    back to codex when pro is exhausted. Pro is reserved for purge first; only
  #    if purge isn't triggered does enhance get pro.
  if [[ "$reviewed" -gt "$THRESHOLD" ]]; then
    if [[ -n "$PRO_MODEL" ]]; then
      ACTION="purge"; PURGE_RUNNER="pro"; MODEL="$PRO_MODEL"
    elif [[ "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="purge"; PURGE_RUNNER="codex"
    fi
  fi

  # Triage and enhance both want an advanced runner (gemini-pro or codex).
  # Flash isn't reliable enough for the achievability judgment in triage, and
  # the cheap models definitely can't enrich. They share an alternation state
  # file (tmp/last-advanced) so pro and codex burn evenly across both stages
  # rather than one getting exhausted while the other sits idle.
  ADVANCED_STATE="$ROOT/tmp/last-advanced"
  last_advanced=""
  [[ -f "$ADVANCED_STATE" ]] && last_advanced="$(cat "$ADVANCED_STATE" 2>/dev/null || true)"
  preferred_advanced="codex"
  [[ "$last_advanced" == "codex" ]] && preferred_advanced="pro"

  # 2. Triage — cull obviously-broken fresh ideas in 1-raw/. Uses pro or codex
  #    (alternating with enhance via the shared state above).
  if [[ -z "$ACTION" && "$raw" -ge "$TRIAGE_THRESHOLD" ]]; then
    if [[ "$preferred_advanced" == "pro" && -n "$PRO_MODEL" ]]; then
      ACTION="triage"; TRIAGE_RUNNER="pro"; MODEL="$PRO_MODEL"
    elif [[ "$preferred_advanced" == "codex" && "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="triage"; TRIAGE_RUNNER="codex"
    elif [[ "$CODEX_AVAILABLE" -eq 1 ]]; then
      ACTION="triage"; TRIAGE_RUNNER="codex"
    elif [[ -n "$PRO_MODEL" ]]; then
      ACTION="triage"; TRIAGE_RUNNER="pro"; MODEL="$PRO_MODEL"
    fi
  fi

  # 3. Enhance — pick a file from 2-triaged/ and enrich it, then move it to
  #    3-reviewed/. Same pro/codex alternation as triage.
  if [[ -z "$ACTION" && "$triaged" -gt 0 ]]; then
    if [[ "$preferred_advanced" == "pro" && -n "$PRO_MODEL" ]]; then
      ACTION="enhance"; ENHANCE_RUNNER="pro"; MODEL="$PRO_MODEL"
    elif [[ "$preferred_advanced" == "codex" && "$CODEX_AVAILABLE" -eq 1 ]]; then
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
    codex_summary="codex=$([[ "$CODEX_AVAILABLE" -eq 1 ]] && echo available || echo unavailable) raw=$raw triaged=$triaged reviewed=$reviewed"
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
    echo "[$ts] iteration $iter — $ACTION ($triaged/$n triaged) with $runner_label — log=$log"
  elif [[ "$ACTION" == "purge" ]]; then
    runner_label="$PURGE_RUNNER"
    [[ "$PURGE_RUNNER" == "pro" ]] && runner_label="$MODEL"
    echo "[$ts] iteration $iter — $ACTION ($reviewed/$n reviewed) with $runner_label — log=$log"
  elif [[ "$ACTION" == "triage" ]]; then
    runner_label="$TRIAGE_RUNNER"
    [[ "$TRIAGE_RUNNER" == "pro" ]] && runner_label="$MODEL"
    echo "[$ts] iteration $iter — $ACTION ($raw/$n raw) with $runner_label — log=$log"
  else
    echo "[$ts] iteration $iter — $ACTION ($n ideas) with $MODEL — log=$log"
  fi

  LOOP_STAGE="$ACTION-running"
  set +e
  if [[ "$ACTION" == "enhance" && "$ENHANCE_RUNNER" == "codex" ]]; then
    log_loop "iter=$iter calling codex (enhance triaged=$triaged log=$log)"
    run_codex "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "enhance" ]]; then
    log_loop "iter=$iter calling gemini-pro (enhance model=$MODEL triaged=$triaged log=$log)"
    run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "triage" && "$TRIAGE_RUNNER" == "codex" ]]; then
    log_loop "iter=$iter calling codex (triage raw=$raw log=$log)"
    run_codex "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "triage" ]]; then
    log_loop "iter=$iter calling gemini-pro (triage model=$MODEL raw=$raw log=$log)"
    run_gemini "$MODEL" "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "purge" && "$PURGE_RUNNER" == "codex" ]]; then
    log_loop "iter=$iter calling codex (purge reviewed=$reviewed log=$log)"
    run_codex "$PROMPT_FILE" "$log"
  elif [[ "$ACTION" == "purge" ]]; then
    log_loop "iter=$iter calling gemini-pro (purge model=$MODEL reviewed=$reviewed log=$log)"
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
  after_raw="$(count_raw)"
  after_triaged="$(count_triaged)"
  after_reviewed="$(count_reviewed)"
  if [[ $rc -eq 0 ]]; then
    case "$ACTION" in
      enhance) echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; triaged $triaged → $after_triaged; reviewed $reviewed → $after_reviewed)" ;;
      triage)  echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; raw $raw → $after_raw; triaged $triaged → $after_triaged; $n → $after files)" ;;
      purge)   echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; reviewed $reviewed → $after_reviewed)" ;;
      *)       echo "[$(date +%H:%M:%S)] iteration $iter $ACTION done (exit 0; $n → $after)" ;;
    esac
  else
    echo "[$(date +%H:%M:%S)] iteration $iter $ACTION failed (exit $rc; $n → $after) — see $log" >&2
  fi

  # Persist advanced-runner alternation regardless of success: a failing run
  # still shifts the next iteration to the other runner, so persistent
  # failures get round-robin'd out instead of pinning the loop to one model.
  # Triage and enhance share the same state file (purge has its own pro-first
  # preference and doesn't participate in the alternation).
  if [[ "$ACTION" == "enhance" || "$ACTION" == "triage" ]]; then
    mkdir -p "$ROOT/tmp"
    runner_used="$ENHANCE_RUNNER"
    [[ "$ACTION" == "triage" ]] && runner_used="$TRIAGE_RUNNER"
    echo "$runner_used" > "$ROOT/tmp/last-advanced"
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
