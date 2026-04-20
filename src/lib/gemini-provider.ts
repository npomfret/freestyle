import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { requiredEnv } from './config.js';
import { createCache, deleteCache } from './gemini-cache.js';
import { withRetry } from './retry.js';
import { log } from './logger.js';
import type { LLMProvider, LLMMessage, LLMResponse, GenerateOptions, ToolDeclaration, ToolParameter } from './llm.js';
import { renderToolDescription } from './tool-runtime.js';

// ============================================================
// Conversion helpers
// ============================================================

function convertParamType(type: string): Type {
    switch (type) {
        case 'string': return Type.STRING;
        case 'number': return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
        case 'array': return Type.ARRAY;
        case 'object': return Type.OBJECT;
        default: return Type.STRING;
    }
}

function convertParam(param: ToolParameter): Record<string, unknown> {
    const result: Record<string, unknown> = { type: convertParamType(param.type) };
    if (param.description) result.description = param.description;
    if (param.enum) result.enum = param.enum;
    if (param.additionalProperties !== undefined) result.additionalProperties = param.additionalProperties;
    if (param.items) result.items = convertParam(param.items);
    if (param.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            (result.properties as Record<string, unknown>)[key] = convertParam(value);
        }
    }
    if (param.required) result.required = param.required;
    return result;
}

function convertTools(tools: ToolDeclaration[]): FunctionDeclaration[] {
    return tools.map((t) => ({
        name: t.name,
        description: renderToolDescription(t),
        parameters: convertParam(t.parameters),
    }));
}

function convertToGeminiContents(messages: LLMMessage[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.functionResponses && msg.functionResponses.length > 0) {
                const parts: Part[] = msg.functionResponses.map((fr) => ({
                    functionResponse: {
                        name: fr.name,
                        response: { result: fr.response },
                        id: fr.id,
                    },
                }));
                contents.push({ role: 'user', parts });
            } else if (msg.text) {
                contents.push({ role: 'user', parts: [{ text: msg.text }] });
            }
        } else if (msg.role === 'model') {
            const parts: Part[] = [];
            if (msg.text) parts.push({ text: msg.text });
            if (msg.functionCalls) {
                for (const fc of msg.functionCalls) {
                    parts.push({
                        functionCall: {
                            name: fc.name,
                            args: fc.args,
                            id: fc.id,
                        },
                    });
                }
            }
            if (parts.length > 0) {
                contents.push({ role: 'model', parts });
            }
        }
    }

    return contents;
}

// ============================================================
// Cache management
// ============================================================

interface CacheEntry {
    name: string;
    key: string;
}

let activeCaches: CacheEntry[] = [];

// ============================================================
// Provider
// ============================================================

export class GeminiProvider implements LLMProvider {
    private genai: GoogleGenAI;
    private model: string;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is required for Gemini provider');
        this.genai = new GoogleGenAI({ apiKey });
        this.model = requiredEnv('GEMINI_MODEL');
    }

    async generate(messages: LLMMessage[], opts: GenerateOptions): Promise<LLMResponse> {
        const contents = convertToGeminiContents(messages);
        const geminiTools = opts.tools ? convertTools(opts.tools) : undefined;

        // Try to use cached content for system instruction + tools
        let cacheName: string | undefined;
        if (opts.systemInstruction) {
            const cacheKey = opts.systemInstruction.slice(0, 100);
            const existing = activeCaches.find((c) => c.key === cacheKey);
            if (existing) {
                cacheName = existing.name;
            } else {
                try {
                    cacheName = await createCache(this.genai, {
                        model: this.model,
                        systemInstruction: opts.systemInstruction,
                        contents: [
                            { role: 'user', parts: [{ text: 'Reference information loaded. Ready.' }] },
                            { role: 'model', parts: [{ text: 'Understood. Ready to proceed.' }] },
                        ],
                        tools: geminiTools ? [{ functionDeclarations: geminiTools }] : undefined,
                        displayName: 'gemini-provider-cache',
                        ttlSeconds: 7200,
                    });
                    activeCaches.push({ name: cacheName, key: cacheKey });
                } catch (err) {
                    log.warn('cache creation failed, falling back to inline system instruction', { error: String(err) });
                }
            }
        }

        const config: Record<string, unknown> = {};
        if (cacheName) {
            config.cachedContent = cacheName;
        } else {
            if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
            if (geminiTools) config.tools = [{ functionDeclarations: geminiTools }];
        }

        const response = await withRetry(() => this.genai.models.generateContent({
            model: this.model,
            contents,
            config,
        }), 'gemini-provider');

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
            return { functionCalls: [] };
        }

        const textParts = candidate.content.parts
            .filter((p: Part) => p.text)
            .map((p: Part) => p.text!)
            .join('');

        const functionCalls = candidate.content.parts
            .filter((p: Part) => p.functionCall)
            .map((p: Part) => ({
                name: p.functionCall!.name!,
                args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
                id: p.functionCall!.id,
            }));

        return {
            text: textParts || undefined,
            functionCalls,
        };
    }

    /** Clean up any active caches */
    async cleanup(): Promise<void> {
        for (const cache of activeCaches) {
            await deleteCache(this.genai, cache.name);
        }
        activeCaches = [];
    }
}
