# Backend And Pipeline Rules

Applies to `src/**`.

- Server routes live in `src/server.ts`; shared resource/query behavior belongs in `src/lib/**`.
- Reuse catalog/query/provider abstractions before creating a new helper or wrapper.
- API handlers should validate request input at the boundary, use shared catalog functions for data access, and return stable JSON or markdown via existing formatting helpers.
- LLM-provider behavior is sensitive. Preserve the existing provider boundary in `src/lib/llm.ts`, `gemini-*`, `ollama-provider.ts`, and `local-provider.ts` unless explicitly asked to redesign it.
- Discovery, repair, recheck, embedding, and queue scripts can mutate the database. Treat them as operational workflows, not harmless local scripts.
- Records go through `src/lib/logger.ts`, which emits newline-delimited JSON; never `console` in application code.
- Pipeline jobs write logs to `tmp/logs/<process>.log`; check it when debugging a job, without exposing secrets.
- For an API change, check request validation, response shape, markdown negotiation where it applies, and the impact on `web/src/types.ts` and `web/src/api.ts`.
- Repo map and conventions: `.claude/references/architecture-map.md`, `.claude/references/conventions.md`.
