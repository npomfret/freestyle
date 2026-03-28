import { GoogleGenAI } from '@google/genai';
import { withRetry } from './retry.js';
import { pickGeminiModel } from './gemini-cli-quota.js';

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
 * Returns text results including grounding URLs when available.
 */
export async function webSearch(query: string): Promise<string> {
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

        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        let text = response.text ?? 'No results found.';
        if (groundingMeta?.groundingChunks) {
            const urls = groundingMeta
                .groundingChunks
                .filter((c) => c.web?.uri)
                .map((c) => {
                    const web = c.web!;
                    return `- [${web.title ?? web.uri}](${web.uri})`;
                });
            if (urls.length > 0) {
                text += '\n\nDirect URLs from search:\n' + urls.join('\n');
            }
        }
        return text;
    } catch (err) {
        return `Search failed: ${err}`;
    }
}

/**
 * Check social media mentions via Gemini with Google Search grounding.
 */
export async function checkSocial(name: string): Promise<string> {
    try {
        const genai = getSearchGenai();
        const model = await pickGeminiModel();
        const response = await withRetry(() => genai.models.generateContent({
            model,
            contents:
                `Search for: "${name}" site:reddit.com OR site:news.ycombinator.com OR site:twitter.com OR site:x.com\n\nAlso search for: "${name}" API trends\n\nSummarize:\n1. Is this resource being discussed on Reddit, HackerNews, or Twitter? How recently?\n2. Is sentiment positive, negative, or mixed?\n3. Is interest growing, stable, or declining?\n4. Any red flags (e.g. people complaining about reliability, surprise pricing, shutdowns)?\n5. Overall social signal: strong, moderate, weak, or none`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_social');
        return response.text ?? 'No social data found.';
    } catch (err) {
        return `Social check failed: ${err}`;
    }
}

/**
 * Check backlinks/references via Gemini with Google Search grounding.
 */
export async function checkReferences(url: string): Promise<string> {
    try {
        const genai = getSearchGenai();
        const model = await pickGeminiModel();
        const response = await withRetry(() => genai.models.generateContent({
            model,
            contents:
                `Search for: "${url}"\n\nFind pages that link to or mention this URL. Summarize:\n1. How many results reference it (roughly)\n2. What kinds of sites reference it (academic, government, industry, blogs, awesome-lists)\n3. Any notable organizations or projects that use or recommend it\n4. Overall credibility signal: strong, moderate, weak, or unknown`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }), 'check_references');
        return response.text ?? 'No reference data found.';
    } catch (err) {
        return `Reference check failed: ${err}`;
    }
}
