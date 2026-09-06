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
- Claude setup maintenance: `.claude/skills/config-maintenance/SKILL.md`
- Repo map: `.claude/references/architecture-map.md`

## Dangerous Areas

- Ask before running write-capable DB scripts: `discover`, `add-url`, `repair`, `validity-check`, `embed`, `re-embed`, `migrate`, queue processing, or direct `psql` writes.
- Ask before touching deployment files or running `npm run deploy`, Docker Compose production commands, or SSH commands against `fsd.snowmonkey.co.uk`.
- Do not edit `dist/`, `web/dist/`, `node_modules/`, lockfiles, generated logs, or `tmp/` artifacts unless the task specifically requires it.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **freestyle** (1266 symbols, 2133 relationships, 92 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
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

## Task files

A `tasks/` folder holds one markdown file per piece of work. This is our standard workflow and the wording is identical across all our projects. Task files are committed with the code.

### When a task file is required

- Always, for planned work.
- For unplanned work, whenever a reasonable-length commit message could not adequately describe the problem, the solution and the evidence. If a commit message is enough, no task file is needed.
- One file per piece of work. If an existing task already owns the work, update it instead of creating another.

### Naming and location

- `<slug>.md` inside a `tasks/` folder. The slug is a short imperative description in plain search terms, for example `fix-login-timeout.md` or `add-csv-export.md`. A numeric or stream prefix is fine where the project already uses one.
- A `tasks/` folder need not be at the repository root. Where a project is split into sub-projects, each may keep its own `tasks/` folder owning the work for its code, and a root `tasks/` then covers work that crosses sub-projects or concerns the repository itself. Put the file in the `tasks/` folder closest to the code it changes.
- Subfolders inside `tasks/` may group related work.
- Non-task documentation goes in `docs/`, not `tasks/`.

### What goes in a task file

A task file grows with the work. It may begin as nothing more than a bug report or a one-line feature request, and at that point it is complete. Add a section when the work produces something to put under it; never write a heading you have nothing to fill.

Only the issue is always present:

- The issue: the bug, feature, refactor or research question, and why it matters.
- Brainstorming: candidate approaches, including rejected ones and why they were rejected.
- The plan: the chosen solution, broken into steps or phases that each leave the system working, with observable success criteria.
- Tracking: current status, decisions and approvals, what has shipped, what remains, blockers, the exact verification run, and residual risk.

### Keeping it current

- A task file is a living working document, not a diary. Correct stale scope, plans and claims in place. Do not append a chronological log of changes of mind; git history records that.
- Update the task file in the same commit as the code it describes so status and implementation never drift.
- Mark a step complete only when the implementation exists and its verification has passed. If verification cannot run, leave the step open and record the exact blocker.

### Completion and deletion

- A task file is not an authority, and code and durable docs must never reference one.
- Usually nothing needs promoting before deletion. The work is the code, the tests are the evidence, and both stay. Delete the file.
- Occasionally a task reaches a conclusion the code cannot carry: a product or architecture decision, or an approach rejected for reasons worth not rediscovering. Move that to `docs/` first. This is the exception, not the rule.
- The commit that lands the last piece of work also updates the task file to its final state: what shipped, exact verification, remaining risk.
- Delete the completed task file in a separate follow-up commit, after that last piece of work is committed. Genuinely outstanding work moves to a new, narrower task file first.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
