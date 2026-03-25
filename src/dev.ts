import { execSync, spawn } from 'child_process';
import { log } from './lib/logger.js';

function run(cmd: string): void {
    execSync(cmd, { stdio: 'inherit' });
}

function bg(cmd: string, name: string): void {
    const [bin, ...args] = cmd.split(' ');
    const child = spawn(bin, args, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
        log.info('process exited', { name, code });
    });
}

async function main(): Promise<void> {
    // 1. Start DB if not already running
    log.info('starting database');
    run('docker compose up -d db');

    // 2. Wait for DB to be ready
    log.info('waiting for database');
    for (let i = 0; i < 30; i++) {
        try {
            execSync('docker compose exec db pg_isready -U freestyle', { stdio: 'ignore' });
            break;
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    // 3. Run migrations
    log.info('running migrations');
    run('npx tsx src/migrate.ts');

    // 4. Start API server and Vite dev server in parallel
    log.info('starting services');
    bg('npx tsx src/server.ts', 'server');
    bg('npm run dev:web', 'web');

    log.info('dev environment ready', { api: 'http://localhost:3001', web: 'http://localhost:5173' });
}

main();
