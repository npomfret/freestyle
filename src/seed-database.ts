import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { log } from './lib/logger.js';
import type { Kind, ProjectId, ResourceId, SourceName, Topic, Url } from './lib/types.js';
import { ProjectId as mkProjectId, ResourceId as mkResourceId } from './lib/types.js';

// Translates old 32-label catalog vocabulary to the current 71-label schema vocabulary.
const TOPIC_REMAP: Record<string, string> = {
    'agriculture':  'crops',
    'blockchain':   'crypto',
    'data-science': 'ai-ml',
    'finance':      'banking',
    'games':        'gaming',
    'geoscience':   'earth-science',
    'health':       'public-health',
    'social-science': 'demographics',
    'transport':    'logistics',
};

const ROOT = resolve(import.meta.dirname, '..');
const CATALOG_JSON = resolve(ROOT, 'catalog.json');
const DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://freestyle:freestyle@localhost:5433/freestyle';

interface CatalogResource {
    name: string;
    url: Url;
    kinds: Kind[];
    topics: Topic[];
    sources: SourceName[];
    directDescriptions: string[];
}

interface CatalogProject {
    name: string;
    repoUrl: Url;
    description: string;
    labels: string[];
    listBased: boolean;
}

interface Catalog {
    resources: CatalogResource[];
    projects: CatalogProject[];
}

/** Build a multi-row INSERT from an array of [resource_id, value] pairs. */
function batchInsert(
    table: string,
    col: string,
    rows: [ResourceId | ProjectId, string][],
): { sql: string; params: unknown[] } | null {
    if (rows.length === 0) return null;
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < rows.length; i++) {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(rows[i][0], rows[i][1]);
    }
    return {
        sql: `INSERT INTO ${table} (${table.includes('project') ? 'project_id' : 'resource_id'}, ${col}) VALUES ${values.join(', ')}`,
        params,
    };
}

async function seed(client: pg.Client, catalog: Catalog): Promise<void> {
    // --- Projects (full replace) ---
    await client.query('DELETE FROM project_labels');
    await client.query('DELETE FROM projects');

    for (const p of catalog.projects) {
        const { rows } = await client.query(
            `INSERT INTO projects (name, repo_url, description, list_based)
       VALUES ($1, $2, $3, $4) RETURNING id`,
            [p.name, p.repoUrl, p.description, p.listBased],
        );
        const pid = mkProjectId(rows[0].id);
        if (p.labels.length > 0) {
            const batch = batchInsert('project_labels', 'label', p.labels.map((l) => [pid, l] as [ProjectId, string]));
            if (batch) await client.query(batch.sql, batch.params);
        }
    }

    // --- Resources (upsert by URL to preserve IDs) ---
    const { rows: existingRows } = await client.query(
        'SELECT url, id FROM resources',
    );
    const existing = new Map<Url, ResourceId>(
        existingRows.map((r: { url: string; id: number }) => [r.url as Url, mkResourceId(r.id)]),
    );

    const newUrls = new Set(catalog.resources.map((r) => r.url));
    const goneUrls = [...existing.keys()].filter((u) => !newUrls.has(u));

    if (goneUrls.length) {
        await client.query('DELETE FROM resources WHERE url = ANY($1)', [goneUrls]);
    }

    // Clear junction tables for surviving resources
    await client.query('DELETE FROM resource_kinds');
    await client.query('DELETE FROM resource_topics');
    await client.query('DELETE FROM resource_regions');
    await client.query('DELETE FROM resource_sources');
    await client.query('DELETE FROM resource_descriptions');

    // Collect all junction rows for batch insert
    const kindRows: [ResourceId, string][] = [];
    const topicRows: [ResourceId, string][] = [];
    const sourceRows: [ResourceId, string][] = [];
    const descRows: [ResourceId, string][] = [];
    const staleEmbeddingIds: ResourceId[] = [];

    for (const r of catalog.resources) {
        let rid: ResourceId;
        if (existing.has(r.url)) {
            rid = existing.get(r.url)!;
            await client.query(
                'UPDATE resources SET name = $1, updated_at = now() WHERE id = $2',
                [r.name, rid],
            );
            // Name/topics/descriptions changed — embedding may be stale
            staleEmbeddingIds.push(rid);
        } else {
            const { rows } = await client.query(
                'INSERT INTO resources (name, url) VALUES ($1, $2) RETURNING id',
                [r.name, r.url],
            );
            rid = mkResourceId(rows[0].id);
        }

        for (const kind of r.kinds) kindRows.push([rid, kind]);
        for (const topic of r.topics) {
            const mapped = TOPIC_REMAP[topic as string] ?? topic;
            topicRows.push([rid, mapped as Topic]);
        }
        for (const source of r.sources) sourceRows.push([rid, source]);
        for (const desc of r.directDescriptions) descRows.push([rid, desc]);
    }

    // Batch insert junction rows (in chunks of 5000 to avoid param limits)
    const CHUNK = 5000;
    for (const [table, col, rows] of [
        ['resource_kinds', 'kind', kindRows],
        ['resource_topics', 'topic', topicRows],
        ['resource_sources', 'source', sourceRows],
        ['resource_descriptions', 'description', descRows],
    ] as const) {
        for (let i = 0; i < rows.length; i += CHUNK) {
            const batch = batchInsert(table, col, rows.slice(i, i + CHUNK) as [ResourceId, string][]);
            if (batch) await client.query(batch.sql, batch.params);
        }
    }

    // Clear stale embeddings so re-embed picks them up
    if (staleEmbeddingIds.length > 0) {
        await client.query(
            'UPDATE resources SET embedding = NULL WHERE id = ANY($1) AND embedding IS NOT NULL',
            [staleEmbeddingIds],
        );
        log.info('cleared stale embeddings', { count: staleEmbeddingIds.length });
    }

    // Summary
    const resourceCount = (await client.query('SELECT COUNT(*) FROM resources')).rows[0].count;
    const projectCount = (await client.query('SELECT COUNT(*) FROM projects')).rows[0].count;
    const topicCount = (await client.query('SELECT COUNT(DISTINCT topic) FROM resource_topics')).rows[0].count;
    log.info('seed complete', { resources: Number(resourceCount), projects: Number(projectCount), topics: Number(topicCount) });
}

async function main(): Promise<void> {
    let raw: string;
    try {
        raw = readFileSync(CATALOG_JSON, 'utf-8');
    } catch {
        log.error('catalog not found', {
            path: CATALOG_JSON,
            hint: 'restore catalog.json or run npm run generate if you intentionally want to rebuild it from the legacy source corpus',
        });
        process.exit(1);
    }

    const catalog: Catalog = JSON.parse(raw);
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
        await client.query('BEGIN');
        await seed(client, catalog);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.end();
    }
}

main();
