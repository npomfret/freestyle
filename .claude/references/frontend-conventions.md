# Frontend Conventions

- Keep screen orchestration separate from reusable presentation. `App.tsx` may compose, but repeated or complex UI should move into named components.
- Keep data fetching in hooks or API helpers. Components should not duplicate URL construction or response parsing.
- CSS class names should describe product/UI meaning, not just appearance.
- Avoid one-off inline style patches when the style is part of the app's reusable visual language.
- Keep controls reachable and readable on mobile and desktop. Watch for search/filter overflow, topic chip wrapping, modal scroll traps, and text truncation.
- For visible UI work, check at least one narrow mobile viewport and one desktop viewport if a browser is available.
