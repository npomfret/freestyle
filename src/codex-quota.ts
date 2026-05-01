import { CodexQuotaError, deriveAvailable, fetchCodexQuota } from './lib/codex-cli-quota.js';

const isJson = process.argv.includes('--json');
const isAvailable = process.argv.includes('--available');

// --min-remaining=<int> raises the bar the windows must clear to count as available.
// Defaults to 5 (matches the lib default — "any non-trivial headroom"). Pass 50 to
// require at least half the window unused.
function parseMinRemaining(): number {
    const arg = process.argv.find((a) => a.startsWith('--min-remaining='));
    if (!arg) return 5;
    const n = Number(arg.slice('--min-remaining='.length));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
        process.stderr.write(`Invalid --min-remaining value: ${arg}\n`);
        process.exit(64);
    }
    return n;
}

try {
    const snapshot = await fetchCodexQuota();
    const minRemaining = parseMinRemaining();
    const available = deriveAvailable(snapshot.windows, snapshot.credits, minRemaining);

    if (isAvailable) {
        const parts = snapshot.windows.length > 0
            ? snapshot.windows.map((w) => `${w.name}=${w.remainingPercent}%`).join('  ')
            : '(no windows reported)';
        const creditsPart = snapshot.credits
            ? `  credits.hasCredits=${snapshot.credits.hasCredits} unlimited=${snapshot.credits.unlimited}`
            : '';
        const threshold = `min=${minRemaining}%`;

        if (!available) {
            process.stderr.write(`codex: ${parts}${creditsPart}  ${threshold}  → no capacity\n`);
            process.exit(2);
        }

        process.stderr.write(`codex: ${parts}${creditsPart}  ${threshold}  → available (plan=${snapshot.planType})\n`);
        process.exit(0);
    }

    if (isJson) {
        console.log(JSON.stringify(snapshot, null, 2));
        process.exit(0);
    }

    console.log('Codex quota');
    console.log(`Account:  ${snapshot.accountId ?? '(unknown)'}`);
    console.log(`Plan:     ${snapshot.planType}`);
    console.log(`Available: ${snapshot.available ? 'yes' : 'no'}`);
    console.log('');

    if (snapshot.windows.length > 0) {
        console.log('Window      Remaining   Reset (epoch s)   Limit window');
        for (const w of snapshot.windows) {
            const name = w.name.padEnd(12);
            const pct = `${w.remainingPercent}%`.padEnd(12);
            const reset = String(w.resetAt).padEnd(18);
            console.log(`${name}${pct}${reset}${w.limitWindowSeconds}s`);
        }
    } else {
        console.log('(no rate-limited windows reported by API)');
    }

    if (snapshot.credits) {
        console.log('');
        console.log('Credits');
        console.log(`  hasCredits: ${snapshot.credits.hasCredits}`);
        console.log(`  unlimited:  ${snapshot.credits.unlimited}`);
        console.log(`  balance:    ${snapshot.credits.balance ?? '—'}`);
    }
} catch (err) {
    if (err instanceof CodexQuotaError) {
        console.error(`Error [${err.code}]: ${err.message}`);
    } else {
        console.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
}
