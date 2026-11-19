# Freestyle

Freestyle catalogs free and near-free developer resources. The backend is TypeScript on Express/Postgres, pipeline scripts use LLM providers to discover/repair/check resources, and `web/` is a small Vite/React frontend. Postgres uses pgvector and trigram search; Docker is used for deployment.

Lifecycle: not evidenced (status unknown). A production deploy target exists (`root@fsd.snowmonkey.co.uk`, `docker-compose.production.yml`).

## Non-Negotiables

- For any non-trivial feature or bugfix, follow `.claude/skills/feature-workflow/SKILL.md`: audit upstream/downstream/lateral code, refactor for readiness, implement, verify.
- Before editing, identify the applicable skill and rule files. If no convention covers the change, decide, follow the nearest existing pattern, and note the decision in your report.
- Prefer existing dependencies and patterns. When you introduce a new dependency, abstraction layer, file layout, naming scheme, database mutation pattern, or LLM provider behavior, say why in your report. Run production deploys when the task calls for them and state it in your report.
- Treat the remote database as real production-like data. Anything using `DATABASE_URL`, `npm run db:tunnel`, migrations, deploys, discovery, repair, validity checks, embeddings, or queue processing can affect important data.
- If an approved convention changes, update the relevant `.claude` rule, skill, or reference file in the same change.

## Canonical Commands

- Format: `npm run format -- <files>` or `npm run format`
- Test backend unit tests: `npm test`
- Typecheck both roots: `npm run compile`
- Start API: `npm run server` (requires DB tunnel for DB-backed work)
- Start frontend: `npm run dev:web`
- Build frontend: `npm run build:web`
- Deploy: `npm run deploy` (when the task calls for it; state it in your report)
- Pipeline and DB scripts (`discover`, `repair`, `validity-check`, `embed`, `migrate`, `db:tunnel`, and others) are listed in `package.json`; most write to the remote database, so see Dangerous Areas.

## Routing

- Global standing rules: `.claude/rules/global.md`
- Backend/API conventions: `.claude/skills/backend-conventions/SKILL.md`
- Frontend conventions: `.claude/skills/frontend-conventions/SKILL.md`
- Database and migration work: `.claude/skills/database-work/SKILL.md`
- Bug investigation: `.claude/skills/bug-investigation/SKILL.md`
- Working-tree review: `.claude/skills/review-working-tree/SKILL.md`
- Repo map: `.claude/references/architecture-map.md`

## Dangerous Areas

- Write-capable DB scripts are run when the task calls for them, and stated in your report: `discover`, `add-url`, `repair`, `validity-check`, `embed`, `re-embed`, `migrate`, queue processing, or direct `psql` writes.
- Touching deployment files and running `npm run deploy`, Docker Compose production commands, or SSH commands against `fsd.snowmonkey.co.uk` are done when the task calls for them; state it in your report.
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
## Operating contract

*Managed by `npomfret/agent-standards`; detailed workflows are skills.*

- Scope: do what was asked plus the callers, tests and migrations it needs. Leave unrelated refactors, renames, cleanup, dependency bumps and docs for separate work; suggest them at the end. Never invent commands, paths, field names or APIs; check the source first. Add failure handling only for observed evidence. When readings differ materially, choose the most plausible, state the assumption in your report and proceed. Done means the behaviour works, verification passes, and you report evidence and blockers.
- Skills: before any code, test, SQL, UI, script, logging, CI or commit work, check the skills list and invoke every skill whose description matches that part of the request. Loading the relevant skills is part of the work, and the first match is not enough.
- Gates: only substantive failures block (types, broken behaviour, agreed rules). Cosmetics are autoformatted and never block commits, CI or reviews. Run tests, builds and type checks yourself; no test or lint hooks, and formatting hooks only when targeted at changed files.
- Other agents share the checkout. Stage only your files; never stash, discard, revert or commit their changes. The shared checkout stays on the default branch; isolate with `git worktree add --detach tmp/worktrees/<name> <default-branch>`.
- Git: work is complete only when verified, reviewed commits are on the default branch and pushed (`git pull --rebase`, land with `git merge --ff-only`). Force-pushing is permitted; prefer `--force-with-lease`. Commit, land and push without asking. Repositories stay private.
- Significant work (behaviour, refactor, tests, config, tooling) is reviewed independently before commit: spawn a project reviewer or `change-reviewer` subagent (`spawn_agent` in Codex, the Agent tool in Claude Code), never report a review you did not delegate; resolve every finding. Tests and review do not replace each other.
- Substantial work needs a committed task file under `tasks/`.
- Run commands yourself unless they need the user's login, password, sudo, device or install. Reuse the project's scripts and `tmp/ad-hoc-scripts/`; put multi-step or quoted shell in a named script there. Hand the user one short command, else a script run as `! tmp/ad-hoc-scripts/<purpose>.sh`. Send long output to `tmp/logs/`; read it with `rg` and bounded excerpts; never paste whole logs.
- Secrets never go in source, arguments, output or logs, or the repo; they live in iCloud Drive, reached through gitignored `secrets/` links. Configuration comes only from explicitly supplied files, never environment, dotenv or ambient login.
- Code: construct dependencies at the entry point and inject them; no globals, singletons or hidden construction; immutable by default; structured logs with fixed labels that preserve error causes and stacks; no sleeps in tests. Raise a test timeout or limit only on measured evidence, recorded beside the operation.

- Be concise: lead with the outcome; give only the detail needed to act or decide.
- Do the work properly and verify it; never trade correctness for speed or cost.
- When options exist, recommend the best technical solution first, even if costlier; state cheaper alternatives separately with their trade-offs.
- Fail fast: surface errors with their cause; never swallow, mask or silently fall back from them.
- Keep one canonical implementation: migrate callers and delete superseded code instead of adding shims or compatibility layers.
- Question unclear or unsound requests before acting on them; do not comply silently.
Also read these always-on project rules before work: [backend](.claude/rules/backend.md), [database](.claude/rules/database.md), [frontend](.claude/rules/frontend.md), [global](.claude/rules/global.md), [ops](.claude/rules/ops.md).
In Codex, use native skills and specialists for equivalent Claude invocations; referenced `.claude/` files remain canonical project knowledge.

*Managed by `npomfret/agent-standards`; edit the shared sources there.*
<!-- agent-standards:end -->
