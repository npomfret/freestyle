# Related Resources

## Context

Resources have 384-dim embeddings stored in pgvector. When a user is viewing a resource, showing the most similar ones by cosine distance is a natural way to surface discovery paths that search alone won't provide.

## Backend

### `src/server.ts`
- Add `GET /api/resources/:id/related` endpoint
- Query: `SELECT ... FROM resources r WHERE r.id != $1 ORDER BY r.embedding <=> (SELECT embedding FROM resources WHERE id = $1) LIMIT $2`
- Reuse existing `enrichResources()` for the result shape
- Accept optional `?limit=N` query param (default 5, max 20)
- Return 404 if resource not found or has no embedding

## Frontend

### `web/src/App.tsx`
- Fetch `/api/resources/:id/related` when a resource card is expanded/focused
- Render a "Similar resources" section below the analysis with a compact list: name (linked), kinds, topics
- Only show the section if at least one related resource is returned

## Verification

1. `npm run compile` passes
2. `GET /api/resources/1/related` returns an array of enriched resources
3. Resources without embeddings return an empty array (not an error)
4. UI shows the section when a resource is focused
