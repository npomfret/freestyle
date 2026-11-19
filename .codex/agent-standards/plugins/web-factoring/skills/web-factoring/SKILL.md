---
name: web-factoring
description: Browser front-end code. Use when writing or refactoring React, Vue or Svelte components, hooks, stores, CSS, themes, design tokens, client API transport and caching, routing, focus and ARIA, or reskinning a web UI. Use together with ui-implementation for any web UI change. Not for server code, native apps or browser tests.
---

Keep shared browser behavior and design decisions in shared homes. Features compose those pieces. Visual design guidance chooses the look; these conventions govern its implementation.
### Shared UI design system

Apply these rules to every UI platform, including web, macOS, iOS and Android. Every app-wide visual decision, primitive and reusable composed component must have a central, discoverable owner.

- Keep app-wide colours, typography, spacing, dimensions, corners, borders, surfaces, elevation, icons, motion and state treatments in a shared design-token layer. Name tokens for semantic roles and use them consistently across applicable surfaces.
- Build shared primitives from those tokens, then build reusable composed components from the primitives. Centralise complex components as deliberately as simple controls. Feature screens compose the shared system.
- Assume every new on-screen element or composition will be reused. Factor meaningful UI pieces into named, discoverable reusable components from first use, including pieces that currently have only one caller. Keep them independently accessible to other features. Do not hide reusable structure inside another component or wait for a second use before extracting it. A component remaining single-use is an acceptable cost of this policy.
- Give shared components ownership of appearance, interaction, accessibility and supported states. Expose meaningful semantic variants. Feature code supplies domain content and layout choices permitted by the component contract.
- Make the system easy to find through cohesive modules, stable names and a maintained entry point or catalogue identifying tokens, primitives and composed components. Keep it current as shared components change.
- Before creating or changing UI, inspect that entry point and search existing components by purpose, appearance and behaviour. Reuse or extend the canonical owner. Do not recreate its appearance locally or copy an implementation into another feature.
- Route shared decisions through their owners. Feature-local values and overrides must not bypass component appearance or state policy. Put genuinely local geometry at the boundary that owns it.
- When introducing a shared replacement, migrate all applicable callers and remove superseded implementations in the same change. Include loading, empty, error, disabled, preview and alternate-layout paths where applicable.
- Verify the system's propagation claim. Changing an app-wide token or shared component must reach every applicable consumer. Inventory callers and justified exceptions, and inspect representative rendered states that exercise distinct rules. Report any unverified surfaces explicitly.
- Keep platform implementations faithful to the same product meaning while respecting platform interaction and accessibility requirements. When one product spans platforms, keep corresponding design decisions aligned and make required platform differences explicit.
### Browser design bindings

- Script and styles read the same token definitions. Themes change semantic roles. Keep breakpoints and reduced-motion treatment in that layer, and remove tokens with their last consumer.
- Use inline styles only for runtime values. Intrinsic geometry that cannot be a token needs a brief reason beside it.
- Keep third-party UI libraries behind shared primitives. Use semantic variants rather than CSS-value props, boolean combinations or class/style escape hatches for primitive-owned internals.
- Parents own spacing between siblings. Size a primitive through its own supported custom property rather than descendant selectors. Route/page files compose rather than define reusable UI.
- A reskin changes tokens, icons and primitives through their shared owners.
### Patterns to avoid

- Token fallbacks, raw visual literals outside tokens, or fading secondary text with opacity.
- Copying a component, style block or hook and editing the copy.
- Restyling shared internals with `!important`, descendant selectors or caller class/style overrides; nesting a primitive inside another of its own kind.
- Div-based controls, tables or lists; semantic elements whose display/role hides their meaning; ARIA references to elements that are not rendered.
- Assertions/`any` that silence missing type evidence.
### Shared application behavior

Give each concern one owner: API transport, resource loading/cache/invalidation, input schemas, formatting, routes/URL state, errors, logging/analytics, permissions, browser storage, keyboard/focus, text catalogues and test stubs. Consumers use or extend that owner rather than repeat its logic.

- The API boundary owns authentication, timeouts, retries, error translation and response validation. Components do not call fetch/vendor SDKs directly.
- Each resource has one loading/cache owner that discards stale responses. Share domain rules with the server; browser validation is feedback, not authority.
- Every cache receives runtime-supplied configuration through its construction boundary, including an enabled/disabled setting. Each project owns its caching policy. Support disabling caching in development and pass the relevant validated settings to the owner.
- Keep pure calculations, transforms, validation and constants in plain modules; effects and subscriptions in hooks/stores. Templates render prepared values and wire named handlers. Test pure logic without rendering.
### Controls, accessibility and text

- Design the default interface for expert users familiar with the task and controls. Offer concise, nicely formatted explanations in hover/focus tooltips. For fuller optional help, use a small info icon that opens a popover on click, tap or keyboard activation, with accessible naming, focus and dismissal behaviour. Keep explanatory content inside those optional surfaces.

- Use one established icon library through the shared icon module. Keep an existing maintained library; use Lucide when none exists. Do not mix libraries, hand-draw feature icons or substitute emoji/text glyphs.
- Use recognizable icons with explanatory tooltips whenever a suitable icon communicates the action. Use button text only when an icon cannot communicate it adequately. Icon controls require localized accessible names and matching tooltips. Add headings or subheadings only when explicitly instructed by the user. Keep visible copy focused on the user's task and required decisions.
- Primitives supply hover, focus, pressed and disabled states, pointer cursors and complete WAI-ARIA keyboard behavior. Tooltips open on hover/focus, close on Escape and contain no interactive or uniquely necessary content. An explanatory disabled control remains focusable with aria-disabled.
- Keep roles and rendered ARIA targets consistent. Name horizontally scrolling regions. Meet minimum touch targets and WCAG AA contrast (4.5:1 text; 3:1 large text), measuring composited colors. Announce loading and failure states.
- In a project where localization applies, show text through its message catalogue, including accessible names, errors and notifications; the localization skill covers catalogues, translation, formatting and text growth.
- Do not put words in images or CSS glyphs, and preserve user-entered text. Avoid fixed text dimensions and truncating the only label.
### Types

Use meaningful types for IDs, units and domain values, literal unions for finite choices, and discriminated unions for state. Parse unknown input into validated domain types at boundaries and use exhaustive switches. Prefer strict toolchain checks, including unchecked-index and optional-property checks. Named exported component props derive from domain types where appropriate. Do not weaken checks to land a change without recording the concrete constraint.
### Reuse and verification

- Search the web package and relevant server/shared modules by behavior and rendered structure before building another implementation. Extend the canonical version. If the existing design cannot serve the request, explain that decision rather than copy it.
- Factor meaningful UI pieces for reuse from first use, following the shared UI design system. Keep unrelated refactors outside the task.
- When introducing a shared replacement, migrate its existing callers and remove the superseded code in the same change. Include loading, empty, error and mobile paths. Check whether differences were deliberate, then search for leftovers.
- Test rendering in a real browser, following the browser-testing skill. Move existing DOM-emulation tests as separate planned work; add no new emulated UI tests. The first new component test establishes the browser runner when needed.
- A behavior/visual-neutral refactor needs runtime evidence: compare affected computed styles at phone/desktop widths, use deterministic screenshots where possible, and compare both versions for broad changes. State actual differences and unverified states.

Other than the avoid-list, these are defaults. A departure records the verified constraint where it occurs (or in the project's library/runner decision). Repeated departures should improve the shared implementation. Report the reuse, removals and verification that matter to the change.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
