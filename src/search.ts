import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://freestyle:freestyle@localhost:5433/freestyle";
const MODEL = "gemini-embedding-001";

async function search(query: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set.");
    process.exit(1);
  }

  const genai = new GoogleGenAI({ apiKey });
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Embed the query
  const r = await genai.models.embedContent({
    model: MODEL,
    contents: [query],
    config: { outputDimensionality: 768 },
  });
  const vec = "[" + r.embeddings![0].values!.join(",") + "]";

  // Search
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
}

const query = process.argv[2] ?? "commodity supply chain tracking";
search(query);
