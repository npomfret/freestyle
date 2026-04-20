import type { ToolDeclaration, ToolError, ToolExecutionMeta, ToolParameter, ToolResult } from './llm.js';

export interface ToolValidationResult {
    ok: boolean;
    errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(base: string, key: string): string {
    return base ? `${base}.${key}` : key;
}

function validateValue(
    param: ToolParameter,
    value: unknown,
    path: string,
    errors: string[],
): void {
    switch (param.type) {
        case 'string':
            if (typeof value !== 'string') {
                errors.push(`${path} must be a string`);
                return;
            }
            if (param.enum && !param.enum.includes(value)) {
                errors.push(`${path} must be one of: ${param.enum.join(', ')}`);
            }
            return;

        case 'number':
            if (typeof value !== 'number' || Number.isNaN(value)) {
                errors.push(`${path} must be a number`);
            }
            return;

        case 'boolean':
            if (typeof value !== 'boolean') {
                errors.push(`${path} must be a boolean`);
            }
            return;

        case 'array':
            if (!Array.isArray(value)) {
                errors.push(`${path} must be an array`);
                return;
            }
            if (param.items) {
                for (let i = 0; i < value.length; i++) {
                    validateValue(param.items, value[i], `${path}[${i}]`, errors);
                }
            }
            return;

        case 'object':
            if (!isPlainObject(value)) {
                errors.push(`${path} must be an object`);
                return;
            }

            for (const key of param.required ?? []) {
                if (value[key] === undefined) {
                    errors.push(`${joinPath(path, key)} is required`);
                }
            }

            if (param.properties) {
                for (const [key, child] of Object.entries(param.properties)) {
                    if (value[key] !== undefined) {
                        validateValue(child, value[key], joinPath(path, key), errors);
                    }
                }
            }

            if (param.additionalProperties === false && param.properties) {
                const allowed = new Set(Object.keys(param.properties));
                for (const key of Object.keys(value)) {
                    if (!allowed.has(key)) {
                        errors.push(`${joinPath(path, key)} is not allowed`);
                    }
                }
            }
            return;
    }
}

export function validateToolArgs(
    declaration: ToolDeclaration,
    args: Record<string, unknown>,
): ToolValidationResult {
    const errors: string[] = [];
    validateValue(declaration.parameters, args, declaration.name, errors);
    return { ok: errors.length === 0, errors };
}

function trimString(value: string, limit: number): { value: string; truncated: boolean } {
    if (value.length <= limit) return { value, truncated: false };
    return {
        value: `${value.slice(0, limit)}...[truncated]`,
        truncated: true,
    };
}

function truncateUnknown(value: unknown, limit: number): { value: unknown; truncated: boolean } {
    if (typeof value === 'string') {
        return trimString(value, limit);
    }

    if (Array.isArray(value)) {
        let truncated = false;
        const next = value.map((item) => {
            const result = truncateUnknown(item, limit);
            truncated ||= result.truncated;
            return result.value;
        });
        return { value: next, truncated };
    }

    if (isPlainObject(value)) {
        let truncated = false;
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value)) {
            const result = truncateUnknown(child, limit);
            truncated ||= result.truncated;
            next[key] = result.value;
        }
        return { value: next, truncated };
    }

    return { value, truncated: false };
}

export function toolOk<T>(
    data: T,
    extras?: Omit<ToolResult<T>, 'ok' | 'data'>,
): ToolResult<T> {
    return {
        ok: true,
        data,
        ...extras,
    };
}

export function toolError<T = unknown>(
    message: string,
    extras?: Omit<ToolResult<T>, 'ok' | 'error'> & { code?: string; retryable?: boolean; details?: unknown },
): ToolResult<T> {
    const { code, retryable, details, ...rest } = extras ?? {};
    const error: ToolError = {
        message,
        ...(code ? { code } : {}),
        ...(retryable !== undefined ? { retryable } : {}),
        ...(details !== undefined ? { details } : {}),
    };

    return {
        ok: false,
        error,
        ...rest,
    };
}

export function isToolResult(value: unknown): value is ToolResult {
    return isPlainObject(value) && typeof value.ok === 'boolean';
}

export function normalizeToolResult(
    value: unknown,
    declaration?: ToolDeclaration,
    executionMeta?: ToolExecutionMeta,
): ToolResult {
    const normalized = isToolResult(value) ? value : toolOk(value);
    const mergedMeta = {
        ...(normalized.executionMeta ?? {}),
        ...(executionMeta ?? {}),
    };

    const limit = declaration?.maxResponseChars;
    if (!limit) {
        return {
            ...normalized,
            executionMeta: Object.keys(mergedMeta).length > 0 ? mergedMeta : undefined,
        };
    }

    const { value: data, truncated: dataTruncated } = truncateUnknown(normalized.data, limit);
    const { value: error, truncated: errorTruncated } = truncateUnknown(normalized.error, limit);
    const truncated = normalized.truncated || dataTruncated || errorTruncated;

    return {
        ...normalized,
        data,
        error: error as ToolError | undefined,
        truncated,
        executionMeta: Object.keys(mergedMeta).length > 0 ? mergedMeta : undefined,
    };
}

export function renderToolDescription(declaration: ToolDeclaration): string {
    const parts = [declaration.description];

    if (declaration.whenToUse) {
        parts.push(`Use when: ${declaration.whenToUse}`);
    }
    if (declaration.whenNotToUse) {
        parts.push(`Do not use when: ${declaration.whenNotToUse}`);
    }
    if (declaration.returns) {
        parts.push(`Returns: ${declaration.returns}`);
    }
    if (declaration.notes && declaration.notes.length > 0) {
        parts.push(`Notes: ${declaration.notes.join(' ')}`);
    }
    if (declaration.examples && declaration.examples.length > 0) {
        const examples = declaration.examples
            .map((example) => {
                const renderedArgs = JSON.stringify(example.args);
                return example.description
                    ? `${example.description}: ${renderedArgs}`
                    : renderedArgs;
            })
            .join(' | ');
        parts.push(`Examples: ${examples}`);
    }

    return parts.filter(Boolean).join('\n');
}
