import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { createClient } from './lib/db.js';
import { embed } from './lib/embeddings.js';
import { log } from './lib/logger.js';
import type { Kind, ResourceId, Topic, Url } from './lib/types.js';
import { ResourceId as mkResourceId, Url as mkUrl } from './lib/types.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    log.error('missing api key', { key: 'GEMINI_API_KEY' });
    process.exit(1);
}

const MODEL = 'gemini-2.5-flash';
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

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const db = createClient();

// ============================================================
// Tool declarations
// ============================================================

const toolDeclarations: FunctionDeclaration[] = [
    {
        name: 'fetch_page',
        description:
            'Fetch a URL and check if it loads. Returns statusCode, content, and a \'likely_broken\' flag with \'problems\' array if issues are detected (404, soft 404, redirect to homepage, DNS failure, timeout, domain parking, etc.).',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: 'URL to fetch' },
            },
            required: ['url'],
        },
    },
    {
        name: 'update_resource',
        description: 'Update a resource\'s metadata after rechecking it.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                name: {
                    type: Type.STRING,
                    description:
                        'The correct, human-readable name for this resource (e.g. \'CLERC\', \'OpenWeatherMap\', \'USGS Earthquake Catalog\'). Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
                },
                description: {
                    type: Type.STRING,
                    description: 'New one-sentence description of what this resource provides. Write this even if one already exists — make it accurate and current.',
                },
                topics: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: `Updated topic labels (1-4) from: ${TOPIC_LABELS.join(', ')}. Keep existing ones if still accurate, adjust if needed.`,
                },
                is_alive: {
                    type: Type.BOOLEAN,
                    description:
                        'true ONLY if this specific URL loads and serves the expected content. false if fetch_page returned likely_broken=true, or if the page is a 404, error, redirect to homepage, parked domain, etc. Do NOT set true just because the project exists elsewhere.',
                },
                notes: {
                    type: Type.STRING,
                    description: 'Brief notes about what you found: any changes, issues, or notable details',
                },
                analysis: {
                    type: Type.STRING,
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
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'Search query' },
            },
            required: ['query'],
        },
    },
    {
        name: 'repair_url',
        description: 'If the original URL is broken but you found the resource at a new URL, call this to update the URL. Call fetch_page on the new URL first to verify it works before calling this.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                new_url: { type: Type.STRING, description: 'The new, working URL for this resource' },
                reason: { type: Type.STRING, description: 'Why the URL changed (e.g. \'domain moved\', \'repo transferred\', \'new docs site\')' },
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
    descriptions: string[];
}

let currentResource: ResourceRow | null = null;

async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    switch (name) {
        case 'fetch_page': {
            const url = args.url as string;
            try {
                const resp = await fetch(url, {
                    headers: { 'User-Agent': 'freestyle-recheck-agent/1.0' },
                    signal: AbortSignal.timeout(10000),
                    redirect: 'follow',
                });

                const finalUrl = resp.url;
                const statusCode = resp.status;
                const redirected = finalUrl !== url;

                let rawHtml = await resp.text();
                let text = rawHtml
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&[#\w]+;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // Detect broken page signals
                const problems: string[] = [];

                if (statusCode >= 400) {
                    problems.push(`HTTP ${statusCode}`);
                }

                // Soft 404 / error page detection
                const lower = text.toLowerCase();
                const titleMatch = rawHtml.match(/<title[^>]*>(.*?)<\/title>/i);
                const title = titleMatch?.[1]?.trim().toLowerCase() ?? '';

                const SOFT_404_SIGNALS = [
                    'page not found',
                    '404',
                    'not found',
                    'no longer available',
                    'this page doesn\'t exist',
                    'page does not exist',
                    'page has been removed',
                    'sorry, we couldn\'t find',
                    'the page you requested',
                    'this site can\'t be reached',
                    'domain for sale',
                    'domain is parked',
                    'buy this domain',
                    'coming soon',
                    'under construction',
                    'website expired',
                    'account suspended',
                    'account has been suspended',
                    '403 forbidden',
                    'access denied',
                ];

                for (const signal of SOFT_404_SIGNALS) {
                    if (title.includes(signal) || (lower.length < 2000 && lower.includes(signal))) {
                        problems.push(`soft 404: page contains "${signal}"`);
                        break;
                    }
                }

                // Redirect to a generic homepage (not the specific resource page)
                if (redirected) {
                    const originalPath = new URL(url).pathname;
                    const finalPath = new URL(finalUrl).pathname;
                    if (originalPath.length > 1 && (finalPath === '/' || finalPath === '')) {
                        problems.push(`redirected to homepage: ${finalUrl}`);
                    } else {
                        problems.push(`redirected to: ${finalUrl}`);
                    }
                }

                // Very little content (likely an error stub)
                if (text.length < 100 && statusCode === 200) {
                    problems.push('page has almost no content');
                }

                // Domain parking / generic CMS detection
                if (lower.includes('godaddy') || lower.includes('squarespace') && lower.includes('claim this domain')) {
                    problems.push('domain appears parked');
                }

                if (text.length > 8000) text = text.slice(0, 8000) + '\n...[truncated]';

                const result: Record<string, unknown> = {
                    statusCode,
                    content: text,
                };
                if (redirected) result.redirectedTo = finalUrl;
                if (problems.length > 0) {
                    result.problems = problems;
                    result.likely_broken = true;
                }
                return result;
            } catch (err) {
                const errStr = String(err);
                const problems = ['fetch failed: ' + errStr];

                // Classify the error
                if (errStr.includes('ENOTFOUND') || errStr.includes('getaddrinfo')) {
                    problems.push('DNS lookup failed — domain does not exist');
                } else if (errStr.includes('ECONNREFUSED')) {
                    problems.push('connection refused — server is down');
                } else if (errStr.includes('CERT_') || errStr.includes('SSL') || errStr.includes('certificate')) {
                    problems.push('SSL/TLS error — certificate problem');
                } else if (errStr.includes('TimeoutError') || errStr.includes('timed out') || errStr.includes('abort')) {
                    problems.push('request timed out after 10s');
                }

                return {
                    statusCode: 0,
                    content: `Error: ${errStr}`,
                    problems,
                    likely_broken: true,
                };
            }
        }

        case 'web_search': {
            try {
                const response = await genai.models.generateContent({
                    model: MODEL,
                    contents: `Search for: ${args.query}`,
                    config: { tools: [{ googleSearch: {} }] },
                });
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
            const analysis = args.analysis as string | undefined;

            // Update name if provided
            if (newName && newName !== r.name) {
                await db.query('UPDATE resources SET name = $1 WHERE id = $2', [newName, r.id]);
            }

            // Update description: clear old, insert new
            await db.query('DELETE FROM resource_descriptions WHERE resource_id = $1', [r.id]);
            if (description) {
                await db.query(
                    'INSERT INTO resource_descriptions (resource_id, description) VALUES ($1, $2)',
                    [r.id, description],
                );
            }

            // Update topics if provided
            if (topics && topics.length > 0) {
                await db.query('DELETE FROM resource_topics WHERE resource_id = $1', [r.id]);
                for (const t of topics) {
                    await db.query(
                        'INSERT INTO resource_topics (resource_id, topic) VALUES ($1, $2)',
                        [r.id, t],
                    );
                }
            }

            // Update analysis if provided
            if (analysis) {
                await db.query(
                    `INSERT INTO resource_analyses (resource_id, analysis, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (resource_id) DO UPDATE
           SET analysis = $2, updated_at = now()`,
                    [r.id, analysis],
                );
            }

            // Determine status: alive resets, broken escalates suspect → dead
            let newStatus: string;
            let failCount: number;
            if (isAlive) {
                newStatus = 'alive';
                failCount = 0;
            } else {
                // Check current fail_count to decide suspect vs dead
                const { rows: lcRows } = await db.query(
                    'SELECT fail_count FROM link_checks WHERE resource_id = $1',
                    [r.id],
                );
                const currentFails = lcRows.length > 0 ? (lcRows[0].fail_count as number) : 0;
                failCount = currentFails + 1;
                newStatus = failCount >= 2 ? 'dead' : 'suspect';
            }

            // Update link_checks
            await db.query(
                `INSERT INTO link_checks (resource_id, checked_at, status_code, status, fail_count, notes)
         VALUES ($1, now(), NULL, $2, $3, $4)
         ON CONFLICT (resource_id) DO UPDATE
         SET checked_at = now(), status = $2, fail_count = $3, notes = $4`,
                [r.id, newStatus, failCount, notes],
            );

            // Re-generate embedding with new description using local model (only if alive)
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
    ORDER BY lc.checked_at ASC NULLS FIRST, r.id
    LIMIT 1
  `);

    if (!rows.length) return null;

    const r = rows[0];

    // Fetch kinds, topics, descriptions (sequential — pg.Client doesn't support concurrent queries)
    const kinds = await db.query('SELECT kind FROM resource_kinds WHERE resource_id = $1', [r.id]);
    const topics = await db.query('SELECT topic FROM resource_topics WHERE resource_id = $1', [r.id]);
    const descs = await db.query('SELECT description FROM resource_descriptions WHERE resource_id = $1', [r.id]);

    return {
        id: mkResourceId(r.id),
        name: r.name,
        url: mkUrl(r.url),
        kinds: kinds.rows.map((k: { kind: string; }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string; }) => t.topic as Topic),
        descriptions: descs.rows.map((d: { description: string; }) => d.description),
    };
}

// ============================================================
// Recheck one resource
// ============================================================

async function recheckOne(resource: ResourceRow): Promise<void> {
    currentResource = resource;

    const systemPrompt = `You are a quality-check agent. Your job is to recheck whether a specific URL in our catalog still works.

Resource to check:
- Name: ${resource.name}
- URL: ${resource.url}
- Current kinds: ${resource.kinds.join(', ') || 'none'}
- Current topics: ${resource.topics.join(', ') || 'none'}
- Current description: ${resource.descriptions[0] || 'none'}

## CRITICAL: What "alive" means

You are checking THIS EXACT URL: ${resource.url}
- is_alive = true ONLY if this URL loads and serves the expected content (API docs, dataset, service page, repo, etc.)
- is_alive = false if ANY of these are true:
  - The URL returns a 4xx or 5xx status code
  - The URL redirects to a generic homepage (not the specific resource)
  - The URL shows "page not found", "domain for sale", "coming soon", "under construction", etc.
  - The domain doesn't resolve (DNS failure)
  - The connection times out or is refused
  - The page has almost no content (stub/error page)
  - The fetch_page result includes "likely_broken: true" or "problems"

If the fetch result has "likely_broken: true", mark is_alive = false. Do NOT override this by searching for the project elsewhere.

## When the URL is broken: try to repair it
If fetch_page returns likely_broken, follow this sequence:
1. Use web_search to find where the resource moved to (e.g. "AgensGraph official site", "AgensGraph GitHub")
2. If you find a new, working URL:
   a. Use fetch_page on the new URL to verify it actually works
   b. If the new URL works, call repair_url with the new URL, then call update_resource with is_alive = true
   c. If the new URL also doesn't work, call update_resource with is_alive = false
3. If you can't find the resource anywhere, call update_resource with is_alive = false

## Steps
1. Use fetch_page to visit the URL
2. Look at the statusCode, problems, and likely_broken fields in the result
3. If the page loads fine → is_alive = true, write a description from what you see
4. If likely_broken is true:
   a. web_search for the resource name to find a new URL
   b. If found: fetch_page the new URL → repair_url if it works → update_resource with is_alive = true
   c. If not found or new URL also broken: update_resource with is_alive = false
5. Call update_resource with:
   - name: the correct human-readable name (fix if garbled/emoji/symbol)
   - description: one sentence about what this resource provides
   - topics: updated if needed
   - is_alive: true/false (follow the rules above strictly)
   - notes: what you found, include old URL if repaired

Be concise.`;

    const contents: Content[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
    ];

    const rlog = log.child({ agent: 'recheck', resourceId: resource.id, url: resource.url });

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
            rlog.debug('agent text', { text: part.text });
        }

        const functionCalls = candidate.content.parts.filter((p: Part) => p.functionCall);
        if (functionCalls.length === 0) break;

        const responseParts: Part[] = [];
        for (const part of functionCalls) {
            const fc = part.functionCall!;
            const toolName = fc.name!;
            const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

            rlog.info('tool call', { tool: toolName, args: toolArgs });

            const result = await executeTool(toolName, toolArgs);
            rlog.debug('tool result', { tool: toolName, result });

            responseParts.push({
                functionResponse: {
                    name: toolName,
                    response: { result },
                    id: fc.id,
                },
            });

            // If we just updated, we're done with this resource
            if (toolName === 'update_resource') return;
        }

        contents.push({ role: 'user', parts: responseParts });
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
    const descs = await db.query('SELECT description FROM resource_descriptions WHERE resource_id = $1', [r.id]);

    return {
        id: mkResourceId(r.id),
        name: r.name,
        url: mkUrl(r.url),
        kinds: kinds.rows.map((k: { kind: string; }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string; }) => t.topic as Topic),
        descriptions: descs.rows.map((d: { description: string; }) => d.description),
    };
}

async function main(): Promise<void> {
    const arg = process.argv[2];
    const isSingleUrl = arg?.startsWith('http');
    await db.connect();

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
