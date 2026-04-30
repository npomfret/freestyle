import type { ToolDeclaration } from './llm.js';
import { KINDS, TOPICS } from './types.js';

// ============================================================
// Shared tool declarations used across agents
// Each agent picks the subset it needs.
// ============================================================

const TOPIC_LIST = TOPICS.join(', ');

export const fetchPageTool: ToolDeclaration = {
    name: 'fetch_page',
    description: 'Open a specific URL and read the page content.',
    whenToUse: 'Use after you already know the exact URL you want to inspect or verify.',
    whenNotToUse: 'Do not use for discovery. Search first if you do not know the canonical URL.',
    returns: 'statusCode, content, likely_broken, problems, redirect information, execution tier, and source metadata.',
    notes: [
        'The content may be truncated.',
        'If likely_broken is true, treat the page as untrustworthy unless a later fetch proves otherwise.',
    ],
    examples: [
        { description: 'Open a documentation page', args: { url: 'https://example.com/docs' } },
    ],
    parallelSafe: true,
    timeoutMs: 25_000,
    maxCallsPerRun: 20,
    maxResponseChars: 16_000,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            url: { type: 'string', description: 'Exact URL to fetch and inspect.' },
        },
        required: ['url'],
    },
};

export const webSearchTool: ToolDeclaration = {
    name: 'lookup_web',
    description: 'Search the public web for candidate sources and official pages.',
    whenToUse: 'Use for discovery, finding moved resources, or collecting authoritative candidate URLs before opening them.',
    whenNotToUse: 'Do not use if you already have an exact page URL to inspect.',
    returns: 'query metadata, search results, source URLs, and any grounded summary text returned by the provider.',
    notes: [
        'Prefer primary sources such as official docs, product pages, dataset portals, and GitHub repos.',
        'Search results are not verification on their own. Open the source page before making important decisions.',
    ],
    examples: [
        { description: 'Find the official site for a project', args: { query: 'AgensGraph official site' } },
    ],
    parallelSafe: true,
    timeoutMs: 20_000,
    maxCallsPerRun: 12,
    maxResponseChars: 12_000,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            query: { type: 'string', description: 'Search query focused on the resource or topic you need to investigate.' },
        },
        required: ['query'],
    },
};

/** update_resource for the recheck agent (includes is_alive, shorter analysis). */
export const recheckUpdateTool: ToolDeclaration = {
    name: 'update_resource',
    description: 'Update a resource after rechecking whether the stored URL still works.',
    whenToUse: 'Use only after you have enough evidence from fetches and searches to decide whether the URL is alive and what metadata should be stored.',
    whenNotToUse: 'Do not use before verifying the current or repaired URL.',
    returns: 'Database update status, resource id, and current failure count.',
    examples: [
        {
            description: 'Mark a broken resource as dead after investigation',
            args: {
                description: 'A hosted graph database platform.',
                is_alive: false,
                notes: 'Old URL returns 404 and no working replacement was found.',
            },
        },
    ],
    timeoutMs: 15_000,
    maxCallsPerRun: 2,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            name: {
                type: 'string',
                description: 'The correct, human-readable name for this resource. Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
            },
            description: {
                type: 'string',
                description: 'New one-sentence description of what this resource provides. Write this even if one already exists — make it accurate and current.',
            },
            topics: {
                type: 'array',
                items: { type: 'string', enum: [...TOPICS] },
                description: `Updated topic labels (1-4) from: ${TOPIC_LIST}. Keep existing ones if still accurate, adjust if needed.`,
            },
            regions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Updated geographic regions (e.g. "Global", "Europe", "North America/United States"). Keep existing ones if still accurate, adjust if needed.',
            },
            is_alive: {
                type: 'boolean',
                description:
                    'true ONLY if this specific URL loads and serves the expected content. false if fetch_page returned likely_broken=true, or if the page is a 404, error, redirect to homepage, parked domain, etc.',
            },
            notes: {
                type: 'string',
                description: 'Brief notes about what you found: any changes, issues, or notable details',
            },
            analysis: {
                type: 'string',
                description:
                    'A 2-4 sentence analysis covering: what data/service this resource provides and in what format, access model (open-source licence / public-domain / free-tier / ≤$5k paid — include pricing or licence when visible), how to get started (API key? signup? rate limits?), what makes it notable, and any caveats.',
            },
        },
        required: ['description', 'is_alive', 'notes'],
    },
};

/** update_resource for the repair agent (no is_alive, detailed analysis). */
export const repairUpdateTool: ToolDeclaration = {
    name: 'update_resource',
    description: 'Update the resource metadata after reviewing the page content in detail.',
    whenToUse: 'Use once you have read the page and can produce final catalog metadata.',
    whenNotToUse: 'Do not use for intermediate notes or before inspecting the actual page.',
    returns: 'Database update status and resource id.',
    examples: [
        {
            description: 'Write repaired metadata after a successful review',
            args: {
                name: 'Example API',
                description: 'An API that provides weather observations and forecasts.',
                topics: ['climate', 'developer'],
                analysis: '**Overview**: ...',
                notes: 'Updated the description and topics from the live docs.',
            },
        },
    ],
    timeoutMs: 15_000,
    maxCallsPerRun: 2,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            name: {
                type: 'string',
                description: 'The correct, human-readable name for this resource. Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
            },
            description: {
                type: 'string',
                description: 'One-sentence description of what this resource provides. Make it accurate and current based on the page content.',
            },
            topics: {
                type: 'array',
                items: { type: 'string', enum: [...TOPICS] },
                description: `Topic labels (1-4) from: ${TOPIC_LIST}. Assign based on what the resource actually provides.`,
            },
            regions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Geographic regions (e.g. "Global", "Europe", "North America/United States"). Leave empty if not geographically specific.',
            },
            analysis: {
                type: 'string',
                description: `A detailed write-up in markdown format. Use this structure:

**Overview**: What this resource is, who provides it, and what problem it solves. 2-3 sentences.

**Data & Format**: What data or functionality is available. Mention formats (JSON, CSV, GeoJSON, etc.), key endpoints or datasets, and the scope/coverage of the data.

**Access**: Licence (open-source name, public-domain, proprietary) and pricing tier (free, free tier + paid, very-low-cost paid). State the actual cost — free, free-tier limits, or specific price. **Whenever any cost or non-trivial licence applies, include a direct link to the official pricing or licence page** (e.g. \`Pricing: https://example.com/pricing\`). How to get started — open access, API key required (free signup?), OAuth, rate limits, quotas. Quote actual prices and licence names when visible on the page.

**Strengths**: What makes this resource stand out — unique data, high quality, good documentation, active community, government-backed, etc.

**Limitations**: Honest caveats — rate limits, data freshness, geographic gaps, missing features, unstable uptime, unclear licensing, etc.

Write in a neutral, informative tone. Be specific — mention actual numbers (rate limits, dataset sizes, update frequency) when visible on the page. Aim for 150-300 words total.`,
            },
            notes: {
                type: 'string',
                description: 'Brief notes about any changes you made or anything notable.',
            },
        },
        required: ['name', 'description', 'topics', 'analysis', 'notes'],
    },
};

export const repairUrlTool: ToolDeclaration = {
    name: 'repair_url',
    description: 'Update a resource URL after you have verified that the resource moved to a new canonical page.',
    whenToUse: 'Use only after fetch_page confirms that the new URL works.',
    whenNotToUse: 'Do not use for guesses, raw endpoints, or pages you have not fetched.',
    returns: 'Database update status plus the old and new URLs.',
    timeoutMs: 15_000,
    maxCallsPerRun: 1,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            new_url: { type: 'string', description: 'The new, working URL for this resource' },
            reason: { type: 'string', description: 'Why the URL changed (e.g. \'domain moved\', \'repo transferred\', \'new docs site\')' },
        },
        required: ['new_url', 'reason'],
    },
};

export const checkExistingTool: ToolDeclaration = {
    name: 'check_existing',
    description: 'Check whether a candidate URL already exists in the resources table or discovery queue.',
    whenToUse: 'Use before add_resource to avoid duplicates.',
    whenNotToUse: 'Do not use for URLs you are not seriously considering adding.',
    returns: 'Whether the URL already exists in resources and/or the queue.',
    parallelSafe: true,
    timeoutMs: 10_000,
    maxCallsPerRun: 30,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            url: { type: 'string', description: 'The URL to check' },
        },
        required: ['url'],
    },
};

export const addResourceTool: ToolDeclaration = {
    name: 'add_resource',
    description: 'Add a verified accessible resource to the catalog.',
    whenToUse:
        'Use only after you have opened the primary source, confirmed it is real, and checked that it is open-source, public-domain, has a generous free tier, or is very low cost (up to ~$300/month for the full product, or an equivalent one-off purchase). When any cost applies, you must have located the official pricing page so it can be linked from the analysis.',
    whenNotToUse:
        'Do not use for aggregators, tutorials, blog posts, trial-only access, or products without a clearly cheap tier (enterprise SaaS, "contact sales" pricing, or paid plans well above ~$300/month).',
    returns: 'The inserted resource id or duplicate status.',
    timeoutMs: 15_000,
    maxCallsPerRun: 8,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            name: {
                type: 'string',
                description: 'Short name of the resource (e.g. \'OpenWeatherMap\')',
            },
            url: { type: 'string', description: 'URL of the resource' },
            kinds: {
                type: 'array',
                items: { type: 'string', enum: [...KINDS] },
                description: `Resource types. One or more of: ${KINDS.join(', ')}`,
            },
            topics: {
                type: 'array',
                items: { type: 'string', enum: [...TOPICS] },
                description: `1-4 topic labels from: ${TOPIC_LIST}`,
            },
            regions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Geographic regions this resource covers (e.g. "Global", "Europe", "North America/United States"). Leave empty if not geographically specific.',
            },
            description: {
                type: 'string',
                description: 'One-sentence description of what this resource provides',
            },
            analysis: {
                type: 'string',
                description:
                    'A 2-4 sentence analysis covering: what data/service it provides and in what format; access model (open-source licence / public-domain / free tier / very-low-cost paid); the actual cost — free, free-tier limits, or specific price — AND a direct link to the official pricing or licence page whenever any cost or non-trivial licence applies (e.g. "Pricing: https://example.com/pricing — free up to 1k req/day, $5/month above"); how to get started (API key? signup? rate limits?); what makes it notable; and any caveats.',
            },
        },
        required: ['name', 'url', 'kinds', 'topics', 'description', 'analysis'],
    },
};

export const checkSocialTool: ToolDeclaration = {
    name: 'check_social',
    description: 'Check Reddit, HackerNews, Twitter/X for discussions about a resource. Returns sentiment, recency, and whether interest is growing or dying.',
    whenToUse: 'Use when social proof or warning signals could affect whether a resource is worth cataloging.',
    whenNotToUse: 'Do not use as the primary verification source for whether a resource exists or is free.',
    returns: 'Grounded social-search summary plus cited URLs when available.',
    parallelSafe: true,
    timeoutMs: 20_000,
    maxCallsPerRun: 8,
    maxResponseChars: 12_000,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            name: {
                type: 'string',
                description: 'Name of the resource to check (e.g. \'OpenWeatherMap API\')',
            },
        },
        required: ['name'],
    },
};

export const checkReferencesTool: ToolDeclaration = {
    name: 'check_references',
    description: 'Search for pages that link to or mention a specific URL. A resource referenced by government sites, universities, or major projects is more credible.',
    whenToUse: 'Use when you want credibility evidence around a candidate resource.',
    whenNotToUse: 'Do not use instead of opening the resource itself.',
    returns: 'Grounded backlink/reference summary plus cited URLs when available.',
    parallelSafe: true,
    timeoutMs: 20_000,
    maxCallsPerRun: 8,
    maxResponseChars: 12_000,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            url: {
                type: 'string',
                description: 'The URL to check references for',
            },
        },
        required: ['url'],
    },
};

export const queueItemsTool: ToolDeclaration = {
    name: 'queue_items',
    description: 'Queue multiple URLs for later processing. Use when you find a list/directory of resources. Items at depth >= 3 are silently dropped to prevent infinite recursion.',
    whenToUse: 'Use for directories, awesome-lists, org pages, or resource indexes that should be split into individual candidate URLs.',
    whenNotToUse: 'Do not use for a single resource page that should be evaluated directly.',
    returns: 'Queue insertion status and counts.',
    timeoutMs: 15_000,
    maxCallsPerRun: 10,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        url: { type: 'string', description: 'URL to queue' },
                        label: { type: 'string', description: 'Name or label of the resource' },
                        source: { type: 'string', description: 'Where you found this link' },
                        depth: { type: 'number', description: 'Nesting depth — set to (source item depth + 1). Omit or use 0 for top-level items. Items at depth >= 3 are dropped.' },
                    },
                    required: ['url'],
                },
                description: 'List of items to queue',
            },
        },
        required: ['items'],
    },
};

export const getQueueTool: ToolDeclaration = {
    name: 'get_queue',
    description: 'Get the next batch of pending URLs from the discovery queue to process. Each item includes a `depth` field — use depth+1 when calling queue_items for any children you find.',
    whenToUse: 'Use in discovery loop mode when there are queued candidate URLs to process.',
    whenNotToUse: 'Do not use if you still have fresh unexplored candidates in the current page context.',
    returns: 'Queued URLs with labels, sources, and nesting depth.',
    parallelSafe: true,
    timeoutMs: 10_000,
    maxCallsPerRun: 8,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            limit: {
                type: 'number',
                description: 'How many items to retrieve (default 10)',
            },
        },
    },
};
