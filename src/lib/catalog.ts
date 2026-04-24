import type pg from 'pg';
import { embed } from './embeddings.js';
import { KINDS, ResourceId, type KindValue } from './types.js';

type BaseRow = {
    id: number;
    name: string;
    url: string;
    created_at?: string;
    updated_at?: string;
    similarity?: number;
};

export type ResourceRecord = {
    id: ResourceId;
    name: string;
    url: string;
    created_at?: string;
    updated_at?: string;
    similarity?: number;
    kinds: string[];
    topics: string[];
    regions: string[];
    sources: { name: string; url: string | null }[];
    descriptions: string[];
    analysis: string | null;
};

export type SearchParams = {
    q: string;
    topic?: string;
    kind?: string;
    region?: string;
    limit: number;
    offset: number;
};

export type BrowseParams = {
    topic?: string;
    kind?: string;
    source?: string;
    region?: string;
    limit: number;
    offset: number;
};

export type PaginatedResources = {
    items: ResourceRecord[];
    hasMore: boolean;
    offset: number;
    limit: number;
};

export const VALID_KINDS = new Set<string>(KINDS);

export function isValidKind(kind: string | undefined): kind is KindValue {
    return kind !== undefined && VALID_KINDS.has(kind);
}

export async function searchResources(
    db: pg.Pool | pg.Client,
    params: SearchParams,
): Promise<PaginatedResources> {
    const { q, topic, kind, region, limit, offset } = params;

    try {
        const embText = region ? `${q} ${region}` : q;
        const vecs = await embed([embText]);
        const vec = `[${vecs[0].join(',')}]`;

        let sql = `
      SELECT r.id, r.name, r.url, r.updated_at,
             1 - (r.embedding <=> $1::vector) AS similarity
      FROM resources r
      WHERE r.embedding IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))
    `;
        const queryParams: unknown[] = [vec];
        let paramIdx = 2;

        if (topic) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_topics rt WHERE rt.resource_id = r.id AND rt.topic = $${paramIdx})`;
            queryParams.push(topic);
            paramIdx++;
        }
        if (kind) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_kinds rk WHERE rk.resource_id = r.id AND rk.kind = $${paramIdx})`;
            queryParams.push(kind);
            paramIdx++;
        }
        if (region) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_regions rr WHERE rr.resource_id = r.id AND rr.region = $${paramIdx})`;
            queryParams.push(region);
            paramIdx++;
        }

        sql += ` ORDER BY r.embedding <=> $1::vector LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        queryParams.push(limit + 1, offset);

        const { rows } = await db.query(sql, queryParams);
        return buildPaginatedResult(db, rows as BaseRow[], offset, limit);
    } catch {
        let sql = `SELECT r.id, r.name, r.url, r.updated_at,
            GREATEST(similarity(r.name, $1), ts_rank(r.fts, plainto_tsquery('english', $1))) AS similarity
     FROM resources r
     WHERE (r.name % $1 OR r.fts @@ plainto_tsquery('english', $1))
       AND NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))`;
        const queryParams: unknown[] = [q];
        let paramIdx = 2;

        if (topic) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_topics rt WHERE rt.resource_id = r.id AND rt.topic = $${paramIdx})`;
            queryParams.push(topic);
            paramIdx++;
        }
        if (kind) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_kinds rk WHERE rk.resource_id = r.id AND rk.kind = $${paramIdx})`;
            queryParams.push(kind);
            paramIdx++;
        }
        if (region) {
            sql += ` AND EXISTS (SELECT 1 FROM resource_regions rr WHERE rr.resource_id = r.id AND rr.region = $${paramIdx})`;
            queryParams.push(region);
            paramIdx++;
        }

        sql += ` ORDER BY similarity DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        queryParams.push(limit + 1, offset);

        const { rows } = await db.query(sql, queryParams);
        return buildPaginatedResult(db, rows as BaseRow[], offset, limit);
    }
}

export async function browseResources(
    db: pg.Pool | pg.Client,
    params: BrowseParams,
): Promise<PaginatedResources> {
    const { topic, kind, source, region, limit, offset } = params;

    let sql = 'SELECT r.id, r.name, r.url, r.updated_at FROM resources r';
    const joins: string[] = [];
    const wheres: string[] = [
        'NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN (\'suspect\', \'dead\'))',
    ];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (topic) {
        joins.push('JOIN resource_topics rt ON rt.resource_id = r.id');
        wheres.push(`rt.topic = $${paramIdx}`);
        queryParams.push(topic);
        paramIdx++;
    }
    if (kind) {
        joins.push('JOIN resource_kinds rk ON rk.resource_id = r.id');
        wheres.push(`rk.kind = $${paramIdx}`);
        queryParams.push(kind);
        paramIdx++;
    }
    if (source) {
        joins.push('JOIN resource_sources rs ON rs.resource_id = r.id');
        wheres.push(`rs.source = $${paramIdx}`);
        queryParams.push(source);
        paramIdx++;
    }
    if (region) {
        joins.push('JOIN resource_regions rr ON rr.resource_id = r.id');
        wheres.push(`rr.region = $${paramIdx}`);
        queryParams.push(region);
        paramIdx++;
    }

    if (joins.length) sql += ` ${joins.join(' ')}`;
    if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ` ORDER BY r.name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    queryParams.push(limit + 1, offset);

    const { rows } = await db.query(sql, queryParams);
    return buildPaginatedResult(db, rows as BaseRow[], offset, limit);
}

export async function getRecentResources(
    db: pg.Pool | pg.Client,
    limit: number,
): Promise<ResourceRecord[]> {
    const { rows } = await db.query(
        `SELECT r.id, r.name, r.url, r.created_at, r.updated_at
         FROM resources r
         WHERE NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead'))
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [limit],
    );
    return enrichResources(db, rows as BaseRow[]);
}

export async function getResourceById(
    db: pg.Pool | pg.Client,
    id: number,
): Promise<ResourceRecord | null> {
    const { rows } = await db.query(
        'SELECT r.id, r.name, r.url, r.created_at, r.updated_at FROM resources r WHERE r.id = $1',
        [id],
    );
    if (!rows.length) return null;
    const [resource] = await enrichResources(db, rows as BaseRow[]);
    return resource;
}

export async function getRelatedResources(
    db: pg.Pool | pg.Client,
    id: number,
    limit: number,
): Promise<ResourceRecord[] | null> {
    const { rows: target } = await db.query('SELECT embedding FROM resources WHERE id = $1', [id]);
    if (!target.length) return null;
    if (!target[0].embedding) return [];

    const { rows } = await db.query(
        `SELECT r.id, r.name, r.url, r.created_at, r.updated_at,
                1 - (r.embedding <=> $1::vector) AS similarity
         FROM resources r
         WHERE r.id != $2 AND r.embedding IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM link_checks lc
             WHERE lc.resource_id = r.id AND lc.status IN ('suspect', 'dead')
           )
         ORDER BY r.embedding <=> $1::vector
         LIMIT $3`,
        [target[0].embedding, id, limit],
    );

    return enrichResources(db, rows as BaseRow[]);
}

export async function getRandomResource(
    db: pg.Pool | pg.Client,
    filters: Omit<BrowseParams, 'limit' | 'offset'> = {},
): Promise<ResourceRecord | null> {
    const { topic, kind, source, region } = filters;

    let sql = 'SELECT r.id, r.name, r.url, r.created_at, r.updated_at FROM resources r';
    const joins: string[] = [];
    const wheres: string[] = [
        'NOT EXISTS (SELECT 1 FROM link_checks lc WHERE lc.resource_id = r.id AND lc.status IN (\'suspect\', \'dead\'))',
    ];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (topic) {
        joins.push('JOIN resource_topics rt ON rt.resource_id = r.id');
        wheres.push(`rt.topic = $${paramIdx}`);
        queryParams.push(topic);
        paramIdx++;
    }
    if (kind) {
        joins.push('JOIN resource_kinds rk ON rk.resource_id = r.id');
        wheres.push(`rk.kind = $${paramIdx}`);
        queryParams.push(kind);
        paramIdx++;
    }
    if (source) {
        joins.push('JOIN resource_sources rs ON rs.resource_id = r.id');
        wheres.push(`rs.source = $${paramIdx}`);
        queryParams.push(source);
        paramIdx++;
    }
    if (region) {
        joins.push('JOIN resource_regions rr ON rr.resource_id = r.id');
        wheres.push(`rr.region = $${paramIdx}`);
        queryParams.push(region);
        paramIdx++;
    }

    if (joins.length) sql += ` ${joins.join(' ')}`;
    if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ' ORDER BY random() LIMIT 1';

    const { rows } = await db.query(sql, queryParams);
    if (!rows.length) return null;
    const [resource] = await enrichResources(db, rows as BaseRow[]);
    return resource;
}

async function buildPaginatedResult(
    db: pg.Pool | pg.Client,
    rows: BaseRow[],
    offset: number,
    limit: number,
): Promise<PaginatedResources> {
    const hasMore = rows.length > limit;
    const items = await enrichResources(db, hasMore ? rows.slice(0, limit) : rows);
    return { items, hasMore, offset, limit };
}

async function enrichResources(
    db: pg.Pool | pg.Client,
    rows: BaseRow[],
): Promise<ResourceRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);

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

    const sourceMap: Record<number, { name: string; url: string | null }[]> = {};
    for (const row of sources.rows) {
        const key = row.resource_id as number;
        if (!sourceMap[key]) sourceMap[key] = [];
        if (!sourceMap[key].some((source) => source.name === row.name)) {
            sourceMap[key].push({ name: row.name as string, url: (row.url as string | null) ?? null });
        }
    }

    return rows.map((row) => ({
        ...row,
        id: ResourceId(row.id),
        kinds: [...new Set(kindMap[row.id] ?? [])],
        topics: [...new Set(topicMap[row.id] ?? [])],
        regions: [...new Set(regionMap[row.id] ?? [])],
        sources: sourceMap[row.id] ?? [],
        descriptions: [...new Set(descMap[row.id] ?? [])],
        analysis: analysisMap[row.id] ?? null,
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
