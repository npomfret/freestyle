# Richer Embedding Text

## Context

Embeddings are currently built from `name + description` only. Topics, kinds, and regions are structured signals that improve semantic search relevance — especially for queries like "Japan weather data" or "open source geospatial API". Including them in the embedding input text at no extra cost.

## Changes

### `src/generate-embeddings.ts`
- Extend the text fed to the embedding model to include topics, kinds, and regions for each resource
- Join them from their respective junction tables when loading resources without embeddings
- Format example: `"OpenWeatherMap — Current and forecast weather data. Topics: weather, climate. Kinds: api. Regions: Global"`
- Keep the concatenation simple and consistent so the model sees clean signal

## Process

After the code change:
1. Clear existing embeddings: `UPDATE resources SET embedding = NULL`
2. Re-run: `npm run embed`
3. The HNSW index rebuilds automatically on next query

## Verification

1. `npm run compile` passes
2. `npm run embed` completes without errors
3. A search like "Japan weather" returns region-tagged resources higher than before
4. Vector dimensions unchanged (384) — existing index structure is compatible
