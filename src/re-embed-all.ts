import 'dotenv/config';
import { createPool } from './lib/db.js';
import { embedResources } from './lib/embed-resources.js';
import { log } from './lib/logger.js';

async function main(): Promise<void> {
    const db = createPool();

    // Clear all embeddings so they get regenerated
    log.info('clearing existing embeddings');
    await db.query('UPDATE resources SET embedding = NULL');

    const embedded = await embedResources(db, { label: 're-embed', createIndex: true });
    await db.end();
    log.info('done', { embedded });
    process.exit(0);
}

main();
