import 'dotenv/config';
import pg from 'pg';
import { embed } from './lib/embeddings.js';
import { log } from './lib/logger.js';

const DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://freestyle:freestyle@localhost:5433/freestyle';
const BATCH_SIZE = 50;

async function main(): Promise<void> {
    const db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();

    const { rows } = await db.query(`
    SELECT r.id, r.name, r.url,
           COALESCE(string_agg(DISTINCT rd.description, ' '), '') AS descriptions,
           COALESCE(string_agg(DISTINCT rt.topic, ' '), '') AS topics
    FROM resources r
    LEFT JOIN resource_descriptions rd ON rd.resource_id = r.id
    LEFT JOIN resource_topics rt ON rt.resource_id = r.id
    WHERE r.embedding IS NULL
    GROUP BY r.id, r.name, r.url
    ORDER BY r.id
  `);

    if (!rows.length) {
        log.info('nothing to embed', { reason: 'all resources already have embeddings' });
        await db.end();
        return;
    }

    log.info('embedding started', { total: rows.length, model: 'local' });

    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const texts = batch.map((r) => [r.name, r.descriptions, r.topics].filter(Boolean).join(' '));

        const vecs = await embed(texts);

        for (let j = 0; j < vecs.length; j++) {
            await db.query(
                'UPDATE resources SET embedding = $1::vector WHERE id = $2',
                [`[${vecs[j].join(',')}]`, batch[j].id],
            );
        }

        total += batch.length;
        if (total % 500 === 0 || total === rows.length) {
            log.info('embedding progress', { done: total, total: rows.length });
        }
    }

    // Create HNSW index if missing
    const { rows: idxRows } = await db.query(
        'SELECT 1 FROM pg_indexes WHERE indexname = \'idx_resources_embedding\'',
    );
    if (!idxRows.length) {
        log.info('creating vector similarity index');
        await db.query(`
      CREATE INDEX idx_resources_embedding ON resources
      USING hnsw (embedding vector_cosine_ops)
    `);
        log.info('index created');
    }

    await db.end();
    log.info('embedding complete', { embedded: total });
    process.exit(0);
}

main();
