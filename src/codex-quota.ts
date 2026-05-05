import { CodexQuotaError, deriveAvailable, fetchCodexQuota } from './lib/codex-cli-quota.js';

const isJson = process.argv.includes('--json');
const isAvailable = process.argv.includes('--available');

// --min-remaining=<int> raises the bar the windows must clear to count as available.
// Defaults to 5 (matches the lib default — "any non-trivial headroom"). Pass 50 to
// require at least half the window unused. Treats all windows with a single threshold:
// the call counts as available if **any** window clears the bar (the lib's `some()`
// semantics).
//
// --min-primary=<int> and --min-secondary=<int> are an alternative, per-window gate.
// When either is set, the call counts as available only if **every** named window meets
// its threshold (so an exhausted secondary blocks the call even if primary is full).
// A window with no per-window threshold passes the per-window check trivially.
function parsePercentArg(flag: string): number | undefined {
    const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
    if (!arg) return undefined;
    const n = Number(arg.slice(flag.length + 1));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
        process.stderr.write(`Invalid ${flag} value: ${arg}\n`);
        process.exit(64);
    }
    return n;
}

function checkPerWindow(
    windows: { name: string; remainingPercent: number; }[],
    minPrimary: number | undefined,
    minSecondary: number | undefined,
): boolean {
    return windows.every((w) => {
        if (w.name === 'primary' && minPrimary !== undefined) return w.remainingPercent >= minPrimary;
        if (w.name === 'secondary' && minSecondary !== undefined) return w.remainingPercent >= minSecondary;
        return true;
    });
}

try {
    const snapshot = await fetchCodexQuota();
    const minRemaining = parsePercentArg('--min-remaining') ?? 5;
    const minPrimary = parsePercentArg('--min-primary');
    const minSecondary = parsePercentArg('--min-secondary');
    const usePerWindow = minPrimary !== undefined || minSecondary !== undefined;

    let available: boolean;
    if (usePerWindow && snapshot.windows.length > 0) {
        available = checkPerWindow(snapshot.windows, minPrimary, minSecondary);
    } else {
        available = deriveAvailable(snapshot.windows, snapshot.credits, minRemaining);
    }

    if (isAvailable) {
        const parts = snapshot.windows.length > 0
            ? snapshot.windows.map((w) => `${w.name}=${w.remainingPercent}%`).join('  ')
            : '(no windows reported)';
        const creditsPart = snapshot.credits
            ? `  credits.hasCredits=${snapshot.credits.hasCredits} unlimited=${snapshot.credits.unlimited}`
            : '';
        const threshold = usePerWindow
            ? `min=primary≥${minPrimary ?? '—'}% secondary≥${minSecondary ?? '—'}%`
            : `min=${minRemaining}%`;

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
