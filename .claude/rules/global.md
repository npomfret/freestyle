# Global Standing Rules

Applies to the whole repository.

- Search before writing. For non-trivial work, inspect callers, consumers, tests, similarly named files, and shared helpers before making edits.
- Refactor for readiness when the existing shape is weak. Do not force new behavior into a poor abstraction just to keep the diff small.
- Prefer less code when behavior is equivalent. Remove stale branches, duplicate helpers, dead wrappers, and superseded implementations after a replacement.
- Preserve strong TypeScript types. Avoid `any`, vague records, and unchecked boundary shapes unless there is a clear, documented reason.
- Use fail-fast error handling. Catch locally only to recover, translate at a boundary, or add required cleanup/context.
- Use structured logging: stable event labels as messages, runtime values in the data object, and `serializeError(err)` for exceptions.
- Keep formatting mechanical. Run the formatter on touched TS/TSX/JS/JSX/JSON files.
- Do not make unrelated refactors or formatting sweeps while solving a scoped task.
