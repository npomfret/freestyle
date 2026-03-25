import 'dotenv/config';
import { createPool } from './lib/db.js';
import { embed } from './lib/embeddings.js';
import { log } from './lib/logger.js';

async function search(query: string): Promise<void> {
    const db = createPool();

    const vecs = await embed([query]);
    const vec = '[' + vecs[0].join(',') + ']';

    const { rows } = await db.query(
        `SELECT r.name, r.url,
            1 - (r.embedding <=> $1::vector) AS similarity
     FROM resources r
     WHERE r.embedding IS NOT NULL
     ORDER BY r.embedding <=> $1::vector
     LIMIT 15`,
        [vec],
    );

    log.info('search complete', { query, results: rows.length });
    for (const row of rows) {
        log.info('result', {
            similarity: Number((row.similarity as number).toFixed(3)),
            name: row.name,
            url: row.url,
        });
    }

    await db.end();
    process.exit(0);
}

const query = process.argv[2] ?? 'commodity supply chain tracking';
search(query);
