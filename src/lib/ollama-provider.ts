import { requiredEnv } from './config.js';
import { log } from './logger.js';
import type { LLMProvider, LLMMessage, LLMResponse, GenerateOptions, ToolDeclaration, ToolParameter } from './llm.js';


// ============================================================
// Ollama API types
// ============================================================

interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: OllamaToolParams;
    };
}

interface OllamaToolParams {
    type: string;
    properties?: Record<string, OllamaToolParams>;
    items?: OllamaToolParams;
    required?: string[];
    description?: string;
}

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
    function: {
        name: string;
        arguments: Record<string, unknown>;
    };
}

interface OllamaChatResponse {
    message: OllamaMessage;
    done: boolean;
}

// ============================================================
// Conversion helpers
// ============================================================

function convertParam(param: ToolParameter): OllamaToolParams {
    const result: OllamaToolParams = { type: param.type };
    if (param.description) result.description = param.description;
    if (param.items) result.items = convertParam(param.items);
    if (param.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            result.properties[key] = convertParam(value);
        }
    }
    if (param.required) result.required = param.required;
    return result;
}

function convertTools(tools: ToolDeclaration[]): OllamaTool[] {
    return tools.map((t) => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: convertParam(t.parameters),
        },
    }));
}

function convertMessages(messages: LLMMessage[], systemInstruction?: string): OllamaMessage[] {
    const result: OllamaMessage[] = [];

    if (systemInstruction) {
        result.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.functionResponses && msg.functionResponses.length > 0) {
                // Ollama doesn't have a native function response format —
                // send tool results as a user message with structured content
                const parts: string[] = [];
                for (const fr of msg.functionResponses) {
                    parts.push(`Tool "${fr.name}" returned:\n${JSON.stringify(fr.response, null, 2)}`);
                }
                result.push({ role: 'user', content: parts.join('\n\n') });
            } else if (msg.text) {
                result.push({ role: 'user', content: msg.text });
            }
        } else if (msg.role === 'model') {
            if (msg.functionCalls && msg.functionCalls.length > 0) {
                result.push({
                    role: 'assistant',
                    content: msg.text ?? '',
                    tool_calls: msg.functionCalls.map((fc) => ({
                        function: {
                            name: fc.name,
                            arguments: fc.args,
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

export class OllamaProvider implements LLMProvider {
    private model: string;
    private baseUrl: string;

    constructor() {
        this.model = requiredEnv('OLLAMA_MODEL');
        this.baseUrl = requiredEnv('OLLAMA_URL');
    }

    async generate(messages: LLMMessage[], opts: GenerateOptions): Promise<LLMResponse> {
        const ollamaMessages = convertMessages(messages, opts.systemInstruction);
        const body: Record<string, unknown> = {
            model: this.model,
            messages: ollamaMessages,
            stream: false,
        };

        if (opts.tools && opts.tools.length > 0) {
            body.tools = convertTools(opts.tools);
        }

        const resp = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Ollama API error ${resp.status}: ${text}`);
        }

        const data = await resp.json() as OllamaChatResponse;
        const msg = data.message;

        const functionCalls = (msg.tool_calls ?? []).map((tc) => ({
            name: tc.function.name,
            args: tc.function.arguments,
        }));

        log.debug('ollama response', {
            model: this.model,
            hasText: !!msg.content,
            functionCalls: functionCalls.length,
        });

        return {
            text: msg.content || undefined,
            functionCalls,
        };
    }
}
