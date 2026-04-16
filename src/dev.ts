import { type ChildProcess, spawn } from 'child_process';
import { log } from './lib/logger.js';

const children: ChildProcess[] = [];

function bg(cmd: string, name: string): void {
    const [bin, ...args] = cmd.split(' ');
    const child = spawn(bin, args, { stdio: 'inherit', shell: true });
    children.push(child);
    child.on('exit', (code) => {
        log.info('process exited', { name, code });
    });
}

function cleanup(): void {
    log.info('shutting down');
    for (const child of children) {
        if (!child.killed) child.kill('SIGTERM');
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main(): Promise<void> {
    // npm run dev should never start or mutate the database.
    log.info('starting services');
    bg('npx tsx src/server.ts', 'server');
    bg('npm run dev:web', 'web');

    log.info('dev environment ready', {
        api: 'http://localhost:3001',
        web: 'http://localhost:5173',
        note: 'npm run dev does not start Docker Postgres or run migrations',
    });
}

main();
