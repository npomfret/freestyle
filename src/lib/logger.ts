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
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            renameSync(logPath, join(ARCHIVE_DIR, `${processName}-${ts}.log`));
        }

        logStream = createWriteStream(logPath, { flags: 'w' });
    }
    return logStream;
}

function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
        ts: new Date().toISOString(),
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
