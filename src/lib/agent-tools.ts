import type pg from 'pg';
import { embed } from './embeddings.js';
import { log } from './logger.js';
import type { Kind, QueueItemId, ResourceId, SourceName, Topic, Url } from './types.js';
import { QueueItemId as mkQueueItemId, ResourceId as mkResourceId } from './types.js';

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

        // Junction tables
        for (const kind of args.kinds) {
            await client.query(
                'INSERT INTO resource_kinds (resource_id, kind) VALUES ($1, $2)',
                [id, kind],
            );
        }
        for (const topic of args.topics) {
            await client.query(
                'INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)',
                [id, topic],
            );
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
// Tool: fetch_page
// ============================================================

export async function fetchPage(
    args: { url: Url },
): Promise<{ content: string; statusCode: number }> {
    try {
        const resp = await fetch(args.url, {
            headers: { 'User-Agent': 'freestyle-discovery-agent/1.0' },
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
        });
        const html = await resp.text();
        // Strip HTML to rough plain text
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[#\w]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        // Truncate to ~8K chars
        if (text.length > 8000) text = text.slice(0, 8000) + '\n...[truncated]';
        return { content: text, statusCode: resp.status };
    } catch (err) {
        return {
            content: `Error fetching ${args.url}: ${err}`,
            statusCode: 0,
        };
    }
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
    SET status = 'processing'
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
