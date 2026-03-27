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

export async function getLLMProvider(override?: string): Promise<LLMProvider> {
    const providerName = override ?? 'gemini-cli';
    if (!override && cachedProvider) return cachedProvider;

    let provider: LLMProvider;
    switch (providerName) {
        case 'ollama': {
            const { OllamaProvider } = await import('./ollama-provider.js');
            provider = new OllamaProvider();
            log.info('using Ollama LLM provider', {
                model: process.env.LOCAL_LLM_MODEL,
                url: process.env.LOCAL_LLM_URL ?? 'http://localhost:11434',
            });
            break;
        }
        case 'gemini': {
            const { GeminiProvider } = await import('./gemini-provider.js');
            provider = new GeminiProvider();
            log.info('using Gemini LLM provider');
            break;
        }
        case 'gemini-cli': {
            const { GeminiCliProvider } = await import('./gemini-cli-provider.js');
            provider = new GeminiCliProvider();
            log.info('using Gemini CLI provider', {
                model: process.env.GEMINI_MODEL,
            });
            break;
        }
        case 'local': {
            const { LocalProvider } = await import('./local-provider.js');
            provider = new LocalProvider();
            log.info('using local LLM provider (OpenAI-compatible)', {
                model: process.env.LOCAL_LLM_MODEL ?? 'local',
                url: process.env.LOCAL_LLM_URL,
            });
            break;
        }
        default:
            throw new Error(`Unknown LLM_PROVIDER: ${providerName}. Use 'gemini-cli', 'gemini', 'ollama', or 'local'.`);
    }

    if (!override) cachedProvider = provider;
    return provider;
}
