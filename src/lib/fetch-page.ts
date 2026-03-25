import { GoogleGenAI } from '@google/genai';
import { log } from './logger.js';
import { withRetry } from './retry.js';

// ============================================================
// Types
// ============================================================

export interface FetchResult {
    content: string;
    statusCode: number;
    redirectedTo?: string;
    problems?: string[];
    likely_broken?: boolean;
    tier: 'native' | 'gemini-url-context' | 'puppeteer';
}

export type FetchTier = 'native' | 'gemini-url-context' | 'puppeteer';

export interface FetchPageOptions {
    /** Which tiers to attempt in order. Default: all three. */
    tiers?: FetchTier[];
    /** Timeout per tier in ms. Default: 10000 */
    timeoutMs?: number;
    /** Skip content analysis (soft-404 detection etc). Default: false */
    skipAnalysis?: boolean;
}

interface RawFetchResult {
    html: string;
    text: string;
    statusCode: number;
    finalUrl: string;
    isPlainText?: boolean;
}

const DEFAULT_TIERS: FetchTier[] = ['native', 'puppeteer'];
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 8000;

// ============================================================
// HTML stripping
// ============================================================

export function stripHtml(html: string): string {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[#\w]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksLikeHtml(content: string): boolean {
    return /<[a-z][\s\S]*>/i.test(content.slice(0, 500));
}

function truncate(text: string): string {
    if (text.length > MAX_CONTENT_LENGTH) {
        return text.slice(0, MAX_CONTENT_LENGTH) + '\n...[truncated]';
    }
    return text;
}

// ============================================================
// Content analysis (extracted from recheck.ts)
// ============================================================

const SOFT_404_SIGNALS = [
    'page not found',
    '404',
    'not found',
    'no longer available',
    "this page doesn't exist",
    'page does not exist',
    'page has been removed',
    "sorry, we couldn't find",
    'the page you requested',
    "this site can't be reached",
    'domain for sale',
    'domain is parked',
    'buy this domain',
    'coming soon',
    'under construction',
    'website expired',
    'account suspended',
    'account has been suspended',
    '403 forbidden',
    'access denied',
];

export function analyzeContent(
    raw: RawFetchResult,
    originalUrl: string,
    tier: FetchTier,
): FetchResult {
    const problems: string[] = [];
    const text = raw.isPlainText ? raw.text : stripHtml(raw.html);

    if (raw.statusCode >= 400) {
        problems.push(`HTTP ${raw.statusCode}`);
    }

    // Soft 404 / error page detection
    const lower = text.toLowerCase();
    const titleMatch = raw.html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim().toLowerCase() ?? '';

    for (const signal of SOFT_404_SIGNALS) {
        if (title.includes(signal) || (lower.length < 2000 && lower.includes(signal))) {
            problems.push(`soft 404: page contains "${signal}"`);
            break;
        }
    }

    // Redirect analysis
    const redirected = raw.finalUrl !== originalUrl;
    if (redirected) {
        try {
            const originalParsed = new URL(originalUrl);
            const finalParsed = new URL(raw.finalUrl);
            const originalPath = originalParsed.pathname;
            const finalPath = finalParsed.pathname;

            // Redirect to homepage — likely a soft 404
            if (originalPath.length > 1 && (finalPath === '/' || finalPath === '')) {
                problems.push(`redirected to homepage: ${raw.finalUrl}`);
            }
            // Cross-domain redirect (excluding www/non-www normalization)
            else if (
                originalParsed.hostname.replace(/^www\./, '') !== finalParsed.hostname.replace(/^www\./, '')
            ) {
                problems.push(`redirected to different domain: ${raw.finalUrl}`);
            }
        } catch {
            // URL parsing failed — flag it
            problems.push(`redirect to unparseable URL: ${raw.finalUrl}`);
        }
    }

    // Very little content (likely an error stub)
    if (text.length < 100 && raw.statusCode === 200) {
        problems.push('page has almost no content');
    }

    // Domain parking detection
    if (lower.includes('godaddy') || (lower.includes('squarespace') && lower.includes('claim this domain'))) {
        problems.push('domain appears parked');
    }

    const result: FetchResult = {
        content: truncate(text),
        statusCode: raw.statusCode,
        tier,
    };
    if (redirected) result.redirectedTo = raw.finalUrl;
    if (problems.length > 0) {
        result.problems = problems;
        result.likely_broken = true;
    }
    return result;
}

// ============================================================
// Tier 1: Native fetch
// ============================================================

async function fetchWithNative(url: string, timeoutMs: number): Promise<RawFetchResult> {
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'freestyle-agent/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
    });
    const html = await resp.text();
    return {
        html,
        text: stripHtml(html),
        statusCode: resp.status,
        finalUrl: resp.url,
    };
}

// ============================================================
// Tier 2: Gemini URL Context
// ============================================================

let genaiInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
    if (genaiInstance) return genaiInstance;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    genaiInstance = new GoogleGenAI({ apiKey: key });
    return genaiInstance;
}

async function fetchWithGeminiUrlContext(url: string): Promise<RawFetchResult> {
    const genai = getGenAI();
    if (!genai) throw new Error('GEMINI_API_KEY not set');

    const response = await withRetry(() => genai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `Visit this URL and return the full text content of the page. Do not summarize or interpret — return the actual text as-is, including headings, navigation, and footer text. URL: ${url}`,
        config: {
            tools: [{ urlContext: {} }],
        },
    }), 'fetch-page-gemini');

    const text = response.text ?? '';

    // If Gemini reports the page couldn't be loaded
    const lower = text.toLowerCase();
    if (
        text.length < 50 &&
        (lower.includes('unable to') || lower.includes('could not') || lower.includes('cannot access'))
    ) {
        return {
            html: '',
            text,
            statusCode: 0,
            finalUrl: url,
            isPlainText: true,
        };
    }

    return {
        html: '',
        text,
        statusCode: 200,
        finalUrl: url,
        isPlainText: true,
    };
}

// ============================================================
// Tier 3: Puppeteer (optional)
// ============================================================

async function fetchWithPuppeteer(url: string, timeoutMs: number): Promise<RawFetchResult> {
    const { getBrowser } = await import('./browser.js');
    const browser = await getBrowser();
    if (!browser) throw new Error('puppeteer not available');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await browser.newPage() as any;
    try {
        await page.setUserAgent('freestyle-agent/1.0');
        const response = await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: timeoutMs,
        });
        const statusCode: number = response?.status() ?? 0;
        const finalUrl: string = page.url();
        const html: string = await page.content();
        const text: string = await page.evaluate(() => document.body?.innerText ?? '');

        return {
            html,
            text,
            statusCode,
            finalUrl,
            isPlainText: true,
        };
    } finally {
        await page.close();
    }
}

// ============================================================
// Orchestrator
// ============================================================

function shouldFallback(result: FetchResult): boolean {
    if (result.statusCode === 0) return true;
    if (result.statusCode >= 400) return true;
    if (result.likely_broken) return true;
    if (result.content.length < 50) return true;
    return false;
}

export async function fetchPage(
    url: string,
    options?: FetchPageOptions,
): Promise<FetchResult> {
    const tiers = options?.tiers ?? DEFAULT_TIERS;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const skipAnalysis = options?.skipAnalysis ?? false;

    let lastResult: FetchResult | null = null;

    for (const tier of tiers) {
        try {
            let raw: RawFetchResult;

            switch (tier) {
                case 'native':
                    raw = await fetchWithNative(url, timeoutMs);
                    break;
                case 'gemini-url-context':
                    raw = await fetchWithGeminiUrlContext(url);
                    break;
                case 'puppeteer':
                    raw = await fetchWithPuppeteer(url, timeoutMs);
                    break;
            }

            const result = skipAnalysis
                ? { content: truncate(raw.isPlainText ? raw.text : stripHtml(raw.html)), statusCode: raw.statusCode, tier, ...(raw.finalUrl !== url ? { redirectedTo: raw.finalUrl } : {}) }
                : analyzeContent(raw, url, tier);

            if (!shouldFallback(result)) {
                return result;
            }

            // This tier returned something but it looks broken — save it and try next
            lastResult = result;
            log.info('fetch tier failed, trying next', {
                url,
                tier,
                statusCode: result.statusCode,
                problems: result.problems,
            });
        } catch (err) {
            const errStr = String(err);
            const problems = ['fetch failed: ' + errStr];

            // Classify network errors
            if (errStr.includes('ENOTFOUND') || errStr.includes('getaddrinfo')) {
                problems.push('DNS lookup failed — domain does not exist');
            } else if (errStr.includes('ECONNREFUSED')) {
                problems.push('connection refused — server is down');
            } else if (errStr.includes('CERT_') || errStr.includes('SSL') || errStr.includes('certificate')) {
                problems.push('SSL/TLS error — certificate problem');
            } else if (errStr.includes('TimeoutError') || errStr.includes('timed out') || errStr.includes('abort')) {
                problems.push('request timed out');
            } else if (errStr.includes('not available') || errStr.includes('not set')) {
                // Tier not available (e.g. no GEMINI_API_KEY, no puppeteer) — skip silently
                log.debug('fetch tier not available', { tier, reason: errStr });
                continue;
            }

            lastResult = {
                statusCode: 0,
                content: `Error: ${errStr}`,
                problems,
                likely_broken: true,
                tier,
            };

            // DNS and SSL errors won't be fixed by a different fetch method
            if (
                errStr.includes('ENOTFOUND') ||
                errStr.includes('getaddrinfo') ||
                errStr.includes('CERT_') ||
                errStr.includes('SSL')
            ) {
                log.info('permanent fetch error, skipping remaining tiers', { url, tier, error: errStr });
                break;
            }

            log.info('fetch tier threw, trying next', { url, tier, error: errStr });
        }
    }

    // All tiers exhausted — return whatever we got last
    return lastResult ?? {
        statusCode: 0,
        content: `Error: all fetch tiers failed for ${url}`,
        problems: ['all fetch tiers exhausted'],
        likely_broken: true,
        tier: tiers[tiers.length - 1] ?? 'native',
    };
}
