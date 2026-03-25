import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from './lib/db.js';
import { log } from './lib/logger.js';

const DB_DIR = resolve(import.meta.dirname, '../db');

async function main(): Promise<void> {
    const db = createClient();
    await db.connect();

    // Run schema.sql first, then all migrate-*.sql files in sorted order
    const schemaPath = resolve(DB_DIR, 'schema.sql');
    log.info('applying schema', { file: 'db/schema.sql' });
    await db.query(readFileSync(schemaPath, 'utf-8'));

    const migrations = readdirSync(DB_DIR)
        .filter((f) => f.startsWith('migrate-') && f.endsWith('.sql'))
        .sort();

    for (const file of migrations) {
        log.info('applying migration', { file: `db/${file}` });
        const sql = readFileSync(resolve(DB_DIR, file), 'utf-8');
        await db.query(sql);
    }

    log.info('migrations complete', { count: migrations.length + 1 });
    await db.end();
}

main();
