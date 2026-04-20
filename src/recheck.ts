import { fetchPage, updateResource } from './lib/agent-tools.js';
import type { ResourceRow } from './lib/agent-tools.js';
import { runAgent, toolHandlers } from './lib/agent-runner.js';
import type { AgentConfig } from './lib/agent-runner.js';
import { closeBrowser } from './lib/browser.js';
import { createPool } from './lib/db.js';
import { fetchPageToolResult } from './lib/fetch-page.js';
import { webSearch } from './lib/search.js';
import { log, serializeError } from './lib/logger.js';
import { toolError } from './lib/tool-runtime.js';
import { getNextRecheckResource, getNextSuspectResource, getResourceById, getResourceByUrl } from './lib/resource-queries.js';
import { fetchPageTool, recheckUpdateTool, repairUrlTool, webSearchTool } from './lib/tool-declarations.js';
import type { ResourceId } from './lib/types.js';
import { TOPICS } from './lib/types.js';

const TOPIC_LIST = TOPICS.join(', ');

const db = createPool();

// ============================================================
// System instruction
// ============================================================

const SYSTEM_INSTRUCTION = `You are a quality-check agent. Your job is to recheck whether a specific URL in our catalog still works.

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
1. Use lookup_web to find where the resource moved to (e.g. "AgensGraph official site", "AgensGraph GitHub")
2. If you find a new, working URL (website, docs, or pricing page — not a raw API endpoint):
   a. Use fetch_page on the new URL to verify it actually works
   b. If the new URL works, call repair_url with the new URL, then call update_resource with is_alive = true
   c. If the new URL also doesn't work, call update_resource with is_alive = false
3. If you can't find the resource anywhere, call update_resource with is_alive = false

## Steps
1. Look at the pre-fetched results provided in the first message
2. If the page appears broken:
   a. lookup_web for the resource name to find a new URL and rely on the returned source URLs
   b. If found: fetch_page the new URL → repair_url if it works → update_resource with is_alive = true
   c. If not found or new URL also broken: update_resource with is_alive = false
3. Call update_resource with:
   - name: the correct human-readable name (fix if garbled/emoji/symbol)
   - description: one sentence about what this resource provides
   - topics: updated if needed
   - is_alive: true/false (follow the rules above strictly)
   - notes: what you found, include old URL if repaired

Available topic labels: ${TOPIC_LIST}

Kind values: api (HTTP endpoints), dataset (downloadable data), service (hosted tool), code (repo/library)

Region format: "Global", continent (e.g. "Europe"), continent/country (e.g. "North America/United States"), or sub-region (e.g. "EU", "Middle East")

Be concise.`;

// ============================================================
// Failure escalation (suspect → dead)
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
// Recheck one resource
// ============================================================

async function recheckOne(resource: ResourceRow): Promise<void> {
    const rlog = log.child({ agent: 'recheck', resourceId: resource.id, url: resource.url });

    // Pre-fetch the page (native + puppeteer, no Gemini fallback)
    const fetchResult = await fetchPage(resource.url, { tiers: ['native', 'puppeteer'] });
    rlog.info('pre-fetch result', {
        statusCode: fetchResult.statusCode,
        likely_broken: fetchResult.likely_broken,
        problems: fetchResult.problems,
    });

    // Fast-path: if healthy, update DB directly — no LLM needed
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

    // Page is broken — use LLM to diagnose and attempt repair
    const config: AgentConfig = {
        name: 'recheck',
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [fetchPageTool, recheckUpdateTool, webSearchTool, repairUrlTool],
        maxTurns: 20,

        toolHandlers: toolHandlers(
            ['fetch_page', async (args) => {
                const url = args.url as string;
                return fetchPageToolResult(url, await fetchPage(url));
            }],
            ['lookup_web', async (args) => webSearch(args.query as string)],
            ['update_resource', async (args) => updateResource(db, resource, {
                name: args.name as string | undefined,
                description: args.description as string,
                topics: args.topics as string[] | undefined,
                regions: args.regions as string[] | undefined,
                analysis: args.analysis as string | undefined,
                is_alive: args.is_alive as boolean,
                notes: args.notes as string,
            })],
            ['repair_url', async (args) => {
                const newUrl = args.new_url as string;
                const reason = args.reason as string;
                const { rows: dupeRows } = await db.query(
                    'SELECT id FROM resources WHERE url = $1', [newUrl],
                );
                if (dupeRows.length > 0) {
                    return toolError(`URL already exists as resource ${dupeRows[0].id}`, {
                        code: 'duplicate_resource_url',
                        details: { url: newUrl },
                    });
                }
                const oldUrl = resource.url;
                await db.query('UPDATE resources SET url = $1, updated_at = now() WHERE id = $2', [newUrl, resource.id]);
                rlog.info('url repaired', { id: resource.id, oldUrl, newUrl, reason });
                return { status: 'url_updated', id: resource.id, oldUrl, newUrl, reason };
            }],
        ),

        onResponse: () => 'continue',

        onToolResult: (call) => call.name === 'update_resource',

        onNoTools: async (response): Promise<'break'> => {
            await recordFailure(resource.id, `agent returned no action: ${response.text?.slice(0, 200) ?? 'no text'}`);
            return 'break';
        },
    };

    const context = `Resource to check:
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

The page appears broken. Try to find where this resource moved to using lookup_web, then repair_url if you find it. Call update_resource when done.`;

    await runAgent(config, [{ role: 'user', text: context }]);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const idFlag = args.indexOf('--id');
    const urlFlag = args.indexOf('--url');
    const singleId = idFlag !== -1 ? Number(args[idFlag + 1]) : null;
    const singleUrl = urlFlag !== -1 ? args[urlFlag + 1] : null;
    const suspectOnly = args.includes('--suspect');
    const batchArg = (singleId == null && singleUrl == null) ? args.find((a) => /^\d+$/.test(a)) : undefined;

    try {
        if (singleId != null || singleUrl != null) {
            const resource = singleUrl
                ? await getResourceByUrl(db, singleUrl)
                : await getResourceById(db, singleId!);
            if (!resource) {
                log.error('resource not found', { id: singleId, url: singleUrl });
                process.exit(1);
            }
            log.info('rechecking single resource', { id: resource.id, name: resource.name, url: resource.url });
            try {
                await recheckOne(resource);
            } catch (err) {
                log.error('recheck failed', { id: resource.id, url: resource.url, ...serializeError(err) });
                await recordFailure(resource.id, `Agent error: ${err}`);
            }
        } else {
            const count = Number(batchArg) || 10;
            log.info('recheck started', { count, suspectOnly });

            for (let i = 0; i < count; i++) {
                const resource = suspectOnly
                    ? await getNextSuspectResource(db)
                    : await getNextRecheckResource(db);
                if (!resource) {
                    log.info(suspectOnly ? 'no more suspect resources' : 'no more resources to check');
                    break;
                }

                log.info('checking resource', { index: i + 1, total: count, id: resource.id, name: resource.name, url: resource.url });

                try {
                    await recheckOne(resource);
                } catch (err) {
                    log.error('recheck failed', { id: resource.id, url: resource.url, ...serializeError(err) });
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
    } finally {
        await closeBrowser();
        await db.end();
    }
}

main();
