import { addResource, checkExisting, fetchPage, getQueue, queueItems } from './lib/agent-tools.js';
import { runAgent, toolHandlers } from './lib/agent-runner.js';
import type { AgentConfig } from './lib/agent-runner.js';
import { createPool } from './lib/db.js';
import { generateDiscoveryQuery } from './lib/discovery-topics.js';
import { webSearch, checkSocial, checkReferences } from './lib/search.js';
import { log, serializeError } from './lib/logger.js';
import {
    fetchPageTool, webSearchTool, checkExistingTool, addResourceTool,
    checkSocialTool, checkReferencesTool, queueItemsTool, getQueueTool,
} from './lib/tool-declarations.js';
import { Kind, Region, SourceName, Topic, TOPICS, Url } from './lib/types.js';

const TOPIC_LIST = TOPICS.join(', ');

// ============================================================
// Exclusion list — skip these domains/URLs automatically
// ============================================================

const EXCLUDED_DOMAINS = [
    'kaggle.com',
    'wikipedia.org',
    'medium.com',
    'towardsdatascience.com',
    'stackoverflow.com',
    'reddit.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'freecodecamp.org',
    'udemy.com',
    'coursera.org',
    'rapidapi.com',
    'programmableweb.com',
    'any-api.com',
    'freepublicapis.com',
    'findapis.com',
    'apilist.fun',
    'public-apis.io',
    'vertexaisearch.cloud.google.com',
];

function isExcludedUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return EXCLUDED_DOMAINS.some((d) => lower.includes(d));
}

// ============================================================
// System instruction
// ============================================================

const SYSTEM_INSTRUCTION = `You are a research agent that finds free APIs, datasets, and web services on the internet and adds them to our catalog database.

## What we're looking for
Resources that are FREE or have a very generous free tier (< $1000/year). This includes:
- Open APIs with no or generous rate limits
- APIs that are free but require an API key for access — these are valid (e.g. NASA APIs, OpenWeatherMap)
- Public datasets available for download
- Government and academic data portals
- Open-source tools and services with free hosted tiers
- GitHub repos that ARE the dataset or API (not just code that uses one)

## URL guidelines
The URL we store should be the resource's main website, documentation page, or pricing page — NOT a raw API endpoint. We want the page a developer would visit to learn about and sign up for the resource.

## What to SKIP — be ruthless
- Anything that requires paid access to get real value (trials don't count)
- "Free tier" that's just a demo with 10 requests/month — useless
- Aggregator sites and directories (Kaggle, RapidAPI, ProgrammableWeb, etc.) — we want PRIMARY sources
- Blog posts, tutorials, courses, Wikipedia articles
- Vaporware, abandoned repos (no commits in 2+ years), broken links
- Generic/obvious resources everyone already knows (Google Maps, Twitter API, etc.)
- Marketing pages that say "API" but are really selling SaaS

## Handling lists and "awesome lists"
GitHub repos whose README is primarily a curated list of links (e.g. "awesome-public-datasets", "public-apis", "awesome-X") are **directories, not primary resources**. Do NOT add them with add_resource. Instead:
1. fetch_page the URL to get the content
2. queue_items all the individual resource URLs found in the list
3. When queueing items from a source that was itself queued at depth N, set depth = N+1 in each item
4. The system stops drilling at depth 3 — items with depth >= 3 are dropped automatically

This applies to any page that is primarily an index of other resources, not a resource itself.

## Quality evaluation process
For each candidate resource:
1. Use fetch_page to visit the actual page — verify it loads, is real, and is free
2. Use check_references to see who links to it — a resource referenced by government sites, universities, or major projects is much more credible than one nobody links to
3. Use check_social to see what Reddit, HackerNews, and Twitter say — look for red flags like reliability complaints, surprise pricing, or shutdowns. Growing interest is a positive signal.
4. Look for: actual documentation, data samples, clear terms of use, active maintenance
5. Only call add_resource after you're confident it's genuinely useful and free

## Classification
- kinds: "api" (has HTTP endpoints), "dataset" (downloadable data), "service" (hosted tool), "code" (repo/library)
- topics: assign 1-4 from: ${TOPIC_LIST}
- regions: geographic areas the resource covers — use continent (e.g. "Europe"), continent/country (e.g. "North America/United States"), sub-region (e.g. "EU", "Middle East"), or "Global". Leave empty if not geographically specific.
- description: one clear sentence about what it provides and why it's useful
- analysis: 2-4 sentences covering what data/service it provides and in what format, how to access it (API key? open? rate limits?), what makes it notable, and any caveats

## Excluded domains (skip these automatically)
${EXCLUDED_DOMAINS.join(', ')}

## Workflow
1. web_search to find candidates
2. For each: check_existing → fetch_page → check_references → add_resource (if it passes)
3. If you find a list/directory (awesome list, dataset index, API catalog): fetch_page it, queue_items the individual resources (depth=0 for top-level finds), do NOT add_resource for the list itself
4. When processing items from get_queue, pass depth = item.depth+1 in queue_items if those items are also lists
5. Search from multiple angles — try different search terms, follow links from good resources

## How to search
Search for the subject matter directly — e.g. "crystal structure database", "earthquake data portal", "ship tracking AIS" — NOT "free crystal structure APIs databases datasets".
Find the resource first, then evaluate whether it's free. Appending "free API" to every query produces worse results.

When done, say "DISCOVERY COMPLETE" and give a summary of what you added and what you skipped (with reasons).`;

// ============================================================
// Discover
// ============================================================

const db = createPool();

/** If url is a GitHub org root (github.com/<org>), return the repositories listing URL. */
function githubOrgReposUrl(url: string): string | null {
    const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/?$/);
    if (!match) return null;
    return `https://github.com/orgs/${match[1]}/repositories?type=all`;
}

async function discover(query: string, isUrl = false): Promise<void> {
    const config: AgentConfig = {
        name: 'discover',
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [
            webSearchTool, checkSocialTool, checkReferencesTool, checkExistingTool,
            addResourceTool, fetchPageTool, queueItemsTool, getQueueTool,
        ],
        maxTurns: 50,

        toolHandlers: toolHandlers(
            ['web_search', async (args) => ({ results: await webSearch(args.query as string) })],
            ['check_social', async (args) => ({ social: await checkSocial(args.name as string) })],
            ['check_references', async (args) => ({ references: await checkReferences(args.url as string) })],
            ['check_existing', async (args) => {
                const url = args.url as string;
                if (isExcludedUrl(url)) return { error: 'URL excluded: domain is in the blocklist' };
                return checkExisting(db, { url: Url(url) });
            }],
            ['add_resource', async (args) => {
                const url = args.url as string;
                if (isExcludedUrl(url)) return { error: 'URL excluded: domain is in the blocklist' };
                return addResource(db, {
                    name: args.name as string,
                    url: Url(url),
                    kinds: (args.kinds as string[]).map(Kind),
                    topics: (args.topics as string[]).map(Topic),
                    regions: args.regions ? (args.regions as string[]).map(Region) : undefined,
                    description: args.description as string,
                    analysis: args.analysis as string | undefined,
                });
            }],
            ['fetch_page', async (args) => fetchPage(args.url as string)],
            ['queue_items', async (args) => {
                const rawItems = (args as { items: { url: string; label: string; source: string; depth?: number }[] }).items;
                const filtered = rawItems
                    .filter((i) => i.url && !isExcludedUrl(i.url))
                    .map((i) => ({ url: Url(i.url), label: i.label, source: SourceName(i.source), depth: i.depth ?? 0 }));
                const excluded = rawItems.length - filtered.length;
                const result = await queueItems(db, { items: filtered });
                return { ...result, excludedByBlocklist: excluded };
            }],
            ['get_queue', async (args) => getQueue(db, args as { limit: number })],
        ),

        onResponse: (response) => {
            if (response.text?.includes('DISCOVERY COMPLETE')) return 'done';
            return 'continue';
        },

        onNoTools: (response) => {
            // Nudge the agent to keep going
            const msgs = [];
            if (response.text) msgs.push({ role: 'model' as const, text: response.text });
            msgs.push({
                role: 'user' as const,
                text: 'Continue. Use web_search to find more resources, or get_queue if there are queued items.',
            });
            return msgs;
        },
    };

    const reposUrl = isUrl ? githubOrgReposUrl(query) : null;
    const initialMessage = reposUrl
        ? `Evaluate the GitHub organization at ${query}. Fetch its repository listing at ${reposUrl} to find individual repos. For each relevant repo, evaluate it and add it to the catalog if it qualifies. Do NOT add the org page itself.`
        : isUrl
        ? `Evaluate this specific URL and add it to the catalog if appropriate: ${query}\n\nBegin by fetching the page directly with fetch_page.`
        : `Your task: "${query}"\n\nBegin by searching for relevant resources.`;

    await runAgent(config, [{ role: 'user', text: initialMessage }]);
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
        const isUrl = /^https?:\/\//.test(userQuery);
        await discover(userQuery, isUrl);
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
                log.error('discovery loop iteration failed', serializeError(err));
                await new Promise(r => setTimeout(r, 5 * 60_000));
            }
        }
    } else {
        try {
            await run();
        } finally {
            await db.end();
        }
    }
}

main();
