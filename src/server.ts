import "dotenv/config";
import express from "express";
import cors from "cors";
import { resolve } from "path";
import { createClient } from "./lib/db.js";
import { embed } from "./lib/embeddings.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json());

const db = createClient();

// ============================================================
// API Routes
// ============================================================

// Stats
app.get("/api/stats", async (_req, res) => {
  const resources = (await db.query("SELECT COUNT(*) FROM resources")).rows[0].count;
  const apis = (await db.query("SELECT COUNT(*) FROM resource_kinds WHERE kind = 'api'")).rows[0].count;
  const datasets = (await db.query("SELECT COUNT(*) FROM resource_kinds WHERE kind = 'dataset'")).rows[0].count;
  const topics = (await db.query("SELECT COUNT(DISTINCT topic) FROM resource_topics")).rows[0].count;
  const withEmbeddings = (await db.query("SELECT COUNT(*) FROM resources WHERE embedding IS NOT NULL")).rows[0].count;
  res.json({
    resources: Number(resources),
    apis: Number(apis),
    datasets: Number(datasets),
    topics: Number(topics),
    withEmbeddings: Number(withEmbeddings),
  });
});

// Topic list with counts
app.get("/api/topics", async (_req, res) => {
  const { rows } = await db.query(
    "SELECT topic, COUNT(*) AS count FROM resource_topics GROUP BY topic ORDER BY count DESC",
  );
  res.json(rows.map((r) => ({ topic: r.topic, count: Number(r.count) })));
});

// Semantic search
app.get("/api/search", async (req, res) => {
  const q = req.query.q as string;
  const topic = req.query.topic as string | undefined;
  const kind = req.query.kind as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  if (!q) {
    res.status(400).json({ error: "q parameter required" });
    return;
  }

  // Semantic search using local embedding model
  try {
    const vecs = await embed([q]);
    const vec = "[" + vecs[0].join(",") + "]";

    let sql = `
      SELECT r.id, r.name, r.url,
             1 - (r.embedding <=> $1::vector) AS similarity
      FROM resources r
      WHERE r.embedding IS NOT NULL
    `;
    const params: unknown[] = [vec];
    let paramIdx = 2;

    if (topic) {
      sql += ` AND EXISTS (SELECT 1 FROM resource_topics rt WHERE rt.resource_id = r.id AND rt.topic = $${paramIdx})`;
      params.push(topic);
      paramIdx++;
    }
    if (kind) {
      sql += ` AND EXISTS (SELECT 1 FROM resource_kinds rk WHERE rk.resource_id = r.id AND rk.kind = $${paramIdx})`;
      params.push(kind);
      paramIdx++;
    }

    sql += ` ORDER BY r.embedding <=> $1::vector LIMIT $${paramIdx}`;
    params.push(limit);

    const { rows } = await db.query(sql, params);
    const enriched = await enrichResources(rows);
    res.json(enriched);
    return;
  } catch {
    // Fall through to text search
  }

  // Fallback: trigram + FTS
  const { rows } = await db.query(
    `SELECT r.id, r.name, r.url,
            GREATEST(similarity(r.name, $1), ts_rank(r.fts, plainto_tsquery('english', $1))) AS similarity
     FROM resources r
     WHERE r.name % $1 OR r.fts @@ plainto_tsquery('english', $1)
     ORDER BY similarity DESC
     LIMIT $2`,
    [q, limit],
  );
  const enriched = await enrichResources(rows);
  res.json(enriched);
});

// Browse resources with filtering
app.get("/api/resources", async (req, res) => {
  const topic = req.query.topic as string | undefined;
  const kind = req.query.kind as string | undefined;
  const source = req.query.source as string | undefined;
  const offset = Number(req.query.offset) || 0;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let sql = "SELECT r.id, r.name, r.url FROM resources r";
  const joins: string[] = [];
  const wheres: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (topic) {
    joins.push(`JOIN resource_topics rt ON rt.resource_id = r.id`);
    wheres.push(`rt.topic = $${paramIdx}`);
    params.push(topic);
    paramIdx++;
  }
  if (kind) {
    joins.push(`JOIN resource_kinds rk ON rk.resource_id = r.id`);
    wheres.push(`rk.kind = $${paramIdx}`);
    params.push(kind);
    paramIdx++;
  }
  if (source) {
    joins.push(`JOIN resource_sources rs ON rs.resource_id = r.id`);
    wheres.push(`rs.source = $${paramIdx}`);
    params.push(source);
    paramIdx++;
  }

  if (joins.length) sql += " " + joins.join(" ");
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += ` ORDER BY r.name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);

  const { rows } = await db.query(sql, params);
  const enriched = await enrichResources(rows);
  res.json(enriched);
});

// Single resource detail
app.get("/api/resources/:id", async (req, res) => {
  const { rows } = await db.query(
    "SELECT r.id, r.name, r.url, r.created_at, r.updated_at FROM resources r WHERE r.id = $1",
    [req.params.id],
  );
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const enriched = await enrichResources(rows);
  res.json(enriched[0]);
});

// ============================================================
// Helpers
// ============================================================

async function enrichResources(
  rows: { id: number; name: string; url: string; similarity?: number }[],
) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [kinds, topics, sources, descs] = await Promise.all([
    db.query("SELECT resource_id, kind FROM resource_kinds WHERE resource_id = ANY($1)", [ids]),
    db.query("SELECT resource_id, topic FROM resource_topics WHERE resource_id = ANY($1)", [ids]),
    db.query("SELECT resource_id, source FROM resource_sources WHERE resource_id = ANY($1)", [ids]),
    db.query("SELECT resource_id, description FROM resource_descriptions WHERE resource_id = ANY($1)", [ids]),
  ]);

  const kindMap = groupBy(kinds.rows, "resource_id", "kind");
  const topicMap = groupBy(topics.rows, "resource_id", "topic");
  const sourceMap = groupBy(sources.rows, "resource_id", "source");
  const descMap = groupBy(descs.rows, "resource_id", "description");

  return rows.map((r) => ({
    ...r,
    kinds: [...new Set(kindMap[r.id] ?? [])],
    topics: [...new Set(topicMap[r.id] ?? [])],
    sources: [...new Set(sourceMap[r.id] ?? [])],
    descriptions: [...new Set(descMap[r.id] ?? [])],
  }));
}

function groupBy(
  rows: Record<string, unknown>[],
  keyField: string,
  valueField: string,
): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  for (const row of rows) {
    const key = row[keyField] as number;
    if (!map[key]) map[key] = [];
    map[key].push(row[valueField] as string);
  }
  return map;
}

// ============================================================
// Serve static frontend in production
// ============================================================

const distPath = resolve(import.meta.dirname, "../web/dist");
app.use(express.static(distPath));
app.get("/{*path}", (_req, res) => {
  res.sendFile(resolve(distPath, "index.html"));
});

// ============================================================
// Start
// ============================================================

async function start() {
  await db.connect();
  app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
  });
}

start();
