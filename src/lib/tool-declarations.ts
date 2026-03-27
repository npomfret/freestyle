import type { ToolDeclaration } from './llm.js';
import { TOPICS } from './types.js';

// ============================================================
// Shared tool declarations used across agents
// Each agent picks the subset it needs.
// ============================================================

const TOPIC_LIST = TOPICS.join(', ');

export const fetchPageTool: ToolDeclaration = {
    name: 'fetch_page',
    description: 'Fetch and read a web page. Returns statusCode, content, and a likely_broken flag with problems array if issues are detected.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
    },
};

export const webSearchTool: ToolDeclaration = {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with URLs and snippets.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
    },
};

/** update_resource for the recheck agent (includes is_alive, shorter analysis). */
export const recheckUpdateTool: ToolDeclaration = {
    name: 'update_resource',
    description: 'Update a resource\'s metadata after rechecking it.',
    parameters: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description:
                    'The correct, human-readable name for this resource. Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
            },
            description: {
                type: 'string',
                description: 'New one-sentence description of what this resource provides. Write this even if one already exists — make it accurate and current.',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
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
                    'A 2-4 sentence analysis covering: what data/service this resource provides and in what format, how to access it (API key? open? rate limits?), what makes it notable, and any caveats.',
            },
        },
        required: ['description', 'is_alive', 'notes'],
    },
};

/** update_resource for the repair agent (no is_alive, detailed analysis). */
export const repairUpdateTool: ToolDeclaration = {
    name: 'update_resource',
    description: 'Update the resource metadata after reviewing the page content.',
    parameters: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description:
                    'The correct, human-readable name for this resource. Fix it if the current name is wrong, garbled, or just an emoji/symbol.',
            },
            description: {
                type: 'string',
                description: 'One-sentence description of what this resource provides. Make it accurate and current based on the page content.',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: `Topic labels (1-4) from: ${TOPIC_LIST}. Assign based on what the resource actually provides.`,
            },
            regions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Geographic regions (e.g. "Global", "Europe", "North America/United States"). Leave empty if not geographically specific.',
            },
            analysis: {
                type: 'string',
                description:
                    `A detailed write-up in markdown format. Use this structure:

**Overview**: What this resource is, who provides it, and what problem it solves. 2-3 sentences.

**Data & Format**: What data or functionality is available. Mention formats (JSON, CSV, GeoJSON, etc.), key endpoints or datasets, and the scope/coverage of the data.

**Access**: How to get started — open access, API key required (free signup?), OAuth, rate limits, quotas. Mention the free tier specifics if applicable.

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
    description: 'If the original URL is broken but you found the resource at a new URL, call this to update the URL. Call fetch_page on the new URL first to verify it works.',
    parameters: {
        type: 'object',
        properties: {
            new_url: { type: 'string', description: 'The new, working URL for this resource' },
            reason: { type: 'string', description: 'Why the URL changed (e.g. \'domain moved\', \'repo transferred\', \'new docs site\')' },
        },
        required: ['new_url', 'reason'],
    },
};

export const checkExistingTool: ToolDeclaration = {
    name: 'check_existing',
    description: 'Check if a URL already exists in our resources database or discovery queue. Always call this before adding a resource.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'The URL to check' },
        },
        required: ['url'],
    },
};

export const addResourceTool: ToolDeclaration = {
    name: 'add_resource',
    description: 'Add a verified free resource to our database. Only call this AFTER you have verified it is genuinely free or has a very generous free tier.',
    parameters: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Short name of the resource (e.g. \'OpenWeatherMap\')',
            },
            url: { type: 'string', description: 'URL of the resource' },
            kinds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Resource types. One or more of: "api", "dataset", "service"',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
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
                    'A 2-4 sentence analysis covering: what data/service it provides and in what format, how to access it (API key, open, rate limits), what makes it notable, and any caveats.',
            },
        },
        required: ['name', 'url', 'kinds', 'topics', 'description', 'analysis'],
    },
};

export const checkSocialTool: ToolDeclaration = {
    name: 'check_social',
    description:
        'Check Reddit, HackerNews, Twitter/X for discussions about a resource. Returns sentiment, recency, and whether interest is growing or dying.',
    parameters: {
        type: 'object',
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
    description:
        'Search for pages that link to or mention a specific URL. A resource referenced by government sites, universities, or major projects is more credible.',
    parameters: {
        type: 'object',
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
    parameters: {
        type: 'object',
        properties: {
            items: {
                type: 'array',
                items: {
                    type: 'object',
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
    parameters: {
        type: 'object',
        properties: {
            limit: {
                type: 'number',
                description: 'How many items to retrieve (default 10)',
            },
        },
    },
};
