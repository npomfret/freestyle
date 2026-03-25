import pg from "pg";
import { GoogleGenAI } from "@google/genai";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://freestyle:freestyle@localhost:5433/freestyle";
const MODEL = "gemini-embedding-001";
const BATCH_SIZE = 100;

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set.");
    process.exit(1);
  }

  const genai = new GoogleGenAI({ apiKey });
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Fetch resources without embeddings
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
    console.log("All resources already have embeddings.");
    await db.end();
    return;
  }

  console.log(`Generating embeddings for ${rows.length} resources...`);

  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) =>
      [r.name, r.descriptions, r.topics].filter(Boolean).join(" "),
    );

    const response = await genai.models.embedContent({
      model: MODEL,
      contents: texts,
      config: { outputDimensionality: 768 },
    });

    const embeddings = response.embeddings ?? [];
    for (let j = 0; j < embeddings.length; j++) {
      const vec = embeddings[j].values;
      await db.query(
        "UPDATE resources SET embedding = $1::vector WHERE id = $2",
        [`[${vec!.join(",")}]`, batch[j].id],
      );
    }

    total += batch.length;
    console.log(`  ${total}/${rows.length} done`);
  }

  // Create IVFFlat index if missing
  const { rows: idxRows } = await db.query(
    "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_resources_embedding'",
  );
  if (!idxRows.length) {
    console.log("Creating vector similarity index...");
    await db.query(`
      CREATE INDEX idx_resources_embedding ON resources
      USING hnsw (embedding vector_cosine_ops)
    `);
    console.log("Index created.");
  }

  await db.end();
  console.log(`Done. Embedded ${total} resources.`);
}

main();
