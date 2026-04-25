---
description: Use for debugging, failing tests, regressions, runtime errors, broken API behavior, broken UI behavior, failed LLM/provider runs, or database inconsistencies. Prefer reproducing before fixing.
user-invocable: true
---

# Bug Investigation

1. Capture the observed failure, expected behavior, and scope.
2. Reproduce with the smallest available command, test, request, or UI path.
3. Inspect logs and code paths before editing. For pipeline jobs, check `tmp/logs/<process>.log` when relevant without exposing secrets.
4. Trace upstream input, boundary validation, shared helpers, DB queries, provider behavior, and downstream consumers.
5. Add or update a failing test first when practical.
6. Fix the owning abstraction, not just the symptom. Avoid local `try/catch` or helper patches unless they are the correct boundary.
7. Verify the original reproduction path and the relevant tests/checks.

If reproduction requires remote DB writes, deploy actions, paid API calls, or destructive operations, stop and ask.
