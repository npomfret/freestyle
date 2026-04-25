---
description: Minimal, intent-first Claude Code command to update your branch with a linear history. Supports `--fast` for a speed-first conflict-free path and `--strict` for full validation. Lets the LLM decide exact Git commands; avoids brittle inline Bash snippets and environment leakage. Auto when possible; asks only if the upstream cannot be inferred.
argument-hint: "[optional mode + upstream ref, e.g. --fast origin/main | --strict origin/main | origin/main]"
allowed-tools:
  - Bash(git:*)
  - Bash(npm:*)
  - Bash(node:*)
  - Read
  - Edit
  - MultiEdit
  - Write
---

# /merge

## Mission
Bring the current branch up to date from a single upstream ref **without creating merge commits**, preferring **fast-forward** and otherwise performing a **rebase**. If conflicts arise, resolve them **intent‑first** using inbound diffs and keep changes minimal.

## Modes
- Default is `--strict` when no mode is provided.
- `--fast`: prioritize latency on clean paths. Skip non-essential checks when no conflicts occur.
- `--strict`: run full safety workflow and broader validation.

## Operating principles for the assistant
- Prefer **rebase** over merge; keep history linear.
- Do **not** rely on previously defined shell variables or state persisting between tool calls. Every `Bash(...)` command you run must be **self‑contained** with explicit values.
- If upstream is ambiguous and cannot be inferred safely, ask the user exactly once: “Which upstream? (e.g. origin/main)”. Otherwise proceed automatically.
- Never use interactive TUIs (no `-i`). Never run `git pull` (construct explicit `fetch`, `merge --ff-only`, or `rebase` commands instead).
- If the working tree has unrelated local changes, auto‑stash before rebase and pop afterward.
- Prefer per-command Git config (`git -c ...`) over persistent repo config writes.
- Use `rerere` and `merge.conflictStyle=zdiff3` (or `diff3` fallback) during rebase to speed repeat resolutions.
- Treat commit messages as supporting context only. The actual code diffs and file content are authoritative if signals conflict.

## Plan (what to do)
1) **Detect upstream** (call it `UP`):
    - Parse mode from arguments first:
        - `--fast` => MODE=fast
        - `--strict` => MODE=strict
        - no mode => MODE=strict
    - Remove mode token from arguments before upstream detection.
    - If the user provided an argument, use it verbatim (e.g., `origin/main`).
    - Else try, in order:
      a) `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (tracking branch)  
      b) default branch from `refs/remotes/origin/HEAD` via `git symbolic-ref --short refs/remotes/origin/HEAD`, then normalize to `origin/<HEAD>`  
      c) fallbacks: try `origin/main`, then `origin/master` if they exist
    - If none resolves, ask the user for the ref.

2) **Preflight**
    - Ensure not in detached HEAD.
    - Fetch only what is needed: `git fetch --prune --no-tags <remote-for-UP> <branch-for-UP>`.
    - If a later command fails due to shallow history, run `git fetch --unshallow <remote-for-UP>` and retry.
    - Do not write persistent repo config in this workflow.

3) **Inbound preview (before any branch-changing operation)**
    - Compute inbound count: `git rev-list --count HEAD..<UP>`.
    - If zero, report "already up to date" and stop.
    - Print a one-line summary for each inbound commit (oldest first) before any merge/rebase:
      `git log --reverse --pretty=format:'%h %s' HEAD..<UP>`
    - Keep this preview concise and always include it in user-facing output.

4) **Update**
    - If `git merge-base --is-ancestor HEAD <UP>` is true:
        - Run `git merge --ff-only <UP>` (fast‑forward).
        - Clean-path exit: if MODE=fast, skip directly to output report (no extra checks).
    - Else → run rebase with per-command settings:
      `git -c rerere.enabled=true -c merge.conflictStyle=zdiff3 rebase --autostash <UP>`
      (fallback to `merge.conflictStyle=diff3` if `zdiff3` is unsupported).
    - If rebase completes with no conflicts and MODE=fast, skip directly to output report.

5) **On conflicts (intent‑aware, deterministic)**
    - List conflicts: `git diff --name-only --diff-filter=U`.
    - For each conflicted file, gather evidence before editing:
        - Conflict sides: `git show :1:FILE`, `git show :2:FILE`, `git show :3:FILE`.
        - Inbound file history: `git log --oneline --left-right HEAD...<UP> -- FILE`.
        - Inbound file diff (with renames): `git diff --find-renames HEAD..<UP> -- FILE`.
    - Write a 3-line pre-edit intent brief for the file:
        - What upstream changed.
        - Why upstream changed (from code diff first; commit message second).
        - What local behavior must be preserved.
    - Classify the conflict type for the file: `api-contract`, `rename-move`, `behavior-fix`, `refactor-only`, `test-only`, `config-only`, or `mixed`.
    - Resolve using this order:
        - 1. Adopt upstream final contracts first (APIs, types, renames, config schema).
        - 2. Reapply local intent only where still valid under those contracts.
        - 3. Drop local hunks that duplicate or contradict upstream fixes.
    - Prefer reconstructing the final file from intent and diffs over marker-splicing. Keep the edit minimal and avoid opportunistic cleanup/refactors.
    - Stage each file (`git add FILE`) only after its intent brief and resolution are coherent, then continue (`git rebase --continue`). Repeat until clean.
    - After each conflicted file is staged, produce a 1-line proof note: `adopted upstream X; preserved local Y; residual risk Z`.

6) **Post‑checks**
    - MODE=fast:
        - Skip dependency install.
        - Skip broad typecheck unless conflict resolution touched TypeScript-related files or `tsconfig.json`.
        - Prefer targeted validation only when conflicts occurred.
    - MODE=strict:
        - If lockfiles changed, surface the exact install command and ask before running it.
        - Run targeted validation for impacted areas first (closest tests/typechecks). Run broader checks only if targeted checks pass or are unavailable.
        - Prefer canonical build/check commands from `CLAUDE.md` over ad-hoc raw `tsc`.
    - If we auto‑stashed, `git stash pop` and resolve trivial aftershocks similarly.
    - Suggest `git push --force-with-lease` if branch was previously pushed.

## Examples (assistant may adapt as needed)
- Detect tracking branch: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
- Default remote head: `git symbolic-ref --short refs/remotes/origin/HEAD`
- Check fast‑forward: `git merge-base --is-ancestor HEAD origin/main && git merge --ff-only origin/main`
- Rebase explicitly: `git -c rerere.enabled=true -c merge.conflictStyle=zdiff3 rebase --autostash origin/main`
- List conflicts: `git diff --name-only --diff-filter=U`

## Output
- Short report: mode (`fast`/`strict`), strategy (FF/rebase), number of inbound commits, conflicted files (if any), one‑line description of inbound intent, and the inbound commit preview list (`HEAD..<UP`).
