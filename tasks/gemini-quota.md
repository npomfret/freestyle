# Gemini CLI Quota Probe

## Goal

Use the Gemini CLI's local OAuth session to determine which Gemini model families still have quota remaining, then use that signal to:

1. expose a fast local command for inspection, and
2. make `src/lib/gemini-cli-provider.ts` choose models based on real remaining quota instead of a blind one-hour cooldown.

## Why This Matters

Current behavior in [src/lib/gemini-cli-provider.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-provider.ts) is reactive:

- it tries the cheapest configured model,
- waits for a rate-limit error,
- marks that exact model as exhausted for one hour,
- then escalates to the next model.

That is cheap to implement, but it has two weaknesses:

- it does not know actual remaining quota up front, so the first request after exhaustion still fails,
- it tracks exhaustion per model string, while Gemini quota is really bucketed by model family (`pro`, `flash`, `flash-lite`).

CodexBar already solved this problem using the Gemini CLI's OAuth files and Google's internal quota API.

## What CodexBar Is Doing

Repo studied: `/tmp/CodexBar`

Key files:

- `/tmp/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift`
- `/tmp/CodexBar/Tests/CodexBarTests/GeminiStatusProbeAPITests.swift`
- `/tmp/CodexBar/Tests/CodexBarTests/GeminiStatusProbePlanTests.swift`
- `/tmp/CodexBar/docs/gemini.md`

Important findings from that code:

1. Auth source
   - Reads `~/.gemini/settings.json` to determine auth mode.
   - Supports `oauth-personal`.
   - Explicitly rejects `api-key` and `vertex-ai`.

2. Credential source
   - Reads `~/.gemini/oauth_creds.json`.
   - Uses `access_token`, `refresh_token`, `id_token`, `expiry_date`.

3. Token refresh
   - If `expiry_date` is in the past, it refreshes the token through `https://oauth2.googleapis.com/token`.
   - It extracts the OAuth client ID and secret from the installed Gemini CLI package by locating `oauth2.js` under the Gemini installation and regexing `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`.

4. Quota API
   - Calls `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`.
   - Sends bearer auth with the Gemini CLI OAuth access token.
   - Includes a `project` in the request body when available.

5. Project selection
   - First calls `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`.
   - Prefers `cloudaicompanionProject` from that response.
   - Falls back to `GET https://cloudresourcemanager.googleapis.com/v1/projects` and chooses a project that looks like Gemini CLI ownership, such as `gen-lang-client*` or a project with a `generative-language` label.

6. Quota shape
   - The response contains `buckets`.
   - Each bucket can include `modelId`, `remainingFraction`, `resetTime`, and sometimes token-type detail.
   - CodexBar groups by `modelId` and keeps the lowest `remainingFraction` per model, because multiple buckets can exist for a single model and the smallest remaining fraction is the limiting one.

7. Model-family grouping
   - It maps models into `pro`, `flash`, and `flash-lite`.
   - For each family, it uses the lowest remaining percentage across all models in that family.
   - This is the key detail we want: several model names can share one quota family.

8. Tests that matter
   - Unsupported auth modes fail early.
   - Expired tokens refresh correctly.
   - `loadCodeAssist` project ID takes precedence over project discovery.
   - `flash` and `flash-lite` stay separate.
   - The lowest quota in a family wins.

## Recommended Approach For This Repo

Port the Gemini quota probe logic into TypeScript rather than shelling out to CodexBar.

Why:

- this repo already owns Gemini model selection in [src/lib/gemini-cli-provider.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-provider.ts),
- we only need a small subset of CodexBar's Swift implementation,
- a native TS module is easier to test and easier to reuse from both the provider and a local debug command,
- it avoids building or depending on the Swift app/CLI.

## Scope

### Phase 1: Reusable quota probe module

Add a new module, suggested path:

- [src/lib/gemini-cli-quota.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-quota.ts)

Responsibilities:

- read `~/.gemini/settings.json`,
- validate auth mode,
- read `~/.gemini/oauth_creds.json`,
- refresh token if expired,
- locate the installed `gemini` binary,
- extract Gemini CLI OAuth client ID/secret from `oauth2.js`,
- call `loadCodeAssist`,
- determine the project ID,
- call `retrieveUserQuota`,
- normalize the response into a stable TS shape.

Suggested return type:

```ts
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
```

Implementation notes:

- keep the transport in plain `fetch`,
- prefer explicit helper functions over one large probe function,
- cache the resolved CLI install path and parsed OAuth client credentials in memory,
- do not mutate provider state here except for updating `oauth_creds.json` after refresh.

### Phase 2: Model family selection in `GeminiCliProvider`

Update [src/lib/gemini-cli-provider.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-provider.ts) to use the quota probe before making a request.

Target behavior:

1. Convert configured models from `GEMINI_MODELS` into model families.
2. Fetch quota once at provider startup, then refresh on a short TTL.
3. Choose the first configured model whose family has remaining quota.
4. Preserve the current rate-limit fallback path as a secondary safety net.
5. When a CLI call returns a rate-limit error, mark the whole family as exhausted locally, not just the exact model string.

Recommended helper behavior:

- `gemini-2.5-flash-lite` -> `flash-lite`
- `gemini-2.5-flash` or `gemini-3-flash-preview` -> `flash`
- `gemini-2.5-pro` or `gemini-3.1-pro-preview` -> `pro`

Important detail:

- family selection should still respect user ordering in `GEMINI_MODELS`;
- quota data decides eligibility, not final ordering.

Example:

If `GEMINI_MODELS=flash-lite-a,flash-a,flash-b,pro-a` and quota says:

- `flash-lite` = 0%
- `flash` = 62%
- `pro` = 100%

Then the chosen model should be `flash-a`, not `pro-a`, because `flash-a` is the first configured model in a family with remaining quota.

### Phase 3: Fast inspection command

Add a small executable entry point so quota can be inspected without running the app pipeline.

Suggested path:

- [src/gemini-quota.ts](/Users/nickpomfret/projects/freestyle/src/gemini-quota.ts)

Suggested script in [package.json](/Users/nickpomfret/projects/freestyle/package.json):

```json
"gemini-quota": "tsx src/gemini-quota.ts"
```

Suggested output modes:

- default: concise markdown/text table,
- `--json`: raw normalized snapshot.

Suggested text output:

```text
Gemini quota
Account: user@example.com
Plan: Free
Project: gen-lang-client-123

Family      Remaining   Reset
flash-lite  0%          2026-03-28T23:00:00Z
flash       62%         2026-03-28T23:00:00Z
pro         100%        2026-03-29T00:00:00Z

Models
- gemini-2.5-flash-lite: 0%
- gemini-2.5-flash: 62%
- gemini-3-flash-preview: 62%
- gemini-2.5-pro: 100%
```

This command is the fastest way to answer the original question: "which models still have quota remaining right now?"

## File-Level Plan

### New files

- [src/lib/gemini-cli-quota.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-quota.ts)
  - quota fetch, token refresh, model-family grouping, normalized types
- [src/gemini-quota.ts](/Users/nickpomfret/projects/freestyle/src/gemini-quota.ts)
  - one-shot CLI wrapper around the probe

### Existing files to update

- [src/lib/gemini-cli-provider.ts](/Users/nickpomfret/projects/freestyle/src/lib/gemini-cli-provider.ts)
  - replace exact-model cooldown selection with quota-aware family selection
  - keep current runtime escalation as a fallback, but family-scoped
- [package.json](/Users/nickpomfret/projects/freestyle/package.json)
  - add `gemini-quota` script
- [README.md](/Users/nickpomfret/projects/freestyle/README.md)
  - document the new inspection command and quota-aware cascade behavior
- [.env.example](/Users/nickpomfret/projects/freestyle/.env.example)
  - optionally document tuning env vars if we add any

### Optional env vars

Only add these if the defaults are not good enough:

- `GEMINI_QUOTA_TTL_MS`
  - how long to trust a successful quota snapshot before refetching
- `GEMINI_QUOTA_TIMEOUT_MS`
  - timeout for Google quota API calls

Avoid adding configuration unless it is necessary.

## Edge Cases To Preserve

These come directly from CodexBar and should be handled explicitly:

1. `~/.gemini/settings.json` missing
   - treat auth type as unknown and still try OAuth credentials.

2. `api-key` auth selected
   - return a clear unsupported error instead of silently failing later.

3. `vertex-ai` auth selected
   - same as above.

4. expired access token with missing refresh token
   - fail with a clear "not logged in" style error.

5. `loadCodeAssist` fails
   - continue without plan info if possible.
   - still try project discovery.

6. no project found
   - still call quota API with `{}`.

7. multiple buckets for one model
   - keep the lowest `remainingFraction`.

8. `flash` vs `flash-lite`
   - never let `flash-lite` contaminate `flash`.

9. provider runtime
   - if quota probe fails unexpectedly, do not brick the existing CLI path.
   - log the problem and fall back to the current reactive behavior.

## Testing Plan

This repo does not currently have an obvious test harness around these modules, so add one before or alongside the quota work.

Minimum useful coverage:

1. quota response normalization
   - multiple buckets for the same model collapse to the lowest fraction.

2. family grouping
   - `flash`, `flash-lite`, and `pro` remain distinct.

3. project selection
   - `loadCodeAssist` project beats cloud resource manager fallback.

4. auth validation
   - `api-key` and `vertex-ai` are rejected.

5. token refresh
   - expired credentials trigger refresh and update the stored creds.

6. provider selection
   - configured model order is preserved among families that still have quota.

7. provider resilience
   - when the quota probe throws, `GeminiCliProvider` still falls back to its current rate-limit-on-error flow.

If the repo stays test-light, at least make the quota helpers small and dependency-injected so they are easy to cover with `node:test`.

## Acceptance Criteria

- `npm run gemini-quota` prints remaining Gemini quota by family and model.
- `npm run gemini-quota -- --json` prints structured data suitable for automation.
- `GeminiCliProvider` skips families that already have 0 remaining quota instead of discovering exhaustion only after a failed request.
- a rate-limit error from one model suppresses the entire family for the current run.
- if quota probing fails, the existing provider behavior still works.
- README documents the command and the new selection behavior.

## Non-Goals

- building or vendoring CodexBar,
- scraping Gemini CLI terminal output,
- supporting non-OAuth Gemini CLI auth modes,
- implementing a long-running quota daemon or database persistence.

## Recommended Order Of Work

1. Add `src/lib/gemini-cli-quota.ts` with a hard-coded smoke script or inline manual test.
2. Add `src/gemini-quota.ts` so the snapshot can be inspected directly.
3. Wire quota-aware family selection into `GeminiCliProvider`.
4. Add tests around normalization and model selection.
5. Update docs.

## Short Implementation Summary

Port the logic from CodexBar's Gemini Swift probe, but keep the scope tight:

- read Gemini CLI OAuth state from `~/.gemini`,
- refresh if needed,
- call `loadCodeAssist` and `retrieveUserQuota`,
- collapse quotas by model,
- group them into `pro` / `flash` / `flash-lite`,
- expose that via a small CLI,
- then use it to drive model choice in `GeminiCliProvider`.

That gets us a real answer to "what still has quota left?" and makes the existing Gemini cascade noticeably smarter.
