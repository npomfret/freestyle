---
description: Use for backend TypeScript, Express routes, catalog queries, CLI scripts, LLM providers, logging, tests under src, or shared src/lib code.
paths:
  - src/**
user-invocable: true
---

# Backend Conventions

Load `.claude/rules/backend.md`, `.claude/rules/database.md` when DB access is involved, `.claude/references/architecture-map.md`, and `.claude/references/conventions.md`.

Rules:

- Keep route input validation at HTTP boundaries and shared behavior in `src/lib/**`.
- Prefer precise TypeScript types and explicit domain shapes over loose objects.
- Use shared provider/catalog/logger patterns before adding local wrappers.
- Preserve structured logging through `log` and `serializeError`.
- Do not run DB-mutating scripts without approval.
- For API changes, verify request validation, response shape, markdown negotiation where applicable, and frontend type/client impact.

Verification options:

- `npm test`
- `npm run compile`
- Focused manual API requests only when the API server is intentionally running.
