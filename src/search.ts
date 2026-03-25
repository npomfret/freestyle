import "dotenv/config";
import pg from "pg";
import { embed } from "./lib/embeddings.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://freestyle:freestyle@localhost:5433/freestyle";

async function search(query: string): Promise<void> {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();

  const vecs = await embed([query]);
  const vec = "[" + vecs[0].join(",") + "]";

  const { rows } = await db.query(
    `SELECT r.name, r.url,
            1 - (r.embedding <=> $1::vector) AS similarity
     FROM resources r
     WHERE r.embedding IS NOT NULL
     ORDER BY r.embedding <=> $1::vector
     LIMIT 15`,
    [vec],
  );

  console.log(`\nSemantic search: "${query}"\n`);
  for (const row of rows) {
    const sim = (row.similarity as number).toFixed(3);
    console.log(`  ${sim}  ${row.name}`);
    console.log(`         ${row.url}`);
  }

  await db.end();
  process.exit(0);
}

const query = process.argv[2] ?? "commodity supply chain tracking";
search(query);
