import assert from 'node:assert/strict';
import test from 'node:test';
import type { FetchResult } from './fetch-page.js';
import { fetchPageToolResult } from './fetch-page.js';

test('fetchPageToolResult preserves provenance metadata', () => {
    const fetchResult: FetchResult = {
        content: 'Example documentation content',
        statusCode: 200,
        redirectedTo: 'https://example.com/docs',
        truncated: false,
        tier: 'puppeteer',
    };

    const result = fetchPageToolResult('https://example.com', fetchResult);

    assert.equal(result.ok, true);
    assert.deepEqual(result.sources, [{
        url: 'https://example.com/docs',
        title: 'Fetched https://example.com (redirected)',
        snippet: 'Example documentation content',
        sourceType: 'browser',
    }]);
    assert.equal(result.executionMeta?.tier, 'puppeteer');
    assert.equal(result.truncated, false);
});

test('fetchPageToolResult uses explicit FetchResult truncation flag', () => {
    const fetchResult: FetchResult = {
        content: 'plain content without sentinel',
        statusCode: 200,
        truncated: true,
        tier: 'native',
    };

    const result = fetchPageToolResult('https://example.com', fetchResult);

    assert.equal(result.truncated, true);
});
