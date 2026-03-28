import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeModels,
    groupIntoFamilies,
    modelFamily,
    tierToPlan,
    extractEmail,
} from './gemini-cli-quota.js';

// ============================================================
// normalizeModels
// ============================================================

describe('normalizeModels', () => {
    it('collapses multiple buckets for same model — lowest fraction wins', () => {
        const raw = [
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.8 },
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.3 },
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.6 },
        ];
        const result = normalizeModels(raw);
        assert.equal(result.length, 1);
        assert.equal(result[0].modelId, 'gemini-2.5-flash');
        assert.equal(result[0].remainingFraction, 0.3);
        assert.equal(result[0].remainingPercent, 30);
    });

    it('keeps resetTime from the bucket with the lowest fraction', () => {
        const raw = [
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.8, resetTime: '2026-03-29T00:00:00Z' },
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.2, resetTime: '2026-03-28T23:00:00Z' },
        ];
        const result = normalizeModels(raw);
        assert.equal(result[0].resetTime, '2026-03-28T23:00:00Z');
    });

    it('handles buckets with missing modelId or fraction', () => {
        const raw = [
            { modelId: 'gemini-2.5-pro', remainingFraction: 1.0 },
            { remainingFraction: 0.5 },        // no modelId
            { modelId: 'gemini-2.5-flash' },    // no fraction
        ];
        const result = normalizeModels(raw);
        assert.equal(result.length, 1);
        assert.equal(result[0].modelId, 'gemini-2.5-pro');
    });

    it('returns results sorted alphabetically by modelId', () => {
        const raw = [
            { modelId: 'gemini-2.5-pro', remainingFraction: 1.0 },
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.5 },
            { modelId: 'gemini-2.5-flash-lite', remainingFraction: 0.1 },
        ];
        const result = normalizeModels(raw);
        assert.deepEqual(
            result.map((m) => m.modelId),
            ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
        );
    });
});

// ============================================================
// modelFamily
// ============================================================

describe('modelFamily', () => {
    it('flash-lite is family flash-lite, not flash', () => {
        assert.equal(modelFamily('gemini-2.5-flash-lite'), 'flash-lite');
        assert.equal(modelFamily('gemini-2.5-flash-lite-preview'), 'flash-lite');
    });

    it('flash (without lite) is family flash', () => {
        assert.equal(modelFamily('gemini-2.5-flash'), 'flash');
        assert.equal(modelFamily('gemini-3-flash-preview'), 'flash');
    });

    it('pro is family pro', () => {
        assert.equal(modelFamily('gemini-2.5-pro'), 'pro');
        assert.equal(modelFamily('gemini-3.1-pro-preview'), 'pro');
    });

    it('unknown model is family unknown', () => {
        assert.equal(modelFamily('some-other-model'), 'unknown');
    });

    it('is case-insensitive', () => {
        assert.equal(modelFamily('Gemini-2.5-Flash-Lite'), 'flash-lite');
        assert.equal(modelFamily('GEMINI-2.5-PRO'), 'pro');
    });
});

// ============================================================
// groupIntoFamilies
// ============================================================

describe('groupIntoFamilies', () => {
    it('flash-lite and flash remain separate families', () => {
        const models = [
            { modelId: 'gemini-2.5-flash-lite', remainingFraction: 0.0, remainingPercent: 0, resetTime: '2026-03-28T23:00:00Z' },
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.62, remainingPercent: 62, resetTime: '2026-03-29T00:00:00Z' },
        ];
        const families = groupIntoFamilies(models);
        const famNames = families.map((f) => f.family);
        assert.ok(famNames.includes('flash-lite'));
        assert.ok(famNames.includes('flash'));
        assert.equal(families.find((f) => f.family === 'flash-lite')?.remainingPercent, 0);
        assert.equal(families.find((f) => f.family === 'flash')?.remainingPercent, 62);
    });

    it('lowest remainingPercent wins within a family', () => {
        const models = [
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.8, remainingPercent: 80, resetTime: null },
            { modelId: 'gemini-3-flash-preview', remainingFraction: 0.4, remainingPercent: 40, resetTime: null },
        ];
        const families = groupIntoFamilies(models);
        assert.equal(families.find((f) => f.family === 'flash')?.remainingPercent, 40);
    });

    it('includes all models in the family models array', () => {
        const models = [
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.8, remainingPercent: 80, resetTime: null },
            { modelId: 'gemini-3-flash-preview', remainingFraction: 0.4, remainingPercent: 40, resetTime: null },
        ];
        const families = groupIntoFamilies(models);
        const flashFamily = families.find((f) => f.family === 'flash')!;
        assert.equal(flashFamily.models.length, 2);
    });

    it('picks earliest non-null resetTime within a family', () => {
        const models = [
            { modelId: 'gemini-2.5-flash', remainingFraction: 0.5, remainingPercent: 50, resetTime: '2026-03-29T02:00:00Z' },
            { modelId: 'gemini-3-flash', remainingFraction: 0.3, remainingPercent: 30, resetTime: '2026-03-28T22:00:00Z' },
        ];
        const families = groupIntoFamilies(models);
        assert.equal(families.find((f) => f.family === 'flash')?.resetTime, '2026-03-28T22:00:00Z');
    });
});

// ============================================================
// tierToPlan
// ============================================================

function makeIdToken(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `header.${payload}.sig`;
}

describe('tierToPlan', () => {
    it('standard-tier → Paid', () => {
        assert.equal(tierToPlan('standard-tier', null), 'Paid');
    });

    it('free-tier + hosted domain → Workspace', () => {
        const token = makeIdToken({ email: 'user@corp.com', hd: 'corp.com' });
        assert.equal(tierToPlan('free-tier', token), 'Workspace');
    });

    it('free-tier without domain → Free', () => {
        const token = makeIdToken({ email: 'user@gmail.com' });
        assert.equal(tierToPlan('free-tier', token), 'Free');
    });

    it('legacy-tier → Legacy', () => {
        assert.equal(tierToPlan('legacy-tier', null), 'Legacy');
    });

    it('null tier → null plan', () => {
        assert.equal(tierToPlan(null, null), null);
    });
});

// ============================================================
// extractEmail
// ============================================================

describe('extractEmail', () => {
    it('decodes email from a well-formed JWT', () => {
        const token = makeIdToken({ email: 'test@example.com', sub: '12345' });
        assert.equal(extractEmail(token), 'test@example.com');
    });

    it('returns null for null input', () => {
        assert.equal(extractEmail(null), null);
    });

    it('returns null for malformed token', () => {
        assert.equal(extractEmail('notajwt'), null);
    });

    it('returns null when email claim is absent', () => {
        const token = makeIdToken({ sub: '12345' });
        assert.equal(extractEmail(token), null);
    });
});
