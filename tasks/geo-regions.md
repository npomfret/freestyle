# Add Geographic Regions to Resources

## Context

Many resources are region-specific (government data portals, country weather APIs, national statistics) but we have no way to label, filter, or search by geography. Adding region metadata follows the same junction-table pattern as topics/kinds.

## Region Vocabulary

Flat list with hierarchy encoded in the label:
- Continents: `Africa`, `Asia`, `Europe`, `North America`, `South America`, `Oceania`
- Countries: `Europe/United Kingdom`, `North America/United States`, `Asia/Japan`, etc.
- Sub-regions: `EU`, `Middle East`, `Southeast Asia`, `Caribbean`, etc.
- `Global` for resources with no geographic restriction

Resources with no clear geo association get no region tag. A resource can have multiple regions. The LLM picks from free-form geo labels (not a fixed enum) — same approach as topics.

## Database

New migration `db/migrate-regions.sql`:

```sql
CREATE TABLE IF NOT EXISTS resource_regions (
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    region      TEXT NOT NULL,
    PRIMARY KEY (resource_id, region)
);
CREATE INDEX IF NOT EXISTS idx_resource_regions_region ON resource_regions(region);
```

## Changes

### `src/lib/types.ts`
- Add `Region` branded type and constructor

### `src/lib/agent-tools.ts` — `addResource()`
- Add `regions?: string[]` to args
- Insert into `resource_regions` (same pattern as topics)

### `src/discover.ts`
- Add `regions` to `add_resource` tool parameters and system prompt classification section

### `src/recheck.ts`
- Add `regions` to `update_resource` tool parameters
- Delete + re-insert regions in update handler (same pattern as topics)
- Include current regions in system prompt context
- Add regions to `getResourceForRecheck()` and `getNextResource()` queries

### `src/server.ts`
- `GET /api/regions` endpoint (group by region, count, order by count desc)
- `region` query param on `/api/search` and `/api/resources`
- Add `resource_regions` to `enrichResources()`

### `src/seed-database.ts`
- Add `regionRows` array, include in batch insert loop, clear in junction table cleanup

### `src/lib/embed-resources.ts`
- LEFT JOIN `resource_regions`, concatenate with topics in embedding text

## Verification

1. `npm run compile` passes
2. `npm run migrate` creates the table
3. Discovery tags resources with regions
4. Recheck can update regions
5. `GET /api/regions` returns counts
6. Search/browse filtering by region works
