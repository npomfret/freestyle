export function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        console.error(JSON.stringify({ level: 'error', msg: 'missing required env var', key, ts: new Date().toISOString() }));
        process.exit(1);
    }
    return value;
}
