import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLLMProviderName } from './llm.js';

function withGeminiApiKey(value: string | undefined, fn: () => void): void {
    const previous = process.env.GEMINI_API_KEY;
    if (value === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = value;

    try {
        fn();
    } finally {
        if (previous === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous;
    }
}

test('resolveLLMProviderName defaults to local when GEMINI_API_KEY is missing', () => {
    withGeminiApiKey(undefined, () => {
        assert.equal(resolveLLMProviderName(), 'local');
    });
});

test('resolveLLMProviderName defaults to gemini when GEMINI_API_KEY is present', () => {
    withGeminiApiKey('test-key', () => {
        assert.equal(resolveLLMProviderName(), 'gemini');
    });
});

test('resolveLLMProviderName honors explicit overrides', () => {
    withGeminiApiKey(undefined, () => {
        assert.equal(resolveLLMProviderName('ollama'), 'ollama');
    });
});

test('resolveLLMProviderName rejects unknown providers', () => {
    assert.throws(() => resolveLLMProviderName('bad-provider'), /Unknown LLM provider/);
});
