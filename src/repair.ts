import { fetchPage, updateResource } from './lib/agent-tools.js';
import type { ResourceRow } from './lib/agent-tools.js';
import { closeBrowser } from './lib/browser.js';
import { createPool } from './lib/db.js';
import { getLLMProvider } from './lib/llm.js';
import type { LLMMessage, ToolDeclaration } from './lib/llm.js';
import { log } from './lib/logger.js';
import type { Kind, Region, ResourceId, Topic, Url } from './lib/types.js';
import { ResourceId as mkResourceId, Url as mkUrl } from './lib/types.js';

const MAX_TURNS = 10;

const TOPIC_LABELS = [
    'ai-ml', 'agriculture', 'audio', 'bioinformatics', 'blockchain',
    'chemistry', 'climate', 'cybersecurity', 'data-science', 'developer',
    'drug-discovery', 'finance', 'food', 'games', 'geospatial', 'geoscience',
    'government', 'health', 'humanities', 'journalism', 'law', 'maritime',
    'materials', 'neuroscience', 'nlp', 'open-science', 'remote-sensing',
    'robotics', 'semantic-web', 'social-science', 'space', 'sports', 'transport',
];

const db = createPool();

// ============================================================
// Tool declarations — only update_resource and fetch_page
// ============================================================

const toolDeclarations: ToolDeclaration[] = [
    {
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
                    description: `Topic labels (1-4) from: ${TOPIC_LABELS.join(', ')}. Assign based on what the resource actually provides.`,
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
    },
    {
        name: 'fetch_page',
        description: 'Fetch a URL to read its content. Use if you need to check a linked page for more detail.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' },
            },
            required: ['url'],
        },
    },
];

// ============================================================
// System instruction
// ============================================================

const REPAIR_SYSTEM_INSTRUCTION = `You are a metadata repair agent. Your job is to review an existing resource in our catalog and produce accurate, detailed metadata based on the actual page content.

## Your task
You will receive a resource's current metadata and the fetched content of its URL. Review the page thoroughly and call update_resource with improved metadata. This is your main opportunity to produce a high-quality catalog entry, so be thorough.

## Guidelines
- **name**: The proper human-readable name. Fix garbled names, emoji-only names, or overly generic names.
- **description**: One clear, specific sentence about what this resource provides and why a developer would use it. Avoid vague language like "provides data" — say what data.
- **topics**: 1-4 topic labels from the allowed set. Choose based on what the resource actually covers.
- **regions**: Geographic coverage. Use "Global" if worldwide, specific regions/countries if limited. Omit if not geographically specific.
- **analysis**: This is the most important field. Write a detailed markdown write-up (150-300 words) covering overview, data/format, access, strengths, and limitations. Be specific — include actual numbers (rate limits, dataset sizes, update frequencies, number of endpoints) when visible on the page. This write-up should give a developer everything they need to decide whether this resource is useful for their project.
- **notes**: What you changed and why, or "metadata confirmed accurate" if no changes needed.

## Important
- APIs that require a free API key are valid resources — document the signup process in the Access section.
- The URL is already confirmed alive — focus entirely on metadata quality.
- Always call update_resource, even if the existing metadata looks correct (confirm and improve it).
- Read the page content carefully. Extract specific details rather than paraphrasing generically.

Available topic labels: ${TOPIC_LABELS.join(', ')}
Kind values: api (HTTP endpoints), dataset (downloadable data), service (hosted tool), code (repo/library)
Region format: "Global", continent, continent/country, or sub-region`;

// ============================================================
// Tool execution
// ============================================================

let currentResource: ResourceRow | null = null;

async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    switch (name) {
        case 'update_resource': {
            if (!currentResource) return { error: 'No current resource' };
            return updateResource(db, currentResource, {
                name: args.name as string | undefined,
                description: args.description as string,
                topics: args.topics as string[] | undefined,
                regions: args.regions as string[] | undefined,
                analysis: args.analysis as string | undefined,
                is_alive: true,
                notes: args.notes as string,
            }, { skipLinkChecks: true });
        }

        case 'fetch_page':
            return fetchPage(args.url as string);

        default:
            return { error: `Unknown tool: ${name}` };
    }
}

// ============================================================
// Get next resource to repair (oldest updated_at, alive only)
// ============================================================

async function getNextResource(): Promise<ResourceRow | null> {
    const { rows } = await db.query(`
        SELECT r.id, r.name, r.url
        FROM resources r
        LEFT JOIN link_checks lc ON lc.resource_id = r.id
        WHERE lc.status IS NULL OR lc.status = 'alive'
        ORDER BY r.updated_at ASC
        LIMIT 1
    `);

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
        kinds: kinds.rows.map((k: { kind: string }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string }) => t.topic as Topic),
        regions: regions.rows.map((rg: { region: string }) => rg.region as Region),
        descriptions: descs.rows.map((d: { description: string }) => d.description),
    };
}

async function getResourceById(id: number): Promise<ResourceRow | null> {
    const { rows } = await db.query(`
        SELECT r.id, r.name, r.url
        FROM resources r
        LEFT JOIN link_checks lc ON lc.resource_id = r.id
        WHERE r.id = $1
        AND (lc.status IS NULL OR lc.status = 'alive')
    `, [id]);
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
        kinds: kinds.rows.map((k: { kind: string }) => k.kind as Kind),
        topics: topics.rows.map((t: { topic: string }) => t.topic as Topic),
        regions: regions.rows.map((rg: { region: string }) => rg.region as Region),
        descriptions: descs.rows.map((d: { description: string }) => d.description),
    };
}

// ============================================================
// Repair one resource
// ============================================================

async function repairOne(resource: ResourceRow): Promise<void> {
    currentResource = resource;
    const rlog = log.child({ agent: 'repair', resourceId: resource.id, url: resource.url });

    // Fetch the page content
    const fetchResult = await fetchPage(resource.url);
    if (fetchResult.likely_broken) {
        rlog.info('skipping — page appears broken (run validity-check first)', {
            problems: fetchResult.problems,
        });
        return;
    }

    const provider = await getLLMProvider();

    const resourceContext = `Review and repair the metadata for this resource:

- Name: ${resource.name}
- URL: ${resource.url}
- Current kinds: ${resource.kinds.join(', ') || 'none'}
- Current topics: ${resource.topics.join(', ') || 'none'}
- Current regions: ${resource.regions.join(', ') || 'none'}
- Current description: ${resource.descriptions[0] || 'none'}

Page content:
${fetchResult.content}

Review the page content and call update_resource with accurate, complete metadata.`;

    const messages: LLMMessage[] = [
        { role: 'user', text: resourceContext },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await provider.generate(messages, {
            systemInstruction: REPAIR_SYSTEM_INSTRUCTION,
            tools: toolDeclarations,
        });

        if (response.text) {
            rlog.debug('agent text', { text: response.text });
        }

        if (response.functionCalls.length === 0) {
            rlog.warn('agent returned no action', { text: response.text });
            break;
        }

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

            if (fc.name === 'update_resource') {
                rlog.info('metadata updated');
                return;
            }
        }

        messages.push({ role: 'user', functionResponses });
    }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const idFlag = args.indexOf('--id');
    const singleId = idFlag !== -1 ? Number(args[idFlag + 1]) : null;
    const batchArg = singleId == null ? args[0] : undefined;

    try {
        if (singleId != null && Number.isInteger(singleId) && singleId > 0) {
            const resource = await getResourceById(singleId);
            if (!resource) {
                log.error('resource not found or not alive', { id: singleId });
                process.exit(1);
            }
            log.info('repairing single resource', { id: resource.id, name: resource.name, url: resource.url });
            await repairOne(resource);
        } else {
            const batchSize = Number(batchArg) || 10;
            log.info('repair started', { count: batchSize });

            for (let i = 0; i < batchSize; i++) {
                const resource = await getNextResource();
                if (!resource) {
                    log.info('no more resources to repair');
                    break;
                }

                log.info('repairing resource', {
                    index: i + 1,
                    total: batchSize,
                    id: resource.id,
                    name: resource.name,
                    url: resource.url,
                });

                try {
                    await repairOne(resource);
                } catch (err) {
                    log.error('repair failed', { id: resource.id, error: String(err) });
                }
            }
        }

        log.info('repair complete');
    } finally {
        await closeBrowser();
        await db.end();
    }
}

main();
