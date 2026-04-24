import 'dotenv/config';
import {
    getRandomResource,
    isValidKind,
    searchResources,
    type ResourceRecord,
} from './lib/catalog.js';
import { createPool } from './lib/db.js';
import { formatResourceAsMarkdown, formatResourcesAsMarkdown } from './lib/markdown.js';

function printHelp(): void {
    console.log(`Freestyle CLI

Usage:
  npm run search -- search <query> [--kind <kind>] [--topic <topic>] [--region <region>] [--limit <n>] [--markdown]
  npm run search -- random [--kind <kind>] [--topic <topic>] [--region <region>] [--source <source>] [--markdown]
  npm run search -- help

Commands:
  search   Search the catalog
  random   Return one random matching resource
  help     Show this help text

Options:
  --kind <kind>       Filter by resource kind
  --topic <topic>     Filter by topic
  --region <region>   Filter by region
  --source <source>   Filter by source (random only)
  --limit <n>         Result limit for search, default 15
  --markdown          Print Markdown instead of plain text
  --help              Alias for help
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
    const lines = [`${resource.name}`, `${resource.url}`];

    if (typeof resource.similarity === 'number') {
        lines.push(`similarity: ${resource.similarity.toFixed(3)}`);
    }
    if (resource.kinds.length) lines.push(`kinds: ${resource.kinds.join(', ')}`);
    if (resource.topics.length) lines.push(`topics: ${resource.topics.join(', ')}`);
    if (resource.regions.length) lines.push(`regions: ${resource.regions.join(', ')}`);
    if (resource.descriptions[0]) lines.push(`description: ${resource.descriptions[0]}`);

    return lines.join('\n');
}

async function run(): Promise<void> {
    const db = createPool();
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        await db.end();
        return;
    }

    const kind = parseFlag(args, '--kind');
    const topic = parseFlag(args, '--topic');
    const region = parseFlag(args, '--region');
    const markdown = hasFlag(args, '--markdown');

    if (kind && !isValidKind(kind)) {
        console.error(`Invalid kind: ${kind}`);
        await db.end();
        process.exit(1);
    }

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
            await db.end();
            process.exit(1);
        }

        const limitValue = parseFlag(args, '--limit');
        const limit = limitValue ? Math.max(1, Math.min(200, Number.parseInt(limitValue, 10) || 15)) : 15;
        const result = await searchResources(db, { q: query, topic, kind, region, limit, offset: 0 });

        console.log(markdown ? formatResourcesAsMarkdown(result) : result.items.map(formatPlainResource).join('\n\n'));
        await db.end();
        return;
    }

    if (command === 'random') {
        const source = parseFlag(args, '--source');
        const resource = await getRandomResource(db, { topic, kind, region, source });
        if (!resource) {
            console.error('No matching resource found.');
            await db.end();
            process.exit(1);
        }

        console.log(markdown ? formatResourceAsMarkdown(resource) : formatPlainResource(resource));
        await db.end();
        return;
    }

    console.error(`Unknown command: ${command}`);
    printHelp();
    await db.end();
    process.exit(1);
}

run().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
