import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { createClient } from "./lib/db.js";
import {
  checkExisting,
  addResource,
  fetchPage,
  queueItems,
  getQueue,
} from "./lib/agent-tools.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY not set.");
  process.exit(1);
}

const MODEL = "gemini-2.5-flash";
const MAX_TURNS = 50;

const TOPIC_LABELS = [
  "ai-ml", "agriculture", "audio", "bioinformatics", "blockchain",
  "chemistry", "climate", "cybersecurity", "data-science", "developer",
  "drug-discovery", "finance", "food", "games", "geospatial", "geoscience",
  "government", "health", "humanities", "journalism", "law", "maritime",
  "materials", "neuroscience", "nlp", "open-science", "remote-sensing",
  "robotics", "semantic-web", "social-science", "space", "sports", "transport",
];

// ============================================================
// Tool declarations for Gemini
// ============================================================

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "web_search",
    description:
      "Search the web for free APIs, datasets, and services. Returns search results with URLs and snippets. Use this to discover new resources.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Search query (e.g. 'free earthquake API real-time data')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "check_existing",
    description:
      "Check if a URL already exists in our resources database or discovery queue. Always call this before adding a resource to avoid duplicates.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "The URL to check" },
      },
      required: ["url"],
    },
  },
  {
    name: "add_resource",
    description:
      "Add a new free API, dataset, or service to our database. Only add resources that are genuinely free or cost less than $2000/year.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Short name of the resource (e.g. 'OpenWeatherMap')",
        },
        url: { type: Type.STRING, description: "URL of the resource" },
        kinds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Resource types. One or more of: "api", "dataset", "service", "code"',
        },
        topics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: `1-4 topic labels from: ${TOPIC_LABELS.join(", ")}`,
        },
        description: {
          type: Type.STRING,
          description: "One-sentence description of what this resource provides",
        },
      },
      required: ["name", "url", "kinds", "topics", "description"],
    },
  },
  {
    name: "fetch_page",
    description:
      "Fetch and read the content of a web page. Use this to evaluate a resource's quality, check if it's actually free, read documentation, or extract links from list pages.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "queue_items",
    description:
      "Queue multiple URLs for later processing. Use this when you find a list/directory of resources — queue them all, then process them one by one with get_queue.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              url: { type: Type.STRING, description: "URL to queue" },
              label: {
                type: Type.STRING,
                description: "Name or label of the resource",
              },
              source: {
                type: Type.STRING,
                description: "Where you found this link",
              },
            },
            required: ["url"],
          },
          description: "List of items to queue",
        },
      },
      required: ["items"],
    },
  },
  {
    name: "get_queue",
    description:
      "Get the next batch of pending URLs from the discovery queue to process.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: "How many items to retrieve (default 10)",
        },
      },
    },
  },
];

// ============================================================
// Web search via Gemini with Google Search grounding
// ============================================================

async function webSearch(
  query: string,
): Promise<string> {
  try {
    const response = await genai.models.generateContent({
      model: MODEL,
      contents: `Search for: ${query}\n\nReturn a list of relevant URLs with brief descriptions. Focus on free APIs, datasets, and services. Format each result as:\n- [Name](URL) - description`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text ?? "No results found.";
  } catch (err) {
    return `Search failed: ${err}`;
  }
}

// ============================================================
// Tool execution
// ============================================================

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "web_search":
      return { results: await webSearch(args.query as string) };
    case "check_existing":
      return checkExisting(db, args as { url: string });
    case "add_resource":
      return addResource(db, genai, args as {
        name: string; url: string; kinds: string[];
        topics: string[]; description: string;
      });
    case "fetch_page":
      return fetchPage(args as { url: string });
    case "queue_items":
      return queueItems(db, args as {
        items: { url: string; label: string; source: string }[];
      });
    case "get_queue":
      return getQueue(db, args as { limit: number });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ============================================================
// Agent loop
// ============================================================

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const db = createClient();

async function discover(query: string): Promise<void> {
  await db.connect();

  const systemPrompt = `You are a research agent that finds free APIs, datasets, and web services on the internet and adds them to our catalog database.

Your task: "${query}"

Rules:
- Use web_search to find free (or < $2000/year) APIs, datasets, and services
- Use fetch_page to read pages, verify resources exist, and check they're actually free
- Always call check_existing before add_resource to avoid duplicates
- Classify each resource with kinds: "api", "dataset", "service", or "code"
- Assign 1-4 topic labels from: ${TOPIC_LABELS.join(", ")}
- Write a clear one-sentence description for each resource
- If you find a curated list or directory of resources (like an awesome-list), use fetch_page to read it, then queue_items to queue the individual resources, then use get_queue to process them
- Skip: dead links, paywalled services, deprecated APIs, empty repos
- Be thorough: search multiple angles, follow promising links

When you're done searching and have processed everything you found, say "DISCOVERY COMPLETE" and summarize what you added.`;

  const contents: Content[] = [
    { role: "user", parts: [{ text: systemPrompt }] },
  ];

  console.log(`\nDiscovery agent starting: "${query}"\n`);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await genai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      console.log("  No response from model, stopping.");
      break;
    }

    // Add model response to conversation
    contents.push(candidate.content);

    // Check for text output
    const textParts = candidate.content.parts.filter((p: Part) => p.text);
    for (const part of textParts) {
      console.log(`  Agent: ${part.text}`);
    }

    // Check if done
    const fullText = textParts.map((p: Part) => p.text ?? "").join("");
    if (fullText.includes("DISCOVERY COMPLETE")) {
      break;
    }

    // Handle function calls
    const functionCalls = candidate.content.parts.filter(
      (p: Part) => p.functionCall,
    );
    if (functionCalls.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Continue. Use web_search to find more resources, or get_queue if there are queued items." }],
      });
      continue;
    }

    // Execute each function call and build response parts
    const responseParts: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const toolName = fc.name!;
      const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

      const argStr = JSON.stringify(toolArgs);
      console.log(`  Tool: ${toolName}(${argStr.length > 120 ? argStr.slice(0, 120) + "..." : argStr})`);

      const result = await executeTool(toolName, toolArgs);
      const resultStr = JSON.stringify(result);
      console.log(`  Result: ${resultStr.length > 200 ? resultStr.slice(0, 200) + "..." : resultStr}`);

      responseParts.push({
        functionResponse: {
          name: toolName,
          response: { result },
          id: fc.id,
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  await db.end();
  console.log("\nAgent finished.");
}

// ============================================================
// CLI
// ============================================================

const query = process.argv.slice(2).join(" ") || "free APIs and datasets";

if (query === "--process-queue") {
  discover(
    "Process the pending items in the discovery queue. Use get_queue to fetch them, evaluate each one, and add good ones to the database.",
  );
} else {
  discover(query);
}
