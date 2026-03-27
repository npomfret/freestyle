# Test Coverage

## Context

Zero tests exist across the project. The highest-value targets are pure/near-pure functions with complex logic that is hard to verify by eye and easy to break during refactors.

## Setup

- Add `vitest` as a dev dependency (compatible with the existing TypeScript/ESM setup, no extra config needed)
- Add `"test": "vitest run"` and `"test:watch": "vitest"` to package.json scripts
- Test files alongside source: `src/lib/fetch-page.test.ts`, etc.

## Test Targets

### `src/lib/fetch-page.ts` — soft-404 detection
- Unit tests for the signal-matching logic (the 14 hardcoded strings)
- Cases: known error page HTML, domain-for-sale page, coming-soon page, normal page
- Cases: short content threshold (`< 100` chars), sparse content threshold (`< 2000` chars)
- No network calls needed — pass raw HTML strings

### `src/lib/agent-tools.ts` — resource operations
- Integration tests against a real test DB (same approach as prod — no mocks)
- `addResource()`: inserts resource + junction rows, deduplicates by URL
- `updateResource()`: updates fields, replaces junction rows correctly
- Use a separate test database or transaction rollback per test

### `src/lib/retry.ts` — retry logic
- Unit tests for backoff behavior and max-retry enforcement
- Mock the clock or use fake timers

## Verification

1. `npm test` passes with no failures
2. Coverage includes at least the soft-404 detection paths and add/update resource operations
