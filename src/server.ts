import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { resolve } from 'path';
import { createClient } from './lib/db.js';
import { embed } from './lib/embeddings.js';
import { log } from './lib/logger.js';
import type { ResourceId } from './lib/types.js';
import { ResourceId as mkResourceId } from './lib/types.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json());

const db = createClient();

// ============================================================
// API Routes
// ============================================================

// Stats
app.get('/api/stats', async (_req, res) => {
    const resources = (await db.query('SELECT COUNT(*) FROM resources')).rows[0].count;
    const apis = (await db.query('SELECT COUNT(*) FROM resource_kinds WHERE kind = \'api\'')).rows[0].count;
    const datasets = (await db.query('SELECT COUNT(*) FROM resource_kinds WHERE kind = \'dataset\'')).rows[0].count;
    const topics = (await db.query('SELECT COUNT(DISTINCT topic) FROM resource_topics')).rows[0].count;
    const withEmbeddings = (await db.query('SELECT COUNT(*) FROM resources WHERE embedding IS NOT NULL')).rows[0].count;
    res.json({
        resources: Number(resources),
        apis: Number(apis),
        datasets: Number(datasets),
        topics: Number(topics),
        withEmbeddings: Number(withEmbeddings),
    });
});

// Topic list with counts
app.get('/api/topics', async (_req, res) => {
    const { rows } = await db.query(
        'SELECT topic, COUNT(*) AS count FROM resource_topics GROUP BY topic ORDER BY count DESC',
    );
    res.json(rows.map((r) => ({ topic: r.topic, count: Number(r.count) })));
});

// Recently added resources
app.get('/api/recent', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const { rows } = await db.query(
        `SELECT r.id, r.name, r.url, r.created_at, r.updated_at
     FROM resources r
     WHERE NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))
     ORDER BY r.created_at DESC
     LIMIT $1`,
        [limit],
    );
    const enriched = await enrichResources(rows);
    res.json(enriched);
});

// Semantic search
app.get('/api/search', async (req, res) => {
    const q = req.query.q as string;
    const topic = req.query.topic as string | undefined;
    const kind = req.query.kind as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const offset = Number(req.query.offset) || 0;

    if (!q) {
        res.status(400).json({ error: 'q parameter required' });
        return;
    }

    // Semantic search using local embedding model
    try {
        const vecs = await embed([q]);
        const vec = '[' + vecs[0].join(',') + ']';

        let sql = `
      SELECT r.id, r.name, r.url, r.updated_at,
             1 - (r.embedding <=> $1::vector) AS similarity
      FROM resources r
      WHERE r.embedding IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))
    `;
        const params: unknown[] = [vec];
        let paramIdx = 2;

        if (topic) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_topics rt WHERE rt.resource_id = r.id AND rt.topic = $${paramIdx})`;
            params.push(topic);
            paramIdx++;
        }
        if (kind) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_kinds rk WHERE rk.resource_id = r.id AND rk.kind = $${paramIdx})`;
            params.push(kind);
            paramIdx++;
        }

        sql += ` ORDER BY r.embedding <=> $1::vector LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit + 1, offset); // fetch one extra to detect hasMore

        const { rows } = await db.query(sql, params);
        const hasMore = rows.length > limit;
        const enriched = await enrichResources(hasMore ? rows.slice(0, limit) : rows);
        res.json({ items: enriched, hasMore, offset, limit });
        return;
    } catch {
        // Fall through to text search
    }

    // Fallback: trigram + FTS
    const { rows } = await db.query(
        `SELECT r.id, r.name, r.url, r.updated_at,
            GREATEST(similarity(r.name, $1), ts_rank(r.fts, plainto_tsquery('english', $1))) AS similarity
     FROM resources r
     WHERE (r.name % $1 OR r.fts @@ plainto_tsquery('english', $1))
       AND NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))
     ORDER BY similarity DESC
     LIMIT $2 OFFSET $3`,
        [q, limit + 1, offset],
    );
    const hasMore = rows.length > limit;
    const enriched = await enrichResources(hasMore ? rows.slice(0, limit) : rows);
    res.json({ items: enriched, hasMore, offset, limit });
});

// Browse resources with filtering
app.get('/api/resources', async (req, res) => {
    const topic = req.query.topic as string | undefined;
    const kind = req.query.kind as string | undefined;
    const source = req.query.source as string | undefined;
    const offset = Number(req.query.offset) || 0;
    const limit = Math.min(Number(req.query.limit) || 30, 200);

    let sql = 'SELECT r.id, r.name, r.url, r.updated_at FROM resources r';
    const joins: string[] = [];
    const wheres: string[] = ['NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN (\'suspect\', \'dead\'))'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (topic) {
        joins.push(`JOIN resource_topics rt ON rt.resource_id = r.id`);
        wheres.push(`rt.topic = $${paramIdx}`);
        params.push(topic);
        paramIdx++;
    }
    if (kind) {
        joins.push(`JOIN resource_kinds rk ON rk.resource_id = r.id`);
        wheres.push(`rk.kind = $${paramIdx}`);
        params.push(kind);
        paramIdx++;
    }
    if (source) {
        joins.push(`JOIN resource_sources rs ON rs.resource_id = r.id`);
        wheres.push(`rs.source = $${paramIdx}`);
        params.push(source);
        paramIdx++;
    }

    if (joins.length) sql += ' ' + joins.join(' ');
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ` ORDER BY r.name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit + 1, offset);

    const { rows } = await db.query(sql, params);
    const hasMore = rows.length > limit;
    const enriched = await enrichResources(hasMore ? rows.slice(0, limit) : rows);
    res.json({ items: enriched, hasMore, offset, limit });
});

// Single resource detail
app.get('/api/resources/:id', async (req, res) => {
    const { rows } = await db.query(
        'SELECT r.id, r.name, r.url, r.created_at, r.updated_at FROM resources r WHERE r.id = $1',
        [req.params.id],
    );
    if (!rows.length) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const enriched = await enrichResources(rows);
    res.json(enriched[0]);
});

// ============================================================
// Helpers
// ============================================================

async function enrichResources(
    rows: { id: ResourceId; name: string; url: string; created_at?: string; updated_at?: string; similarity?: number; }[],
) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);

    const [kinds, topics, sources, descs, analyses] = await Promise.all([
        db.query('SELECT resource_id, kind FROM resource_kinds WHERE resource_id = ANY($1)', [ids]),
        db.query('SELECT resource_id, topic FROM resource_topics WHERE resource_id = ANY($1)', [ids]),
        db.query(
            `SELECT rs.resource_id, rs.source AS name, p.repo_url AS url
       FROM resource_sources rs
       LEFT JOIN projects p ON p.name = rs.source
       WHERE rs.resource_id = ANY($1)`,
            [ids],
        ),
        db.query('SELECT resource_id, description FROM resource_descriptions WHERE resource_id = ANY($1)', [ids]),
        db.query('SELECT resource_id, analysis FROM resource_analyses WHERE resource_id = ANY($1)', [ids]),
    ]);

    const kindMap = groupBy(kinds.rows, 'resource_id', 'kind');
    const topicMap = groupBy(topics.rows, 'resource_id', 'topic');
    const descMap = groupBy(descs.rows, 'resource_id', 'description');

    // Build analysis map (one per resource)
    const analysisMap: Record<number, string> = {};
    for (const row of analyses.rows) {
        analysisMap[row.resource_id as number] = row.analysis as string;
    }

    // Build source map as objects with name + optional url
    const sourceObjMap: Record<number, { name: string; url: string | null; }[]> = {};
    for (const row of sources.rows) {
        const key = row.resource_id as number;
        if (!sourceObjMap[key]) sourceObjMap[key] = [];
        const exists = sourceObjMap[key].some((s) => s.name === row.name);
        if (!exists) {
            sourceObjMap[key].push({ name: row.name as string, url: (row.url as string) ?? null });
        }
    }

    return rows.map((r) => ({
        ...r,
        kinds: [...new Set(kindMap[r.id] ?? [])],
        topics: [...new Set(topicMap[r.id] ?? [])],
        sources: sourceObjMap[r.id] ?? [],
        descriptions: [...new Set(descMap[r.id] ?? [])],
        analysis: analysisMap[r.id] ?? null,
    }));
}

function groupBy(
    rows: Record<string, unknown>[],
    keyField: string,
    valueField: string,
): Record<number, string[]> {
    const map: Record<number, string[]> = {};
    for (const row of rows) {
        const key = row[keyField] as number;
        if (!map[key]) map[key] = [];
        map[key].push(row[valueField] as string);
    }
    return map;
}

// ============================================================
// Serve static frontend in production
// ============================================================

const distPath = resolve(import.meta.dirname, '../web/dist');
app.use(express.static(distPath));
app.get('/{*path}', (_req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
});

// ============================================================
// Start
// ============================================================

async function start() {
    await db.connect();
    app.listen(PORT, () => {
        log.info('server started', { port: PORT });
    });
}

start();
