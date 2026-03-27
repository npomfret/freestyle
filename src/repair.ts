import { fetchPage, updateResource } from './lib/agent-tools.js';
import type { ResourceRow } from './lib/agent-tools.js';
import { runAgent, toolHandlers } from './lib/agent-runner.js';
import type { AgentConfig } from './lib/agent-runner.js';
import { closeBrowser } from './lib/browser.js';
import { createPool } from './lib/db.js';
import { log, serializeError } from './lib/logger.js';
import { getNextRepairResource, getNextNoAnalysisResource, getNextNoDescriptionResource, getRepairResourceById } from './lib/resource-queries.js';
import { fetchPageTool, repairUpdateTool } from './lib/tool-declarations.js';
import { TOPICS } from './lib/types.js';

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
- APIs that require a free API key are valid resources — document the signup process in the Access section.
- The URL is already confirmed alive — focus entirely on metadata quality.
- Always call update_resource, even if the existing metadata looks correct (confirm and improve it).
- Read the page content carefully. Extract specific details rather than paraphrasing generically.

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
        tools: [repairUpdateTool, fetchPageTool],
        maxTurns: 10,

        toolHandlers: toolHandlers(
            ['update_resource', async (args) => updateResource(db, resource, {
                name: args.name as string | undefined,
                description: args.description as string,
                topics: args.topics as string[] | undefined,
                regions: args.regions as string[] | undefined,
                analysis: args.analysis as string | undefined,
                is_alive: true,
                notes: args.notes as string,
            }, { skipLinkChecks: true })],
            ['fetch_page', async (args) => fetchPage(args.url as string)],
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
