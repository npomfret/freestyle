import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSnapshot, type CodexCreds, type CodexWindowSnapshot, deriveAvailable, needsRefresh, normalizeCredits, normalizePlanType, normalizeWindow, parseAuth } from './codex-cli-quota.js';

// ============================================================
// parseAuth
// ============================================================

describe('parseAuth', () => {
    it('extracts OAuth tokens from typical auth.json', () => {
        const raw = JSON.stringify({
            tokens: {
                access_token: 'at-123',
                refresh_token: 'rt-456',
                id_token: 'id-789',
                account_id: 'acc-abc',
            },
            last_refresh: '2026-04-01T12:00:00Z',
        });
        const creds = parseAuth(raw);
        assert.equal(creds.accessToken, 'at-123');
        assert.equal(creds.refreshToken, 'rt-456');
        assert.equal(creds.idToken, 'id-789');
        assert.equal(creds.accountId, 'acc-abc');
        assert.equal(creds.lastRefresh, '2026-04-01T12:00:00Z');
        assert.equal(creds.isApiKey, false);
    });

    it('returns API-key shape when OPENAI_API_KEY is present', () => {
        const raw = JSON.stringify({ OPENAI_API_KEY: 'sk-test-123' });
        const creds = parseAuth(raw);
        assert.equal(creds.isApiKey, true);
        assert.equal(creds.accessToken, 'sk-test-123');
        assert.equal(creds.refreshToken, '');
    });

    it('throws NOT_LOGGED_IN when tokens are missing', () => {
        assert.throws(() => parseAuth('{}'), /no tokens/i);
    });

    it('throws NOT_LOGGED_IN when access_token absent', () => {
        const raw = JSON.stringify({ tokens: { refresh_token: 'rt' } });
        assert.throws(() => parseAuth(raw), /access_token/);
    });

    it('throws on invalid JSON', () => {
        assert.throws(() => parseAuth('not-json'), /parse/i);
    });

    it('accepts camelCase keys as a fallback', () => {
        const raw = JSON.stringify({
            tokens: {
                accessToken: 'at-camel',
                refreshToken: 'rt-camel',
                idToken: 'id-camel',
                accountId: 'acc-camel',
            },
        });
        const creds = parseAuth(raw);
        assert.equal(creds.accessToken, 'at-camel');
        assert.equal(creds.accountId, 'acc-camel');
    });
});

// ============================================================
// needsRefresh
// ============================================================

const baseCreds = (overrides: Partial<CodexCreds> = {}): CodexCreds => ({
    accessToken: 'at',
    refreshToken: 'rt',
    idToken: null,
    accountId: null,
    lastRefresh: null,
    isApiKey: false,
    ...overrides,
});

describe('needsRefresh', () => {
    it('API-key creds never need refresh', () => {
        assert.equal(needsRefresh(baseCreds({ isApiKey: true })), false);
    });

    it('no last_refresh → needs refresh', () => {
        assert.equal(needsRefresh(baseCreds({ lastRefresh: null })), true);
    });

    it('refreshed within 8 days → no refresh', () => {
        const now = Date.now();
        const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
        assert.equal(needsRefresh(baseCreds({ lastRefresh: oneDayAgo }), now), false);
    });

    it('refreshed more than 8 days ago → needs refresh', () => {
        const now = Date.now();
        const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
        assert.equal(needsRefresh(baseCreds({ lastRefresh: tenDaysAgo }), now), true);
    });

    it('unparseable last_refresh → needs refresh', () => {
        assert.equal(needsRefresh(baseCreds({ lastRefresh: 'not-a-date' })), true);
    });

    it('no refresh token → cannot refresh, returns false', () => {
        assert.equal(needsRefresh(baseCreds({ refreshToken: '' })), false);
    });
});

// ============================================================
// normalizePlanType
// ============================================================

describe('normalizePlanType', () => {
    it('passes known plans through', () => {
        assert.equal(normalizePlanType('plus'), 'plus');
        assert.equal(normalizePlanType('pro'), 'pro');
        assert.equal(normalizePlanType('team'), 'team');
        assert.equal(normalizePlanType('free_workspace'), 'free_workspace');
    });

    it('lowercases input', () => {
        assert.equal(normalizePlanType('Plus'), 'plus');
        assert.equal(normalizePlanType('PRO'), 'pro');
    });

    it('returns unknown for unrecognised plans', () => {
        assert.equal(normalizePlanType('mystery_tier'), 'unknown');
    });

    it('returns unknown for null/undefined', () => {
        assert.equal(normalizePlanType(undefined), 'unknown');
        assert.equal(normalizePlanType(null), 'unknown');
    });
});

// ============================================================
// normalizeWindow
// ============================================================

describe('normalizeWindow', () => {
    it('returns null when raw is undefined', () => {
        assert.equal(normalizeWindow(undefined, 'primary'), null);
    });

    it('returns null when used_percent is missing', () => {
        assert.equal(normalizeWindow({ reset_at: 123 }, 'primary'), null);
    });

    it('clamps used_percent to [0, 100]', () => {
        const w = normalizeWindow({ used_percent: 150 }, 'primary');
        assert.equal(w?.usedPercent, 100);
        assert.equal(w?.remainingPercent, 0);
    });

    it('computes remainingPercent from used_percent', () => {
        const w = normalizeWindow({ used_percent: 30 }, 'secondary');
        assert.equal(w?.usedPercent, 30);
        assert.equal(w?.remainingPercent, 70);
        assert.equal(w?.name, 'secondary');
    });
});

// ============================================================
// normalizeCredits
// ============================================================

describe('normalizeCredits', () => {
    it('returns null when credits absent', () => {
        assert.equal(normalizeCredits(undefined), null);
    });

    it('parses numeric balance', () => {
        const c = normalizeCredits({ has_credits: true, unlimited: false, balance: 12.5 });
        assert.equal(c?.balance, 12.5);
        assert.equal(c?.hasCredits, true);
        assert.equal(c?.unlimited, false);
    });

    it('parses string balance', () => {
        const c = normalizeCredits({ has_credits: true, balance: '42' });
        assert.equal(c?.balance, 42);
    });

    it('returns null balance for unparseable strings', () => {
        const c = normalizeCredits({ has_credits: true, balance: 'oops' });
        assert.equal(c?.balance, null);
    });
});

// ============================================================
// deriveAvailable
// ============================================================

const window = (used: number, name: 'primary' | 'secondary' = 'primary'): CodexWindowSnapshot => ({
    name,
    usedPercent: used,
    remainingPercent: 100 - used,
    resetAt: 0,
    limitWindowSeconds: 0,
});

describe('deriveAvailable', () => {
    it('available when both windows have headroom', () => {
        assert.equal(deriveAvailable([window(20), window(60, 'secondary')], null), true);
    });

    it('available when at least one window has headroom', () => {
        assert.equal(deriveAvailable([window(98), window(40, 'secondary')], null), true);
    });

    it('unavailable when both windows are exhausted', () => {
        assert.equal(deriveAvailable([window(99), window(99, 'secondary')], null), false);
    });

    it('available when no windows reported (subscription with no rate limits)', () => {
        assert.equal(deriveAvailable([], null), true);
    });

    it('subscription with rate windows is available even when credits.hasCredits=false', () => {
        // ChatGPT Plus / Pro / Team: pays subscription, not credits, so credits.hasCredits=false
        // is meaningless when rate windows are reported.
        const credits = { hasCredits: false, unlimited: false, balance: 0 };
        assert.equal(deriveAvailable([window(20)], credits), true);
    });

    it('unavailable when no windows and credits are empty (pay-as-you-go exhausted)', () => {
        const credits = { hasCredits: false, unlimited: false, balance: 0 };
        assert.equal(deriveAvailable([], credits), false);
    });

    it('available when no windows but credits are unlimited', () => {
        const credits = { hasCredits: false, unlimited: true, balance: null };
        assert.equal(deriveAvailable([], credits), true);
    });

    it('available when no windows and credits have balance', () => {
        const credits = { hasCredits: true, unlimited: false, balance: 10 };
        assert.equal(deriveAvailable([], credits), true);
    });
});

// ============================================================
// buildSnapshot
// ============================================================

describe('buildSnapshot', () => {
    it('plan_type comes from raw response for OAuth creds', () => {
        const snap = buildSnapshot(baseCreds({ accountId: 'acc-1' }), { plan_type: 'plus' }, '2026-05-01T00:00:00Z');
        assert.equal(snap.planType, 'plus');
        assert.equal(snap.accountId, 'acc-1');
        assert.equal(snap.windows.length, 0);
        assert.equal(snap.available, true);
        assert.equal(snap.fetchedAt, '2026-05-01T00:00:00Z');
    });

    it('API-key creds get planType=api_key regardless of raw', () => {
        const snap = buildSnapshot(baseCreds({ isApiKey: true }), { plan_type: 'plus' });
        assert.equal(snap.planType, 'api_key');
    });

    it('marshals primary and secondary windows', () => {
        const snap = buildSnapshot(baseCreds(), {
            plan_type: 'pro',
            rate_limit: {
                primary_window: { used_percent: 25, reset_at: 1700000000, limit_window_seconds: 300 },
                secondary_window: { used_percent: 80, reset_at: 1700000600, limit_window_seconds: 86400 },
            },
        });
        assert.equal(snap.windows.length, 2);
        assert.equal(snap.windows[0].name, 'primary');
        assert.equal(snap.windows[0].remainingPercent, 75);
        assert.equal(snap.windows[1].name, 'secondary');
        assert.equal(snap.windows[1].remainingPercent, 20);
    });

    it('flips available=false when both windows are exhausted', () => {
        const snap = buildSnapshot(baseCreds(), {
            rate_limit: {
                primary_window: { used_percent: 100 },
                secondary_window: { used_percent: 100 },
            },
        });
        assert.equal(snap.available, false);
    });
});
