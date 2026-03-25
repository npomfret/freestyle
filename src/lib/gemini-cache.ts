import type { GoogleGenAI, Content, FunctionDeclaration, Tool } from '@google/genai';
import { log } from './logger.js';

interface CacheOptions {
    model: string;
    systemInstruction: string;
    contents?: Content[];
    tools?: Tool[];
    displayName: string;
    ttlSeconds?: number;
}

export async function createCache(genai: GoogleGenAI, opts: CacheOptions): Promise<string> {
    const cache = await genai.caches.create({
        model: opts.model,
        config: {
            systemInstruction: opts.systemInstruction,
            contents: opts.contents,
            tools: opts.tools,
            displayName: opts.displayName,
            ttl: `${opts.ttlSeconds ?? 3600}s`,
        },
    });
    log.info('cache created', { name: cache.name, displayName: opts.displayName });
    return cache.name!;
}

export async function deleteCache(genai: GoogleGenAI, name: string): Promise<void> {
    try {
        await genai.caches.delete({ name });
        log.info('cache deleted', { name });
    } catch { /* best-effort cleanup */ }
}
