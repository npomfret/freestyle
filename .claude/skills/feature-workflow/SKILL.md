---
description: Use for any non-trivial feature, bugfix, refactor, API change, frontend change, pipeline change, or behavior change. Enforces audit -> refactor -> implement -> verify. Do not use for typo-only or pure formatting edits.
user-invocable: true
---

# Feature Workflow

Use this before writing code for non-trivial work.

1. Identify the touched subsystem and load applicable rules/skills.
2. Audit before editing:
   - upstream callers and entry points
   - downstream implementations, persistence, side effects, and consumers
   - lateral precedent in similarly named files, functions, hooks, scripts, tests, and API shapes
3. State the current canonical pattern and any readiness problem.
4. Refactor for readiness if the current structure would force duplication, helper creep, weak types, awkward branching, or pattern drift.
5. Stop and ask before introducing a new dependency, abstraction, file layout, naming convention, data model, or operational behavior.
6. Implement against the prepared structure.
7. Run targeted verification first, then broader checks when blast radius warrants it.
8. If the work establishes or changes a convention, update `.claude` rules, skills, or references in the same change.

Completion should include what changed, what was verified, and any remaining risk.
