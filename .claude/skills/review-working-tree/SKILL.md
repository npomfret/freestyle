---
description: Use for code review, sanity checks, reviewing staged or unstaged changes, or assessing a diff for correctness risks. Read-only unless the user explicitly asks for fixes.
user-invocable: true
---

# Review Working Tree

Default to a code-review stance.

1. Inspect `git status`, `git diff`, and relevant surrounding code.
2. Prioritize correctness, data loss, security, operational risk, behavior regressions, pattern drift, and missing tests.
3. Check whether changes follow `.claude/rules/**` and the relevant convention references.
4. Lead with findings ordered by severity. Include file and line references.
5. Keep summaries secondary. If there are no findings, say that clearly and list residual verification gaps.

Do not edit, stage, unstage, commit, or run mutating commands during review unless explicitly asked.
