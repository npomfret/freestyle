---
name: web-factoring
description: >-
  The required rules for all browser code in this project: components,
  templates, hooks, stores, styles, formatters, client-side logic, on-screen
  text and their tests. Load this before writing or changing any UI
  component, stylesheet, hook, store, client module, on-screen text, or
  component or browser test, and before design or reskin work lands in code.
  Covers where every site-wide design value, primitive and application concept
  lives, icons, tooltips and control states, text ready for translation,
  testing in a real browser by what the user sees, keeping logic out of
  templates, searching before writing, converging shared code, and exceptions.
---

## Web factoring

This standard is about how web application code is factored and tested, and the interface conventions every project shares. It is not a visual design. It covers all code that runs in the browser: components, templates, hooks, stores, styles, formatters, constants, client-side logic, on-screen text and the tests of all of these. Every site-wide decision has one home, every concern has one implementation, and new work uses or extends what exists instead of adding a near-copy.

### Alongside design guidance

- Design guidance, such as the `frontend-design` skill, decides what the product looks like. This standard decides where those decisions live in the code. Both apply together.
- Design work lands in the shared homes. A new palette or type scale is written into the token layer, a new button treatment into the button primitive, a new icon set into the icon module. It never lands as styling on one screen.
- A distinct visual direction belongs to a whole product or a deliberate reskin, never to one screen or feature inside an existing product.
- Where the two disagree about code structure, this standard wins.

### The reskin test

Assume the site must be reskinned at a moment's notice: new colours, fonts, spacing rhythm, corners, borders, shadows, icons and motion. That job must be an edit to the token layer, the icon module and the shared components. It must never mean a sweep through feature code. When a change would make that job harder, the change is wrong.

### Where site-wide decisions live

- **Design tokens:** one token layer, a single file or folder, holds every visual value listed below. Nothing visual is defined anywhere else.
- **Shared components:** one folder holds every primitive listed below.
- **Application modules:** each concept listed below has one named module.
- Colour has two tiers. The raw palette is private to the token layer; code uses semantic roles that map onto it.
- Themes, such as light and dark, are alternative sets of role values in the token layer. Features never branch on the active theme.
- Code that needs a token value in script, such as a chart or a canvas, reads it from the token layer. It never keeps a copy.
- If a project has no home for one of these yet, create it in the expected place and say so. Never scatter the values.

### Design values

Every one of these comes from the token layer, by meaning:

- Space: padding, margin, gap, insets, page gutters.
- Size: layout widths, control heights, icon and avatar sizes, the minimum touch target.
- Breakpoints: defined once, in whatever form the styling system can use in media queries.
- Borders and separators: widths and styles.
- Corner radii.
- Typography: families, sizes, weights, line heights, letter spacing, text transforms.
- Colour roles: surfaces, text, borders, actions, links, focus, selection, disabled, overlays, and states such as info, success, warning and danger.
- Elevation: shadows and the stacking order (z-index).
- Effects: opacity levels, blur, gradients.
- Motion: durations, easing curves and delays, with a reduced-motion treatment.

Rules:

- No raw literal for any of these appears outside the token layer.
- With utility-class styling such as Tailwind, the utility scale is generated from the token layer, and arbitrary values such as `p-[13px]` are raw literals.
- Inline `style` attributes carry only values computed at runtime, such as a measured position or a progress width.
- Choose a token by meaning, not appearance. Something that is merely red does not use `danger`. Two meanings may share a value and still have two names.
- No fallback values such as `var(--token, #fff)`. A missing token is a defect to fix.
- A token needs a meaning and a real consumer, and is deleted with its last consumer.
- A literal that cannot be a token, such as geometry intrinsic to one component, carries a comment saying why.

### Primitives

Each has exactly one shared implementation. Features use them from the first use, never a raw element:

- Buttons, icon buttons, and every other clickable surface, including clickable rows and cards.
- Links, internal and external, from one component that knows how each behaves.
- Icons and emoji, from one icon module that maps meaning names to glyphs from the project's icon library (see Controls). Features never import the library directly, so a new icon set is a one-file change. Every icon has an accessible name or is marked decorative.
- Form fields: text, number, select, checkbox, radio, switch, text area, with their label, hint and error message.
- Tooltips, hover cards and popovers.
- Menus, dropdowns, tabs and segmented controls.
- Dialogs, drawers, sheets and confirmation prompts, owning focus trapping, focus return, Escape and scroll locking.
- Containers: page layout, section, card, panel, divider.
- Notices: alerts, warnings, banners, toasts.
- Badges, chips, tags and pills.
- Tables, lists and pagination.
- Loading, empty and error states, including skeletons and spinners.
- Error boundaries, so a failing section shows the shared error state and the rest of the page keeps working.
- Avatars and images.

A third-party component library or headless UI library is used only inside primitives. Features import the primitive, never the library.

### Application concepts

Each has one module that owns it. Features call the module and never reimplement it:

- **API access:** one client over one transport. The transport owns authentication, timeouts, retries and error translation. Responses are parsed and validated where they arrive. Components never call `fetch` or a vendor SDK.
- **Data flow:** each resource has one owner, a hook or store that fetches, caches, refreshes and discards stale responses. Other consumers read from it and never start their own fetch of the same data.
- **Input validation:** one schema per input shape, shared with the server where both validate it. The browser validates for feedback; the server is the authority.
- **Formatting:** dates, times, durations, numbers, currency and percentages, for the active locale.
- **Routes and URL state:** one route table. Links and redirects build URLs from it.
- **Errors:** one policy for where errors are caught, how they are shown and how they are reported.
- **Auditing and analytics:** one logger and one module recording user actions as named events. No stray `console` calls anywhere else. What a record may and may not say is the auditing standard's, not repeated here.
- **Animation and timing:** transitions defined once per kind, such as enter, exit and expand, from motion tokens. Non-visual timings such as debounce, polling and retry intervals are named constants in one place.
- **Permissions:** one check per capability. Features ask the check and never inspect roles themselves.
- **Browser storage:** one module owns every key, its parsing and its failure behaviour.
- **On-screen text:** one message catalogue and one translation module (see Text and translation).
- **Keyboard and focus:** shortcuts, Escape layering and focus management belong to the primitives and one keyboard module.
- **Test stubs:** one set of network stub handlers per API resource, shared by every test (see Testing).

### Controls: icons, words, tooltips and states

- Every project uses one established open source icon library, imported only by the icon module. Where a project has none, use Lucide (`lucide-react`, or the Lucide package for its framework): ISC-licensed, one consistent style, and each icon imported on its own. A project already on another maintained library keeps it. Never mix libraries, draw an SVG by hand, or use emoji or text characters such as `×` and `›` as icons. A glyph the library lacks is added inside the icon module, in the library's style.
- Never put a word on a button where an icon will do. An icon will do when a first-time user would name the action from the glyph alone: close, search, copy, edit, delete, settings, refresh, expand and collapse, menu, sort, filter, download, open externally, back.
- Use an icon and a word when the icon alone would not say it: the primary action of a form or dialog, confirming anything destructive or costly, and any action whose consequence needs spelling out ("Delete 3 transactions").
- Every icon-only control has an accessible name, and a tooltip that shows that same text. The icon button primitive requires the label, so it cannot be left out.
- Use tooltips to add context to clickables: the name of an icon-only control, a keyboard shortcut, what will happen, or why a control is disabled. A tooltip never just repeats the visible label.
- A tooltip opens on hover and on keyboard focus, closes on Escape, and holds nothing interactive; that is a popover. It never carries the only copy of something the user needs, because touch screens have no hover.
- A disabled control that explains itself stays focusable (`aria-disabled`), so its tooltip can open.
- Every clickable, including rows and cards, has hover, keyboard-focus, pressed and disabled states and the pointer cursor, defined once in its primitive from tokens.

### Text and translation

Assume every project will be translated.

- Every string a user can see or hear comes from the message catalogue: visible text, accessible names, tooltips, placeholders, alt text, page titles, validation and error messages, notifications and empty states. Components and client-side logic hold no literal copy.
- One translation module loads the catalogue for the active locale and formats its messages. Where a project has none, use FormatJS (`react-intl`, or `@formatjs/intl` outside React), which uses the ICU message format translation tools expect. A project already on another maintained library keeps it.
- A message id names the meaning (`transactions.delete.confirm`), not the English wording.
- A message is a whole sentence with named placeholders. Never build a sentence from fragments, by concatenation or a template string, because word order differs between languages.
- Plurals and other grammatical variants use the message format's plural and select rules, never `count === 1 ? … : …`.
- Numbers, currency, dates and times reach a message already formatted for the locale by the formatting module, or through the message format's own number and date arguments.
- No words in images, icon glyphs or CSS `content`.
- Layout allows for text a third longer than English: controls that hold text have no fixed width or height, and truncation never hides the only copy of a label.
- Text the user entered, such as a name, is shown as it is. Wording an API sends for display cannot be translated in the browser: the API sends a code that the catalogue maps to words, or localises the text itself for the requested locale.

### No logic in templates

- A component file holds markup and wiring. All plain TypeScript logic moves to a separate module as pure functions with their own unit tests: calculations, formatting, sorting, filtering, grouping, parsing, validation, mapping API data to view data, business rules and constants.
- Stateful behaviour, such as effects, subscriptions, timers and request orchestration, lives in a hook or store. Its decisions call pure functions from those modules.
- Allowed in a template: reading props and state, rendering a list that is already prepared, choosing what to show from a value that is already computed, and passing handlers that call named functions.
- If checking a value would mean rendering the component in a test, the logic is in the wrong place.
- The browser and the server never hold separate definitions of the same rule. Shared code or the server owns it, and the browser asks the server for a better shape rather than re-deriving data.

### Testing

- Pure logic is unit-tested without rendering, as above. Anything that renders is tested in a real browser: Vitest browser mode with its Playwright provider, Playwright component tests, or Playwright against the running app. Never in a DOM emulation such as jsdom or happy-dom.
- Stub the network, not the code. The API is replaced at the request boundary, with Mock Service Worker handlers or Playwright's `page.route`, and stub bodies are typed or validated by the client's own schemas so they cannot drift from the contract. Never mock the project's own components, hooks or modules.
- Find elements only by what a user can perceive, in this order: role and accessible name, label text, placeholder, visible text, alt text. Never by id, `data-testid`, class name, tag, DOM position, XPath or component internals.
- An icon-only control is found by its accessible name, which is also its tooltip text: `getByRole('button', { name: 'Delete' })`.
- If nothing a user can perceive finds an element, the interface is missing a label or a role. Fix the interface, not the test.
- Act as a user does: click, type, hover, press keys and tab, through real browser events. Never call handlers or dispatch synthetic events.
- Assert what the user perceives: visible text, roles, states such as checked, expanded, selected and disabled, where focus is, and the requests the page sent. Never class names, computed styles, internal state or markup snapshots.
- Tests run in the source locale and write its words literally, so a missing or wrong message fails.
- A project still testing in a DOM emulation moves those tests to the browser runner as a planned change of its own. Until then it adds no new emulated tests: the first new component test sets up the browser runner.

### Look before writing

- Before writing a component, hook, store, style rule, formatter, constant, message, test stub or derived value, search for an existing one.
- Search by what it renders or does: class names, CSS properties and values, markup shape, label text, the data it reads. Copies rarely share a name, so a name search is not enough.
- Search the whole web package, not only the folder being edited. For a domain rule, search the server and shared code too.
- Say what the search found before editing: the implementation you will use or extend, or that none exists.
- Nearby code is not precedent. Before following a file's shape, confirm it is the canonical version and not a drifted copy. Where two variants already exist, converge them before adding a third use.

### One concern, one implementation

- Use the existing implementation. If it cannot serve the new need, extend it with a named variant or slot. If extending it would make it wrong, stop and raise the design decision.
- Never copy a component, style block or hook and edit the copy.
- Anything in the lists above gets its shared home on first use. Any other structure, style or behaviour is extracted on its second real use, in the same change, with the first use migrated onto it. Do not build shared code for a hypothetical future use.
- A file that holds several markup-returning functions, or mixes data loading, layout and presentation, is split before more is added to it.

### Ownership

- A primitive owns structure, styling, interaction states and accessibility. Its callers own content and domain choices, passed in as props or children.
- A primitive knows nothing about its callers: no feature class names, no domain types, no screen-specific branches.
- Callers do not restyle a primitive's internals through descendant selectors, style overrides or class-name escape hatches. Variation the design needs becomes a named variant on the primitive.
- Name variants by meaning (`tone="warning"`, `density="compact"`). Do not stack booleans or add a prop that serves one caller.
- Page and route files compose. They do not define reusable UI.

### Converge completely

- A change that introduces a shared implementation moves every existing caller onto it and deletes what it replaces, in the same commit. Old and new never coexist.
- Merging near-duplicates is a behaviour or visual change until shown otherwise. Find out whether a difference was deliberate before choosing one side.
- Delete what becomes unused in the same change: components, hooks, class names, CSS rules, tokens, constants, messages, stub handlers, exports and props.

### Exceptions

- A departure from this standard carries a comment at the site naming the constraint that makes the canonical route impossible. Verify the claim first: if the comment says no token or primitive exists, search for one.
- A second exception with the same reason means the shared implementation must be extended instead. Extend it.

### Finishing

- The project's checks pass.
- The summary of the work names what was reused, what was extracted or converged, and what was deleted.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
