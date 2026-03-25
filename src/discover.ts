import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { addResource, checkExisting, fetchPage, getQueue, queueItems } from './lib/agent-tools.js';
import { createPool } from './lib/db.js';
import { generateDiscoveryQuery } from './lib/discovery-topics.js';
import { requireEnv } from './lib/env.js';
import { withRetry } from './lib/retry.js';
import { log } from './lib/logger.js';
import { Kind, Region, SourceName, Topic, Url } from './lib/types.js';

const GEMINI_API_KEY = requireEnv('GEMINI_API_KEY');

const MODEL = 'gemini-2.5-flash';
const MAX_TURNS = 50;

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

// ============================================================
// Exclusion list — skip these domains/URLs automatically
// These are either too generic, aggregators that aren't primary
// sources, or well-known resources everyone already knows about.
// ============================================================

const EXCLUDED_DOMAINS = [
    'kaggle.com', // aggregator, not a primary source
    'wikipedia.org', // reference, not an API/dataset
    'medium.com', // blog posts
    'towardsdatascience.com', // blog posts
    'stackoverflow.com', // Q&A
    'reddit.com', // forum
    'youtube.com', // video
    'twitter.com', // social
    'x.com', // social
    'linkedin.com', // social
    'freecodecamp.org', // tutorials
    'udemy.com', // courses
    'coursera.org', // courses
    'rapidapi.com', // proxy/aggregator, not primary source
    'programmableweb.com', // dead/dying directory
    'any-api.com', // low-quality aggregator
    'freepublicapis.com', // low-quality aggregator
    'findapis.com', // low-quality aggregator
    'apilist.fun', // low-quality aggregator
    'public-apis.io', // aggregator of aggregators
    'vertexaisearch.cloud.google.com', // Gemini search redirect URLs, not real
];

function isExcludedUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return EXCLUDED_DOMAINS.some((d) => lower.includes(d));
}

// ============================================================
// Tool declarations for Gemini
// ============================================================

const toolDeclarations: FunctionDeclaration[] = [
    {
        name: 'web_search',
        description: 'Search the web for free APIs, datasets, and services. Returns search results with URLs and snippets.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: 'Search query (e.g. \'free earthquake API real-time data\')',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'check_social',
        description:
            'Check Reddit, HackerNews, Twitter/X for discussions about a resource. Returns sentiment, recency, and whether interest is growing or dying. Use this to catch red flags like reliability complaints or surprise pricing.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                name: {
                    type: Type.STRING,
                    description: 'Name of the resource to check (e.g. \'OpenWeatherMap API\')',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'check_references',
        description:
            'Search for pages that link to or mention a specific URL. A resource referenced by government sites, universities, or major projects is more credible. Returns a summary of who links to it.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: {
                    type: Type.STRING,
                    description: 'The URL to check references for',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'check_existing',
        description: 'Check if a URL already exists in our resources database or discovery queue. Always call this before adding a resource.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: 'The URL to check' },
            },
            required: ['url'],
        },
    },
    {
        name: 'add_resource',
        description: 'Add a verified free resource to our database. Only call this AFTER you have verified it is genuinely free or has a very generous free tier (< $1000/year).',
        parameters: {
            type: Type.OBJECT,
            properties: {
                name: {
                    type: Type.STRING,
                    description: 'Short name of the resource (e.g. \'OpenWeatherMap\')',
                },
                url: { type: Type.STRING, description: 'URL of the resource' },
                kinds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Resource types. One or more of: "api", "dataset", "service", "code"',
                },
                topics: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: `1-4 topic labels from: ${TOPIC_LABELS.join(', ')}`,
                },
                regions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Geographic regions this resource covers (e.g. "Global", "Europe", "North America/United States"). Leave empty if not geographically specific.',
                },
                description: {
                    type: Type.STRING,
                    description: 'One-sentence description of what this resource provides',
                },
                analysis: {
                    type: Type.STRING,
                    description:
                        'A 2-4 sentence analysis covering: what data/service it provides and in what format, how to access it (API key, open, rate limits), what makes it notable, and any caveats (freshness, coverage, free tier limits).',
                },
            },
            required: ['name', 'url', 'kinds', 'topics', 'description', 'analysis'],
        },
    },
    {
        name: 'fetch_page',
        description: 'Fetch and read a web page. Use this to verify a resource exists, check pricing/free tier, read documentation, or extract links from list pages.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: 'URL to fetch' },
            },
            required: ['url'],
        },
    },
    {
        name: 'queue_items',
        description: 'Queue multiple URLs for later processing. Use when you find a list/directory of resources.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            url: { type: Type.STRING, description: 'URL to queue' },
                            label: {
                                type: Type.STRING,
                                description: 'Name or label of the resource',
                            },
                            source: {
                                type: Type.STRING,
                                description: 'Where you found this link',
                            },
                        },
                        required: ['url'],
                    },
                    description: 'List of items to queue',
                },
            },
            required: ['items'],
        },
    },
    {
        name: 'get_queue',
        description: 'Get the next batch of pending URLs from the discovery queue to process.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                limit: {
                    type: Type.NUMBER,
                    description: 'How many items to retrieve (default 10)',
                },
            },
        },
    },
];

// ============================================================
// Web search via Gemini with Google Search grounding
// ============================================================

async function webSearch(query: string): Promise<string> {
    try {
        const response = await withRetry(() => genai.models.generateContent({
            model: MODEL,
            contents:
                `Search for: ${query}\n\nReturn a list of relevant URLs with brief descriptions. IMPORTANT: Return the actual destination URLs, not redirect URLs. Focus on primary sources — the actual API documentation, dataset download page, or GitHub repo. Skip aggregator sites, blog posts, tutorials, and directories. Format each result as:\n- [Name](URL) - description`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'web_search');
        // Extract grounding metadata for actual URLs if available
        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        let text = response.text ?? 'No results found.';
        if (groundingMeta?.groundingChunks) {
            const urls = groundingMeta
                .groundingChunks
                .filter((c) => c.web?.uri)
                .map((c) => {
                    const web = c.web!;
                    return `- [${web.title ?? web.uri}](${web.uri})`;
                });
            if (urls.length > 0) {
                text += '\n\nDirect URLs from search:\n' + urls.join('\n');
            }
        }
        return text;
    } catch (err) {
        return `Search failed: ${err}`;
    }
}

// ============================================================
// Reference/backlink check via Gemini with Google Search
// ============================================================

async function checkSocial(name: string): Promise<string> {
    try {
        const response = await withRetry(() => genai.models.generateContent({
            model: MODEL,
            contents:
                `Search for: "${name}" site:reddit.com OR site:news.ycombinator.com OR site:twitter.com OR site:x.com\n\nAlso search for: "${name}" API trends\n\nSummarize:\n1. Is this resource being discussed on Reddit, HackerNews, or Twitter? How recently?\n2. Is sentiment positive, negative, or mixed?\n3. Is interest growing, stable, or declining?\n4. Any red flags (e.g. people complaining about reliability, surprise pricing, shutdowns)?\n5. Overall social signal: strong, moderate, weak, or none`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_social');
        return response.text ?? 'No social data found.';
    } catch (err) {
        return `Social check failed: ${err}`;
    }
}

async function checkReferences(url: string): Promise<string> {
    try {
        const response = await withRetry(() => genai.models.generateContent({
            model: MODEL,
            contents:
                `Search for: "${url}"\n\nFind pages that link to or mention this URL. Summarize:\n1. How many results reference it (roughly)\n2. What kinds of sites reference it (academic, government, industry, blogs, awesome-lists)\n3. Any notable organizations or projects that use or recommend it\n4. Overall credibility signal: strong, moderate, weak, or unknown`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_references');
        return response.text ?? 'No reference data found.';
    } catch (err) {
        return `Reference check failed: ${err}`;
    }
}

// ============================================================
// Tool execution
// ============================================================

async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    // Auto-exclude bad URLs before they hit the DB
    if (name === 'add_resource' || name === 'check_existing') {
        const url = args.url as string;
        if (url && isExcludedUrl(url)) {
            return { error: `URL excluded: domain is in the blocklist (aggregator, blog, or non-primary source)` };
        }
    }

    switch (name) {
        case 'web_search':
            return { results: await webSearch(args.query as string) };
        case 'check_social':
            return { social: await checkSocial(args.name as string) };
        case 'check_references':
            return { references: await checkReferences(args.url as string) };
        case 'check_existing':
            return checkExisting(db, { url: Url(args.url as string) });
        case 'add_resource':
            return addResource(db, {
                name: args.name as string,
                url: Url(args.url as string),
                kinds: (args.kinds as string[]).map(Kind),
                topics: (args.topics as string[]).map(Topic),
                regions: args.regions ? (args.regions as string[]).map(Region) : undefined,
                description: args.description as string,
                analysis: args.analysis as string | undefined,
            });
        case 'fetch_page':
            return fetchPage(args.url as string, { tiers: ['native', 'gemini-url-context'] });
        case 'queue_items': {
            // Filter excluded URLs from queue
            const rawItems = (args as { items: { url: string; label: string; source: string; }[]; }).items;
            const filtered = rawItems
                .filter((i) => !isExcludedUrl(i.url))
                .map((i) => ({ url: Url(i.url), label: i.label, source: SourceName(i.source) }));
            const excluded = rawItems.length - filtered.length;
            const result = await queueItems(db, { items: filtered });
            return { ...result, excludedByBlocklist: excluded };
        }
        case 'get_queue':
            return getQueue(db, args as { limit: number; });
        default:
            return { error: `Unknown tool: ${name}` };
    }
}

// ============================================================
// Agent loop
// ============================================================

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const db = createPool();

async function discover(query: string): Promise<void> {

    const systemPrompt = `You are a research agent that finds free APIs, datasets, and web services on the internet and adds them to our catalog database.

Your task: "${query}"

## What we're looking for
Resources that are FREE or have a very generous free tier (< $1000/year). This includes:
- Open APIs with no or generous rate limits
- Public datasets available for download
- Government and academic data portals
- Open-source tools and services with free hosted tiers
- GitHub repos that ARE the dataset or API (not just code that uses one)

## What to SKIP — be ruthless
- Anything that requires paid access to get real value (trials don't count)
- "Free tier" that's just a demo with 10 requests/month — useless
- Aggregator sites and directories (Kaggle, RapidAPI, ProgrammableWeb, etc.) — we want PRIMARY sources
- Blog posts, tutorials, courses, Wikipedia articles
- Vaporware, abandoned repos (no commits in 2+ years), broken links
- Generic/obvious resources everyone already knows (Google Maps, Twitter API, etc.)
- Marketing pages that say "API" but are really selling SaaS

## Quality evaluation process
For each candidate resource:
1. Use fetch_page to visit the actual page — verify it loads, is real, and is free
2. Use check_references to see who links to it — a resource referenced by government sites, universities, or major projects is much more credible than one nobody links to
3. Use check_social to see what Reddit, HackerNews, and Twitter say — look for red flags like reliability complaints, surprise pricing, or shutdowns. Growing interest is a positive signal.
4. Look for: actual documentation, data samples, clear terms of use, active maintenance
5. Only call add_resource after you're confident it's genuinely useful and free

## Classification
- kinds: "api" (has HTTP endpoints), "dataset" (downloadable data), "service" (hosted tool), "code" (repo/library)
- topics: assign 1-4 from: ${TOPIC_LABELS.join(', ')}
- regions: geographic areas the resource covers — use continent (e.g. "Europe"), continent/country (e.g. "North America/United States"), sub-region (e.g. "EU", "Middle East"), or "Global". Leave empty if not geographically specific.
- description: one clear sentence about what it provides and why it's useful
- analysis: 2-4 sentences covering what data/service it provides and in what format, how to access it (API key? open? rate limits?), what makes it notable, and any caveats

## Workflow
1. web_search to find candidates
2. For each: check_existing → fetch_page → check_references → add_resource (if it passes)
3. If you find a list/directory: fetch_page it, queue_items the individual resources, get_queue to process them
4. Search from multiple angles — try different search terms, follow links from good resources

When done, say "DISCOVERY COMPLETE" and give a summary of what you added and what you skipped (with reasons).`;

    const contents: Content[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
    ];

    const alog = log.child({ agent: 'discover' });
    alog.info('agent started', { query });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await withRetry(() => genai.models.generateContent({
            model: MODEL,
            contents,
            config: {
                tools: [{ functionDeclarations: toolDeclarations }],
            },
        }), 'discover');

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
            alog.warn('no response from model', { turn });
            break;
        }

        contents.push(candidate.content);

        const textParts = candidate.content.parts.filter((p: Part) => p.text);
        for (const part of textParts) {
            alog.debug('agent text', { text: part.text });
        }

        const fullText = textParts.map((p: Part) => p.text ?? '').join('');
        if (fullText.includes('DISCOVERY COMPLETE')) {
            break;
        }

        const functionCalls = candidate.content.parts.filter(
            (p: Part) => p.functionCall,
        );
        if (functionCalls.length === 0) {
            contents.push({
                role: 'user',
                parts: [{ text: 'Continue. Use web_search to find more resources, or get_queue if there are queued items.' }],
            });
            continue;
        }

        const responseParts: Part[] = [];
        for (const part of functionCalls) {
            const fc = part.functionCall!;
            const toolName = fc.name!;
            const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

            alog.info('tool call', { tool: toolName, args: toolArgs });

            const result = await executeTool(toolName, toolArgs);
            alog.debug('tool result', { tool: toolName, result });

            responseParts.push({
                functionResponse: {
                    name: toolName,
                    response: { result },
                    id: fc.id,
                },
            });
        }

        contents.push({ role: 'user', parts: responseParts });
    }

    alog.info('agent finished');
}

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const loopMode = args.includes('--loop');
const filteredArgs = args.filter((a) => a !== '--loop');
const userQuery = filteredArgs.join(' ');

async function run(): Promise<void> {
    if (userQuery === '--process-queue') {
        await discover(
            'Process the pending items in the discovery queue. Use get_queue to fetch them, evaluate each one, and add good ones to the database.',
        );
    } else if (userQuery) {
        await discover(userQuery);
    } else {
        const { group, query } = generateDiscoveryQuery();
        log.info('auto-selected topic group', { group });
        await discover(query);
    }
}

async function main(): Promise<void> {
    if (loopMode) {
        log.info('running in loop mode');
        while (true) {
            try {
                await run();
            } catch (err) {
                log.error('discovery loop iteration failed', { error: String(err) });
            }
        }
    } else {
        await run();
        await db.end();
    }
}

main();
