import { existsSync, mkdirSync, renameSync, createWriteStream } from 'fs';
import type { WriteStream } from 'fs';
import { basename, join } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

interface LogEntry {
    ts: string;
    level: LogLevel;
    msg: string;
    [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL];
}

/**
 * Format a date as ISO-like string in local time (e.g., "2026-04-08T12:52:50.497")
 */
function getLocalISOString(date: Date): string {
    const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const ms = pad(date.getMilliseconds(), 3);
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

// ============================================================
// File logging
// ============================================================

const LOG_DIR = join(process.cwd(), 'tmp', 'logs');
const ARCHIVE_DIR = join(LOG_DIR, 'archive');

/**
 * Derive process name from the script filename.
 * e.g. "src/repair.ts" → "repair", "src/recheck.ts" → "validity-check"
 */
function getProcessName(): string {
    const script = process.argv[1] ?? 'unknown';
    const name = basename(script).replace(/\.[^.]+$/, '');
    // Map script names to their npm run target names
    const nameMap: Record<string, string> = {
        'recheck': 'validity-check',
    };
    return nameMap[name] ?? name;
}

let logStream: WriteStream | null = null;

function getLogStream(): WriteStream {
    if (!logStream) {
        mkdirSync(LOG_DIR, { recursive: true });

        const processName = getProcessName();
        const logPath = join(LOG_DIR, `${processName}.log`);

        // Archive existing log file before starting
        if (existsSync(logPath)) {
            mkdirSync(ARCHIVE_DIR, { recursive: true });
            const ts = getLocalISOString(new Date()).replace(/[:.]/g, '-');
            renameSync(logPath, join(ARCHIVE_DIR, `${processName}-${ts}.log`));
        }

        logStream = createWriteStream(logPath, { flags: 'w' });
    }
    return logStream;
}

function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
        ts: getLocalISOString(new Date()),
        level,
        msg,
        ...data,
    };
    const line = JSON.stringify(entry) + '\n';
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(line);
    getLogStream().write(line);
}

export interface Logger {
    debug(msg: string, data?: Record<string, unknown>): void;
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}

function createLogger(context: Record<string, unknown> = {}): Logger {
    return {
        debug(msg, data) {
            emit('debug', msg, { ...context, ...data });
        },
        info(msg, data) {
            emit('info', msg, { ...context, ...data });
        },
        warn(msg, data) {
            emit('warn', msg, { ...context, ...data });
        },
        error(msg, data) {
            emit('error', msg, { ...context, ...data });
        },
        child(extra) {
            return createLogger({ ...context, ...extra });
        },
    };
}

export const log = createLogger();

/**
 * Serialize an unknown thrown value into a structured object suitable for
 * passing to log.error(). Captures message, stack, and cause chain.
 */
export function serializeError(err: unknown): Record<string, unknown> {
    if (!(err instanceof Error)) {
        return { error: String(err) };
    }
    const result: Record<string, unknown> = {
        error: err.message,
        stack: err.stack,
    };
    if (err.cause != null) {
        result.cause = err.cause instanceof Error
            ? { message: err.cause.message, stack: err.cause.stack }
            : String(err.cause);
    }
    return result;
}
