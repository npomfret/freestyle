---
description: Use for React, Vite, CSS, frontend API client/types, visual UI, responsive layout, or web/src changes.
paths:
  - web/**
user-invocable: true
---

# Frontend Conventions

Load `.claude/rules/frontend.md`, `.claude/references/frontend-conventions.md`, and `.claude/references/architecture-map.md`.

Rules:

- Keep API access in `web/src/api.ts` and reusable data behavior in `web/src/hooks.ts`.
- Keep frontend types aligned with backend response shapes.
- Extract UI when a component becomes hard to scan or a concept is reusable.
- Name CSS by semantic role. Do not reuse a style solely because it looks similar.
- Avoid landing-page or decorative redesign patterns unless explicitly requested; this app is a catalog/search tool.
- For visible UI changes, verify mobile and desktop behavior when practical.

Verification options:

- `npm run compile`
- `npm run build:web`
- Browser/screenshot checks for layout-sensitive work.
