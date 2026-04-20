import { stripHtml } from './fetch-page.js';
import type { ToolResult } from './llm.js';
import { toolError, toolOk } from './tool-runtime.js';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface SearchToolData {
    query: string;
    results: SearchResult[];
    summary?: string;
    provider: 'duckduckgo' | 'gemini-google-search';
}

function decodeDuckDuckGoUrl(href: string): string {
    try {
        const url = new URL(href, 'https://duckduckgo.com');
        const uddg = url.searchParams.get('uddg');
        return uddg ? decodeURIComponent(uddg) : url.toString();
    } catch {
        return href;
    }
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    const blocks = html.split(/<div[^>]+class="[^"]*result[^"]*"[^>]*>/i).slice(1);

    for (const block of blocks) {
        const titleMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;

        const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
            ?? block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        const url = decodeDuckDuckGoUrl(titleMatch[1]);
        const title = stripHtml(titleMatch[2]);
        const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

        if (!title || !url.startsWith('http')) continue;
        results.push({ title, url, snippet });
        if (results.length >= 8) break;
    }

    return results;
}

async function fallbackSearch(query: string): Promise<ToolResult<SearchToolData>> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'freestyle-agent/1.0' },
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new Error(`search failed with HTTP ${response.status}`);
    }

    const html = await response.text();
    const results = parseDuckDuckGoResults(html);

    if (results.length === 0) {
        return toolOk({
            query,
            results,
            summary: `No web search results found for query: "${query}".`,
            provider: 'duckduckgo',
        }, {
            queries: [query],
        });
    }

    return toolOk({
        query,
        results,
        summary: results
            .map((result) => `- [${result.title}](${result.url})${result.snippet ? ` - ${result.snippet}` : ''}`)
            .join('\n'),
        provider: 'duckduckgo',
    }, {
        queries: [query],
        sources: results.map((result) => ({
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            sourceType: 'search' as const,
        })),
    });
}

export async function webSearch(query: string): Promise<ToolResult<SearchToolData>> {
    if (process.env.GEMINI_API_KEY) {
        const { webSearch: geminiWebSearch } = await import('./gemini-search.js');
        return geminiWebSearch(query);
    }

    try {
        return await fallbackSearch(query);
    } catch (err) {
        return toolError<SearchToolData>(`Web search failed: ${err}`, {
            code: 'web_search_failed',
            retryable: true,
            queries: [query],
        });
    }
}

export async function checkSocial(name: string): Promise<ToolResult<SearchToolData>> {
    if (process.env.GEMINI_API_KEY) {
        const { checkSocial: geminiCheckSocial } = await import('./gemini-search.js');
        return geminiCheckSocial(name);
    }

    return webSearch(`"${name}" site:reddit.com OR site:news.ycombinator.com OR site:twitter.com OR site:x.com`);
}

export async function checkReferences(url: string): Promise<ToolResult<SearchToolData>> {
    if (process.env.GEMINI_API_KEY) {
        const { checkReferences: geminiCheckReferences } = await import('./gemini-search.js');
        return geminiCheckReferences(url);
    }

    return webSearch(`"${url}"`);
}
