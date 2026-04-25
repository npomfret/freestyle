# Backend And Pipeline Rules

Applies to `src/**`.

- Server routes live in `src/server.ts`; shared resource/query behavior belongs in `src/lib/**`.
- Reuse catalog/query/provider abstractions before creating a new helper or wrapper.
- API handlers should validate request input at the boundary, use shared catalog functions for data access, and return stable JSON or markdown via existing formatting helpers.
- LLM-provider behavior is sensitive. Preserve the existing provider boundary in `src/lib/llm.ts`, `gemini-*`, `ollama-provider.ts`, and `local-provider.ts` unless explicitly asked to redesign it.
- Discovery, repair, recheck, embedding, and queue scripts can mutate the database. Treat them as operational workflows, not harmless local scripts.
- Logs must be newline-delimited JSON through `src/lib/logger.ts`; do not add ad-hoc `console.log` in application code.
