import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolDeclaration } from './llm.js';
import { normalizeToolResult, validateToolArgs } from './tool-runtime.js';

const nestedTool: ToolDeclaration = {
    name: 'queue_items',
    description: 'Queue items',
    maxResponseChars: 12,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        url: { type: 'string' },
                        depth: { type: 'number' },
                    },
                    required: ['url'],
                },
            },
        },
        required: ['items'],
    },
};

test('validateToolArgs rejects unexpected nested fields and wrong types', () => {
    const result = validateToolArgs(nestedTool, {
        items: [
            { url: 'https://example.com', depth: 1, extra: true },
            { depth: 'bad' },
        ],
        unknown: 'field',
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [
        'queue_items.items[0].extra is not allowed',
        'queue_items.items[1].url is required',
        'queue_items.items[1].depth must be a number',
        'queue_items.unknown is not allowed',
    ]);
});

test('normalizeToolResult truncates oversized payloads using declaration limit', () => {
    const result = normalizeToolResult({
        content: 'abcdefghijklmnopqrstuvwxyz',
        nested: { note: '01234567890123456789' },
    }, nestedTool, { toolName: 'queue_items' });

    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.data, {
        content: 'abcdefghijkl...[truncated]',
        nested: { note: '012345678901...[truncated]' },
    });
    assert.equal(result.executionMeta?.toolName, 'queue_items');
});
