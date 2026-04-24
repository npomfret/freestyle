import 'dotenv/config';
import pg from 'pg';
import { log } from './logger.js';

const DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://freestyle:freestyle@localhost:5433/freestyle';

log.info('DATABASE_URL being used:', DATABASE_URL);

/** Connection pool for long-running processes (server, agents). */
export function createPool(): pg.Pool {
    return new pg.Pool({ connectionString: DATABASE_URL });
}

/** Single client for transactional scripts (seed, migrate). */
export function createClient(): pg.Client {
    return new pg.Client({ connectionString: DATABASE_URL });
}
