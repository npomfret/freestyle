#!/usr/bin/env bash
set -euo pipefail

hook_payload="$(cat || true)"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

cd "$repo_root"

# Run formatter only when a root-level format script exists.
if jq -e '.scripts.format' package.json >/dev/null 2>&1; then
  declare -a target_files
  target_count=0

  add_target_file() {
    local candidate="$1"

    [[ -z "$candidate" ]] && return 0

    if [[ "$candidate" == "$repo_root/"* ]]; then
      candidate="${candidate#"$repo_root"/}"
    fi

    [[ -f "$candidate" ]] || return 0

    local existing
    for existing in "${target_files[@]-}"; do
      [[ "$existing" == "$candidate" ]] && return 0
    done

    target_files+=("$candidate")
    ((target_count += 1))
  }

  if [[ -n "${CLAUDE_FILE_PATHS:-}" ]]; then
    while IFS= read -r file_path; do
      add_target_file "$file_path"
    done < <(printf '%s\n' "$CLAUDE_FILE_PATHS")
  fi

  if [[ $target_count -eq 0 ]] && [[ -n "$hook_payload" ]]; then
    while IFS= read -r file_path; do
      add_target_file "$file_path"
    done < <(
      printf '%s' "$hook_payload" | jq -r '
        [
          .tool_input.file_path?,
          .tool_input.path?,
          .tool_input.file_paths[]?,
          .tool_input.paths[]?,
          .tool_input.edits[]?.file_path?,
          .tool_input.files[]?.file_path?,
          .file_path?
        ] | .[] | select(type == "string")
      ' 2>/dev/null || true
    )
  fi

  if [[ $target_count -gt 0 ]]; then
    npm run format -- "${target_files[@]}"
    exit 0
  fi

  echo "Skipping auto-format: no touched files found in hook payload" >&2
  exit 0
fi

echo "Skipping auto-format: no npm format script found in $repo_root/package.json" >&2
exit 0
