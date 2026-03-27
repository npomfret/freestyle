import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import { resolve } from 'path';
import { requiredEnv } from './lib/config.js';
import { createPool } from './lib/db.js';
import { embed } from './lib/embeddings.js';
import { log, serializeError } from './lib/logger.js';
import type { ResourceId } from './lib/types.js';

const PORT = Number(requiredEnv('PORT'));
const VALID_KINDS = new Set(['api', 'dataset', 'service', 'code']);

const app = express();

// CORS — configurable origin
app.use(cors({ origin: requiredEnv('CORS_ORIGIN') }));
app.use(express.json());

// Health check (before rate limiter so it's never throttled)
app.get('/health', async (_req: Request, res: Response) => {
    try {
        const { rows } = await db.query('SELECT COUNT(*) FROM resources');
        res.json({ status: 'ok', resources: Number(rows[0].count) });
    } catch (err) {
        res.status(503).json({ status: 'error', message: String(err) });
    }
});

// Simple in-memory rate limiter (per IP, 100 req/min)
const rateBuckets = new Map<string, number[]>();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

app.use((req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const timestamps = rateBuckets.get(ip) ?? [];
    const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
        res.status(429).json({ error: 'Too many requests' });
        return;
    }
    recent.push(now);
    rateBuckets.set(ip, recent);
    next();
});

// Prune rate limiter every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, timestamps] of rateBuckets) {
        const recent = timestamps.filter((t) => t > cutoff);
        if (recent.length === 0) rateBuckets.delete(ip);
        else rateBuckets.set(ip, recent);
    }
}, 5 * 60_000).unref();

const db = createPool();

// ============================================================
// Helpers
// ============================================================

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

// ============================================================
// API Routes
// ============================================================

// Stats
app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
        const resources = (await db.query('SELECT COUNT(*) FROM resources')).rows[0].count;
        const apis = (await db.query('SELECT COUNT(*) FROM resource_kinds WHERE kind = \'api\'')).rows[0].count;
        const datasets = (await db.query('SELECT COUNT(*) FROM resource_kinds WHERE kind = \'dataset\'')).rows[0].count;
        const topics = (await db.query('SELECT COUNT(DISTINCT topic) FROM resource_topics')).rows[0].count;
        const withEmbeddings = (await db.query('SELECT COUNT(*) FROM resources WHERE embedding IS NOT NULL')).rows[0].count;
        const added24h = (await db.query('SELECT COUNT(*) FROM resources WHERE created_at >= now() - interval \'24 hours\'')).rows[0].count;
        const checked24h = (await db.query('SELECT COUNT(*) FROM link_checks WHERE checked_at >= now() - interval \'24 hours\'')).rows[0].count;
        const dead24h = (await db.query('SELECT COUNT(*) FROM link_checks WHERE status = \'dead\' AND checked_at >= now() - interval \'24 hours\'')).rows[0].count;
        const repaired24h = (await db.query('SELECT COUNT(*) FROM resource_analyses WHERE updated_at >= now() - interval \'24 hours\'')).rows[0].count;
        res.json({
            resources: Number(resources),
            apis: Number(apis),
            datasets: Number(datasets),
            topics: Number(topics),
            withEmbeddings: Number(withEmbeddings),
            added24h: Number(added24h),
            checked24h: Number(checked24h),
            dead24h: Number(dead24h),
            repaired24h: Number(repaired24h),
        });
    } catch (err) {
        log.error('stats failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Region list with counts
app.get('/api/regions', async (_req: Request, res: Response) => {
    try {
        const { rows } = await db.query(
            'SELECT region, COUNT(*) AS count FROM resource_regions GROUP BY region ORDER BY count DESC',
        );
        res.json(rows.map((r) => ({ region: r.region, count: Number(r.count) })));
    } catch (err) {
        log.error('regions failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Topic list with counts
app.get('/api/topics', async (_req: Request, res: Response) => {
    try {
        const { rows } = await db.query(
            'SELECT topic, COUNT(*) AS count FROM resource_topics GROUP BY topic ORDER BY count DESC',
        );
        res.json(rows.map((r) => ({ topic: r.topic, count: Number(r.count) })));
    } catch (err) {
        log.error('topics failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Recently added resources
app.get('/api/recent', async (req: Request, res: Response) => {
    try {
        const limit = clampInt(req.query.limit, 1, 50, 20);
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
    } catch (err) {
        log.error('recent failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Semantic search
app.get('/api/search', async (req: Request, res: Response) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
        const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const region = typeof req.query.region === 'string' ? req.query.region : undefined;
        const limit = clampInt(req.query.limit, 1, 200, 30);
        const offset = clampInt(req.query.offset, 0, 100_000, 0);

        log.info('search', { q, topic, kind, region, limit, offset });

        if (!q) {
            res.status(400).json({ error: 'q parameter required' });
            return;
        }
        if (kind && !VALID_KINDS.has(kind)) {
            res.status(400).json({ error: `Invalid kind: ${kind}` });
            return;
        }

        // Semantic search using local embedding model
        try {
            const embText = region ? `${q} ${region}` : q;
            const vecs = await embed([embText]);
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
            if (region) {
                sql += ` AND EXISTS (SELECT 1 FROM resource_regions rr WHERE rr.resource_id = r.id AND rr.region = $${paramIdx})`;
                params.push(region);
                paramIdx++;
            }

            sql += ` ORDER BY r.embedding <=> $1::vector LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
            params.push(limit + 1, offset);

            const { rows } = await db.query(sql, params);
            const hasMore = rows.length > limit;
            const enriched = await enrichResources(hasMore ? rows.slice(0, limit) : rows);
            res.json({ items: enriched, hasMore, offset, limit });
            return;
        } catch {
            // Fall through to text search
        }

        // Fallback: trigram + FTS (with same filters as semantic branch)
        let fallbackSql = `SELECT r.id, r.name, r.url, r.updated_at,
            GREATEST(similarity(r.name, $1), ts_rank(r.fts, plainto_tsquery('english', $1))) AS similarity
     FROM resources r
     WHERE (r.name % $1 OR r.fts @@ plainto_tsquery('english', $1))
       AND NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))`;
        const fallbackParams: unknown[] = [q];
        let fbIdx = 2;

        if (topic) {
            fallbackSql += ` AND EXISTS (SELECT 1 FROM resource_topics rt WHERE rt.resource_id = r.id AND rt.topic = $${fbIdx})`;
            fallbackParams.push(topic);
            fbIdx++;
        }
        if (kind) {
            fallbackSql += ` AND EXISTS (SELECT 1 FROM resource_kinds rk WHERE rk.resource_id = r.id AND rk.kind = $${fbIdx})`;
            fallbackParams.push(kind);
            fbIdx++;
        }
        if (region) {
            fallbackSql += ` AND EXISTS (SELECT 1 FROM resource_regions rr WHERE rr.resource_id = r.id AND rr.region = $${fbIdx})`;
            fallbackParams.push(region);
            fbIdx++;
        }

        fallbackSql += ` ORDER BY similarity DESC LIMIT $${fbIdx} OFFSET $${fbIdx + 1}`;
        fallbackParams.push(limit + 1, offset);

        const { rows } = await db.query(fallbackSql, fallbackParams);
        const hasMore = rows.length > limit;
        const enriched = await enrichResources(hasMore ? rows.slice(0, limit) : rows);
        res.json({ items: enriched, hasMore, offset, limit });
    } catch (err) {
        log.error('search failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Browse resources with filtering
app.get('/api/resources', async (req: Request, res: Response) => {
    try {
        const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
        const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const source = typeof req.query.source === 'string' ? req.query.source : undefined;
        const region = typeof req.query.region === 'string' ? req.query.region : undefined;
        const offset = clampInt(req.query.offset, 0, 100_000, 0);
        const limit = clampInt(req.query.limit, 1, 200, 30);

        log.info('browse', { topic, kind, source, region, limit, offset });

        if (kind && !VALID_KINDS.has(kind)) {
            res.status(400).json({ error: `Invalid kind: ${kind}` });
            return;
        }

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
        if (region) {
            joins.push(`JOIN resource_regions rr ON rr.resource_id = r.id`);
            wheres.push(`rr.region = $${paramIdx}`);
            params.push(region);
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
    } catch (err) {
        log.error('browse failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Single resource detail
app.get('/api/resources/:id', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Invalid resource id' });
            return;
        }
        const { rows } = await db.query(
            'SELECT r.id, r.name, r.url, r.created_at, r.updated_at FROM resources r WHERE r.id = $1',
            [id],
        );
        if (!rows.length) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const enriched = await enrichResources(rows);
        res.json(enriched[0]);
    } catch (err) {
        log.error('resource detail failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Related resources by embedding similarity
app.get('/api/resources/:id/related', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Invalid resource id' });
            return;
        }
        const limit = clampInt(req.query.limit, 1, 20, 5);

        const { rows: target } = await db.query(
            'SELECT embedding FROM resources WHERE id = $1',
            [id],
        );
        if (!target.length) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (!target[0].embedding) {
            res.json([]);
            return;
        }

        const { rows } = await db.query(`
            SELECT r.id, r.name, r.url, r.created_at, r.updated_at,
                   1 - (r.embedding <=> $1::vector) AS similarity
            FROM resources r
            WHERE r.id != $2 AND r.embedding IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM link_checks lc
                WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead')
              )
            ORDER BY r.embedding <=> $1::vector
            LIMIT $3
        `, [target[0].embedding, id, limit]);

        res.json(await enrichResources(rows));
    } catch (err) {
        log.error('related resources failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// Helpers
// ============================================================

async function enrichResources(
    rows: { id: ResourceId; name: string; url: string; created_at?: string; updated_at?: string; similarity?: number }[],
) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);

    const [kinds, topics, regions, sources, descs, analyses] = await Promise.all([
        db.query('SELECT resource_id, kind FROM resource_kinds WHERE resource_id = ANY($1)', [ids]),
        db.query('SELECT resource_id, topic FROM resource_topics WHERE resource_id = ANY($1)', [ids]),
        db.query('SELECT resource_id, region FROM resource_regions WHERE resource_id = ANY($1)', [ids]),
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
    const regionMap = groupBy(regions.rows, 'resource_id', 'region');
    const descMap = groupBy(descs.rows, 'resource_id', 'description');

    const analysisMap: Record<number, string> = {};
    for (const row of analyses.rows) {
        analysisMap[row.resource_id as number] = row.analysis as string;
    }

    const sourceObjMap: Record<number, { name: string; url: string | null }[]> = {};
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
        regions: [...new Set(regionMap[r.id] ?? [])],
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
    app.listen(PORT, () => {
        log.info('server started', { port: PORT });
    });
}

start();
