import { GoogleGenAI } from '@google/genai';
import type { ToolResult } from './llm.js';
import { withRetry } from './retry.js';
import { pickGeminiModel } from './gemini-cli-quota.js';
import type { ToolSource } from './llm.js';
import type { SearchResult, SearchToolData } from './search.js';
import { toolError, toolOk } from './tool-runtime.js';

// ============================================================
// Shared Gemini instance for web search grounding
// Used by recheck and discover agents for single-shot searches
// ============================================================

let searchGenai: GoogleGenAI | null = null;

function getSearchGenai(): GoogleGenAI {
    if (searchGenai) return searchGenai;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY required for web search');
    searchGenai = new GoogleGenAI({ apiKey: key });
    return searchGenai;
}

/**
 * Web search via Gemini with Google Search grounding.
 * Returns structured results with grounding URLs when available.
 */
export async function webSearch(query: string): Promise<ToolResult<SearchToolData>> {
    const originalEnvKey = process.env.GEMINI_API_KEY; // Store original key
    if (!originalEnvKey) {
        return toolError('Web search requires GEMINI_API_KEY environment variable to be set. Please provide a valid Gemini API key.', {
            code: 'missing_api_key',
            queries: [query],
        });
    }

    try {
        const genai = getSearchGenai();
        const model = await pickGeminiModel();
        const response = await withRetry(() => genai.models.generateContent({
            model,
            contents:
                `Search for: ${query}\n\nReturn a list of relevant URLs with brief descriptions. IMPORTANT: Return the actual destination URLs, not redirect URLs. Focus on primary sources — the actual API documentation, dataset download page, or GitHub repo. Skip aggregator sites, blog posts, tutorials, and directories. Format each result as:\n- [Name](URL) - description`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'web_search');

        const text = response.text?.trim();
        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        const results: SearchResult[] = [];
        const sources: ToolSource[] = [];

        if (groundingMeta?.groundingChunks) {
            for (const chunk of groundingMeta.groundingChunks) {
                if (!chunk.web?.uri) continue;
                const result = {
                    title: chunk.web.title ?? chunk.web.uri,
                    url: chunk.web.uri,
                    snippet: '',
                };
                results.push(result);
                sources.push({
                    url: result.url,
                    title: result.title,
                    snippet: result.snippet,
                    sourceType: 'grounding',
                });
            }
        }

        if (!text && results.length === 0) {
            return toolOk<SearchToolData>({
                query,
                results,
                summary: `No web search results found for query: "${query}".`,
                provider: 'gemini-google-search',
            }, {
                queries: [query],
            });
        }

        return toolOk<SearchToolData>({
            query,
            results,
            summary: text || undefined,
            provider: 'gemini-google-search',
        }, {
            queries: [query],
            sources,
        });
    } catch (err: any) {
        if (err instanceof Error) {
            // Check for common API key or network errors
            if (err.message.includes('API key not valid') || err.message.includes('invalid_grant')) {
                return toolError(`Web search failed due to an invalid or expired GEMINI_API_KEY. Please check your API key. Error: ${err.message}`, {
                    code: 'invalid_api_key',
                    queries: [query],
                });
            }
            if (err.message.includes('NETWORK_ERROR') || err.message.includes('fetch failed')) {
                return toolError(`Web search failed due to a network error. Please check your internet connection. Error: ${err.message}`, {
                    code: 'network_error',
                    retryable: true,
                    queries: [query],
                });
            }
            if (err.message.includes('resource exhausted') || err.message.includes('quota')) {
                return toolError(`Web search failed due to quota exhaustion. Please try again later. Error: ${err.message}`, {
                    code: 'quota_exhausted',
                    retryable: true,
                    queries: [query],
                });
            }
        }
        return toolError(`Web search failed due to an unexpected error. Error: ${err.message || err}`, {
            code: 'unexpected_error',
            retryable: true,
            queries: [query],
        });
    }
}

/**
 * Check social media mentions via Gemini with Google Search grounding.
 */
export async function checkSocial(name: string): Promise<ToolResult<SearchToolData>> {
    const query = `"${name}" site:reddit.com OR site:news.ycombinator.com OR site:twitter.com OR site:x.com`;
    try {
        const genai = getSearchGenai();
        const model = await pickGeminiModel();
        const response = await withRetry(() => genai.models.generateContent({
            model,
            contents:
                `Search for: ${query}\n\nAlso search for: "${name}" API trends\n\nSummarize:\n1. Is this resource being discussed on Reddit, HackerNews, or Twitter? How recently?\n2. Is sentiment positive, negative, or mixed?\n3. Is interest growing, stable, or declining?\n4. Any red flags (e.g. people complaining about reliability, surprise pricing, shutdowns)?\n5. Overall social signal: strong, moderate, weak, or none`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_social');
        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        const sources = groundingMeta?.groundingChunks
            ?.filter((chunk) => chunk.web?.uri)
            .map((chunk) => ({
                url: chunk.web!.uri!,
                title: chunk.web!.title ?? chunk.web!.uri!,
                sourceType: 'social' as const,
            })) ?? [];

        return toolOk<SearchToolData>({
            query,
            results: sources.map((source) => ({ title: source.title ?? source.url, url: source.url, snippet: '' })),
            summary: response.text ?? 'No social data found.',
            provider: 'gemini-google-search',
        }, {
            queries: [query, `"${name}" API trends`],
            sources,
        });
    } catch (err) {
        return toolError(`Social check failed: ${err}`, {
            code: 'social_check_failed',
            retryable: true,
            queries: [query],
        });
    }
}

/**
 * Check backlinks/references via Gemini with Google Search grounding.
 */
export async function checkReferences(url: string): Promise<ToolResult<SearchToolData>> {
    const query = `"${url}"`;
    try {
        const genai = getSearchGenai();
        const model = await pickGeminiModel();
        const response = await withRetry(() => genai.models.generateContent({
            model,
            contents:
                `Search for: ${query}\n\nFind pages that link to or mention this URL. Summarize:\n1. How many results reference it (roughly)\n2. What kinds of sites reference it (academic, government, industry, blogs, awesome-lists)\n3. Any notable organizations or projects that use or recommend it\n4. Overall credibility signal: strong, moderate, weak, or unknown`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_references');
        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        const sources = groundingMeta?.groundingChunks
            ?.filter((chunk) => chunk.web?.uri)
            .map((chunk) => ({
                url: chunk.web!.uri!,
                title: chunk.web!.title ?? chunk.web!.uri!,
                sourceType: 'reference' as const,
            })) ?? [];

        return toolOk<SearchToolData>({
            query,
            results: sources.map((source) => ({ title: source.title ?? source.url, url: source.url, snippet: '' })),
            summary: response.text ?? 'No reference data found.',
            provider: 'gemini-google-search',
        }, {
            queries: [query],
            sources,
        });
    } catch (err) {
        return toolError(`Reference check failed: ${err}`, {
            code: 'reference_check_failed',
            retryable: true,
            queries: [query],
        });
    }
}
