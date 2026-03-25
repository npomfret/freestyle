import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";
import { log } from "./lib/logger.js";

const ROOT = resolve(import.meta.dirname, "..");
const CATALOG_JSON = resolve(ROOT, "catalog.json");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://freestyle:freestyle@localhost:5433/freestyle";

interface CatalogResource {
  name: string;
  url: string;
  kinds: string[];
  topics: string[];
  sources: string[];
  directDescriptions: string[];
}

interface CatalogProject {
  name: string;
  repoUrl: string;
  description: string;
  labels: string[];
  listBased: boolean;
}

interface Catalog {
  resources: CatalogResource[];
  projects: CatalogProject[];
}

async function seed(client: pg.Client, catalog: Catalog): Promise<void> {
  // --- Projects (full replace) ---
  await client.query("DELETE FROM project_labels");
  await client.query("DELETE FROM projects");

  for (const p of catalog.projects) {
    const { rows } = await client.query(
      `INSERT INTO projects (name, repo_url, description, list_based)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [p.name, p.repoUrl, p.description, p.listBased],
    );
    const pid = rows[0].id;
    for (const label of p.labels) {
      await client.query(
        "INSERT INTO project_labels (project_id, label) VALUES ($1, $2)",
        [pid, label],
      );
    }
  }

  // --- Resources (upsert by URL to preserve IDs) ---
  const { rows: existingRows } = await client.query(
    "SELECT url, id FROM resources",
  );
  const existing = new Map<string, number>(
    existingRows.map((r: { url: string; id: number }) => [r.url, r.id]),
  );

  const newUrls = new Set(catalog.resources.map((r) => r.url));
  const goneUrls = [...existing.keys()].filter((u) => !newUrls.has(u));

  if (goneUrls.length) {
    await client.query("DELETE FROM resources WHERE url = ANY($1)", [goneUrls]);
  }

  // Clear junction tables for surviving resources
  await client.query("DELETE FROM resource_kinds");
  await client.query("DELETE FROM resource_topics");
  await client.query("DELETE FROM resource_sources");
  await client.query("DELETE FROM resource_descriptions");

  for (const r of catalog.resources) {
    let rid: number;
    if (existing.has(r.url)) {
      rid = existing.get(r.url)!;
      await client.query(
        "UPDATE resources SET name = $1, updated_at = now() WHERE id = $2",
        [r.name, rid],
      );
    } else {
      const { rows } = await client.query(
        "INSERT INTO resources (name, url) VALUES ($1, $2) RETURNING id",
        [r.name, r.url],
      );
      rid = rows[0].id;
    }

    for (const kind of r.kinds) {
      await client.query(
        "INSERT INTO resource_kinds (resource_id, kind) VALUES ($1, $2)",
        [rid, kind],
      );
    }
    for (const topic of r.topics) {
      await client.query(
        "INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)",
        [rid, topic],
      );
    }
    for (const source of r.sources) {
      await client.query(
        "INSERT INTO resource_sources (resource_id, source) VALUES ($1, $2)",
        [rid, source],
      );
    }
    for (const desc of r.directDescriptions) {
      await client.query(
        "INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)",
        [rid, desc],
      );
    }
  }

  // Summary
  const resourceCount = (await client.query("SELECT COUNT(*) FROM resources")).rows[0].count;
  const projectCount = (await client.query("SELECT COUNT(*) FROM projects")).rows[0].count;
  const topicCount = (await client.query("SELECT COUNT(DISTINCT topic) FROM resource_topics")).rows[0].count;
  log.info("seed complete", { resources: Number(resourceCount), projects: Number(projectCount), topics: Number(topicCount) });
}

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(CATALOG_JSON, "utf-8");
  } catch {
    log.error("catalog not found", { path: CATALOG_JSON, hint: "run npm run generate first" });
    process.exit(1);
  }

  const catalog: Catalog = JSON.parse(raw);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await seed(client, catalog);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main();
