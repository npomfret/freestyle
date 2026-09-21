# Freestyle Claude Operating Rules

Freestyle catalogs free and near-free developer resources. The backend is TypeScript on Express/Postgres, pipeline scripts use LLM providers to discover/repair/check resources, and `web/` is a small Vite/React frontend.

## Non-Negotiables

- For any non-trivial feature or bugfix, follow `.claude/skills/feature-workflow/SKILL.md`: audit upstream/downstream/lateral code, refactor for readiness, implement, verify.
- Before editing, identify the applicable skill and rule files. If no convention covers the change, stop and ask before inventing a new pattern.
- Never introduce a new dependency, abstraction layer, file layout, naming scheme, deployment behavior, database mutation pattern, or LLM provider behavior without explicit approval.
- Treat the remote database as real production-like data. Anything using `DATABASE_URL`, `npm run db:tunnel`, migrations, deploys, discovery, repair, validity checks, embeddings, or queue processing can affect important data.
- Prefer source inspection and existing tests before browser tools, MCPs, or external research. Use external sources only when current or missing information is required.
- If an approved convention changes, update the relevant `.claude` rule, skill, or reference file in the same change.

## Canonical Commands

- Format: `npm run format -- <files>` or `npm run format`
- Test backend unit tests: `npm test`
- Typecheck both roots: `npm run compile`
- Start API: `npm run server` (requires DB tunnel for DB-backed work)
- Start frontend: `npm run dev:web`
- Build frontend: `npm run build:web`
- Deploy: `npm run deploy` (ask first)

## Routing

- Global standing rules: `.claude/rules/global.md`
- Backend/API conventions: `.claude/skills/backend-conventions/SKILL.md`
- Frontend conventions: `.claude/skills/frontend-conventions/SKILL.md`
- Database and migration work: `.claude/skills/database-work/SKILL.md`
- Bug investigation: `.claude/skills/bug-investigation/SKILL.md`
- Working-tree review: `.claude/skills/review-working-tree/SKILL.md`
- Repo map: `.claude/references/architecture-map.md`

## Dangerous Areas

- Ask before running write-capable DB scripts: `discover`, `add-url`, `repair`, `validity-check`, `embed`, `re-embed`, `migrate`, queue processing, or direct `psql` writes.
- Ask before touching deployment files or running `npm run deploy`, Docker Compose production commands, or SSH commands against `fsd.snowmonkey.co.uk`.
- Do not edit `dist/`, `web/dist/`, `node_modules/`, lockfiles, generated logs, or `tmp/` artifacts unless the task specifically requires it.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **freestyle** (1266 symbols, 2133 relationships, 92 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze --skip-agents-md` in terminal first.

## Always Do

- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- Prefer WebStorm's MCP server (`mcp__webstorm`) whenever it is connected: `search_symbol` and `get_symbol_info` to find a symbol, `analyze_calls` for callers and callees, `rename_refactoring` for renames. Use `gitnexus_query` and `gitnexus_context` only for execution-flow questions WebStorm cannot answer, or when it is not connected.

## Never Do

- NEVER rename symbols with find-and-replace — use WebStorm's `rename_refactoring`, or `gitnexus_rename` when WebStorm is not connected.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/freestyle/context` | Codebase overview, check index freshness |
| `gitnexus://repo/freestyle/clusters` | All functional areas |
| `gitnexus://repo/freestyle/processes` | All execution flows |
| `gitnexus://repo/freestyle/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Scope

Do what was asked, and nothing more. Work that was invented rather than requested is why a task never reaches an end.

### Never invent work

- Never invent a requirement. If the request does not state it and the project does not already require it, it is not a requirement.
- Never widen the scope of a change. The request sets the boundary; a related file, a neighbouring function or a second caller is outside it unless the change cannot work without them.
- Never start adjacent work you thought of yourself: a refactor you noticed, a test you would like to exist, a rename, a tidy-up, a dependency bump, a doc you would have written differently. "While I was in there" is not a reason.
- Never invent edge cases or failure scenarios. Before adding special handling, a fallback or a test for one, cite evidence that it exists: observed data, an actual incident, or a reproducible failure. "It could happen" is not evidence.
- Never treat a suggestion the user has not answered as approval. Silence is not yes, and neither is a suggestion you made yourself.

### Suggest instead

- Noticing work is not permission to do it. Say what you noticed in one line, and stop.
- Put suggestions at the end of the report, after what was actually done, and keep them separate from it so the two are never confused.
- One line each. A suggestion that needs a paragraph is a proposal, and a proposal is asked about before it is written, not after.
- Ask when the request is ambiguous. Do not resolve an ambiguity by building both sides, by building the larger one, or by building the one you find more interesting.

### Finish what was asked

This is not licence to stop early, and scope discipline is not an excuse for leaving something broken.

- A change is finished when what was asked works and has been verified — not when nothing more can be thought of, and not when the first part of it compiles.
- Work the change makes necessary is inside the scope, not outside it: a caller the new signature breaks, a test the change invalidates, a migration the schema now needs. Doing that is finishing the job, not expanding it.
- If the requested change cannot be made without work that was not requested, say so and wait. Do not do it silently, and do not abandon the request because of it.
- Report what was done and what was verified. Do not report intentions, or work you decided against.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
