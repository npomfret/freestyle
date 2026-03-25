import { log } from './logger.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

/**
 * Retry a function with exponential backoff on transient errors (429, 503).
 */
export async function withRetry<T>(fn: () => Promise<T>, label?: string): Promise<T> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            const isRetryable = status === 429 || status === 503;

            if (!isRetryable || attempt === MAX_RETRIES) {
                throw err;
            }

            const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
            log.warn('retrying after transient error', {
                label,
                status,
                attempt: attempt + 1,
                maxRetries: MAX_RETRIES,
                delayMs: Math.round(delay),
            });
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error('unreachable');
}
