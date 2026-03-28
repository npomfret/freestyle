import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { modelFamily } from './gemini-cli-quota.js';

// ============================================================
// modelFamily integration (used by provider's chooseModel)
// ============================================================

describe('modelFamily (provider usage)', () => {
    it('maps provider model strings to correct families', () => {
        assert.equal(modelFamily('gemini-2.5-flash-lite'), 'flash-lite');
        assert.equal(modelFamily('gemini-2.5-flash'), 'flash');
        assert.equal(modelFamily('gemini-2.5-pro'), 'pro');
    });
});

// ============================================================
// chooseModel logic — tested via a lightweight harness
// ============================================================

/**
 * A minimal stand-in for the provider's chooseModel logic.
 * Mirrors the real implementation but is dependency-injectable for testing.
 */
function makeChooser(
    models: string[],
    familyRateLimitedAt: Map<string, number>,
    quotaSnapshot: { families: { family: string; remainingPercent: number }[] } | null,
    now = Date.now(),
    cooldownMs = 60 * 60 * 1000,
) {
    return function chooseModel(): string | null {
        for (const m of models) {
            const fam = modelFamily(m);

            const limitedAt = familyRateLimitedAt.get(fam);
            if (limitedAt && now - limitedAt <= cooldownMs) continue;

            if (quotaSnapshot) {
                const fd = quotaSnapshot.families.find((f) => f.family === fam);
                if (fd && fd.remainingPercent === 0) continue;
            }

            return m;
        }
        return null;
    };
}

describe('chooseModel', () => {
    it('returns the first configured model when nothing is exhausted', () => {
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
            new Map(),
            null,
        );
        assert.equal(choose(), 'gemini-2.5-flash-lite');
    });

    it('skips families at 0% quota per snapshot', () => {
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
            new Map(),
            {
                families: [
                    { family: 'flash-lite', remainingPercent: 0 },
                    { family: 'flash', remainingPercent: 62 },
                    { family: 'pro', remainingPercent: 100 },
                ],
            },
        );
        assert.equal(choose(), 'gemini-2.5-flash');
    });

    it('respects user-specified ordering — picks first eligible model not first eligible family', () => {
        // GEMINI_MODELS=flash-lite-a,flash-a,flash-b,pro-a
        // flash-lite = 0%, flash = 62%, pro = 100%
        // Expected: flash-a (first model in an eligible family)
        const models = ['flash-lite-model', 'flash-model-a', 'flash-model-b', 'pro-model'];
        const choose = makeChooser(
            models,
            new Map(),
            {
                families: [
                    { family: 'flash-lite', remainingPercent: 0 },
                    { family: 'flash', remainingPercent: 62 },
                    { family: 'pro', remainingPercent: 100 },
                ],
            },
        );
        assert.equal(choose(), 'flash-model-a');
    });

    it('skips families within runtime cooldown', () => {
        const now = Date.now();
        const rateLimited = new Map([['flash-lite', now - 1000]]); // 1 second ago
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
            rateLimited,
            null,
            now,
            60 * 60 * 1000,
        );
        assert.equal(choose(), 'gemini-2.5-flash');
    });

    it('allows a family again after cooldown expires', () => {
        const now = Date.now();
        const rateLimited = new Map([['flash-lite', now - 2 * 60 * 60 * 1000]]); // 2 hours ago
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
            rateLimited,
            null,
            now,
            60 * 60 * 1000,
        );
        assert.equal(choose(), 'gemini-2.5-flash-lite');
    });

    it('returns null when all families are exhausted', () => {
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
            new Map(),
            {
                families: [
                    { family: 'flash-lite', remainingPercent: 0 },
                    { family: 'flash', remainingPercent: 0 },
                ],
            },
        );
        assert.equal(choose(), null);
    });

    it('proceeds normally when quota snapshot is null (probe failed)', () => {
        // When quota probe throws, snapshot stays null — provider falls back to reactive behavior
        const choose = makeChooser(
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
            new Map(),
            null, // probe failed
        );
        assert.equal(choose(), 'gemini-2.5-flash-lite');
    });
});
