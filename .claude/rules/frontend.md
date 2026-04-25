# Frontend Rules

Applies to `web/**`.

- The frontend is a Vite/React app with app-level data hooks in `web/src/hooks.ts`, API wrappers in `web/src/api.ts`, and presentational/resource UI in component files.
- Do not grow `App.tsx` into a dumping ground. Extract coherent components, hooks, and view helpers when a UI change becomes hard to scan.
- Keep API response types in `web/src/types.ts` aligned with backend response shapes.
- Reuse existing CSS class semantics in `web/src/App.css` and `web/src/index.css`; introduce new semantic names only when the concept is distinct.
- Check responsive behavior for visible UI changes. Run `npm run build:web` when frontend build behavior could be affected.
