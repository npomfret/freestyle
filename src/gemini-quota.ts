import { fetchGeminiQuota, GeminiQuotaError } from './lib/gemini-cli-quota.js';

const isJson = process.argv.includes('--json');
const isPickModel = process.argv.includes('--pick-model');

const FAMILY_TO_MODEL: Record<string, string> = {
    'flash-lite': 'gemini-2.5-flash-lite',
    'flash': 'gemini-2.5-flash',
    'pro': 'gemini-2.5-pro',
};

try {
    const snapshot = await fetchGeminiQuota();

    if (isPickModel) {
        const MIN_PCT = 5;
        const eligible = [...snapshot.families]
            .filter((f) => f.family in FAMILY_TO_MODEL && f.remainingPercent >= MIN_PCT)
            .sort((a, b) => b.remainingPercent - a.remainingPercent);

        // Quota summary → stderr so the shell can capture just the model name from stdout
        const parts = snapshot.families
            .filter((f) => f.family in FAMILY_TO_MODEL)
            .map((f) => `${f.family}=${f.remainingPercent}%`)
            .join('  ');

        if (eligible.length === 0) {
            process.stderr.write(`quota: ${parts}  → no capacity\n`);
            process.exit(2);
        }

        const model = FAMILY_TO_MODEL[eligible[0].family];
        process.stderr.write(`quota: ${parts}  → ${model}\n`);
        console.log(model);
        process.exit(0);
    }

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
