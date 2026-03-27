import { log } from './logger.js';
import type { LLMProvider, LLMMessage, LLMResponse, GenerateOptions } from './llm.js';

const DEFAULT_URL = 'http://localhost:11434';

// ============================================================
// OpenAI-compatible API types
// ============================================================

interface OAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: OAIToolCall[];
    tool_call_id?: string;
}

interface OAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

interface OAIResponse {
    choices: Array<{
        message: {
            content: string | null;
            tool_calls?: OAIToolCall[];
        };
    }>;
}

// ============================================================
// Message conversion
// ============================================================

function convertMessages(messages: LLMMessage[], systemInstruction?: string): OAIMessage[] {
    const result: OAIMessage[] = [];

    if (systemInstruction) {
        result.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.functionResponses && msg.functionResponses.length > 0) {
                // OpenAI format: each tool result is a separate 'tool' role message
                for (const fr of msg.functionResponses) {
                    result.push({
                        role: 'tool',
                        tool_call_id: fr.id ?? fr.name,
                        content: JSON.stringify(fr.response),
                    });
                }
            } else if (msg.text) {
                result.push({ role: 'user', content: msg.text });
            }
        } else if (msg.role === 'model') {
            if (msg.functionCalls && msg.functionCalls.length > 0) {
                result.push({
                    role: 'assistant',
                    content: msg.text ?? null,
                    tool_calls: msg.functionCalls.map((fc, i) => ({
                        id: fc.id ?? `call_${i}`,
                        type: 'function' as const,
                        function: {
                            name: fc.name,
                            arguments: JSON.stringify(fc.args),
                        },
                    })),
                });
            } else {
                result.push({ role: 'assistant', content: msg.text ?? '' });
            }
        }
    }

    return result;
}

// ============================================================
// Provider
// ============================================================

export class LocalProvider implements LLMProvider {
    private model: string;
    private baseUrl: string;

    constructor() {
        // Model name is optional — for MLX Studio the port determines the model,
        // so this is only used as a placeholder in the request body.
        this.model = process.env.LOCAL_LLM_MODEL ?? 'local';
        this.baseUrl = process.env.LOCAL_LLM_URL ?? DEFAULT_URL;
    }

    async generate(messages: LLMMessage[], opts: GenerateOptions): Promise<LLMResponse> {
        const body: Record<string, unknown> = {
            model: this.model,
            messages: convertMessages(messages, opts.systemInstruction),
        };

        if (opts.tools && opts.tools.length > 0) {
            // OpenAI-compatible tools format — parameters map directly to JSON Schema
            body.tools = opts.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                },
            }));
            body.tool_choice = 'auto';
        }

        const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Local LLM API error ${resp.status}: ${text}`);
        }

        const data = await resp.json() as OAIResponse;
        const msg = data.choices[0]?.message;

        const functionCalls = (msg?.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        }));

        log.debug('local llm response', {
            model: this.model,
            url: this.baseUrl,
            hasText: !!msg?.content,
            functionCalls: functionCalls.length,
        });

        return {
            text: msg?.content || undefined,
            functionCalls,
        };
    }
}
