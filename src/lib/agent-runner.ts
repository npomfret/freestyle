import { getLLMProvider } from './llm.js';
import type { LLMMessage, LLMProvider, LLMResponse, ToolDeclaration, FunctionCall, ToolResult } from './llm.js';
import { log as rootLog } from './logger.js';
import { normalizeToolResult, toolError, validateToolArgs } from './tool-runtime.js';

// ============================================================
// Agent configuration — each agent provides one of these
// ============================================================

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Build a typed tool handler map from entries. */
export function toolHandlers(
    ...entries: [string, ToolHandler][]
): Map<string, ToolHandler> {
    return new Map(entries);
}

export interface AgentConfig {
    /** Short name for logging (e.g. 'repair', 'recheck', 'discover'). */
    name: string;

    /** System instruction sent with every generate() call. */
    systemInstruction: string;

    /** Tool declarations exposed to the LLM. */
    tools: ToolDeclaration[];

    /** Map of tool name → handler function. */
    toolHandlers: Map<string, ToolHandler>;

    /** Maximum turns before the loop gives up. */
    maxTurns: number;

    /** Override the global LLM_PROVIDER for this agent. */
    provider?: string;
    /** Inject a provider directly, primarily for tests. */
    providerInstance?: LLMProvider;

    /**
     * Called after each LLM response. Return 'done' to exit the loop,
     * 'continue' to keep going normally, or a message array to inject
     * (e.g. a nudge prompt) and skip the normal tool-execution flow.
     */
    onResponse(response: LLMResponse, turn: number): 'done' | 'continue' | LLMMessage[];

    /**
     * Called after each tool call executes. Return true to exit the loop
     * immediately (e.g. update_resource signals completion).
     */
    onToolResult?(call: FunctionCall, result: ToolResult): boolean;

    /**
     * Called when the LLM returns no function calls.
     * Return 'break' to exit, or messages to inject and continue.
     * May be async (e.g. to write a failure record before exiting).
     */
    onNoTools?(response: LLMResponse): Promise<'break' | LLMMessage[]> | 'break' | LLMMessage[];
}

// ============================================================
// Agent runner — executes the turn-based loop
// ============================================================

export interface AgentResult {
    turns: number;
    terminated: 'tool' | 'response' | 'no-tools' | 'max-turns';
}

const DEFAULT_TOOL_TIMEOUT_MS = 20_000;

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

interface ExecutedToolCall {
    call: FunctionCall;
    result: ToolResult;
    stop: boolean;
}

interface ToolExecutionState {
    callCounts: Map<string, number>;
    seenTurnSignatures: Set<string>;
}

async function executeToolCall(
    config: AgentConfig,
    declarationMap: Map<string, ToolDeclaration>,
    state: ToolExecutionState,
    fc: FunctionCall,
    parallel: boolean,
): Promise<ExecutedToolCall> {
    const alog = rootLog.child({ agent: config.name });
    const declaration = declarationMap.get(fc.name);
    const handler = config.toolHandlers.get(fc.name);

    alog.info('tool call', {
        tool: fc.name,
        args: fc.args,
        parallelSafe: declaration?.parallelSafe ?? false,
        parallel,
    });

    if (!handler) {
        return {
            call: fc,
            result: normalizeToolResult(
                toolError(`Unknown tool: ${fc.name}`, { code: 'unknown_tool' }),
                declaration,
                { toolName: fc.name, callId: fc.id, parallel },
            ),
            stop: false,
        };
    }

    if (!declaration) {
        return {
            call: fc,
            result: normalizeToolResult(
                toolError(`Tool ${fc.name} is not declared for this agent`, { code: 'undeclared_tool' }),
                undefined,
                { toolName: fc.name, callId: fc.id, parallel },
            ),
            stop: false,
        };
    }

    const signature = `${fc.name}:${stableStringify(fc.args)}`;
    if (state.seenTurnSignatures.has(signature)) {
        return {
            call: fc,
            result: normalizeToolResult(
                toolError('Duplicate tool call suppressed', {
                    code: 'duplicate_tool_call',
                    details: { signature },
                }),
                declaration,
                { toolName: fc.name, callId: fc.id, parallel },
            ),
            stop: false,
        };
    }

    const currentCount = state.callCounts.get(fc.name) ?? 0;
    if (declaration.maxCallsPerRun !== undefined && currentCount >= declaration.maxCallsPerRun) {
        return {
            call: fc,
            result: normalizeToolResult(
                toolError(`Tool ${fc.name} exceeded maxCallsPerRun (${declaration.maxCallsPerRun})`, {
                    code: 'tool_call_limit_exceeded',
                }),
                declaration,
                { toolName: fc.name, callId: fc.id, parallel },
            ),
            stop: false,
        };
    }

    const validation = validateToolArgs(declaration, fc.args);
    if (!validation.ok) {
        return {
            call: fc,
            result: normalizeToolResult(
                toolError('Tool arguments failed validation', {
                    code: 'invalid_arguments',
                    details: validation.errors,
                }),
                declaration,
                { toolName: fc.name, callId: fc.id, parallel },
            ),
            stop: false,
        };
    }

    state.seenTurnSignatures.add(signature);
    state.callCounts.set(fc.name, currentCount + 1);

    const started = Date.now();
    try {
        const rawResult = await withTimeout(
            handler(fc.args),
            declaration.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
            fc.name,
        );
        const normalized = normalizeToolResult(rawResult, declaration, {
            toolName: fc.name,
            callId: fc.id,
            durationMs: Date.now() - started,
            parallel,
        });

        alog.info('tool result', {
            tool: fc.name,
            ok: normalized.ok,
            durationMs: normalized.executionMeta?.durationMs,
            sources: normalized.sources?.length ?? 0,
            queries: normalized.queries?.length ?? 0,
            truncated: normalized.truncated ?? false,
        });

        return {
            call: fc,
            result: normalized,
            stop: config.onToolResult?.(fc, normalized) ?? false,
        };
    } catch (err) {
        const normalized = normalizeToolResult(
            toolError(`Tool execution failed: ${String(err)}`, {
                code: 'tool_execution_failed',
                retryable: true,
            }),
            declaration,
            {
                toolName: fc.name,
                callId: fc.id,
                durationMs: Date.now() - started,
                parallel,
            },
        );
        alog.warn('tool execution failed', { tool: fc.name, error: String(err) });
        return {
            call: fc,
            result: normalized,
            stop: false,
        };
    }
}

export async function runAgent(
    config: AgentConfig,
    initialMessages: LLMMessage[],
): Promise<AgentResult> {
    const provider = config.providerInstance ?? await getLLMProvider(config.provider);
    const alog = rootLog.child({ agent: config.name });
    const messages = [...initialMessages];
    const declarationMap = new Map(config.tools.map((tool) => [tool.name, tool]));
    const executionState: ToolExecutionState = {
        callCounts: new Map<string, number>(),
        seenTurnSignatures: new Set<string>(),
    };

    for (let turn = 0; turn < config.maxTurns; turn++) {
        executionState.seenTurnSignatures.clear();
        alog.info('llm call', { turn, messageCount: messages.length });
        const started = Date.now();
        const response = await provider.generate(messages, {
            systemInstruction: config.systemInstruction,
            tools: config.tools,
        });
        alog.info('llm response', {
            turn,
            elapsedMs: Date.now() - started,
            textSnippet: response.text?.slice(0, 200),
            toolCalls: response.functionCalls.map((fc) => fc.name),
        });

        if (response.text) {
            alog.debug('agent text', { turn, text: response.text });
        }

        // Let the agent config inspect the full response first
        const verdict = config.onResponse(response, turn);
        if (verdict === 'done' && response.functionCalls.length === 0) {
            // Model signalled completion and there's nothing left to execute — exit now.
            return { turns: turn + 1, terminated: 'response' };
        }
        if (Array.isArray(verdict)) {
            // Config wants to inject messages (e.g. nudge) and skip tool execution
            for (const msg of verdict) messages.push(msg);
            continue;
        }
        // If verdict === 'done' but there are pending tool calls, execute them first
        // and exit after. Otherwise completion signals in the same turn as add_resource
        // calls cause those adds to be silently dropped.
        const exitAfterTools = verdict === 'done';

        // No tool calls
        if (response.functionCalls.length === 0) {
            if (config.onNoTools) {
                const action = await config.onNoTools(response);
                alog.info('no tool calls', { turn, action: action === 'break' ? 'break' : 'nudge' });
                if (action === 'break') {
                    return { turns: turn + 1, terminated: 'no-tools' };
                }
                // Inject messages and continue
                for (const msg of action) messages.push(msg);
                continue;
            }
            alog.warn('agent returned no action', { text: response.text });
            return { turns: turn + 1, terminated: 'no-tools' };
        }

        // Push model response
        messages.push({
            role: 'model',
            text: response.text,
            functionCalls: response.functionCalls,
        });

        // Execute tools
        const functionResponses = [];
        let index = 0;
        while (index < response.functionCalls.length) {
            const fc = response.functionCalls[index];
            const declaration = declarationMap.get(fc.name);

            if (declaration?.parallelSafe) {
                const batch = [fc];
                index++;
                while (
                    index < response.functionCalls.length &&
                    declarationMap.get(response.functionCalls[index].name)?.parallelSafe
                ) {
                    batch.push(response.functionCalls[index]);
                    index++;
                }

                const executed = await Promise.all(batch.map((call) => executeToolCall(
                    config,
                    declarationMap,
                    executionState,
                    call,
                    true,
                )));

                for (const item of executed) {
                    functionResponses.push({
                        name: item.call.name,
                        response: item.result,
                        id: item.call.id,
                    });

                    if (item.stop) {
                        return { turns: turn + 1, terminated: 'tool' };
                    }
                }
                continue;
            }

            const executed = await executeToolCall(
                config,
                declarationMap,
                executionState,
                fc,
                false,
            );

            functionResponses.push({
                name: executed.call.name,
                response: executed.result,
                id: executed.call.id,
            });

            if (executed.stop) {
                return { turns: turn + 1, terminated: 'tool' };
            }
            index++;
        }

        messages.push({ role: 'user', functionResponses });

        if (exitAfterTools) {
            return { turns: turn + 1, terminated: 'response' };
        }
    }

    alog.warn('max turns reached', { maxTurns: config.maxTurns });
    return { turns: config.maxTurns, terminated: 'max-turns' };
}
