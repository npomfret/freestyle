import { readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

// ============================================================
// Public types
// ============================================================

export type CodexPlanType =
    | 'guest'
    | 'free'
    | 'go'
    | 'plus'
    | 'pro'
    | 'free_workspace'
    | 'team'
    | 'business'
    | 'education'
    | 'quorum'
    | 'k12'
    | 'enterprise'
    | 'edu'
    | 'api_key'
    | 'unknown';

export interface CodexWindowSnapshot {
    name: 'primary' | 'secondary';
    usedPercent: number;
    remainingPercent: number;
    resetAt: number; // unix seconds
    limitWindowSeconds: number;
}

export interface CodexCredits {
    hasCredits: boolean;
    unlimited: boolean;
    balance: number | null;
}

export interface CodexQuotaSnapshot {
    accountId: string | null;
    planType: CodexPlanType;
    fetchedAt: string;
    windows: CodexWindowSnapshot[];
    credits: CodexCredits | null;
    /** True when at least one rate window has headroom and credits aren't depleted. */
    available: boolean;
}

// ============================================================
// Errors
// ============================================================

export class CodexQuotaError extends Error {
    constructor(
        message: string,
        public readonly code:
            | 'NOT_LOGGED_IN'
            | 'TOKEN_REFRESH_FAILED'
            | 'API_ERROR',
    ) {
        super(message);
        this.name = 'CodexQuotaError';
    }
}

// ============================================================
// Internal types
// ============================================================

export interface CodexCreds {
    accessToken: string;
    refreshToken: string;
    idToken: string | null;
    accountId: string | null;
    /** ISO8601 of when access token was last refreshed; null if unknown (or pure API-key auth). */
    lastRefresh: string | null;
    /** True when auth.json was an OPENAI_API_KEY shortcut, not OAuth. */
    isApiKey: boolean;
}

interface RawUsageResponse {
    plan_type?: string;
    rate_limit?: {
        primary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number; };
        secondary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number; };
    };
    credits?: {
        has_credits?: boolean;
        unlimited?: boolean;
        balance?: number | string | null;
    };
}

// ============================================================
// Constants
// ============================================================

const REFRESH_ENDPOINT = 'https://auth.openai.com/oauth/token';
const REFRESH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const USAGE_URL_DEFAULT = 'https://chatgpt.com/backend-api/wham/usage';
const REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;

// ============================================================
// Step 1 — auth.json location
// ============================================================

export function authFilePath(env: NodeJS.ProcessEnv = process.env): string {
    const codexHome = env.CODEX_HOME?.trim();
    const root = codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex');
    return join(root, 'auth.json');
}

// ============================================================
// Step 2 — parse auth.json
// ============================================================

export function parseAuth(raw: string): CodexCreds {
    let json: Record<string, unknown>;
    try {
        json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        throw new CodexQuotaError('Could not parse Codex auth.json.', 'NOT_LOGGED_IN');
    }

    const apiKey = (json['OPENAI_API_KEY'] as string | undefined)?.trim();
    if (apiKey) {
        return {
            accessToken: apiKey,
            refreshToken: '',
            idToken: null,
            accountId: null,
            lastRefresh: null,
            isApiKey: true,
        };
    }

    const tokens = json['tokens'] as Record<string, unknown> | undefined;
    if (!tokens) {
        throw new CodexQuotaError('Codex auth.json contains no tokens. Run `codex` to log in.', 'NOT_LOGGED_IN');
    }

    const pickString = (...keys: string[]): string | null => {
        for (const k of keys) {
            const v = tokens[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return null;
    };

    const accessToken = pickString('access_token', 'accessToken');
    const refreshToken = pickString('refresh_token', 'refreshToken');
    if (!accessToken || !refreshToken) {
        throw new CodexQuotaError('Codex tokens missing access_token or refresh_token.', 'NOT_LOGGED_IN');
    }

    const idToken = pickString('id_token', 'idToken');
    const accountId = pickString('account_id', 'accountId');
    const lastRefreshRaw = json['last_refresh'];
    const lastRefresh = typeof lastRefreshRaw === 'string' && lastRefreshRaw.length > 0 ? lastRefreshRaw : null;

    return {
        accessToken,
        refreshToken,
        idToken,
        accountId,
        lastRefresh,
        isApiKey: false,
    };
}

export async function loadCreds(env: NodeJS.ProcessEnv = process.env): Promise<CodexCreds> {
    const path = authFilePath(env);
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    } catch {
        throw new CodexQuotaError('Codex auth.json not found. Run `codex` to log in.', 'NOT_LOGGED_IN');
    }
    return parseAuth(raw);
}

// ============================================================
// Step 3 — refresh decision
// ============================================================

export function needsRefresh(creds: CodexCreds, now: number = Date.now()): boolean {
    if (creds.isApiKey) return false;
    if (!creds.refreshToken) return false;
    if (!creds.lastRefresh) return true;
    const last = Date.parse(creds.lastRefresh);
    if (Number.isNaN(last)) return true;
    return now - last > REFRESH_INTERVAL_MS;
}

// ============================================================
// Step 4 — refresh token
// ============================================================

export async function refreshToken(creds: CodexCreds): Promise<CodexCreds> {
    const response = await fetch(REFRESH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: REFRESH_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: creds.refreshToken,
            scope: 'openid profile email',
        }),
        signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401) {
        throw new CodexQuotaError(
            'Codex refresh token expired or revoked. Run `codex` to log in again.',
            'NOT_LOGGED_IN',
        );
    }

    if (!response.ok) {
        throw new CodexQuotaError(
            `Codex token refresh failed with HTTP ${response.status}.`,
            'TOKEN_REFRESH_FAILED',
        );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const accessToken = (json['access_token'] as string | undefined) ?? creds.accessToken;
    const newRefreshToken = (json['refresh_token'] as string | undefined) ?? creds.refreshToken;
    const idToken = (json['id_token'] as string | undefined) ?? creds.idToken;

    return {
        accessToken,
        refreshToken: newRefreshToken,
        idToken,
        accountId: creds.accountId,
        lastRefresh: new Date().toISOString(),
        isApiKey: false,
    };
}

export async function saveCreds(creds: CodexCreds, env: NodeJS.ProcessEnv = process.env): Promise<void> {
    if (creds.isApiKey) return;
    const path = authFilePath(env);

    let existing: Record<string, unknown> = {};
    try {
        existing = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    } catch {
        // missing or unparseable — write fresh
    }

    const tokens: Record<string, unknown> = {
        access_token: creds.accessToken,
        refresh_token: creds.refreshToken,
    };
    if (creds.idToken) tokens.id_token = creds.idToken;
    if (creds.accountId) tokens.account_id = creds.accountId;

    existing.tokens = tokens;
    existing.last_refresh = creds.lastRefresh ?? new Date().toISOString();

    await writeFile(path, JSON.stringify(existing, null, 2), 'utf8');
}

export async function ensureFreshCreds(env: NodeJS.ProcessEnv = process.env): Promise<CodexCreds> {
    const creds = await loadCreds(env);
    if (!needsRefresh(creds)) return creds;
    const refreshed = await refreshToken(creds);
    await saveCreds(refreshed, env);
    return refreshed;
}

// ============================================================
// Step 5 — fetch usage
// ============================================================

export async function fetchUsage(creds: CodexCreds): Promise<RawUsageResponse> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'freestyle-codex-quota',
    };
    if (creds.accountId) headers['ChatGPT-Account-Id'] = creds.accountId;

    const response = await fetch(USAGE_URL_DEFAULT, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401 || response.status === 403) {
        throw new CodexQuotaError(
            'Codex usage API returned 401/403. Run `codex` to re-authenticate.',
            'NOT_LOGGED_IN',
        );
    }
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new CodexQuotaError(
            `Codex usage API returned HTTP ${response.status}. ${body.slice(0, 200)}`,
            'API_ERROR',
        );
    }

    return (await response.json()) as RawUsageResponse;
}

// ============================================================
// Step 6 — normalize
// ============================================================

const KNOWN_PLANS = new Set<CodexPlanType>([
    'guest',
    'free',
    'go',
    'plus',
    'pro',
    'free_workspace',
    'team',
    'business',
    'education',
    'quorum',
    'k12',
    'enterprise',
    'edu',
]);

export function normalizePlanType(raw: string | undefined | null): CodexPlanType {
    if (!raw) return 'unknown';
    const lower = raw.toLowerCase();
    if (KNOWN_PLANS.has(lower as CodexPlanType)) return lower as CodexPlanType;
    return 'unknown';
}

export function normalizeWindow(
    raw: { used_percent?: number; reset_at?: number; limit_window_seconds?: number; } | undefined,
    name: 'primary' | 'secondary',
): CodexWindowSnapshot | null {
    if (!raw) return null;
    if (typeof raw.used_percent !== 'number') return null;
    const usedPercent = Math.max(0, Math.min(100, raw.used_percent));
    return {
        name,
        usedPercent,
        remainingPercent: 100 - usedPercent,
        resetAt: typeof raw.reset_at === 'number' ? raw.reset_at : 0,
        limitWindowSeconds: typeof raw.limit_window_seconds === 'number' ? raw.limit_window_seconds : 0,
    };
}

export function normalizeCredits(raw: RawUsageResponse['credits']): CodexCredits | null {
    if (!raw) return null;
    let balance: number | null = null;
    if (typeof raw.balance === 'number') {
        balance = raw.balance;
    } else if (typeof raw.balance === 'string') {
        const parsed = Number(raw.balance);
        balance = Number.isFinite(parsed) ? parsed : null;
    }
    return {
        hasCredits: raw.has_credits === true,
        unlimited: raw.unlimited === true,
        balance,
    };
}

/**
 * Codex is "available" when at least one rate window has headroom (≥ 5% remaining).
 *
 * Subscription plans (Plus/Pro/Team) report rate windows and `credits.hasCredits=false`
 * because the user pays a subscription, not credit balance — credits are irrelevant
 * when windows are present. Only fall back to credits when no windows are reported
 * (pure pay-as-you-go API-key style).
 */
export function deriveAvailable(
    windows: CodexWindowSnapshot[],
    credits: CodexCredits | null,
    minRemainingPercent = 5,
): boolean {
    if (windows.length > 0) {
        return windows.some((w) => w.remainingPercent >= minRemainingPercent);
    }
    if (credits) {
        if (credits.unlimited) return true;
        if (!credits.hasCredits) return false;
    }
    return true;
}

// ============================================================
// Step 7 — main entry
// ============================================================

export function buildSnapshot(
    creds: CodexCreds,
    raw: RawUsageResponse,
    fetchedAt: string = new Date().toISOString(),
): CodexQuotaSnapshot {
    const planType = creds.isApiKey ? 'api_key' : normalizePlanType(raw.plan_type);
    const primary = normalizeWindow(raw.rate_limit?.primary_window, 'primary');
    const secondary = normalizeWindow(raw.rate_limit?.secondary_window, 'secondary');
    const windows: CodexWindowSnapshot[] = [];
    if (primary) windows.push(primary);
    if (secondary) windows.push(secondary);
    const credits = normalizeCredits(raw.credits);

    return {
        accountId: creds.accountId,
        planType,
        fetchedAt,
        windows,
        credits,
        available: deriveAvailable(windows, credits),
    };
}

export async function fetchCodexQuota(env: NodeJS.ProcessEnv = process.env): Promise<CodexQuotaSnapshot> {
    const creds = await ensureFreshCreds(env);

    if (creds.isApiKey) {
        // API-key path: no usage endpoint to query. Treat as unconstrained.
        return {
            accountId: null,
            planType: 'api_key',
            fetchedAt: new Date().toISOString(),
            windows: [],
            credits: null,
            available: true,
        };
    }

    const raw = await fetchUsage(creds);
    return buildSnapshot(creds, raw);
}
