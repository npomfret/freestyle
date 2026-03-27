import { getLLMProvider } from './llm.js';
import type { LLMMessage, LLMResponse, ToolDeclaration, FunctionCall } from './llm.js';
import { log as rootLog } from './logger.js';

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
    onToolResult?(call: FunctionCall, result: unknown): boolean;

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

export async function runAgent(
    config: AgentConfig,
    initialMessages: LLMMessage[],
): Promise<AgentResult> {
    const provider = await getLLMProvider();
    const alog = rootLog.child({ agent: config.name });
    const messages = [...initialMessages];

    for (let turn = 0; turn < config.maxTurns; turn++) {
        const response = await provider.generate(messages, {
            systemInstruction: config.systemInstruction,
            tools: config.tools,
        });

        if (response.text) {
            alog.debug('agent text', { turn, text: response.text });
        }

        // Let the agent config inspect the full response first
        const verdict = config.onResponse(response, turn);
        if (verdict === 'done') {
            return { turns: turn + 1, terminated: 'response' };
        }
        if (Array.isArray(verdict)) {
            // Config wants to inject messages (e.g. nudge) and skip tool execution
            for (const msg of verdict) messages.push(msg);
            continue;
        }

        // No tool calls
        if (response.functionCalls.length === 0) {
            if (config.onNoTools) {
                const action = await config.onNoTools(response);
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
        for (const fc of response.functionCalls) {
            const handler = config.toolHandlers.get(fc.name);
            if (!handler) {
                alog.warn('unknown tool', { tool: fc.name });
                functionResponses.push({
                    name: fc.name,
                    response: { error: `Unknown tool: ${fc.name}` },
                    id: fc.id,
                });
                continue;
            }

            alog.info('tool call', { tool: fc.name, args: fc.args });
            const result = await handler(fc.args);
            alog.debug('tool result', { tool: fc.name, result });

            functionResponses.push({
                name: fc.name,
                response: result,
                id: fc.id,
            });

            // Check if this tool call signals completion
            if (config.onToolResult?.(fc, result)) {
                return { turns: turn + 1, terminated: 'tool' };
            }
        }

        messages.push({ role: 'user', functionResponses });
    }

    alog.warn('max turns reached', { maxTurns: config.maxTurns });
    return { turns: config.maxTurns, terminated: 'max-turns' };
}
