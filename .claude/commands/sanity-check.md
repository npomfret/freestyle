---
description: Run a read-only working-tree sanity check for correctness risks, duplication, and missing verification. Manual command only.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git log:*)
  - mcp__ide__getDiagnostics
---

# Sanity Check

Run a read-only review of the current working tree.

- Do not edit, stage, unstage, or delete files.
- Use `.claude/skills/review-working-tree/SKILL.md` as the primary workflow.
- Use the canonical commands in `CLAUDE.md` for build/type/test confidence when evidence is needed.
- Output:
  - brief status summary
  - findings ordered by severity
  - build/type/test confidence by evidence
  - open risks or questions
