import { log } from './logger.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

export interface RetryOptions {
    /** Max retry attempts after the initial call. Defaults to 5. */
    maxRetries?: number;
    /** Base backoff delay in ms; doubles each attempt. Defaults to 2000. */
    baseDelayMs?: number;
    /**
     * Predicate deciding whether a thrown error is worth retrying.
     * Defaults to transient HTTP status codes (429, 503).
     */
    isRetryable?: (err: unknown) => boolean;
}

/** True for the DOMException raised when an AbortSignal.timeout() fires. */
export function isTimeoutError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { name?: string; }).name === 'TimeoutError';
}

function isTransientStatus(err: unknown): boolean {
    const status = (err as { status?: number; }).status;
    return status === 429 || status === 503;
}

/**
 * Retry a function with exponential backoff. By default retries transient HTTP
 * errors (429, 503); pass `isRetryable` to retry a different class of error.
 */
export async function withRetry<T>(fn: () => Promise<T>, label?: string, options?: RetryOptions): Promise<T> {
    const maxRetries = options?.maxRetries ?? MAX_RETRIES;
    const baseDelayMs = options?.baseDelayMs ?? BASE_DELAY_MS;
    const isRetryable = options?.isRetryable ?? isTransientStatus;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            if (!isRetryable(err) || attempt === maxRetries) {
                throw err;
            }

            const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
            log.warn('retrying after transient error', {
                label,
                status: (err as { status?: number; }).status,
                error: err instanceof Error ? err.message : String(err),
                attempt: attempt + 1,
                maxRetries,
                delayMs: Math.round(delay),
            });
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error('unreachable');
}
