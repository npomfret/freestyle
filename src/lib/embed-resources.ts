import type pg from 'pg';
import { embed } from './embeddings.js';
import { log } from './logger.js';

interface EmbedOptions {
    batchSize?: number;
    createIndex?: boolean;
    label?: string;
}

/**
 * Embed all resources that have NULL embeddings.
 * Shared by generate-embeddings.ts and re-embed-all.ts.
 */
export async function embedResources(
    db: pg.Pool | pg.Client,
    opts: EmbedOptions = {},
): Promise<number> {
    const batchSize = opts.batchSize ?? 50;
    const createIndex = opts.createIndex ?? true;
    const label = opts.label ?? 'embed';

    const { rows } = await db.query(`
    SELECT r.id, r.name, r.url,
           COALESCE(string_agg(DISTINCT rd.description, ' '), '') AS descriptions,
           COALESCE(string_agg(DISTINCT rt.topic, ' '), '') AS topics,
           COALESCE(string_agg(DISTINCT rr.region, ' '), '') AS regions
    FROM resources r
    LEFT JOIN resource_descriptions rd ON rd.resource_id = r.id
    LEFT JOIN resource_topics rt ON rt.resource_id = r.id
    LEFT JOIN resource_regions rr ON rr.resource_id = r.id
    WHERE r.embedding IS NULL
    GROUP BY r.id, r.name, r.url
    ORDER BY r.id
  `);

    if (!rows.length) {
        log.info('nothing to embed', { label, reason: 'all resources already have embeddings' });
        return 0;
    }

    log.info('embedding started', { label, total: rows.length, model: 'local' });

    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const texts = batch.map((r) => [r.name, r.descriptions, r.topics, r.regions].filter(Boolean).join(' '));

        const vecs = await embed(texts);

        for (let j = 0; j < vecs.length; j++) {
            await db.query(
                'UPDATE resources SET embedding = $1::vector WHERE id = $2',
                [`[${vecs[j].join(',')}]`, batch[j].id],
            );
        }

        total += batch.length;
        if (total % 500 === 0 || total === rows.length) {
            log.info('embedding progress', { label, done: total, total: rows.length });
        }
    }

    if (createIndex) {
        log.info('ensuring vector index exists', { label });
        await db.query(`
      CREATE INDEX IF NOT EXISTS idx_resources_embedding ON resources
      USING hnsw (embedding vector_cosine_ops)
    `);
    }

    log.info('embedding complete', { label, embedded: total });
    return total;
}
