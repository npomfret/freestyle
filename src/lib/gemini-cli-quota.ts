import { readFile, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { realpath } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';

const execFileAsync = promisify(execFile);

// ============================================================
// Public types
// ============================================================

export interface GeminiQuotaBucket {
    modelId: string;
    remainingFraction: number;
    remainingPercent: number;
    resetTime: string | null;
}

export interface GeminiQuotaFamily {
    family: 'pro' | 'flash' | 'flash-lite' | 'unknown';
    remainingPercent: number;
    resetTime: string | null;
    models: GeminiQuotaBucket[];
}

export interface GeminiQuotaSnapshot {
    accountEmail: string | null;
    accountPlan: 'Paid' | 'Workspace' | 'Free' | 'Legacy' | null;
    projectId: string | null;
    fetchedAt: string;
    models: GeminiQuotaBucket[];
    families: GeminiQuotaFamily[];
}

// ============================================================
// Errors
// ============================================================

export class GeminiQuotaError extends Error {
    constructor(
        message: string,
        public readonly code:
            | 'UNSUPPORTED_AUTH'
            | 'NOT_LOGGED_IN'
            | 'OAUTH_MISSING'
            | 'TOKEN_REFRESH_FAILED'
            | 'API_ERROR',
    ) {
        super(message);
        this.name = 'GeminiQuotaError';
    }
}

// ============================================================
// Internal types
// ============================================================

interface OAuthCreds {
    access_token: string | null;
    refresh_token: string | null;
    id_token: string | null;
    /** Milliseconds since epoch */
    expiry_date: number | null;
}

interface RawBucket {
    modelId?: string;
    remainingFraction?: number;
    resetTime?: string;
}

// ============================================================
// Module-level caches
// ============================================================

let cachedOAuth2JsPath: string | null = null;
let cachedClientCreds: { clientId: string; clientSecret: string } | null = null;

// ============================================================
// Step 1 — Auth mode validation
// ============================================================

export async function readAuthMode(): Promise<string | null> {
    const settingsPath = join(homedir(), '.gemini', 'settings.json');
    let raw: string;
    try {
        raw = await readFile(settingsPath, 'utf8');
    } catch {
        // Missing settings.json → treat as unknown, allow OAuth attempt
        return null;
    }

    let json: Record<string, unknown>;
    try {
        json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }

    const security = json['security'] as Record<string, unknown> | undefined;
    const auth = security?.['auth'] as Record<string, unknown> | undefined;
    const selectedType = auth?.['selectedType'] as string | undefined;

    if (selectedType === 'api-key') {
        throw new GeminiQuotaError(
            'Gemini API key auth is not supported. Use Google account (OAuth) instead.',
            'UNSUPPORTED_AUTH',
        );
    }
    if (selectedType === 'vertex-ai') {
        throw new GeminiQuotaError(
            'Gemini Vertex AI auth is not supported. Use Google account (OAuth) instead.',
            'UNSUPPORTED_AUTH',
        );
    }

    return selectedType ?? null;
}

// ============================================================
// Step 2 — Read OAuth credentials
// ============================================================

export async function readOAuthCreds(): Promise<OAuthCreds> {
    const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
    let raw: string;
    try {
        raw = await readFile(credsPath, 'utf8');
    } catch {
        throw new GeminiQuotaError(
            'Gemini OAuth credentials not found. Run `gemini` to authenticate.',
            'NOT_LOGGED_IN',
        );
    }

    let json: Record<string, unknown>;
    try {
        json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        throw new GeminiQuotaError('Could not parse Gemini OAuth credentials file.', 'NOT_LOGGED_IN');
    }

    const creds: OAuthCreds = {
        access_token: (json['access_token'] as string | undefined) ?? null,
        refresh_token: (json['refresh_token'] as string | undefined) ?? null,
        id_token: (json['id_token'] as string | undefined) ?? null,
        expiry_date: (json['expiry_date'] as number | undefined) ?? null,
    };

    if (!creds.access_token) {
        throw new GeminiQuotaError(
            'No access token in Gemini credentials. Run `gemini` to re-authenticate.',
            'NOT_LOGGED_IN',
        );
    }

    return creds;
}

// ============================================================
// Step 3 — Locate oauth2.js in the Gemini CLI installation
// ============================================================

export async function findGeminiOAuth2Js(): Promise<string> {
    if (cachedOAuth2JsPath) return cachedOAuth2JsPath;

    // Find the gemini binary
    let geminiPath: string;
    try {
        const { stdout } = await execFileAsync('which', ['gemini']);
        geminiPath = stdout.trim();
    } catch {
        throw new GeminiQuotaError('Gemini CLI not found on PATH.', 'OAUTH_MISSING');
    }

    // Resolve symlinks
    let realGeminiPath = geminiPath;
    try {
        realGeminiPath = await realpath(geminiPath);
    } catch {
        // Use original path if realpath fails
    }

    const binDir = dirname(realGeminiPath);
    const baseDir = dirname(binDir);

    const oauthSubpath =
        'node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js';
    const nixShareSubpath =
        'share/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js';
    const oauthFile = 'dist/src/code_assist/oauth2.js';

    const candidates = [
        // Homebrew nested structure
        join(baseDir, 'libexec', 'lib', oauthSubpath),
        join(baseDir, 'lib', oauthSubpath),
        // Nix package layout
        join(baseDir, nixShareSubpath),
        // Bun/npm sibling structure
        join(baseDir, '..', 'gemini-cli-core', oauthFile),
        // npm nested inside gemini-cli
        join(baseDir, 'node_modules', '@google', 'gemini-cli-core', oauthFile),
    ];

    for (const candidate of candidates) {
        try {
            await readFile(candidate, 'utf8');
            cachedOAuth2JsPath = candidate;
            return candidate;
        } catch {
            // Try next
        }
    }

    throw new GeminiQuotaError(
        'Could not find Gemini CLI oauth2.js. Token refresh unavailable.',
        'OAUTH_MISSING',
    );
}

// ============================================================
// Step 4 — Extract OAuth client ID + secret from oauth2.js
// ============================================================

export async function extractOAuthClientCreds(
    oauth2JsPath: string,
): Promise<{ clientId: string; clientSecret: string }> {
    if (cachedClientCreds) return cachedClientCreds;

    const content = await readFile(oauth2JsPath, 'utf8');

    const clientIdMatch = content.match(/OAUTH_CLIENT_ID\s*=\s*['"]([^'"]+)['"]\s*;/);
    const secretMatch = content.match(/OAUTH_CLIENT_SECRET\s*=\s*['"]([^'"]+)['"]\s*;/);

    if (!clientIdMatch || !secretMatch) {
        throw new GeminiQuotaError(
            'Could not extract OAuth client credentials from Gemini CLI.',
            'OAUTH_MISSING',
        );
    }

    cachedClientCreds = { clientId: clientIdMatch[1], clientSecret: secretMatch[1] };
    return cachedClientCreds;
}

// ============================================================
// Step 5 — Refresh access token
// ============================================================

export async function refreshAccessToken(creds: OAuthCreds): Promise<OAuthCreds> {
    if (!creds.refresh_token) {
        throw new GeminiQuotaError(
            'No refresh token available. Run `gemini` to re-authenticate.',
            'NOT_LOGGED_IN',
        );
    }

    const oauth2JsPath = await findGeminiOAuth2Js();
    const { clientId, clientSecret } = await extractOAuthClientCreds(oauth2JsPath);

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new GeminiQuotaError(
            `Token refresh failed with HTTP ${response.status}.`,
            'TOKEN_REFRESH_FAILED',
        );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const newAccessToken = json['access_token'] as string | undefined;
    if (!newAccessToken) {
        throw new GeminiQuotaError('Token refresh response missing access_token.', 'TOKEN_REFRESH_FAILED');
    }

    const expiresIn = (json['expires_in'] as number | undefined) ?? 3600;
    const newExpiry = (Date.now() + expiresIn * 1000);

    const updated: OAuthCreds = {
        access_token: newAccessToken,
        refresh_token: creds.refresh_token,
        id_token: (json['id_token'] as string | undefined) ?? creds.id_token,
        expiry_date: newExpiry,
    };

    // Write updated creds back to disk
    const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
    try {
        const existing = JSON.parse(await readFile(credsPath, 'utf8')) as Record<string, unknown>;
        existing['access_token'] = updated.access_token;
        existing['expiry_date'] = updated.expiry_date;
        if (updated.id_token) existing['id_token'] = updated.id_token;
        await writeFile(credsPath, JSON.stringify(existing, null, 2), 'utf8');
    } catch {
        // Non-fatal: we have the new token in memory
    }

    return updated;
}

// ============================================================
// Step 6 — Ensure fresh access token
// ============================================================

export async function ensureFreshToken(): Promise<string> {
    let creds = await readOAuthCreds();

    const REFRESH_BUFFER_MS = 60_000;
    const isExpired = creds.expiry_date !== null && creds.expiry_date - Date.now() < REFRESH_BUFFER_MS;

    if (isExpired) {
        creds = await refreshAccessToken(creds);
    }

    return creds.access_token!;
}

// ============================================================
// Step 7 — loadCodeAssist (tier + project)
// ============================================================

export async function loadCodeAssist(
    token: string,
): Promise<{ projectId: string | null; tier: string | null }> {
    try {
        const response = await fetch(
            'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ metadata: { ideType: 'GEMINI_CLI', pluginType: 'GEMINI' } }),
                signal: AbortSignal.timeout(15_000),
            },
        );

        if (!response.ok) return { projectId: null, tier: null };

        const json = (await response.json()) as Record<string, unknown>;

        // Extract project ID — can be a string or an object
        let projectId: string | null = null;
        const rawProject = json['cloudaicompanionProject'];
        if (typeof rawProject === 'string') {
            projectId = rawProject.trim() || null;
        } else if (rawProject && typeof rawProject === 'object') {
            const p = rawProject as Record<string, unknown>;
            const id = (p['id'] ?? p['projectId']) as string | undefined;
            projectId = id?.trim() || null;
        }

        // Extract tier ID
        const currentTier = json['currentTier'] as Record<string, unknown> | undefined;
        const tierId = (currentTier?.['id'] as string | undefined) ?? null;

        return { projectId, tier: tierId };
    } catch {
        return { projectId: null, tier: null };
    }
}

// ============================================================
// Step 8 — Discover project from Cloud Resource Manager
// ============================================================

export async function discoverProjectId(token: string): Promise<string | null> {
    try {
        const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) return null;

        const json = (await response.json()) as Record<string, unknown>;
        const projects = (json['projects'] as Record<string, unknown>[] | undefined) ?? [];

        for (const project of projects) {
            const projectId = project['projectId'] as string | undefined;
            if (!projectId) continue;

            if (projectId.startsWith('gen-lang-client')) return projectId;

            const labels = project['labels'] as Record<string, string> | undefined;
            if (labels && 'generative-language' in labels) return projectId;
        }

        return null;
    } catch {
        return null;
    }
}

// ============================================================
// Step 9 — Fetch raw quota buckets
// ============================================================

export async function fetchQuotaBuckets(
    token: string,
    projectId: string | null,
): Promise<RawBucket[]> {
    const body: Record<string, string> = {};
    if (projectId) body['project'] = projectId;

    const response = await fetch(
        'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        },
    );

    if (response.status === 401) {
        throw new GeminiQuotaError('Gemini quota API returned 401. Re-authenticate with `gemini`.', 'NOT_LOGGED_IN');
    }
    if (!response.ok) {
        throw new GeminiQuotaError(`Gemini quota API returned HTTP ${response.status}.`, 'API_ERROR');
    }

    const json = (await response.json()) as Record<string, unknown>;
    return (json['buckets'] as RawBucket[] | undefined) ?? [];
}

// ============================================================
// Step 10 — Normalize buckets to per-model (lowest fraction wins)
// ============================================================

export function normalizeModels(raw: RawBucket[]): GeminiQuotaBucket[] {
    const map = new Map<string, { fraction: number; resetTime: string | null }>();

    for (const bucket of raw) {
        if (!bucket.modelId || bucket.remainingFraction === undefined) continue;
        const existing = map.get(bucket.modelId);
        if (!existing || bucket.remainingFraction < existing.fraction) {
            map.set(bucket.modelId, {
                fraction: bucket.remainingFraction,
                resetTime: bucket.resetTime ?? null,
            });
        }
    }

    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([modelId, { fraction, resetTime }]) => ({
            modelId,
            remainingFraction: fraction,
            remainingPercent: Math.round(fraction * 100),
            resetTime,
        }));
}

// ============================================================
// Step 11 — Map model ID to family
// ============================================================

export function modelFamily(modelId: string): GeminiQuotaFamily['family'] {
    const lower = modelId.toLowerCase();
    if (lower.includes('flash-lite')) return 'flash-lite';
    if (lower.includes('flash')) return 'flash';
    if (lower.includes('pro')) return 'pro';
    return 'unknown';
}

// ============================================================
// Step 12 — Group models into families
// ============================================================

export function groupIntoFamilies(models: GeminiQuotaBucket[]): GeminiQuotaFamily[] {
    const familyMap = new Map<
        GeminiQuotaFamily['family'],
        { minPercent: number; earliestReset: string | null; models: GeminiQuotaBucket[] }
    >();

    for (const model of models) {
        const fam = modelFamily(model.modelId);
        const existing = familyMap.get(fam);
        if (!existing) {
            familyMap.set(fam, {
                minPercent: model.remainingPercent,
                earliestReset: model.resetTime,
                models: [model],
            });
        } else {
            existing.models.push(model);
            if (model.remainingPercent < existing.minPercent) {
                existing.minPercent = model.remainingPercent;
            }
            // Keep the earliest (smallest string-sortable) reset time
            if (model.resetTime !== null) {
                if (existing.earliestReset === null || model.resetTime < existing.earliestReset) {
                    existing.earliestReset = model.resetTime;
                }
            }
        }
    }

    const order: GeminiQuotaFamily['family'][] = ['flash-lite', 'flash', 'pro', 'unknown'];
    return order
        .filter((f) => familyMap.has(f))
        .map((f) => {
            const { minPercent, earliestReset, models: fModels } = familyMap.get(f)!;
            return {
                family: f,
                remainingPercent: minPercent,
                resetTime: earliestReset,
                models: fModels,
            };
        });
}

// ============================================================
// Step 13 — Extract email from JWT id_token
// ============================================================

export function extractEmail(idToken: string | null): string | null {
    if (!idToken) return null;
    const parts = idToken.split('.');
    if (parts.length < 2) return null;

    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const remainder = payload.length % 4;
    if (remainder > 0) payload += '='.repeat(4 - remainder);

    try {
        const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
        return (json['email'] as string | undefined) ?? null;
    } catch {
        return null;
    }
}

function extractHostedDomain(idToken: string | null): string | null {
    if (!idToken) return null;
    const parts = idToken.split('.');
    if (parts.length < 2) return null;

    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const remainder = payload.length % 4;
    if (remainder > 0) payload += '='.repeat(4 - remainder);

    try {
        const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
        return (json['hd'] as string | undefined) ?? null;
    } catch {
        return null;
    }
}

// ============================================================
// Step 14 — Map tier + domain to plan string
// ============================================================

export function tierToPlan(
    tier: string | null,
    idToken: string | null,
): GeminiQuotaSnapshot['accountPlan'] {
    const hd = extractHostedDomain(idToken);
    if (tier === 'standard-tier') return 'Paid';
    if (tier === 'free-tier' && hd) return 'Workspace';
    if (tier === 'free-tier') return 'Free';
    if (tier === 'legacy-tier') return 'Legacy';
    return null;
}

// ============================================================
// Step 15 — Main entry point
// ============================================================

// ============================================================
// Shared model picker — used by any code that needs a Gemini model name
// ============================================================

let sharedSnapshot: GeminiQuotaSnapshot | null = null;
let sharedSnapshotAt = 0;
const SHARED_TTL_MS = 5 * 60 * 1000;

/**
 * Pick the best available model from GEMINI_MODELS based on current quota.
 * Falls back to the first configured model if the probe fails.
 */
export async function pickGeminiModel(): Promise<string> {
    const modelsEnv = process.env.GEMINI_MODELS;
    if (!modelsEnv) throw new Error('GEMINI_MODELS is not set');
    const models = modelsEnv.split(',').map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) throw new Error('GEMINI_MODELS is empty');

    if (Date.now() - sharedSnapshotAt >= SHARED_TTL_MS) {
        try {
            sharedSnapshot = await fetchGeminiQuota();
            sharedSnapshotAt = Date.now();
        } catch {
            sharedSnapshot = null;
        }
    }

    for (const m of models) {
        if (sharedSnapshot) {
            const fam = modelFamily(m);
            const fd = sharedSnapshot.families.find((f) => f.family === fam);
            if (fd && fd.remainingPercent === 0) continue;
        }
        return m;
    }

    return models[0]; // all exhausted — caller will hit rate limit and handle it
}

// ============================================================
// Step 15 — Main entry point
// ============================================================

export async function fetchGeminiQuota(): Promise<GeminiQuotaSnapshot> {
    await readAuthMode(); // validates auth, throws on unsupported

    const token = await ensureFreshToken();
    const creds = await readOAuthCreds(); // for id_token

    const caStatus = await loadCodeAssist(token);

    let projectId = caStatus.projectId;
    if (!projectId) {
        projectId = await discoverProjectId(token);
    }

    const rawBuckets = await fetchQuotaBuckets(token, projectId);
    const models = normalizeModels(rawBuckets);
    const families = groupIntoFamilies(models);

    const email = extractEmail(creds.id_token);
    const plan = tierToPlan(caStatus.tier, creds.id_token);

    return {
        accountEmail: email,
        accountPlan: plan,
        projectId,
        fetchedAt: new Date().toISOString(),
        models,
        families,
    };
}
