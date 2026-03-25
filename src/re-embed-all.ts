import "dotenv/config";
import { createClient } from "./lib/db.js";
import { embed } from "./lib/embeddings.js";

const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const db = createClient();
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
    console.log("All resources already have embeddings.");
    await db.end();
    return;
  }

  console.log(`Re-embedding ${rows.length} resources with local model...\n`);

  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) =>
      [r.name, r.descriptions, r.topics].filter(Boolean).join(" "),
    );

    const vecs = await embed(texts);

    for (let j = 0; j < vecs.length; j++) {
      await db.query(
        "UPDATE resources SET embedding = $1::vector WHERE id = $2",
        [`[${vecs[j].join(",")}]`, batch[j].id],
      );
    }

    total += batch.length;
    process.stdout.write(`\r  ${total}/${rows.length}`);
  }

  console.log("\n\nCreating HNSW index...");
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_resources_embedding ON resources
    USING hnsw (embedding vector_cosine_ops)
  `);

  console.log(`Done. Embedded ${total} resources.`);
  await db.end();
  process.exit(0);
}

main();
