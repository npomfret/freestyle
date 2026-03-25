import 'dotenv/config';
import { createPool } from './lib/db.js';
import { embedResources } from './lib/embed-resources.js';
import { log } from './lib/logger.js';

async function main(): Promise<void> {
    const db = createPool();
    const embedded = await embedResources(db, { label: 'generate', createIndex: true });
    await db.end();
    log.info('done', { embedded });
    process.exit(0);
}

main();
