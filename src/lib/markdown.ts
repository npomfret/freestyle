import type { PaginatedResources, ResourceRecord } from './catalog.js';

export function formatResourceAsMarkdown(resource: ResourceRecord): string {
    const lines = [`## ${resource.name}`, '', `- URL: ${resource.url}`];

    if (resource.kinds.length) lines.push(`- Kinds: ${resource.kinds.join(', ')}`);
    if (resource.topics.length) lines.push(`- Topics: ${resource.topics.join(', ')}`);
    if (resource.regions.length) lines.push(`- Regions: ${resource.regions.join(', ')}`);
    if (resource.created_at) lines.push(`- Created: ${resource.created_at}`);
    if (resource.updated_at) lines.push(`- Updated: ${resource.updated_at}`);
    if (typeof resource.similarity === 'number') {
        lines.push(`- Similarity: ${resource.similarity.toFixed(3)}`);
    }

    if (resource.descriptions.length) {
        lines.push('', '### Descriptions', '');
        for (const description of resource.descriptions) {
            lines.push(`- ${description}`);
        }
    }

    if (resource.sources.length) {
        lines.push('', '### Sources', '');
        for (const source of resource.sources) {
            lines.push(`- ${source.url ? `[${source.name}](${source.url})` : source.name}`);
        }
    }

    if (resource.analysis) {
        lines.push('', '### Analysis', '', resource.analysis);
    }

    return lines.join('\n');
}

export function formatResourcesAsMarkdown(payload: PaginatedResources | ResourceRecord[]): string {
    if (Array.isArray(payload)) {
        return payload.map(formatResourceAsMarkdown).join('\n\n---\n\n');
    }

    const lines = [
        `# Resources`,
        '',
        `Showing ${payload.items.length} item(s). Offset ${payload.offset}. Limit ${payload.limit}. Has more: ${payload.hasMore ? 'yes' : 'no'}.`,
    ];

    if (payload.items.length) {
        lines.push('', payload.items.map(formatResourceAsMarkdown).join('\n\n---\n\n'));
    }

    return lines.join('\n');
}
