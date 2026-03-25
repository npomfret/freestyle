import { GoogleGenAI } from '@google/genai';
import { createPool } from './lib/db.js';
import { embed } from './lib/embeddings.js';
import { fetchPage } from './lib/fetch-page.js';
import { getLLMProvider } from './lib/llm.js';
import type { LLMMessage, ToolDeclaration } from './lib/llm.js';
import { withRetry } from './lib/retry.js';
import { log } from './lib/logger.js';
import type { Kind, Region, ResourceId, Topic, Url } from './lib/types.js';
import { KINDS, TOPICS, ResourceId as mkResourceId, Url as mkUrl } from './lib/types.js';

const MAX_TURNS = 20;

const TOPIC_LABELS = [
    'ai-ml',
    'agriculture',
    'audio',
    'bioinformatics',
    'blockchain',
    'chemistry',
    'climate',
    'cybersecurity',
    'data-science',
    'developer',
    'drug-discovery',
    'finance',
    'food',
    'games',
    'geospatial',
    'geoscience',
    'government',
    'health',
    'humanities',
    'journalism',
    'law',
    'maritime',
    'materials',
    'neuroscience',
    'nlp',
    'open-science',
    'remote-sensing',
    'robotics',
    'semantic-web',
    'social-science',
    'space',
    'sports',
    'transport',
];

const db = createPool();

// Gemini instance for web search only (cheap single-shot calls)
let searchGenai: GoogleGenAI | null = null;
function getSearchGenai(): GoogleGenAI {
    if (searchGenai) return searchGenai;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY required for web search');
    searchGenai = new GoogleGenAI({ apiKey: key });
    return searchGenai;
}

// ============================================================
// Tool declarations (provider-agnostic format)
// ============================================================

const toolDeclarations: ToolDeclaration[] = [
    {
        name: 'fetch_page',
        description:
            'Fetch a URL and check if it loads. Returns statusCode, content, and a \'likely_broken\' flag with \'problems\' array if issues are detected (404, soft 404, redirect to homepage, DNS failure, timeout, domain parking, etc.).',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' },
            },
            required: ['url'],
        },
    },
    {
        name: 'update_resource',
        description: 'Update a resource\'s metadata after rechecking it.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description:
                        'The correct, human-readable name for this resource (e.g. \'CLERC\', \'OpenWeatherMap\', \'USGS Earthquake Catalog\'). Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
                },
                description: {
                    type: 'string',
                    description: 'New one-sentence description of what this resource provides. Write this even if one already exists — make it accurate and current.',
                },
                topics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: `Updated topic labels (1-4) from: ${TOPIC_LABELS.join(', ')}. Keep existing ones if still accurate, adjust if needed.`,
                },
                regions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated geographic regions (e.g. "Global", "Europe", "North America/United States"). Keep existing ones if still accurate, adjust if needed.',
                },
                is_alive: {
                    type: 'boolean',
                    description:
                        'true ONLY if this specific URL loads and serves the expected content. false if fetch_page returned likely_broken=true, or if the page is a 404, error, redirect to homepage, parked domain, etc. Do NOT set true just because the project exists elsewhere.',
                },
                notes: {
                    type: 'string',
                    description: 'Brief notes about what you found: any changes, issues, or notable details',
                },
                analysis: {
                    type: 'string',
                    description:
                        'A 2-4 sentence analysis covering: what data/service this resource provides and in what format, how to access it (API key? open? rate limits?), what makes it notable, and any caveats (freshness, coverage, free tier limits). Write this if the page loaded successfully.',
                },
            },
            required: ['description', 'is_alive', 'notes'],
        },
    },
    {
        name: 'web_search',
        description: 'Search the web for more information about this resource if the page itself doesn\'t load or is unclear.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
        },
    },
    {
        name: 'repair_url',
        description: 'If the original URL is broken but you found the resource at a new URL, call this to update the URL. Call fetch_page on the new URL first to verify it works before calling this.',
        parameters: {
            type: 'object',
            properties: {
                new_url: { type: 'string', description: 'The new, working URL for this resource' },
                reason: { type: 'string', description: 'Why the URL changed (e.g. \'domain moved\', \'repo transferred\', \'new docs site\')' },
            },
            required: ['new_url', 'reason'],
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
    regions: Region[];
    descriptions: string[];
}

let currentResource: ResourceRow | null = null;

async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    switch (name) {
        case 'fetch_page': {
            return fetchPage(args.url as string);
        }

        case 'web_search': {
            try {
                const genai = getSearchGenai();
                const response = await withRetry(() => genai.models.generateContent({
                    model: 'gemini-2.5-flash-lite',
                    contents: `Search for: ${args.query}`,
                    config: { tools: [{ googleSearch: {} }] },
                }), 'web_search');
                return { results: response.text ?? 'No results.' };
            } catch (err) {
                return { results: `Search failed: ${err}` };
            }
        }

        case 'update_resource': {
            if (!currentResource) return { error: 'No current resource' };
            const r = currentResource;
            const newName = args.name as string | undefined;
            const description = args.description as string;
            const isAlive = args.is_alive as boolean;
            const notes = args.notes as string;
            const topics = args.topics as string[] | undefined;
            const regions = args.regions as string[] | undefined;
            const analysis = args.analysis as string | undefined;

            const client = await db.connect();
            let newStatus: string;
            let failCount: number;

            try {
                await client.query('BEGIN');

                // Update name if provided
                if (newName && newName !== r.name) {
                    await client.query('UPDATE resources SET name = $1 WHERE id = $2', [newName, r.id]);
                }

                // Update description: clear old, insert new
                await client.query('DELETE FROM resource_descriptions WHERE resource_id = $1', [r.id]);
                if (description) {
                    await client.query(
                        'INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)',
                        [r.id, description],
                    );
                }

                // Update topics if provided (filter to valid labels)
                if (topics && topics.length > 0) {
                    const validTopics = topics.filter(t => (TOPICS as readonly string[]).includes(t));
                    if (validTopics.length > 0) {
                        await client.query('DELETE FROM resource_topics WHERE resource_id = $1', [r.id]);
                        for (const t of validTopics) {
                            await client.query(
                                'INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)',
                                [r.id, t],
                            );
                        }
                    }
                }

                // Update regions if provided
                if (regions && regions.length > 0) {
                    await client.query('DELETE FROM resource_regions WHERE resource_id = $1', [r.id]);
                    for (const reg of regions) {
                        await client.query(
                            'INSERT INTO resource_regions (resource_id, region) VALUES ($1, $2)',
                            [r.id, reg],
                        );
                    }
                }

                // Update analysis if provided
                if (analysis) {
                    await client.query(
                        `INSERT INTO resource_analyses (resource_id, analysis, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (resource_id) DO UPDATE
             SET analysis = $2, updated_at = now()`,
                        [r.id, analysis],
                    );
                }

                // Determine status: alive resets, broken escalates suspect → dead
                if (isAlive) {
                    newStatus = 'alive';
                    failCount = 0;
                } else {
                    const { rows: lcRows } = await client.query(
                        'SELECT fail_count FROM link_checks WHERE resource_id = $1',
                        [r.id],
                    );
                    const currentFails = lcRows.length > 0 ? (lcRows[0].fail_count as number) : 0;
                    failCount = currentFails + 1;
                    newStatus = failCount >= 2 ? 'dead' : 'suspect';
                }

                // Update link_checks
                await client.query(
                    `INSERT INTO link_checks (resource_id, checked_at, status_code, status, fail_count, notes)
           VALUES ($1, now(), NULL, $2, $3, $4)
           ON CONFLICT (resource_id) DO UPDATE
           SET checked_at = now(), status = $2, fail_count = $3, notes = $4`,
                    [r.id, newStatus, failCount, notes],
                );

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }

            // Re-generate embedding outside transaction (best-effort)
            if (isAlive) {
                const embText = [newName ?? r.name, description, ...(topics ?? r.topics)].filter(Boolean).join(' ');
                try {
                    const vecs = await embed([embText]);
                    await db.query(
                        'UPDATE resources SET embedding = $1::vector, updated_at = now() WHERE id = $2',
                        [`[${vecs[0].join(',')}]`, r.id],
                    );
                } catch {
                    // Embedding update is best-effort
                }
            }

            return { status: newStatus, id: r.id, fail_count: failCount };
        }

        case 'repair_url': {
            if (!currentResource) return { error: 'No current resource' };
            const r = currentResource;
            const newUrl = args.new_url as string;
            const reason = args.reason as string;

            // Check the new URL isn't already in our database
            const { rows: dupeRows } = await db.query(
                'SELECT id FROM resources WHERE url = $1',
                [newUrl],
            );
            if (dupeRows.length > 0) {
                return { error: `URL already exists as resource ${dupeRows[0].id}`, url: newUrl };
            }

            const oldUrl = r.url;
            await db.query('UPDATE resources SET url = $1, updated_at = now() WHERE id = $2', [newUrl, r.id]);
            log.info('url repaired', { id: r.id, oldUrl, newUrl, reason });

            return { status: 'url_updated', id: r.id, oldUrl, newUrl, reason };
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
    WHERE lc.status IS DISTINCT FROM 'dead'
      AND (lc.checked_at IS NULL OR lc.checked_at < now() - interval '14 days')
    ORDER BY lc.checked_at ASC NULLS FIRST, r.id
    LIMIT 1
  `);

    if (!rows.length) return null;

    const r = rows[0];

    // Fetch kinds, topics, regions, descriptions (sequential — pg.Client doesn't support concurrent queries)
    const kinds = await db.query('SELECT kind FROM resource_kinds WHERE resource_id = $1', [r.id]);
    const topics = await db.query('SELECT topic FROM resource_topics WHERE resource_id = $1', [r.id]);
    const regions = await db.query('SELECT region FROM resource_regions WHERE resource_id = $1', [r.id]);
    const descs = await db.query('SELECT description FROM resource_descriptions WHERE resource_id = $1', [r.id]);

    return {
        id: mkResourceId(r.id),
        name: r.name,
        url: mkUrl(r.url),
        kinds: kinds.rows.map((k: { kind: string; }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string; }) => t.topic as Topic),
        regions: regions.rows.map((rg: { region: string; }) => rg.region as Region),
        descriptions: descs.rows.map((d: { description: string; }) => d.description),
    };
}

// ============================================================
// System instruction for the recheck agent
// ============================================================

const RECHECK_SYSTEM_INSTRUCTION = `You are a quality-check agent. Your job is to recheck whether a specific URL in our catalog still works.

## CRITICAL: What "alive" means

- is_alive = true ONLY if the URL loads and serves the expected content (API docs, dataset, service page, repo, etc.)
- is_alive = false if ANY of these are true:
  - The URL returns a 4xx or 5xx status code
  - The URL redirects to a generic homepage (not the specific resource)
  - The URL shows "page not found", "domain for sale", "coming soon", "under construction", etc.
  - The domain doesn't resolve (DNS failure)
  - The connection times out or is refused
  - The page has almost no content (stub/error page)
  - The fetch_page result includes "likely_broken: true" or "problems"

If the fetch result has "likely_broken: true", mark is_alive = false. Do NOT override this by searching for the project elsewhere.

## Important: APIs that require keys are valid
Some APIs and datasets are free but require an API key or registration to access. These are valid resources. The URL we store should be the resource's website, documentation page, or pricing page — NOT a raw API endpoint. If a page loads and shows docs/pricing for a free API, it is alive even if the API itself requires a key.

## When the URL is broken: try to repair it
If fetch_page returns likely_broken, follow this sequence:
1. Use web_search to find where the resource moved to (e.g. "AgensGraph official site", "AgensGraph GitHub")
2. If you find a new, working URL (website, docs, or pricing page — not a raw API endpoint):
   a. Use fetch_page on the new URL to verify it actually works
   b. If the new URL works, call repair_url with the new URL, then call update_resource with is_alive = true
   c. If the new URL also doesn't work, call update_resource with is_alive = false
3. If you can't find the resource anywhere, call update_resource with is_alive = false

## Steps
1. Look at the pre-fetched results provided in the first message
2. If the page appears broken:
   a. web_search for the resource name to find a new URL
   b. If found: fetch_page the new URL → repair_url if it works → update_resource with is_alive = true
   c. If not found or new URL also broken: update_resource with is_alive = false
3. Call update_resource with:
   - name: the correct human-readable name (fix if garbled/emoji/symbol)
   - description: one sentence about what this resource provides
   - topics: updated if needed
   - is_alive: true/false (follow the rules above strictly)
   - notes: what you found, include old URL if repaired

Available topic labels: ${TOPIC_LABELS.join(', ')}

Kind values: api (HTTP endpoints), dataset (downloadable data), service (hosted tool), code (repo/library)

Region format: "Global", continent (e.g. "Europe"), continent/country (e.g. "North America/United States"), or sub-region (e.g. "EU", "Middle East")

Be concise.`;

// ============================================================
// Recheck one resource
// ============================================================

async function recheckOne(resource: ResourceRow): Promise<void> {
    currentResource = resource;
    const rlog = log.child({ agent: 'recheck', resourceId: resource.id, url: resource.url });

    // Step 1: Pre-fetch the page ourselves (native only — no Gemini fallback)
    const fetchResult = await fetchPage(resource.url, { tiers: ['native', 'puppeteer'] });
    rlog.info('pre-fetch result', {
        statusCode: fetchResult.statusCode,
        likely_broken: fetchResult.likely_broken,
        problems: fetchResult.problems,
    });

    // Step 2: If healthy, update DB directly — no Gemini needed
    if (!fetchResult.likely_broken && fetchResult.statusCode >= 200 && fetchResult.statusCode < 400) {
        await db.query(
            `INSERT INTO link_checks (resource_id, checked_at, status_code, status, fail_count, notes)
             VALUES ($1, now(), $2, 'alive', 0, 'pre-fetch OK')
             ON CONFLICT (resource_id) DO UPDATE
             SET checked_at = now(), status_code = $2, status = 'alive', fail_count = 0, notes = 'pre-fetch OK'`,
            [resource.id, fetchResult.statusCode],
        );
        rlog.info('resource alive (no LLM needed)');
        return;
    }

    // Step 3: Page is broken — use LLM to diagnose and attempt repair
    const provider = await getLLMProvider();

    const resourceContext = `Resource to check:
- Name: ${resource.name}
- URL: ${resource.url}
- Current kinds: ${resource.kinds.join(', ') || 'none'}
- Current topics: ${resource.topics.join(', ') || 'none'}
- Current regions: ${resource.regions.join(', ') || 'none'}
- Current description: ${resource.descriptions[0] || 'none'}

I already fetched the page. Here are the results:
- Status code: ${fetchResult.statusCode}
- Problems: ${fetchResult.problems?.join(', ') || 'none'}
- Content preview: ${fetchResult.content.slice(0, 500)}

The page appears broken. Try to find where this resource moved to using web_search, then repair_url if you find it. Call update_resource when done.`;

    const messages: LLMMessage[] = [
        { role: 'user', text: resourceContext },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await provider.generate(messages, {
            systemInstruction: RECHECK_SYSTEM_INSTRUCTION,
            tools: toolDeclarations,
        });

        if (response.text) {
            rlog.debug('agent text', { text: response.text });
        }

        if (response.functionCalls.length === 0) {
            // Model responded with text only — record so this resource doesn't keep resurfacing
            rlog.warn('agent returned no action', { text: response.text });
            await recordFailure(resource.id, `agent returned no action: ${response.text?.slice(0, 200) ?? 'no text'}`);
            break;
        }

        // Add model response to history
        messages.push({
            role: 'model',
            text: response.text,
            functionCalls: response.functionCalls,
        });

        const functionResponses = [];
        for (const fc of response.functionCalls) {
            rlog.info('tool call', { tool: fc.name, args: fc.args });

            const result = await executeTool(fc.name, fc.args);
            rlog.debug('tool result', { tool: fc.name, result });

            functionResponses.push({
                name: fc.name,
                response: result,
                id: fc.id,
            });

            // If we just updated, we're done with this resource
            if (fc.name === 'update_resource') return;
        }

        messages.push({ role: 'user', functionResponses });
    }
}

// ============================================================
// Record a failure with suspect/dead escalation
// ============================================================

async function recordFailure(resourceId: ResourceId, notes: string): Promise<void> {
    const { rows } = await db.query(
        'SELECT fail_count FROM link_checks WHERE resource_id = $1',
        [resourceId],
    );
    const currentFails = rows.length > 0 ? (rows[0].fail_count as number) : 0;
    const failCount = currentFails + 1;
    const status = failCount >= 2 ? 'dead' : 'suspect';

    await db.query(
        `INSERT INTO link_checks (resource_id, checked_at, status, fail_count, notes)
     VALUES ($1, now(), $2, $3, $4)
     ON CONFLICT (resource_id) DO UPDATE
     SET checked_at = now(), status = $2, fail_count = $3, notes = $4`,
        [resourceId, status, failCount, notes],
    );
    log.info('recorded failure', { resourceId, status, failCount });
}

// ============================================================
// Main loop
// ============================================================

async function getResourceByUrl(url: string): Promise<ResourceRow | null> {
    const { rows } = await db.query('SELECT id, name, url FROM resources WHERE url = $1', [url]);
    if (!rows.length) return null;

    const r = rows[0];
    const kinds = await db.query('SELECT kind FROM resource_kinds WHERE resource_id = $1', [r.id]);
    const topics = await db.query('SELECT topic FROM resource_topics WHERE resource_id = $1', [r.id]);
    const regions = await db.query('SELECT region FROM resource_regions WHERE resource_id = $1', [r.id]);
    const descs = await db.query('SELECT description FROM resource_descriptions WHERE resource_id = $1', [r.id]);

    return {
        id: mkResourceId(r.id),
        name: r.name,
        url: mkUrl(r.url),
        kinds: kinds.rows.map((k: { kind: string; }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string; }) => t.topic as Topic),
        regions: regions.rows.map((rg: { region: string; }) => rg.region as Region),
        descriptions: descs.rows.map((d: { description: string; }) => d.description),
    };
}

async function main(): Promise<void> {
    const arg = process.argv[2];
    const isSingleUrl = arg?.startsWith('http');

    if (isSingleUrl) {
        const resource = await getResourceByUrl(arg);
        if (!resource) {
            log.error('resource not found', { url: arg });
            await db.end();
            process.exit(1);
        }
        log.info('rechecking single resource', { id: resource.id, name: resource.name, url: resource.url });
        try {
            await recheckOne(resource);
        } catch (err) {
            log.error('recheck failed', { id: resource.id, url: resource.url, error: String(err) });
            await recordFailure(resource.id, `Agent error: ${err}`);
        }
    } else {
        const count = Number(arg) || 10;
        log.info('recheck started', { count });

        for (let i = 0; i < count; i++) {
            const resource = await getNextResource();
            if (!resource) {
                log.info('no more resources to check');
                break;
            }

            log.info('checking resource', { index: i + 1, total: count, id: resource.id, name: resource.name, url: resource.url });

            try {
                await recheckOne(resource);
            } catch (err) {
                log.error('recheck failed', { id: resource.id, url: resource.url, error: String(err) });
                await recordFailure(resource.id, `Agent error: ${err}`);
            }
        }
    }

    // Print summary
    const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'alive') AS alive,
      COUNT(*) FILTER (WHERE status = 'suspect') AS suspect,
      COUNT(*) FILTER (WHERE status = 'dead') AS dead,
      COUNT(*) AS total
    FROM link_checks
  `);
    log.info('recheck complete', {
        alive: Number(rows[0].alive),
        suspect: Number(rows[0].suspect),
        dead: Number(rows[0].dead),
        total: Number(rows[0].total),
    });

    await db.end();
}

main();
