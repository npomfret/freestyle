import { fetchGeminiQuota, GeminiQuotaError } from './lib/gemini-cli-quota.js';

const isJson = process.argv.includes('--json');

try {
    const snapshot = await fetchGeminiQuota();

    if (isJson) {
        console.log(JSON.stringify(snapshot, null, 2));
        process.exit(0);
    }

    // Human-readable output
    console.log('Gemini quota');
    console.log(`Account: ${snapshot.accountEmail ?? '(unknown)'}`);
    console.log(`Plan:    ${snapshot.accountPlan ?? '(unknown)'}`);
    console.log(`Project: ${snapshot.projectId ?? '(none)'}`);
    console.log('');

    // Family table
    const familyHeader = 'Family      Remaining   Reset';
    console.log(familyHeader);
    for (const f of snapshot.families) {
        const name = f.family.padEnd(12);
        const pct = `${f.remainingPercent}%`.padEnd(12);
        const reset = f.resetTime ?? '—';
        console.log(`${name}${pct}${reset}`);
    }

    // Per-model list
    if (snapshot.models.length > 0) {
        console.log('');
        console.log('Models');
        for (const m of snapshot.models) {
            console.log(`- ${m.modelId}: ${m.remainingPercent}%`);
        }
    }
} catch (err) {
    if (err instanceof GeminiQuotaError) {
        console.error(`Error [${err.code}]: ${err.message}`);
    } else {
        console.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
}
