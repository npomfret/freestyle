# Freestyle Conventions

## TypeScript

- Prefer precise exported types at module boundaries.
- Keep runtime validation at input boundaries: HTTP request handlers, CLI args, env parsing, provider responses, and DB rows where shape is uncertain.
- Use existing discriminated unions and literal types where available; do not widen domain fields to string for convenience.
- Avoid defaulting missing config silently unless the repo already documents that behavior.

## Errors

- Let errors bubble through internal layers by default.
- Catch at process, route, or provider boundaries to report, translate, or add context.
- Use `serializeError(err)` for exception logs so stack traces are preserved.
- Avoid repeated logging of the same exception at multiple layers.

## Logging

- Message strings are stable event labels: `log.info('resource repaired', { id })`.
- Runtime data belongs in the structured object, never interpolated into the message.
- Keep logs one-line JSON and useful for filtering.

## Tests

- For bug fixes, add or update a failing test first when the behavior is testable without major harness work.
- For provider parsing, quota, retry, markdown, catalog, and CLI behavior, prefer focused unit tests close to the module.
- For frontend changes, use typecheck/build as the minimum unless a test harness exists for the touched behavior.

## HTTP API

- Validate and clamp query params at the route boundary.
- Keep error payloads stable: do not invent per-route error shapes without a convention decision.
- Preserve markdown negotiation behavior where endpoints already use `sendFormatted`.
- Consider headers, caching, and content type when adding new endpoint behavior; do not treat response body shape as the whole API contract.
