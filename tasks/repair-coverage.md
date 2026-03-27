# Repair Coverage

## Context

`npm run repair` enriches resource metadata (name, description, topics, analysis) but currently processes resources in a fixed order. Many alive resources have no `analysis` text or thin descriptions, which reduces search quality and the usefulness of resource cards.

## Changes

### `src/repair.ts`
- Add a `--mode` flag with options:
  - `all` (default) — current behavior, process any alive resource
  - `no-analysis` — only resources with no entry in `resource_analyses`
  - `no-description` — only resources with no entry in `resource_descriptions`
- Implement the filtering with a WHERE clause on the existing query

### `package.json`
- Add convenience scripts:
  - `"repair:no-analysis": "tsx src/repair.ts --mode no-analysis"`
  - `"repair:no-description": "tsx src/repair.ts --mode no-description"`

## Verification

1. `npm run compile` passes
2. `npm run repair:no-analysis` processes only resources missing analysis and skips those that have one
3. Running it twice does not reprocess already-repaired resources
