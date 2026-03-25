import pg from "pg";
import { embed } from "./embeddings.js";

// ============================================================
// Tool: check_existing
// ============================================================

export async function checkExisting(
  db: pg.Client,
  args: { url: string },
): Promise<{ inResources: boolean; inQueue: boolean }> {
  const { rows: rRows } = await db.query(
    "SELECT 1 FROM resources WHERE url = $1",
    [args.url],
  );
  const { rows: qRows } = await db.query(
    "SELECT 1 FROM discovery_queue WHERE url = $1",
    [args.url],
  );
  return { inResources: rRows.length > 0, inQueue: qRows.length > 0 };
}

// ============================================================
// Tool: add_resource
// ============================================================

export async function addResource(
  db: pg.Client,
  args: {
    name: string;
    url: string;
    kinds: string[];
    topics: string[];
    description: string;
  },
): Promise<{ id: number; status: "added" | "duplicate" }> {
  // Check for duplicate
  const { rows: existing } = await db.query(
    "SELECT id FROM resources WHERE url = $1",
    [args.url],
  );
  if (existing.length > 0) {
    return { id: existing[0].id, status: "duplicate" };
  }

  // Insert resource
  const { rows } = await db.query(
    "INSERT INTO resources (name, url) VALUES ($1, $2) RETURNING id",
    [args.name, args.url],
  );
  const id: number = rows[0].id;

  // Junction tables
  for (const kind of args.kinds) {
    await db.query(
      "INSERT INTO resource_kinds (resource_id, kind) VALUES ($1, $2)",
      [id, kind],
    );
  }
  for (const topic of args.topics) {
    await db.query(
      "INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)",
      [id, topic],
    );
  }
  if (args.description) {
    await db.query(
      "INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)",
      [id, args.description],
    );
  }
  await db.query(
    "INSERT INTO resource_sources (resource_id, source) VALUES ($1, $2)",
    [id, "discovery-agent"],
  );

  // Generate embedding immediately using local model
  const text = [args.name, args.description, ...args.topics]
    .filter(Boolean)
    .join(" ");
  try {
    const vecs = await embed([text]);
    await db.query(
      "UPDATE resources SET embedding = $1::vector WHERE id = $2",
      [`[${vecs[0].join(",")}]`, id],
    );
  } catch (err) {
    console.error(`  Warning: embedding failed for ${args.url}:`, err);
  }

  // Mark as done in queue if it was queued
  await db.query(
    "UPDATE discovery_queue SET status = 'done', processed_at = now() WHERE url = $1",
    [args.url],
  );

  return { id, status: "added" };
}

// ============================================================
// Tool: fetch_page
// ============================================================

export async function fetchPage(
  args: { url: string },
): Promise<{ content: string; statusCode: number }> {
  try {
    const resp = await fetch(args.url, {
      headers: { "User-Agent": "freestyle-discovery-agent/1.0" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const html = await resp.text();
    // Strip HTML to rough plain text
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[#\w]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Truncate to ~8K chars
    if (text.length > 8000) text = text.slice(0, 8000) + "\n...[truncated]";
    return { content: text, statusCode: resp.status };
  } catch (err) {
    return {
      content: `Error fetching ${args.url}: ${err}`,
      statusCode: 0,
    };
  }
}

// ============================================================
// Tool: queue_items
// ============================================================

export async function queueItems(
  db: pg.Client,
  args: { items: { url: string; label: string; source: string }[] },
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  let skipped = 0;
  for (const item of args.items) {
    try {
      await db.query(
        `INSERT INTO discovery_queue (url, label, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (url) DO NOTHING`,
        [item.url, item.label || "", item.source || ""],
      );
      queued++;
    } catch {
      skipped++;
    }
  }
  return { queued, skipped };
}

// ============================================================
// Tool: get_queue
// ============================================================

export async function getQueue(
  db: pg.Client,
  args: { limit: number },
): Promise<{ id: number; url: string; label: string; source: string }[]> {
  const { rows } = await db.query(
    `SELECT id, url, label, source FROM discovery_queue
     WHERE status = 'pending'
     ORDER BY created_at
     LIMIT $1`,
    [args.limit || 10],
  );
  // Mark as processing
  if (rows.length > 0) {
    const ids = rows.map((r: { id: number }) => r.id);
    await db.query(
      "UPDATE discovery_queue SET status = 'processing' WHERE id = ANY($1)",
      [ids],
    );
  }
  return rows;
}
