import 'dotenv/config';
import type { PaginatedResources, ResourceRecord } from './lib/catalog.js';

const API_URL = (process.env.FREESTYLE_API_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`).replace(/\/$/, '');

function printHelp(): void {
    console.log(`Freestyle CLI

Usage:
  npm run search -- search <query> [--kind <kind>] [--topic <topic>] [--region <region>] [--limit <n>] [--markdown]
  npm run search -- random [--kind <kind>] [--topic <topic>] [--region <region>] [--source <source>] [--markdown]
  npm run search -- help

Commands:
  search   Search the catalog via the API
  random   Return one random matching resource via the API
  help     Show this help text

Options:
  --kind <kind>       Filter by resource kind
  --topic <topic>     Filter by topic
  --region <region>   Filter by region
  --source <source>   Filter by source (random only)
  --limit <n>         Result limit for search, default 15
  --markdown          Print Markdown instead of plain text
  --help              Alias for help

Environment:
  FREESTYLE_API_URL   API base URL (default: http://localhost:\${PORT ?? 3001})
`);
}

function parseFlag(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
    return args.includes(name);
}

function formatPlainResource(resource: ResourceRecord): string {
    const lines = [resource.name, resource.url];

    if (typeof resource.similarity === 'number') {
        lines.push(`similarity: ${resource.similarity.toFixed(3)}`);
    }
    if (resource.kinds.length) lines.push(`kinds: ${resource.kinds.join(', ')}`);
    if (resource.topics.length) lines.push(`topics: ${resource.topics.join(', ')}`);
    if (resource.regions.length) lines.push(`regions: ${resource.regions.join(', ')}`);
    if (resource.descriptions[0]) lines.push(`description: ${resource.descriptions[0]}`);

    return lines.join('\n');
}

type ApiResponse = { status: number; body: string; json: unknown };

async function apiGet(
    path: string,
    params: Record<string, string | undefined>,
    markdown: boolean,
): Promise<ApiResponse> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) qs.set(key, value);
    }
    if (markdown) qs.set('format', 'markdown');

    const url = `${API_URL}${path}${qs.size ? `?${qs.toString()}` : ''}`;
    const response = await fetch(url);
    const body = await response.text();

    let json: unknown = null;
    if (!markdown && body) {
        try {
            json = JSON.parse(body);
        } catch {
            // leave json null; caller treats this as a failure when it needs structured data
        }
    }

    return { status: response.status, body, json };
}

function printApiError(response: ApiResponse): void {
    if (response.json && typeof response.json === 'object' && 'error' in response.json) {
        console.error(`HTTP ${response.status}: ${(response.json as { error: string }).error}`);
    } else {
        console.error(`HTTP ${response.status}: ${response.body}`);
    }
}

async function run(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    const kind = parseFlag(args, '--kind');
    const topic = parseFlag(args, '--topic');
    const region = parseFlag(args, '--region');
    const markdown = hasFlag(args, '--markdown');

    if (command === 'search') {
        const queryParts = args.slice(1).filter((arg, index, allArgs) => {
            if (arg.startsWith('--')) return false;
            const previous = allArgs[index - 1];
            return previous !== '--kind' && previous !== '--topic' && previous !== '--region' && previous !== '--source' && previous !== '--limit';
        });
        const query = queryParts.join(' ').trim();

        if (!query) {
            console.error('Search query required.');
            printHelp();
            process.exit(1);
        }

        const limitValue = parseFlag(args, '--limit');
        const limit = String(limitValue ? Math.max(1, Math.min(200, Number.parseInt(limitValue, 10) || 15)) : 15);
        const response = await apiGet('/api/search', { q: query, kind, topic, region, limit }, markdown);

        if (response.status >= 400) {
            printApiError(response);
            process.exit(1);
        }

        if (markdown) {
            console.log(response.body);
            return;
        }

        const result = response.json as PaginatedResources;
        console.log(result.items.map(formatPlainResource).join('\n\n'));
        return;
    }

    if (command === 'random') {
        const source = parseFlag(args, '--source');
        const response = await apiGet('/api/random', { kind, topic, region, source }, markdown);

        if (response.status === 404) {
            console.error('No matching resource found.');
            process.exit(1);
        }
        if (response.status >= 400) {
            printApiError(response);
            process.exit(1);
        }

        if (markdown) {
            console.log(response.body);
            return;
        }

        console.log(formatPlainResource(response.json as ResourceRecord));
        return;
    }

    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

run().catch((err) => {
    const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined;
    if (cause?.code === 'ECONNREFUSED') {
        console.error(`Could not reach ${API_URL} — is the server running? Start it with \`npm run server\`.`);
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
