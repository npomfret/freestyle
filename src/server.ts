import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import { resolve } from 'path';
import { requiredEnv } from './lib/config.js';
import {
    browseResources,
    getRandomResource,
    getRecentResources,
    getRelatedResources,
    getResourceById,
    isValidKind,
    searchResources,
    type PaginatedResources,
    type ResourceRecord,
} from './lib/catalog.js';
import { createPool } from './lib/db.js';
import { log, serializeError } from './lib/logger.js';
import { formatResourceAsMarkdown, formatResourcesAsMarkdown } from './lib/markdown.js';

const PORT = Number(requiredEnv('PORT'));

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

function wantsMarkdown(req: Request): boolean {
    if (req.query.format === 'markdown' || req.query.format === 'md') return true;
    const accept = req.get('accept');
    return typeof accept === 'string' && accept.includes('text/markdown');
}

function sendFormatted(
    req: Request,
    res: Response,
    payload: ResourceRecord | ResourceRecord[] | PaginatedResources,
): void {
    if (!wantsMarkdown(req)) {
        res.json(payload);
        return;
    }

    const markdown = Array.isArray(payload) || 'items' in payload
        ? formatResourcesAsMarkdown(payload)
        : formatResourceAsMarkdown(payload);
    res.type('text/markdown').send(markdown);
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
        const items = await getRecentResources(db, limit);
        sendFormatted(req, res, items);
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
        if (kind && !isValidKind(kind)) {
            res.status(400).json({ error: `Invalid kind: ${kind}` });
            return;
        }

        const result = await searchResources(db, { q, topic, kind, region, limit, offset });
        sendFormatted(req, res, result);
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

        if (kind && !isValidKind(kind)) {
            res.status(400).json({ error: `Invalid kind: ${kind}` });
            return;
        }

        const result = await browseResources(db, { topic, kind, source, region, limit, offset });
        sendFormatted(req, res, result);
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
        const resource = await getResourceById(db, id);
        if (!resource) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        sendFormatted(req, res, resource);
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

        const related = await getRelatedResources(db, id, limit);
        if (related === null) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        sendFormatted(req, res, related);
    } catch (err) {
        log.error('related resources failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/random', async (req: Request, res: Response) => {
    try {
        const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
        const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const source = typeof req.query.source === 'string' ? req.query.source : undefined;
        const region = typeof req.query.region === 'string' ? req.query.region : undefined;

        log.info('random', { topic, kind, source, region });

        if (kind && !isValidKind(kind)) {
            res.status(400).json({ error: `Invalid kind: ${kind}` });
            return;
        }

        const resource = await getRandomResource(db, { topic, kind, source, region });
        if (!resource) {
            res.status(404).json({ error: 'No matching resource found' });
            return;
        }

        sendFormatted(req, res, resource);
    } catch (err) {
        log.error('random failed', serializeError(err));
        res.status(500).json({ error: 'Internal server error' });
    }
});

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
