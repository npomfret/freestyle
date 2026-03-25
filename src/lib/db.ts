import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://freestyle:freestyle@localhost:5433/freestyle';

export function createClient(): pg.Client {
    return new pg.Client({ connectionString: DATABASE_URL });
}
