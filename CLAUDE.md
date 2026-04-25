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
