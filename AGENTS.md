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

<!-- agent-standards:begin -->
## Shared agent guidance

Before starting work, read [Git](.agents/agent-standards/guidance/git.md), [Scope](.agents/agent-standards/guidance/legacy-scope.md).
Keep the shared checkout on its default branch. Use detached worktrees. Agents commit, fast-forward land and push their verified, reviewed work.
Also read these always-on project rules before work: [backend](.claude/rules/backend.md), [database](.claude/rules/database.md), [frontend](.claude/rules/frontend.md), [global](.claude/rules/global.md), [ops](.claude/rules/ops.md).

*Managed by `npomfret/agent-standards`; edit the shared sources there.*
<!-- agent-standards:end -->
