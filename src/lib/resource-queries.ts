import type pg from 'pg';
import type { ResourceRow } from './agent-tools.js';
import type { Kind, Region, Topic } from './types.js';
import { ResourceId, Url } from './types.js';

// ============================================================
// Shared resource hydration — loads a resource with all its
// junction table data (kinds, topics, regions, descriptions).
// ============================================================

async function hydrateResource(db: pg.Pool | pg.Client, row: { id: number; name: string; url: string }): Promise<ResourceRow> {
    const kinds = await db.query('SELECT kind FROM resource_kinds WHERE resource_id = $1', [row.id]);
    const topics = await db.query('SELECT topic FROM resource_topics WHERE resource_id = $1', [row.id]);
    const regions = await db.query('SELECT region FROM resource_regions WHERE resource_id = $1', [row.id]);
    const descs = await db.query('SELECT description FROM resource_descriptions WHERE resource_id = $1', [row.id]);

    return {
        id: ResourceId(row.id),
        name: row.name,
        url: Url(row.url),
        kinds: kinds.rows.map((k: { kind: string }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string }) => t.topic as Topic),
        regions: regions.rows.map((rg: { region: string }) => rg.region as Region),
        descriptions: descs.rows.map((d: { description: string }) => d.description),
    };
}

export async function getResourceById(db: pg.Pool | pg.Client, id: number): Promise<ResourceRow | null> {
    const { rows } = await db.query('SELECT id, name, url FROM resources WHERE id = $1', [id]);
    if (!rows.length) return null;
    return hydrateResource(db, rows[0]);
}

export async function getResourceByUrl(db: pg.Pool | pg.Client, url: string): Promise<ResourceRow | null> {
    const { rows } = await db.query('SELECT id, name, url FROM resources WHERE url = $1', [url]);
    if (!rows.length) return null;
    return hydrateResource(db, rows[0]);
}

/** Next resource for repair: oldest updated_at, alive or unchecked. */
export async function getNextRepairResource(db: pg.Pool | pg.Client): Promise<ResourceRow | null> {
    const { rows } = await db.query(`
        SELECT r.id, r.name, r.url
        FROM resources r
        LEFT JOIN link_checks lc ON lc.resource_id = r.id
        WHERE lc.status IS NULL OR lc.status = 'alive'
        ORDER BY r.updated_at ASC
        LIMIT 1
    `);
    if (!rows.length) return null;
    return hydrateResource(db, rows[0]);
}

/** Next resource for recheck: unchecked first, then oldest checked (>14 days), skip dead. */
export async function getNextRecheckResource(db: pg.Pool | pg.Client): Promise<ResourceRow | null> {
    const { rows } = await db.query(`
        SELECT r.id, r.name, r.url
        FROM resources r
        LEFT JOIN link_checks lc ON lc.resource_id = r.id
        WHERE lc.status IS DISTINCT FROM 'dead'
          AND (lc.checked_at IS NULL OR lc.checked_at < now() - interval '14 days')
        ORDER BY lc.checked_at ASC NULLS FIRST, r.id
        LIMIT 1
    `);
    if (!rows.length) return null;
    return hydrateResource(db, rows[0]);
}
