import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgent, toolHandlers } from './agent-runner.js';
import type { AgentConfig } from './agent-runner.js';
import type { FunctionCall, LLMMessage, LLMProvider, LLMResponse, ToolDeclaration } from './llm.js';

class FakeProvider implements LLMProvider {
    private index = 0;
    public seenMessages: LLMMessage[][] = [];

    constructor(private readonly responses: LLMResponse[]) {}

    async generate(messages: LLMMessage[]): Promise<LLMResponse> {
        this.seenMessages.push(structuredClone(messages));
        return this.responses[this.index++] ?? { functionCalls: [] };
    }
}

function makeConfig(
    provider: LLMProvider,
    tools: ToolDeclaration[],
    handlers: ReturnType<typeof toolHandlers>,
    extra?: Partial<AgentConfig>,
): AgentConfig {
    return {
        name: 'test-agent',
        systemInstruction: 'Test agent',
        tools,
        toolHandlers: handlers,
        maxTurns: 3,
        providerInstance: provider,
        onResponse: () => 'continue',
        onNoTools: () => 'break',
        ...extra,
    };
}

function lastFunctionResponses(messages: LLMMessage[]) {
    const last = messages[messages.length - 1];
    return last?.functionResponses ?? [];
}

function baseTool(overrides?: Partial<ToolDeclaration>): ToolDeclaration {
    return {
        name: 'lookup_web',
        description: 'Search',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: { type: 'string' },
            },
            required: ['query'],
        },
        ...overrides,
    };
}

test('runAgent returns structured validation errors without calling the handler', async () => {
    let handlerCalls = 0;
    const provider = new FakeProvider([
        {
            functionCalls: [{ name: 'lookup_web', args: { query: 123 } }],
        },
        { functionCalls: [] },
    ]);

    const tool = baseTool();

    await runAgent(makeConfig(
        provider,
        [tool],
        toolHandlers(['lookup_web', async () => {
            handlerCalls++;
            return { result: 'should not run' };
        }]),
    ), [{ role: 'user', text: 'Search for docs' }]);

    assert.equal(handlerCalls, 0);
    const responses = lastFunctionResponses(provider.seenMessages[1]);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].response.ok, false);
    assert.equal(responses[0].response.error?.code, 'invalid_arguments');
});

test('runAgent executes consecutive parallel-safe tool calls concurrently and preserves response order', async () => {
    let running = 0;
    let maxRunning = 0;
    const calls: FunctionCall[] = [
        { name: 'slow_fetch', args: {} },
        { name: 'fast_fetch', args: {} },
    ];
    const provider = new FakeProvider([
        { functionCalls: calls },
        { functionCalls: [] },
    ]);

    const tools: ToolDeclaration[] = [
        {
            name: 'slow_fetch',
            description: 'Slow read',
            parallelSafe: true,
            parameters: { type: 'object', additionalProperties: false, properties: {} },
        },
        {
            name: 'fast_fetch',
            description: 'Fast read',
            parallelSafe: true,
            parameters: { type: 'object', additionalProperties: false, properties: {} },
        },
    ];

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    await runAgent(makeConfig(
        provider,
        tools,
        toolHandlers(
            ['slow_fetch', async () => {
                running++;
                maxRunning = Math.max(maxRunning, running);
                await wait(40);
                running--;
                return { value: 'slow' };
            }],
            ['fast_fetch', async () => {
                running++;
                maxRunning = Math.max(maxRunning, running);
                await wait(10);
                running--;
                return { value: 'fast' };
            }],
        ),
    ), [{ role: 'user', text: 'Open both pages' }]);

    assert.equal(maxRunning, 2);
    const responses = lastFunctionResponses(provider.seenMessages[1]);
    assert.deepEqual(responses.map((response) => response.name), ['slow_fetch', 'fast_fetch']);
    assert.deepEqual(responses.map((response) => response.response.data), [{ value: 'slow' }, { value: 'fast' }]);
});

test('runAgent suppresses duplicate tool calls in the same run', async () => {
    let handlerCalls = 0;
    const provider = new FakeProvider([
        {
            functionCalls: [
                { name: 'lookup_web', args: { query: 'freestyle docs' } },
                { name: 'lookup_web', args: { query: 'freestyle docs' } },
            ],
        },
        { functionCalls: [] },
    ]);

    const tool = baseTool({ parallelSafe: true });

    await runAgent(makeConfig(
        provider,
        [tool],
        toolHandlers(['lookup_web', async () => {
            handlerCalls++;
            return { result: 'ok' };
        }]),
    ), [{ role: 'user', text: 'Search twice' }]);

    assert.equal(handlerCalls, 1);
    const responses = lastFunctionResponses(provider.seenMessages[1]);
    assert.equal(responses.length, 2);
    assert.equal(responses[0].response.ok, true);
    assert.equal(responses[1].response.ok, false);
    assert.equal(responses[1].response.error?.code, 'duplicate_tool_call');
});

test('runAgent allows a retry in a later turn after a failed tool execution', async () => {
    let handlerCalls = 0;
    const provider = new FakeProvider([
        { functionCalls: [{ name: 'lookup_web', args: { query: 'freestyle docs' } }] },
        { functionCalls: [{ name: 'lookup_web', args: { query: 'freestyle docs' } }] },
        { functionCalls: [] },
    ]);

    await runAgent(makeConfig(
        provider,
        [baseTool()],
        toolHandlers(['lookup_web', async () => {
            handlerCalls++;
            if (handlerCalls === 1) {
                throw new Error('temporary failure');
            }
            return { result: 'ok on retry' };
        }]),
    ), [{ role: 'user', text: 'Retry if needed' }]);

    assert.equal(handlerCalls, 2);
    const responses = lastFunctionResponses(provider.seenMessages[2]);
    assert.equal(responses[0].response.ok, true);
    assert.deepEqual(responses[0].response.data, { result: 'ok on retry' });
});

test('runAgent does not consume maxCallsPerRun budget for invalid arguments', async () => {
    let handlerCalls = 0;
    const provider = new FakeProvider([
        { functionCalls: [{ name: 'lookup_web', args: { query: 123 } }] },
        { functionCalls: [{ name: 'lookup_web', args: { query: 'fixed query' } }] },
        { functionCalls: [] },
    ]);

    await runAgent(makeConfig(
        provider,
        [baseTool({ maxCallsPerRun: 1 })],
        toolHandlers(['lookup_web', async () => {
            handlerCalls++;
            return { result: 'success' };
        }]),
    ), [{ role: 'user', text: 'Try again with fixed args' }]);

    assert.equal(handlerCalls, 1);
    const responses = lastFunctionResponses(provider.seenMessages[2]);
    assert.equal(responses[0].response.ok, true);
});

test('runAgent returns a structured timeout error when a tool exceeds its timeout', async () => {
    const provider = new FakeProvider([
        { functionCalls: [{ name: 'lookup_web', args: { query: 'slow query' } }] },
        { functionCalls: [] },
    ]);

    await runAgent(makeConfig(
        provider,
        [baseTool({ timeoutMs: 5 })],
        toolHandlers(['lookup_web', async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            return { result: 'too late' };
        }]),
    ), [{ role: 'user', text: 'Trigger timeout' }]);

    const responses = lastFunctionResponses(provider.seenMessages[1]);
    assert.equal(responses[0].response.ok, false);
    assert.equal(responses[0].response.error?.code, 'tool_execution_failed');
    assert.equal(responses[0].response.error?.retryable, true);
});

test('runAgent returns a structured error for unknown tools', async () => {
    const provider = new FakeProvider([
        { functionCalls: [{ name: 'missing_tool', args: {} }] },
        { functionCalls: [] },
    ]);

    await runAgent(makeConfig(
        provider,
        [],
        toolHandlers(),
    ), [{ role: 'user', text: 'Use a missing tool' }]);

    const responses = lastFunctionResponses(provider.seenMessages[1]);
    assert.equal(responses[0].response.ok, false);
    assert.equal(responses[0].response.error?.code, 'unknown_tool');
});

test('runAgent stops immediately when onToolResult returns true', async () => {
    const provider = new FakeProvider([
        { functionCalls: [{ name: 'lookup_web', args: { query: 'done' } }] },
    ]);

    const result = await runAgent(makeConfig(
        provider,
        [baseTool()],
        toolHandlers(['lookup_web', async () => ({ result: 'done' })]),
        {
            onToolResult: () => true,
        },
    ), [{ role: 'user', text: 'Stop after the first tool' }]);

    assert.equal(result.terminated, 'tool');
    assert.equal(provider.seenMessages.length, 1);
});
