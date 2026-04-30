import { runAgent, toolHandlers } from './lib/agent-runner.js';
import type { AgentConfig } from './lib/agent-runner.js';
import { fetchPage, queueItems, updateResource } from './lib/agent-tools.js';
import type { ResourceRow } from './lib/agent-tools.js';
import { closeBrowser } from './lib/browser.js';
import { createPool } from './lib/db.js';
import { fetchPageToolResult } from './lib/fetch-page.js';
import { log, serializeError } from './lib/logger.js';
import { getNextNoAnalysisResource, getNextNoDescriptionResource, getNextRepairResource, getRepairResourceById } from './lib/resource-queries.js';
import { fetchPageTool, queueItemsTool, repairUpdateTool } from './lib/tool-declarations.js';
import { SourceName, TOPICS, Url } from './lib/types.js';

const TOPIC_LIST = TOPICS.join(', ');

const db = createPool();

// ============================================================
// System instruction
// ============================================================

const SYSTEM_INSTRUCTION = `You are a metadata repair agent. Your job is to review an existing resource in our catalog and produce accurate, detailed metadata based on the actual page content.

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
- We catalog only zero-cost and very-low-cost resources: open-source, public-domain, generous free tier, or genuinely cheap paid (up to about $300/month for the full product, or an equivalent one-off purchase). Document the licence, access model (API key / signup / OAuth), and the actual pricing in the Access section. **Whenever any cost or non-trivial licence applies, include a direct link to the official pricing or licence page** (e.g. \`Pricing: https://example.com/pricing\`). Quote actual prices and licence names when visible on the page.
- The URL is already confirmed alive — focus entirely on metadata quality.
- Always call update_resource, even if the existing metadata looks correct (confirm and improve it).
- Read the page content carefully. Extract specific details rather than paraphrasing generically.
- When you rely on follow-up fetches, prefer evidence from those fetched pages over prior assumptions.
- Tool results may include structured data and sources. If fetch_page returns source metadata, treat the fetched page content as the source of truth.

## List resources
If the page is primarily a curated list or index of other resources — such as an organisation page, a link directory, a README whose main content is links to other tools/datasets, or any page that is a collection of pointers rather than a resource itself — call queue_items BEFORE update_resource to extract the individual resource URLs. Set depth=1 for each item (these are one level below the current resource). The system stops drilling at depth 3 automatically — no need to judge whether children are also lists.

Available topic labels: ${TOPIC_LIST}
Kind values: api (HTTP endpoints), dataset (downloadable data), service (hosted tool), code (repo/library)
Region format: "Global", continent, continent/country, or sub-region`;

// ============================================================
// Repair one resource
// ============================================================

async function repairOne(resource: ResourceRow): Promise<void> {
    // Pre-fetch the page
    const fetchResult = await fetchPage(resource.url);
    if (fetchResult.likely_broken) {
        log.info('skipping — page appears broken (run validity-check first)', {
            id: resource.id,
            problems: fetchResult.problems,
        });
        return;
    }

    const config: AgentConfig = {
        name: 'repair',
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [repairUpdateTool, fetchPageTool, queueItemsTool],
        maxTurns: 10,

        toolHandlers: toolHandlers(
            ['update_resource', async (args) =>
                updateResource(db, resource, {
                    name: args.name as string | undefined,
                    description: args.description as string,
                    topics: args.topics as string[] | undefined,
                    regions: args.regions as string[] | undefined,
                    analysis: args.analysis as string | undefined,
                    is_alive: true,
                    notes: args.notes as string,
                }, { skipLinkChecks: true })],
            ['fetch_page', async (args) => {
                const url = args.url as string;
                return fetchPageToolResult(url, await fetchPage(url));
            }],
            ['queue_items', async (args) => {
                const rawItems = (args as { items: { url: string; label: string; source: string; depth?: number; }[]; }).items;
                const items = rawItems.map((i) => ({
                    url: Url(i.url),
                    label: i.label ?? '',
                    source: SourceName(i.source ?? resource.url),
                    depth: i.depth ?? 1,
                }));
                return queueItems(db, { items });
            }],
        ),

        onResponse: () => 'continue',

        onToolResult: (call) => call.name === 'update_resource',
    };

    const context = `Review and repair the metadata for this resource:

- Name: ${resource.name}
- URL: ${resource.url}
- Current kinds: ${resource.kinds.join(', ') || 'none'}
- Current topics: ${resource.topics.join(', ') || 'none'}
- Current regions: ${resource.regions.join(', ') || 'none'}
- Current description: ${resource.descriptions[0] || 'none'}

Page content:
${fetchResult.content}

Review the page content and call update_resource with accurate, complete metadata.`;

    await runAgent(config, [{ role: 'user', text: context }]);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const idFlag = args.indexOf('--id');
    const modeFlag = args.indexOf('--mode');
    const singleId = idFlag !== -1 ? Number(args[idFlag + 1]) : null;
    const mode = modeFlag !== -1 ? args[modeFlag + 1] : 'all';
    const batchArg = singleId == null ? args.find((a) => /^\d+$/.test(a)) : undefined;

    const getNextResource = mode === 'no-analysis'
        ? () => getNextNoAnalysisResource(db)
        : mode === 'no-description'
        ? () => getNextNoDescriptionResource(db)
        : () => getNextRepairResource(db);

    try {
        if (singleId != null && Number.isInteger(singleId) && singleId > 0) {
            const resource = await getRepairResourceById(db, singleId);
            if (!resource) {
                log.error('resource not found or not alive', { id: singleId });
                process.exit(1);
            }
            log.info('repairing single resource', { id: resource.id, name: resource.name, url: resource.url });
            await repairOne(resource);
        } else {
            const batchSize = Number(batchArg) || 10;
            log.info('repair started', { count: batchSize, mode });

            for (let i = 0; i < batchSize; i++) {
                const resource = await getNextResource();
                if (!resource) {
                    log.info('no more resources to repair', { mode });
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
                    log.error('repair failed', { id: resource.id, ...serializeError(err) });
                }
                // Bump updated_at so getNextRepairResource doesn't retry the same resource.
                await db.query('UPDATE resources SET updated_at = now() WHERE id = $1', [resource.id]);
            }
        }

        log.info('repair complete');
    } finally {
        await closeBrowser();
        await db.end();
    }
}

main();
