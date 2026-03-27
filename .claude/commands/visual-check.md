---
description: Use Playwright MCP to audit the UI at http://localhost:5848 across both mobile and desktop, including interactive states such as drill-down list items, dropdowns, menus, sheets, and collapsible panels.
argument-hint: "[optional route, tab, or feature to prioritize]"
allowed-tools:
  - Bash
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_click
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_select_option
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_run_code
---

# Visual Audit

- Use Playwright MCP to audit `http://localhost:5848` across mobile and desktop viewports.
- Focus on `$ARGUMENTS` if provided; otherwise sweep the full app surface after login.
- Save screenshots under `@tmp/screenshots` with deterministic per-viewport names such as `375-bills-list.png`, `390-usage-date-range-sheet-open.png`, or `1440-settings-detail.png`. Archive existing images before you begin.

## Screenshot Compression

After every `browser_take_screenshot` call, immediately run the following before reviewing the image:

```bash
sips --resampleWidth 900 <path-to-screenshot>
```

This resizes the image in-place to 900px wide (preserving aspect ratio), which reduces file size significantly before the image is loaded into context. Do this for every screenshot without exception.

## Preconditions

- Assume `http://localhost:5848` is already running. Do not start or stop local servers.
- If login data, seed users, or a suitable address are missing, stop and report the blocker instead of improvising.
- Prefer role/name-based interactions from `browser_snapshot`; use `browser_evaluate` only when snapshot data is insufficient.

## Viewports

Run the audit at all three required widths. Use `browser_run_code` to set viewport size: `page.setViewportSize({ width: W, height: H })`.

**Mobile:**
- `375x667` (iPhone SE)
- `390x844` (iPhone 14)

**Desktop:**
- `1440x900`

Re-check any reported issue at the relevant viewport(s) before reporting it. Issues that only appear at one viewport should be flagged as such.

## Login And Scope

1. Navigate to `http://localhost:5848`.
2. Log in as admin (`admin@snowmonkey.co.uk` / `aaaaaaaaaaaa`).
3. If `$ARGUMENTS` names a specific route, user, or address, prioritize that scope.
4. Otherwise, switch to **Nick P**; if Nick P is unavailable, stop and report the missing fixture.
5. If the user is inactive, activate them and record the activated userId.
6. Prefer Nick P's **electric-only** address because it is the default test fixture. If the task needs dual-fuel or bills-specific coverage, switch to the matching Nick P address and state that choice in the report.
7. Audit the app shell first, then each tab/screen in scope.

## Sweep Order

Complete the mobile sweep first (both viewports), then the desktop sweep.

**Mobile tabs/screens to cover** (via bottom nav and More menu):
Usage → Meters → Bills → Inverter → Tariffs → Sync → Settings (home + address detail)

**Desktop tabs to cover** (via top nav):
Usage → Inverter → Meters → Bills → Tariff → Settings → Sync

## Audit Method

For each screen or route:

1. Take a baseline full-page screenshot before interacting.
2. Build a quick interaction inventory from visible controls and snapshot roles.
3. Exercise safe interactive states one at a time.
4. Take a full-page screenshot after every meaningful state change.
5. Return the UI to a clean state before moving on.

## Required Interaction Pass

Do not stop at static screens. Explicitly try the following when present:

- nav items, tabs, segmented controls, and drill-down list rows
- expandable rows or cards, including bill summary rows and other accordion-style sections
- overflow menus, action menus, and bottom sheets (mobile) / popup menus (desktop)
- dropdowns, selects, comboboxes, and autocomplete menus
- modal, sheet, and drawer open plus close behavior
- filter chips, toggles, and inline selectors that change layout density or visible content
- date-range controls and preset pickers

Required capture sequence:

- expandable or collapsible UI: `collapsed` then `expanded`
- menus, sheets, dialogs, dropdowns, or autocomplete: `trigger`, `open`, then `dismissed`
- route flows: `list`, `detail`, then `edit` when the edit state is reachable without destructive saves

For interactive elements that reveal hidden content:

- capture the closed state
- open the control
- capture the open state
- inspect the revealed content for clipping, overflow, focus loss, unreachable actions, or dismissal problems
- close the control and confirm the screen recovers cleanly

## Safe Interaction Boundaries

- Safe to use: navigation, tabs, list-item drill-down, expand/collapse, menu open/close, sheet open/close, dropdown open/close, non-destructive filter changes, date-range pickers, and reversible selectors.
- Do not trigger destructive or stateful actions such as save, delete, upload, sync, or irreversible admin actions unless the command explicitly requires them.
- If a control looks risky, record it as skipped and explain why instead of guessing.

## What To Assess

For each baseline and interactive-state screenshot, look for:

### Layout And Overflow

- horizontal scrollbars or content wider than the viewport
- excess or inconsistent whitespace (margins, padding, gaps)
- duplicated or inconsistent card/surface treatments in the same flow
- content hidden behind sticky headers, bottom nav, sheets, or browser chrome
- expanded panels, menus, or dropdowns rendering off-screen
- tables, cards, or list rows that break when a hidden state is revealed
- desktop: content not constrained to the 1280px max-width workspace contract

### Touch And Interaction (mobile)

- tap targets smaller than 44×44px
- controls too close together for reliable tapping
- list rows or toggles that require precision taps
- dropdowns, sheets, or panels that cannot be dismissed cleanly
- interactions that only work on hover or desktop assumptions

### Navigation And State Recovery

- navigation chrome disappearing or becoming unreachable
- opening one panel causing another control to become obscured or trapped
- back-navigation or close actions leaving stale overlays behind
- menus, drawers, or sheets reopening in the wrong position after navigation
- mobile flows that should be route-first being trapped inside cramped inline accordions

### Typography, Density, And Forms

- text truncation that becomes worse in expanded states
- cramped layouts once a panel or menu opens
- font size below 16px on inputs
- labels, placeholders, or helper text becoming ambiguous inside opened sheets or dropdowns
- overlay taxonomy drift: use `sheet` for action picking, `fullscreen` for dense work, and `dialog` for confirmations only
- surface taxonomy drift: default content should read as `surface-card`, nested mini-panels as `surface-subpanel`, and overlays as `surface-dialog` or `surface-sheet`

### Desktop-Specific

- content that should be a card or surface but renders without visible background against the app backdrop
- sidebar/detail split layouts where one pane lacks a solid surface (transparent over background image)
- mobile-only UI patterns (bottom sheets, back buttons, mobile-screen headers) leaking into the desktop layout
- inconsistent spacing between the desktop nav and workspace content
- trigger a sync on the sync tab before taking a screenshot

## Report Format

For each issue found, report:

- **Severity**: Broken / High / Medium / Low
- **Viewport**: e.g. `375x667`, `390x844`, or `1440x900`
- **Problem**: what is wrong and what should happen instead
- **Location**: tab/screen plus the exact interaction path
- **State**: resting / expanded / open / dismissed / detail / edit
- **Interaction**: the control that was clicked or opened
- **Screenshot**: path to the relevant screenshot
- **UserId**: the activated Nick P userId

Also report:

- coverage gaps where a screen or interaction could not be reached
- skipped interactions that looked risky or destructive
- an overall rating per surface: **Broken / Poor / Acceptable / Good**
- the top 5 fixes by impact across the full sweep
