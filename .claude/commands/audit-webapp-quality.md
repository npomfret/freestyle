---
description: Run a read-only webapp quality audit for src/client or a specified frontend scope. Manual command only.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git log:*)
  - mcp__ide__getDiagnostics
---

# Audit Webapp Quality

Run a read-only frontend quality audit for `$ARGUMENTS` or `src/client` if no scope is given.

- Do not edit files.
- Use `review-working-tree` as the base review workflow.
- Load `frontend-patterns-reference` and `repo-architecture-reference`.
- Delegate focused frontend analysis to `frontend-specialist` when useful.
- Output findings only:
  - ordered by severity
  - each with file reference and concrete remediation
  - explicitly call out surface-role drift when selectors rebuild panel/container shells instead of using the shared surface contract
  - residual risks or gaps
