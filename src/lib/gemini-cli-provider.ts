import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { requiredEnv } from './config.js';
import { log } from './logger.js';
import { modelFamily, fetchGeminiQuota } from './gemini-cli-quota.js';
import type { GeminiQuotaSnapshot } from './gemini-cli-quota.js';
import type { LLMProvider, LLMMessage, LLMResponse, GenerateOptions, ToolDeclaration } from './llm.js';
import { renderToolDescription } from './tool-runtime.js';

const execFileAsync = promisify(execFile);

// ============================================================
// Preflight check
// ============================================================

function checkGeminiCliReady(): void {
    try {
        execFileSync('which', ['gemini'], { stdio: 'pipe' });
    } catch {
        throw new Error(
            'Gemini CLI not found. Install it: https://github.com/google-gemini/gemini-cli\n' +
            'Then run: gemini (to authenticate)',
        );
    }
}

interface GeminiCliOutput {
    session_id: string;
    response: string;
    stats: unknown;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Build a JSON schema description from tool declarations.
 * No mention of "tools" or "calling" — just describes the expected JSON output.
 */
function describeJsonSchema(tools: ToolDeclaration[]): string {
    if (tools.length === 1) {
        // Single tool: just describe the fields directly
        const t = tools[0];
        const fields = t.parameters.properties
            ? Object.entries(t.parameters.properties).map(([name, p]) => {
                const req = t.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
                const enumInfo = p.enum ? ` Allowed values: ${p.enum.join(', ')}.` : '';
                return `  - "${name}": ${p.type}${req} — ${p.description ?? ''}${enumInfo}`;
            }).join('\n')
            : '';
        return `Tool: ${renderToolDescription(t)}\nYour response must be a JSON object with these fields:\n${fields}`;
    }

    // Multiple tools: include an "action" field to distinguish
    const schemas = tools.map((t) => {
        const fields = t.parameters.properties
            ? Object.entries(t.parameters.properties).map(([name, p]) => {
                const req = t.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
                const enumInfo = p.enum ? ` Allowed values: ${p.enum.join(', ')}.` : '';
                return `    - "${name}": ${p.type}${req} — ${p.description ?? ''}${enumInfo}`;
            }).join('\n')
            : '';
        return `When "${t.name}" (${renderToolDescription(t)}):\n  {"action": "${t.name}", ...}\n  Fields:\n${fields}`;
    });

    return `Your response must be a JSON object. Set the "action" field to indicate which response type, then include the relevant fields.\n\n${schemas.join('\n\n')}`;
}

function jsonOutputSuffix(tools: ToolDeclaration[]): string {
    if (tools.length === 1) {
        const t = tools[0];
        const required = t.parameters.required ?? [];
        const example = Object.fromEntries(required.map(f => [f, '...']));
        return `IMPORTANT: Respond with ONLY a JSON object. No explanation, no markdown, no code fences. Example format:\n${JSON.stringify(example)}`;
    }
    return `IMPORTANT: Respond with ONLY a JSON object with an "action" field. No explanation, no markdown, no code fences.`;
}

/**
 * Rewrite the system instruction to remove references to "calling tools"
 * and replace with "output JSON".
 */
function rewriteSystemInstruction(instruction: string): string {
    return instruction
        .replace(/\bcall\s+(\w+)\b/gi, 'output your response as JSON')
        .replace(/\bAlways call \w+,/gi, 'Always respond with JSON,')
        .replace(/\bcall\b/gi, 'produce');
}

/**
 * Convert our LLMMessage[] into a single prompt string.
 * The CLI doesn't support multi-turn, so we flatten everything.
 */
function buildPrompt(messages: LLMMessage[], opts: GenerateOptions): string {
    const parts: string[] = [];

    if (opts.systemInstruction) {
        parts.push(rewriteSystemInstruction(opts.systemInstruction));
    }

    if (opts.tools && opts.tools.length > 0) {
        parts.push(describeJsonSchema(opts.tools));
    }

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.functionResponses && msg.functionResponses.length > 0) {
                for (const fr of msg.functionResponses) {
                    parts.push(`Result of "${fr.name}":\n${JSON.stringify(fr.response, null, 2)}`);
                }
            } else if (msg.text) {
                parts.push(msg.text);
            }
        } else if (msg.role === 'model') {
            if (msg.text) {
                parts.push(`Assistant: ${msg.text}`);
            }
            if (msg.functionCalls) {
                for (const fc of msg.functionCalls) {
                    parts.push(`Assistant responded: ${JSON.stringify(fc.args)}`);
                }
            }
        }
    }

    // Place JSON output instruction at the very end
    if (opts.tools && opts.tools.length > 0) {
        parts.push(jsonOutputSuffix(opts.tools));
    }

    return parts.join('\n\n');
}

/**
 * Extract a JSON object from the model's text response.
 * Handles responses wrapped in code fences or with surrounding text.
 */
function parseJson(text: string): Record<string, unknown> | null {
    // First: look for code-fenced JSON
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch { /* fall through */ }
    }

    // Second: find the first { ... } block
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
        try {
            return JSON.parse(text.slice(braceStart, braceEnd + 1));
        } catch { /* fall through */ }
    }

    return null;
}

/**
 * Tool name aliases — map alternative names to canonical tool names.
 * Handles cases where Gemini uses different naming than declared tools.
 */
const TOOL_ALIASES: Record<string, string> = {
    'google_web_search': 'lookup_web',
};

/**
 * Match a parsed JSON response to a tool declaration.
 * For single-tool scenarios, maps directly. For multi-tool, uses the "action" field.
 */
function matchToTool(
    json: Record<string, unknown>,
    tools: ToolDeclaration[],
): { name: string; args: Record<string, unknown> } | null {
    let matched: ToolDeclaration | undefined;

    if (tools.length === 1) {
        matched = tools[0];
    } else {
        // Multi-tool: check "action" or "tool" field
        let action = (json.action ?? json.tool) as string | undefined;
        if (action) {
            // Apply alias mapping
            action = TOOL_ALIASES[action] ?? action;
            matched = tools.find((t) => t.name === action);
        }
    }

    if (!matched) return null;

    // Extract just the declared fields from the JSON
    const args: Record<string, unknown> = {};
    const declaredFields = Object.keys(matched.parameters.properties ?? {});
    for (const field of declaredFields) {
        if (json[field] !== undefined) {
            args[field] = json[field];
        }
    }

    // Also check inside "args" wrapper in case model used {"tool": ..., "args": {...}}
    if (json.args && typeof json.args === 'object') {
        const nested = json.args as Record<string, unknown>;
        for (const field of declaredFields) {
            if (nested[field] !== undefined) {
                args[field] = nested[field];
            }
        }
    }

    return { name: matched.name, args };
}

/**
 * Validate that a tool call has all required fields with non-empty values.
 */
function validateArgs(
    name: string,
    args: Record<string, unknown>,
    tools: ToolDeclaration[],
): boolean {
    const decl = tools.find((t) => t.name === name);
    if (!decl) return false;

    for (const field of decl.parameters.required ?? []) {
        const val = args[field];
        if (val === undefined || val === null || val === '') {
            log.warn('gemini-cli response missing required field', { action: name, field });
            return false;
        }
    }
    return true;
}

// ============================================================
// Provider
// ============================================================

// Rate limit detection patterns
const RATE_LIMIT_PATTERNS = [
    /rate.?limit/i,
    /quota/i,
    /resource.?exhausted/i,
    /429/,
    /too many requests/i,
];

function isRateLimitError(err: string): boolean {
    return RATE_LIMIT_PATTERNS.some((p) => p.test(err));
}

// How long to treat a family as rate-limited before retrying it (ms).
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// How long to trust a successful quota snapshot before re-fetching.
const QUOTA_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GeminiCliProvider implements LLMProvider {
    private models: string[];
    /** Per-family runtime rate-limit timestamp (set when a CLI call returns a rate-limit error). */
    private familyRateLimitedAt: Map<string, number> = new Map();
    private localFallback: LLMProvider | null = null;

    /** Proactively fetched quota snapshot. */
    private quotaSnapshot: GeminiQuotaSnapshot | null = null;
    private quotaFetchedAt = 0;
    /** In-flight startup probe — awaited before the first model selection. */
    private quotaStartupPromise: Promise<void> | null = null;

    constructor() {
        checkGeminiCliReady();
        // Models in order of preference (cheapest first). Configure via GEMINI_MODELS (comma-separated).
        const modelsEnv = requiredEnv('GEMINI_MODELS');
        this.models = modelsEnv.split(',').map((m) => m.trim()).filter(Boolean);
        log.info('gemini-cli models', { models: this.models });
        // Start quota probe immediately so the snapshot is ready before the first request.
        this.quotaStartupPromise = this.refreshQuota();
    }

    /**
     * Refresh the quota snapshot if the cache is stale.
     * Failures are non-fatal: logs a warning and leaves snapshot null.
     */
    private async refreshQuota(): Promise<void> {
        if (Date.now() - this.quotaFetchedAt < QUOTA_TTL_MS) return;
        try {
            this.quotaSnapshot = await fetchGeminiQuota();
            this.quotaFetchedAt = Date.now();
            log.info('gemini-cli quota snapshot', {
                families: this.quotaSnapshot.families.map(
                    (f) => `${f.family}=${f.remainingPercent}%`,
                ),
            });
        } catch (err) {
            log.warn('gemini-cli quota probe failed, falling back to reactive rate-limit handling', {
                error: String(err),
            });
        }
    }

    /**
     * Returns the first configured model whose family:
     *   1. is not in the runtime family rate-limit map (or cooldown has expired), AND
     *   2. has remaining quota > 0 according to the latest snapshot (if available).
     *
     * Preserves user-specified model ordering.
     */
    private async chooseModel(): Promise<string | null> {
        // Wait for the startup probe if it hasn't finished yet, then fall through to TTL check.
        if (this.quotaStartupPromise) {
            await this.quotaStartupPromise;
            this.quotaStartupPromise = null;
        }
        await this.refreshQuota();

        const now = Date.now();

        for (const m of this.models) {
            const fam = modelFamily(m);

            // Check runtime family rate-limit
            const limitedAt = this.familyRateLimitedAt.get(fam);
            if (limitedAt && now - limitedAt <= RATE_LIMIT_COOLDOWN_MS) continue;

            // Check proactive quota snapshot (skip families at 0%)
            if (this.quotaSnapshot) {
                const familyData = this.quotaSnapshot.families.find((f) => f.family === fam);
                if (familyData && familyData.remainingPercent === 0) continue;
            }

            return m;
        }

        return null;
    }

    private markFamilyRateLimited(model: string): void {
        const fam = modelFamily(model);
        this.familyRateLimitedAt.set(fam, Date.now());
        // Invalidate quota cache so next call re-probes
        this.quotaFetchedAt = 0;
        log.info('gemini-cli family rate-limited', { family: fam, model });
    }

    private async callCli(prompt: string, model: string): Promise<string> {
        let stdout: string;
        try {
            const result = await execFileAsync('gemini', [
                '-p', prompt,
                '-m', model,
                '-o', 'json',
            ], {
                timeout: 120_000,
                maxBuffer: 10 * 1024 * 1024,
            });
            stdout = result.stdout;
        } catch (err) {
            const errStr = String(err);
            // Check for rate limiting — let caller handle escalation
            if (isRateLimitError(errStr)) {
                throw new RateLimitError(errStr, model);
            }
            log.error('gemini-cli exec failed', { error: errStr, model });
            throw new Error(`Gemini CLI failed: ${errStr}`);
        }

        // Strip non-JSON prefix (e.g. "Loaded cached credentials.")
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) {
            // Empty response — treat as model-specific issue, try next model
            throw new RateLimitError('Empty response from Gemini CLI', model);
        }

        try {
            const parsed: GeminiCliOutput = JSON.parse(stdout.slice(jsonStart));
            return parsed.response;
        } catch {
            // Invalid JSON — treat as model-specific issue, try next model
            throw new RateLimitError('Invalid JSON response from Gemini CLI', model);
        }
    }

    /** Call CLI with automatic family switching on rate limits. Retries after marking family. */
    private async callCliWithEscalation(prompt: string): Promise<string> {
        for (;;) {
            const model = await this.chooseModel();
            if (!model) {
                // All models currently exhausted — ensure local fallback is initialised
                if (!this.localFallback) {
                    if (process.env.OPENAI_COMPATIBLE_URL) {
                        log.warn('all gemini models rate-limited, falling back to local LLM (OpenAI-compatible)');
                        const { LocalProvider } = await import('./local-provider.js');
                        this.localFallback = new LocalProvider();
                    } else {
                        log.warn('all gemini models rate-limited, falling back to Ollama');
                        const { OllamaProvider } = await import('./ollama-provider.js');
                        this.localFallback = new OllamaProvider();
                    }
                }
                throw new AllModelsExhaustedError();
            }
            try {
                return await this.callCli(prompt, model);
            } catch (err) {
                if (err instanceof RateLimitError) {
                    this.markFamilyRateLimited(err.model);
                    continue; // retry — chooseModel will skip the exhausted family
                }
                throw err;
            }
        }
    }

    async generate(messages: LLMMessage[], opts: GenerateOptions): Promise<LLMResponse> {
        const prompt = buildPrompt(messages, opts);

        log.debug('gemini-cli prompt', { length: prompt.length });

        let responseText: string;
        try {
            responseText = await this.callCliWithEscalation(prompt);
        } catch (err) {
            if (err instanceof AllModelsExhaustedError) {
                if (!this.localFallback) {
                    if (process.env.OPENAI_COMPATIBLE_URL) {
                        log.warn('all gemini models rate-limited, falling back to local LLM (OpenAI-compatible)');
                        const { LocalProvider } = await import('./local-provider.js');
                        this.localFallback = new LocalProvider();
                    } else {
                        log.warn('all gemini models rate-limited, falling back to Ollama');
                        const { OllamaProvider } = await import('./ollama-provider.js');
                        this.localFallback = new OllamaProvider();
                    }
                }
                try {
                    return await this.localFallback.generate(messages, opts);
                } catch (fallbackErr) {
                    log.error('fallback LLM also failed', { error: String(fallbackErr) });
                    throw fallbackErr;
                }
            }
            throw err;
        }

        if (!responseText) {
            log.warn('gemini-cli returned empty response');
            return { functionCalls: [] };
        }

        log.debug('gemini-cli response', {
            length: responseText.length,
        });

        // If tools were provided, try to parse JSON and match to a tool
        if (opts.tools && opts.tools.length > 0) {
            let json = parseJson(responseText);
            let match = json ? matchToTool(json, opts.tools) : null;
            let isValid = match ? validateArgs(match.name, match.args, opts.tools) : false;

            // Retry if we couldn't get valid JSON
            if (!isValid) {
                const reason = !json ? 'no JSON found' : !match ? 'could not match response to schema' : 'missing required fields';
                log.info(`gemini-cli retrying — ${reason}`);

                const retryPrompt = `Your previous response was not valid JSON or was missing required fields. Extract the information from your previous response and format it correctly.

${describeJsonSchema(opts.tools)}

Previous response:
${responseText.slice(0, 4000)}

${jsonOutputSuffix(opts.tools)}`;
                const retryText = await this.callCliWithEscalation(retryPrompt);
                if (retryText) {
                    json = parseJson(retryText);
                    match = json ? matchToTool(json, opts.tools) : null;
                    isValid = match ? validateArgs(match.name, match.args, opts.tools) : false;
                }
            }

            if (match && isValid) {
                return {
                    text: undefined,
                    functionCalls: [{
                        name: match.name,
                        args: match.args,
                    }],
                };
            }

            log.warn('gemini-cli could not produce valid response after retry', {
                response: responseText.slice(0, 300),
            });
        }

        return {
            text: responseText,
            functionCalls: [],
        };
    }
}

class RateLimitError extends Error {
    constructor(message: string, public model: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

class AllModelsExhaustedError extends Error {
    constructor() {
        super('All Gemini CLI models rate-limited');
        this.name = 'AllModelsExhaustedError';
    }
}
