import { log } from './logger.js';

// ============================================================
// Types
// ============================================================

export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    items?: ToolParameter;
    properties?: Record<string, ToolParameter>;
    required?: string[];
}

export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: ToolParameter;
}

export interface FunctionCall {
    name: string;
    args: Record<string, unknown>;
    id?: string;
}

export interface FunctionResponse {
    name: string;
    response: unknown;
    id?: string;
}

export interface LLMMessage {
    role: 'user' | 'model';
    text?: string;
    functionCalls?: FunctionCall[];
    functionResponses?: FunctionResponse[];
}

export interface LLMResponse {
    text?: string;
    functionCalls: FunctionCall[];
}

export interface GenerateOptions {
    systemInstruction?: string;
    tools?: ToolDeclaration[];
}

export interface LLMProvider {
    generate(messages: LLMMessage[], opts: GenerateOptions): Promise<LLMResponse>;
}

// ============================================================
// Provider factory
// ============================================================

let cachedProvider: LLMProvider | null = null;

export async function getLLMProvider(): Promise<LLMProvider> {
    if (cachedProvider) return cachedProvider;

    const providerName = process.env.LLM_PROVIDER ?? 'gemini';

    switch (providerName) {
        case 'ollama': {
            const { OllamaProvider } = await import('./ollama-provider.js');
            cachedProvider = new OllamaProvider();
            log.info('using Ollama LLM provider', {
                model: process.env.OLLAMA_MODEL ?? 'qwen2.5:32b',
                url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
            });
            break;
        }
        case 'gemini': {
            const { GeminiProvider } = await import('./gemini-provider.js');
            cachedProvider = new GeminiProvider();
            log.info('using Gemini LLM provider');
            break;
        }
        default:
            throw new Error(`Unknown LLM_PROVIDER: ${providerName}. Use 'ollama' or 'gemini'.`);
    }

    return cachedProvider;
}
