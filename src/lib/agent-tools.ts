import type pg from 'pg';
import { embed } from './embeddings.js';
import { log } from './logger.js';
import type { Kind, QueueItemId, Region, ResourceId, SourceName, Topic, Url } from './types.js';
import { KINDS, TOPICS, QueueItemId as mkQueueItemId, ResourceId as mkResourceId } from './types.js';

// Re-export shared fetchPage
export { fetchPage } from './fetch-page.js';

// ============================================================
// Tool: check_existing
// ============================================================

export async function checkExisting(
    db: pg.Pool | pg.Client,
    args: { url: Url },
): Promise<{ inResources: boolean; inQueue: boolean }> {
    const { rows: rRows } = await db.query(
        'SELECT 1 FROM resources WHERE url = $1',
        [args.url],
    );
    const { rows: qRows } = await db.query(
        'SELECT 1 FROM discovery_queue WHERE url = $1',
        [args.url],
    );
    return { inResources: rRows.length > 0, inQueue: qRows.length > 0 };
}

// ============================================================
// Tool: add_resource (atomic via transaction)
// ============================================================

export async function addResource(
    db: pg.Pool | pg.Client,
    args: {
        name: string;
        url: Url;
        kinds: Kind[];
        topics: Topic[];
        regions?: Region[];
        description: string;
        analysis?: string;
    },
): Promise<{ id: ResourceId; status: 'added' | 'duplicate' }> {
    // Use a dedicated client for the transaction if given a Pool
    const client = 'totalCount' in db ? await (db as pg.Pool).connect() : db as pg.Client;
    const isPoolClient = 'totalCount' in db;

    try {
        await client.query('BEGIN');

        // Atomic duplicate check + insert using ON CONFLICT
        const { rows } = await client.query(
            `INSERT INTO resources (name, url)
         VALUES ($1, $2)
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
            [args.name, args.url],
        );

        if (rows.length === 0) {
            // Already exists
            await client.query('ROLLBACK');
            const { rows: existing } = await client.query('SELECT id FROM resources WHERE url = $1', [args.url]);
            return { id: mkResourceId(existing[0].id), status: 'duplicate' };
        }

        const id = mkResourceId(rows[0].id);

        // Validate taxonomy values
        const validKinds = args.kinds.filter(k => (KINDS as readonly string[]).includes(k));
        const validTopics = args.topics.filter(t => (TOPICS as readonly string[]).includes(t));

        // Junction tables
        for (const kind of validKinds as Kind[]) {
            await client.query(
                'INSERT INTO resource_kinds (resource_id, kind) VALUES ($1, $2)',
                [id, kind],
            );
        }
        for (const topic of validTopics as Topic[]) {
            await client.query(
                'INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)',
                [id, topic],
            );
        }
        if (args.regions) {
            for (const region of args.regions) {
                await client.query(
                    'INSERT INTO resource_regions (resource_id, region) VALUES ($1, $2)',
                    [id, region],
                );
            }
        }
        if (args.description) {
            await client.query(
                'INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)',
                [id, args.description],
            );
        }
        if (args.analysis) {
            await client.query(
                'INSERT INTO resource_analyses (resource_id, analysis) VALUES ($1, $2)',
                [id, args.analysis],
            );
        }
        await client.query(
            'INSERT INTO resource_sources (resource_id, source) VALUES ($1, $2)',
            [id, 'discovery-agent'],
        );

        // Mark as done in queue if it was queued
        await client.query(
            'UPDATE discovery_queue SET status = \'done\', processed_at = now() WHERE url = $1',
            [args.url],
        );

        await client.query('COMMIT');

        // Generate embedding outside the transaction (best-effort)
        const text = [args.name, args.description, ...args.topics]
            .filter(Boolean)
            .join(' ');
        try {
            const vecs = await embed([text]);
            await db.query(
                'UPDATE resources SET embedding = $1::vector WHERE id = $2',
                [`[${vecs[0].join(',')}]`, id],
            );
        } catch (err) {
            log.warn('embedding failed', { url: args.url, error: String(err) });
        }

        return { id, status: 'added' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        if (isPoolClient) (client as pg.PoolClient).release();
    }
}

// ============================================================
// Tool: update_resource (atomic via transaction)
// ============================================================

export interface ResourceRow {
    id: ResourceId;
    name: string;
    url: Url;
    kinds: Kind[];
    topics: Topic[];
    regions: Region[];
    descriptions: string[];
}

export interface UpdateResourceArgs {
    name?: string;
    description: string;
    topics?: string[];
    regions?: string[];
    analysis?: string;
    is_alive: boolean;
    notes: string;
}

export async function updateResource(
    db: pg.Pool,
    resource: ResourceRow,
    args: UpdateResourceArgs,
    opts?: { skipLinkChecks?: boolean },
): Promise<{ status: string; id: ResourceId; fail_count: number }> {
    const client = await db.connect();
    let newStatus = 'alive';
    let failCount = 0;

    try {
        await client.query('BEGIN');

        // Update name if provided
        if (args.name && args.name !== resource.name) {
            await client.query('UPDATE resources SET name = $1 WHERE id = $2', [args.name, resource.id]);
        }

        // Update description: clear old, insert new
        await client.query('DELETE FROM resource_descriptions WHERE resource_id = $1', [resource.id]);
        if (args.description) {
            await client.query(
                'INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)',
                [resource.id, args.description],
            );
        }

        // Update topics if provided (filter to valid labels).
        // Delete unconditionally so an empty array clears stale topics.
        if (args.topics !== undefined) {
            await client.query('DELETE FROM resource_topics WHERE resource_id = $1', [resource.id]);
            const validTopics = args.topics.filter(t => (TOPICS as readonly string[]).includes(t));
            for (const t of validTopics) {
                await client.query(
                    'INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)',
                    [resource.id, t],
                );
            }
        }

        // Update regions if provided.
        // Delete unconditionally so an empty array clears stale regions.
        if (args.regions !== undefined) {
            await client.query('DELETE FROM resource_regions WHERE resource_id = $1', [resource.id]);
            for (const reg of args.regions) {
                await client.query(
                    'INSERT INTO resource_regions (resource_id, region) VALUES ($1, $2)',
                    [resource.id, reg],
                );
            }
        }

        // Update analysis if provided
        if (args.analysis) {
            await client.query(
                `INSERT INTO resource_analyses (resource_id, analysis, updated_at)
                 VALUES ($1, $2, now())
                 ON CONFLICT (resource_id) DO UPDATE
                 SET analysis = $2, updated_at = now()`,
                [resource.id, args.analysis],
            );
        }

        // Update link_checks (unless caller opts out, e.g. repair job)
        if (!opts?.skipLinkChecks) {
            if (args.is_alive) {
                newStatus = 'alive';
                failCount = 0;
            } else {
                const { rows: lcRows } = await client.query(
                    'SELECT fail_count FROM link_checks WHERE resource_id = $1',
                    [resource.id],
                );
                const currentFails = lcRows.length > 0 ? (lcRows[0].fail_count as number) : 0;
                failCount = currentFails + 1;
                newStatus = failCount >= 2 ? 'dead' : 'suspect';
            }

            await client.query(
                `INSERT INTO link_checks (resource_id, checked_at, status_code, status, fail_count, notes)
                 VALUES ($1, now(), NULL, $2, $3, $4)
                 ON CONFLICT (resource_id) DO UPDATE
                 SET checked_at = now(), status = $2, fail_count = $3, notes = $4`,
                [resource.id, newStatus, failCount, args.notes],
            );
        }

        // Always bump updated_at on the resource
        await client.query('UPDATE resources SET updated_at = now() WHERE id = $1', [resource.id]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    // Re-generate embedding outside transaction (best-effort)
    if (args.is_alive) {
        const embText = [args.name ?? resource.name, args.description, ...(args.topics ?? resource.topics)].filter(Boolean).join(' ');
        try {
            const vecs = await embed([embText]);
            await db.query(
                'UPDATE resources SET embedding = $1::vector WHERE id = $2',
                [`[${vecs[0].join(',')}]`, resource.id],
            );
        } catch {
            // Embedding update is best-effort
        }
    }

    return { status: newStatus, id: resource.id, fail_count: failCount };
}

// ============================================================
// Tool: queue_items (accurate metrics)
// ============================================================

export async function queueItems(
    db: pg.Pool | pg.Client,
    args: { items: { url: Url; label: string; source: SourceName }[] },
): Promise<{ queued: number; skipped: number }> {
    let queued = 0;
    let skipped = 0;
    for (const item of args.items) {
        try {
            const { rowCount } = await db.query(
                `INSERT INTO discovery_queue (url, label, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (url) DO NOTHING`,
                [item.url, item.label || '', item.source || ''],
            );
            if (rowCount && rowCount > 0) queued++;
            else skipped++;
        } catch {
            skipped++;
        }
    }
    return { queued, skipped };
}

// ============================================================
// Tool: get_queue (atomic claim with FOR UPDATE SKIP LOCKED)
// ============================================================

export async function getQueue(
    db: pg.Pool | pg.Client,
    args: { limit: number },
): Promise<{ id: QueueItemId; url: Url; label: string; source: SourceName }[]> {
    // Reset items stuck in 'processing' for >10 minutes (crash recovery).
    // Use processing_started_at so we measure from when processing began, not when the item was queued.
    // IS NULL handles rows that were stuck in processing before this column was added.
    await db.query(
        `UPDATE discovery_queue SET status = 'pending', processing_started_at = NULL
         WHERE status = 'processing'
         AND (processing_started_at IS NULL OR processing_started_at < now() - interval '10 minutes')`,
    );

    // Atomic claim: SELECT + UPDATE in a single statement using a CTE
    const { rows } = await db.query(
        `WITH claimed AS (
      SELECT id FROM discovery_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE discovery_queue dq
    SET status = 'processing', processing_started_at = now()
    FROM claimed
    WHERE dq.id = claimed.id
    RETURNING dq.id, dq.url, dq.label, dq.source`,
        [args.limit || 10],
    );
    return rows.map((r: { id: number; url: string; label: string; source: string }) => ({
        id: mkQueueItemId(r.id),
        url: r.url as Url,
        label: r.label,
        source: r.source as SourceName,
    }));
}
