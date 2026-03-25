import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { createClient } from "./lib/db.js";
import { embed } from "./lib/embeddings.js";
import { log } from "./lib/logger.js";
import type { ResourceId, Url, Topic, Kind } from "./lib/types.js";
import { ResourceId as mkResourceId, Url as mkUrl } from "./lib/types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  log.error("missing api key", { key: "GEMINI_API_KEY" });
  process.exit(1);
}

const MODEL = "gemini-2.5-flash";
const MAX_TURNS = 20;

const TOPIC_LABELS = [
  "ai-ml", "agriculture", "audio", "bioinformatics", "blockchain",
  "chemistry", "climate", "cybersecurity", "data-science", "developer",
  "drug-discovery", "finance", "food", "games", "geospatial", "geoscience",
  "government", "health", "humanities", "journalism", "law", "maritime",
  "materials", "neuroscience", "nlp", "open-science", "remote-sensing",
  "robotics", "semantic-web", "social-science", "space", "sports", "transport",
];

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const db = createClient();

// ============================================================
// Tool declarations
// ============================================================

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "fetch_page",
    description: "Fetch and read a web page to check if the resource is still live, what it offers, and whether anything has changed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "update_resource",
    description: "Update a resource's metadata after rechecking it.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "The correct, human-readable name for this resource (e.g. 'CLERC', 'OpenWeatherMap', 'USGS Earthquake Catalog'). Fix it if the current name is wrong, garbled, or just an emoji/symbol.",
        },
        description: {
          type: Type.STRING,
          description: "New one-sentence description of what this resource provides. Write this even if one already exists — make it accurate and current.",
        },
        topics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: `Updated topic labels (1-4) from: ${TOPIC_LABELS.join(", ")}. Keep existing ones if still accurate, adjust if needed.`,
        },
        is_alive: {
          type: Type.BOOLEAN,
          description: "true if the resource is still accessible and working, false if dead/broken/gone",
        },
        notes: {
          type: Type.STRING,
          description: "Brief notes about what you found: any changes, issues, or notable details",
        },
      },
      required: ["description", "is_alive", "notes"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for more information about this resource if the page itself doesn't load or is unclear.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" },
      },
      required: ["query"],
    },
  },
];

// ============================================================
// Tool execution
// ============================================================

interface ResourceRow {
  id: ResourceId;
  name: string;
  url: Url;
  kinds: Kind[];
  topics: Topic[];
  descriptions: string[];
}

let currentResource: ResourceRow | null = null;

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "fetch_page": {
      const url = args.url as string;
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "freestyle-recheck-agent/1.0" },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        let text = await resp.text();
        text = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&[#\w]+;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 8000) text = text.slice(0, 8000) + "\n...[truncated]";
        return { content: text, statusCode: resp.status };
      } catch (err) {
        return { content: `Error: ${err}`, statusCode: 0 };
      }
    }

    case "web_search": {
      try {
        const response = await genai.models.generateContent({
          model: MODEL,
          contents: `Search for: ${args.query}`,
          config: { tools: [{ googleSearch: {} }] },
        });
        return { results: response.text ?? "No results." };
      } catch (err) {
        return { results: `Search failed: ${err}` };
      }
    }

    case "update_resource": {
      if (!currentResource) return { error: "No current resource" };
      const r = currentResource;
      const newName = args.name as string | undefined;
      const description = args.description as string;
      const isAlive = args.is_alive as boolean;
      const notes = args.notes as string;
      const topics = args.topics as string[] | undefined;

      // Update name if provided
      if (newName && newName !== r.name) {
        await db.query("UPDATE resources SET name = $1 WHERE id = $2", [newName, r.id]);
      }

      // Update description: clear old, insert new
      await db.query("DELETE FROM resource_descriptions WHERE resource_id = $1", [r.id]);
      if (description) {
        await db.query(
          "INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)",
          [r.id, description],
        );
      }

      // Update topics if provided
      if (topics && topics.length > 0) {
        await db.query("DELETE FROM resource_topics WHERE resource_id = $1", [r.id]);
        for (const t of topics) {
          await db.query(
            "INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)",
            [r.id, t],
          );
        }
      }

      // Update link_checks
      await db.query(
        `INSERT INTO link_checks (resource_id, checked_at, status_code, is_alive, notes)
         VALUES ($1, now(), NULL, $2, $3)
         ON CONFLICT (resource_id) DO UPDATE
         SET checked_at = now(), is_alive = $2, notes = $3`,
        [r.id, isAlive, notes],
      );

      // Re-generate embedding with new description using local model
      const embText = [newName ?? r.name, description, ...(topics ?? r.topics)].filter(Boolean).join(" ");
      try {
        const vecs = await embed([embText]);
        await db.query(
          "UPDATE resources SET embedding = $1::vector, updated_at = now() WHERE id = $2",
          [`[${vecs[0].join(",")}]`, r.id],
        );
      } catch {
        // Embedding update is best-effort
      }

      return { status: "updated", id: r.id, is_alive: isAlive };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ============================================================
// Get next resource to check
// ============================================================

async function getNextResource(): Promise<ResourceRow | null> {
  // Resources never checked first (ordered by id), then oldest checked
  // Skip resources already marked dead
  const { rows } = await db.query(`
    SELECT r.id, r.name, r.url
    FROM resources r
    LEFT JOIN link_checks lc ON lc.resource_id = r.id
    WHERE lc.is_alive IS DISTINCT FROM false
    ORDER BY lc.checked_at ASC NULLS FIRST, r.id
    LIMIT 1
  `);

  if (!rows.length) return null;

  const r = rows[0];

  // Fetch kinds, topics, descriptions
  const [kinds, topics, descs] = await Promise.all([
    db.query("SELECT kind FROM resource_kinds WHERE resource_id = $1", [r.id]),
    db.query("SELECT topic FROM resource_topics WHERE resource_id = $1", [r.id]),
    db.query("SELECT description FROM resource_descriptions WHERE resource_id = $1", [r.id]),
  ]);

  return {
    id: mkResourceId(r.id),
    name: r.name,
    url: mkUrl(r.url),
    kinds: kinds.rows.map((k: { kind: string }) => k.kind as Kind),
    topics: topics.rows.map((t: { topic: string }) => t.topic as Topic),
    descriptions: descs.rows.map((d: { description: string }) => d.description),
  };
}

// ============================================================
// Recheck one resource
// ============================================================

async function recheckOne(resource: ResourceRow): Promise<void> {
  currentResource = resource;

  const systemPrompt = `You are a quality-check agent. Your job is to recheck a single resource in our catalog to verify it's still alive, update its description, and note any changes.

Resource to check:
- Name: ${resource.name}
- URL: ${resource.url}
- Current kinds: ${resource.kinds.join(", ") || "none"}
- Current topics: ${resource.topics.join(", ") || "none"}
- Current description: ${resource.descriptions[0] || "none"}

Steps:
1. Use fetch_page to visit the URL and read what's there
2. If the page doesn't load, use web_search to find out if it moved, was renamed, or shut down
3. Call update_resource with:
   - name: the correct human-readable name (ALWAYS fix it if current name is garbled, an emoji, a symbol like "![", or otherwise wrong)
   - A clear, accurate one-sentence description (write a new one even if one exists)
   - Updated topic labels if needed
   - is_alive: true/false
   - notes: what you found (e.g. "still active", "moved to new URL", "returns 404", "now requires paid plan", etc.)

Be concise. One fetch, one update. Done.`;

  const contents: Content[] = [
    { role: "user", parts: [{ text: systemPrompt }] },
  ];

  const rlog = log.child({ agent: "recheck", resourceId: resource.id, url: resource.url });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await genai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) break;

    contents.push(candidate.content);

    const textParts = candidate.content.parts.filter((p: Part) => p.text);
    for (const part of textParts) {
      rlog.debug("agent text", { text: part.text });
    }

    const functionCalls = candidate.content.parts.filter((p: Part) => p.functionCall);
    if (functionCalls.length === 0) break;

    const responseParts: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const toolName = fc.name!;
      const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

      rlog.info("tool call", { tool: toolName, args: toolArgs });

      const result = await executeTool(toolName, toolArgs);
      rlog.debug("tool result", { tool: toolName, result });

      responseParts.push({
        functionResponse: {
          name: toolName,
          response: { result },
          id: fc.id,
        },
      });

      // If we just updated, we're done with this resource
      if (toolName === "update_resource") return;
    }

    contents.push({ role: "user", parts: responseParts });
  }
}

// ============================================================
// Main loop
// ============================================================

async function getResourceByUrl(url: string): Promise<ResourceRow | null> {
  const { rows } = await db.query("SELECT id, name, url FROM resources WHERE url = $1", [url]);
  if (!rows.length) return null;

  const r = rows[0];
  const [kinds, topics, descs] = await Promise.all([
    db.query("SELECT kind FROM resource_kinds WHERE resource_id = $1", [r.id]),
    db.query("SELECT topic FROM resource_topics WHERE resource_id = $1", [r.id]),
    db.query("SELECT description FROM resource_descriptions WHERE resource_id = $1", [r.id]),
  ]);

  return {
    id: mkResourceId(r.id),
    name: r.name,
    url: mkUrl(r.url),
    kinds: kinds.rows.map((k: { kind: string }) => k.kind as Kind),
    topics: topics.rows.map((t: { topic: string }) => t.topic as Topic),
    descriptions: descs.rows.map((d: { description: string }) => d.description),
  };
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const isSingleUrl = arg?.startsWith("http");
  await db.connect();

  if (isSingleUrl) {
    const resource = await getResourceByUrl(arg);
    if (!resource) {
      log.error("resource not found", { url: arg });
      await db.end();
      process.exit(1);
    }
    log.info("rechecking single resource", { id: resource.id, name: resource.name, url: resource.url });
    try {
      await recheckOne(resource);
    } catch (err) {
      log.error("recheck failed", { id: resource.id, url: resource.url, error: String(err) });
      await db.query(
        `INSERT INTO link_checks (resource_id, checked_at, is_alive, notes)
         VALUES ($1, now(), false, $2)
         ON CONFLICT (resource_id) DO UPDATE
         SET checked_at = now(), is_alive = false, notes = $2`,
        [resource.id, `Agent error: ${err}`],
      );
    }
  } else {
    const count = Number(arg) || 10;
    log.info("recheck started", { count });

    for (let i = 0; i < count; i++) {
      const resource = await getNextResource();
      if (!resource) {
        log.info("no more resources to check");
        break;
      }

      log.info("checking resource", { index: i + 1, total: count, id: resource.id, name: resource.name, url: resource.url });

      try {
        await recheckOne(resource);
      } catch (err) {
        log.error("recheck failed", { id: resource.id, url: resource.url, error: String(err) });
        await db.query(
          `INSERT INTO link_checks (resource_id, checked_at, is_alive, notes)
           VALUES ($1, now(), false, $2)
           ON CONFLICT (resource_id) DO UPDATE
           SET checked_at = now(), is_alive = false, notes = $2`,
          [resource.id, `Agent error: ${err}`],
        );
      }
    }
  }

  // Print summary
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_alive = true) AS alive,
      COUNT(*) FILTER (WHERE is_alive = false) AS dead,
      COUNT(*) AS total
    FROM link_checks
  `);
  log.info("recheck complete", { alive: Number(rows[0].alive), dead: Number(rows[0].dead), total: Number(rows[0].total) });

  await db.end();
}

main();
