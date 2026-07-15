import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTimeoutError, withRetry } from './retry.js';

function timeoutError(): Error {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    return err;
}

test('isTimeoutError detects AbortSignal.timeout errors', () => {
    assert.equal(isTimeoutError(timeoutError()), true);
    assert.equal(isTimeoutError(new Error('boom')), false);
    assert.equal(isTimeoutError({ status: 503 }), false);
    assert.equal(isTimeoutError(null), false);
    assert.equal(isTimeoutError('TimeoutError'), false);
});

test('withRetry does not retry a timeout under the default predicate', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(async () => {
            calls += 1;
            throw timeoutError();
        }),
        /aborted due to timeout/,
    );
    assert.equal(calls, 1, 'default predicate only retries 429/503, so no retry');
});

test('withRetry retries a timeout when isRetryable opts in, then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
        async () => {
            calls += 1;
            if (calls === 1) throw timeoutError();
            return 'ok';
        },
        'test',
        { isRetryable: isTimeoutError, maxRetries: 2, baseDelayMs: 0 },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
});

test('withRetry rethrows after exhausting maxRetries', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => {
                calls += 1;
                throw timeoutError();
            },
            'test',
            { isRetryable: isTimeoutError, maxRetries: 1, baseDelayMs: 0 },
        ),
        /aborted due to timeout/,
    );
    assert.equal(calls, 2, 'initial attempt + 1 retry');
});
