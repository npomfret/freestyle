---
name: browser-testing
description: Browser-driven tests. Use for Playwright or Vitest browser mode tests, page objects, locators, end-to-end flows through a web UI, and failing or flaky browser tests, including "test the login flow" and "the e2e keeps failing". Not for unit tests, iOS tests, or using a browser to look at a page while developing.
---

Use these conventions for browser-driven tests, including Playwright component tests and Vitest browser mode. Shared rules and platform notes use the same numbers.
### Shared UI testing rules

Tests describe user behavior through page objects. The page object model is mandatory for all UI tests. A page object is a test driver that hides interaction mechanics behind meaningful application operations. Keep navigation and element knowledge in those objects so UI changes have one place to update.

More than roughly three lines of incidental setup or preparation in a test is a signal to improve its driver abstraction. Keep scenario-defining data visible and encapsulate distracting mechanics. These rules apply across web and native UI platforms, including SwiftUI applications tested through XCUITest.

Treat UI behaviour as asynchronous, including input, clicks, validation, animations and API results. Page objects own all direct UI access and asynchronous waiting, using the shared audited poll-until-matcher infrastructure. Test bodies contain scenario inputs, driver operations and expectations expressed through those drivers. Direct locators, field access and waits in test bodies are forbidden.

1. **Page objects own the screen.** Tests arrange data/stubs, call page-object methods and assert returned values. Element lookup, actions, reads and UI assertions stay inside shared page-object classes, including modals and common regions.
2. **Locate by what a person perceives.** Start at a recognisable section, dialog or row, then narrow by role, accessible name, label or visible source-locale text. Write source text literally. Fix missing interface labels rather than navigating DOM/tree internals. A lookup must identify exactly one element: no first/last/nth selection. Check lists as a whole. Test-only identifiers need a page-object-local comment explaining why perceivable lookup cannot work. Build fresh queries, not cached values from the screen.
3. **Poll for change and audit every wait.** Every result check, including absence, reads fresh state and applies a matcher until it matches or reaches a named timeout. Return immediately on success. Fixed delays followed by assumed completion are forbidden. Shared driver infrastructure audits every wait outcome with a fixed label and single-line JSON containing test/operation identity, expected condition, outcome, elapsed milliseconds and timeout milliseconds. Include attempts when available and safe observed state on failure. Wrap framework waiting APIs and retrying assertions at this boundary too, so no asynchronous wait escapes auditing. Retain success and failure audits in TeamCity build logs. Follow the repository-wide test timeout rules.
4. **Avoid snapshot decisions.** Do not branch on a one-off element read or assert it with plain equality. One-off reads are only for diagnostics after a polling assertion fails. Assert user-visible behavior, focus, semantic states and requests, not styling, application internals or element-tree snapshots.
5. **Actions verify their effect.** Check visibility/enabled state, perform the action, wait for its result and return the already-verified page object for the destination. A modal closing waits for closure; a save waits for visible confirmation/change. Each starting screen has a static entry point or fixture that opens and verifies it; tests do not construct page objects. Constructors do not wait. Each object has `verifyLoaded()` for its own landmarks. Name methods by their outcome; an action staying on the same screen may return nothing.
6. **Prove the transition.** Establish and assert the relevant old state through the page object before an action, then assert the required new state afterward. The starting check may simply assert that the final condition is not already true. Require an exact old value only when it matters to the scenario. The test must fail if the action does nothing or produces the wrong result. Existing or leftover state must not satisfy the final assertion without the required transition. For unchanged-state or idempotency scenarios, establish the preconditions appropriate to that contract.
7. **Use real input.** Do not force actions, call handlers to bypass UI, or retry submits/creates/deletes. Fix missed input in the app. While a fix is pending, only an idempotent action/assertion pair may be retried.
8. **Fail at the first wrong state.** Page objects check their screen before steps, old/new field values around edits, validation state before submission, and destination landmarks after navigation. Poll these checks; failures say what was actually visible and where. Keep named timeout constants together; increasing a limit is not a timing fix.
9. **Stub external boundaries.** Use typed/validated builders and install network/system-service stubs before navigation or launch. Do not mock project components, hooks or view models. A mid-test server change replaces the stub, triggers the real update event and waits for the UI result.
10. **Treat flakiness as failure.** Disable automatic retries. After a timing fix, repeat the affected test (normally 20 times) and report the pass count.

### Choose the behaviour's test boundary

Keep UI layers thin, with layout and rendering bound to application-owned model state and user interactions forwarded to its operations. Move decisions, validation, calculations, workflow and state transitions into UI-independent code with injected collaborators. Unit-test that behaviour in memory. Focus UI-driven coverage on rendering, bindings and platform interactions that require a real UI. Apply this across web and native frameworks so ordinary behavioural coverage can run without a browser, simulator or desktop session.

### Failure artifacts

Shared infrastructure publishes downloadable CI artifacts on failure containing application/server logs, browser console logs where applicable, test errors, audited wait timings and screenshots of the failed UI state. Collect logs and screenshots from every participant in multi-user, multi-browser or multi-device scenarios and label them by test and participant. Capture evidence before cleanup and publish it even when tests fail. Browser application logs use timestamp, severity, fixed label and structured JSON data just like server logs. Preserve original failures and apply auditing redaction rules.

Retain wait timing data for successful tests across builds. Routine screenshots and extensive diagnostic artifacts are unnecessary for successful tests.

### Departures

Rules 3, 4 and 7 have no exceptions. Other departures need a comment naming the rule, the concrete constraint and what would remove it. The single-match requirement in rule 2 also has no exception.
### On the web

1. **Tests never touch the page.**
   - Every page, modal, dialog, dropdown and shared region (header, footer, toasts) has one page-object class.
   - Forbidden in a test file:
     - any selector, and any `Locator`
     - `page.locator`, `page.getBy…`, `page.$`, `page.$$`, `page.evaluate`
     - acting on an element: `click`, `fill`, `type`, `press`, `check`, `selectOption`, `hover`, `page.keyboard`, `page.mouse`
     - reading an element: `textContent`, `innerText`, `inputValue`, `getAttribute`, `isVisible`, `count`
     - `expect(locator)` in any form
   - URL assertions also belong inside page objects, using the audited waiting boundary.

2. **Find elements by narrowing.**
   - A locator starts at a container a person would recognise, then narrows inside it:

     ```ts
     // the "Rent" expense, inside the "Expenses" section, then its Delete button
     this.page.getByRole('region', { name: 'Expenses' })
       .getByRole('listitem').filter({ hasText: 'Rent' })
       .getByRole('button', { name: 'Delete' })

     // a dialog by its title, then a field by its label
     this.page.getByRole('dialog', { name: 'Edit group' }).getByLabel('Group name')

     // a section with no landmark role, found by the heading inside it
     this.page.getByRole('article').filter({ has: this.page.getByRole('heading', { name: 'Balances' }) })
     ```
   - Each step uses, in this order:
     1. role and accessible name: `getByRole`
     2. label text: `getByLabel`
     3. placeholder: `getByPlaceholder`
     4. visible text: `getByText`, `filter({ hasText })`
     5. alt text: `getByAltText`
   - An icon-only control is found by its accessible name, which is also its tooltip: `getByRole('button', { name: 'Delete' })`.
   - A section with a heading but no name is fixed in the markup, for example with a `<section aria-labelledby>` for that heading.
   - Never use CSS selectors, class names, ids, other HTML attributes, XPath or DOM structure (`locator('..')`, child combinators).
   - **Never use `first()`, `last()` or `nth()`.** Playwright refuses to act on or assert against a locator that matches several elements (a strict mode violation). That error is the ambiguity rule 2 describes, and `first()` is how it gets silenced.
   - A list is checked whole: `expect(rows).toHaveCount(3)`, or `expect(rows).toHaveText(['Food', 'Rent', 'Travel'])` when order matters.
   - A `data-testid` is allowed only inside a page object, with the comment rule 2 asks for.
   - Each locator is a protected method on the page object that builds a fresh `Locator` every time it is called. Never keep an element handle, a text value, a count or an `isVisible()` result.

3. **Poll with retrying assertions.**
   - Run every assertion and wait below through the shared audited driver boundary from rule 3, recording its duration and outcome even when it succeeds. Framework polling does not provide the required timing audit by itself.
   - `waitForTimeout`, `sleep`, a `setTimeout` promise and `waitForLoadState('networkidle')` are forbidden, with no exceptions.
   - Wait with assertions that retry: `expect(locator).toBeVisible()`, `toHaveText()`, `toHaveValue()`, `toBeEnabled()`, `toBeFocused()`, `toHaveURL()`.
   - "Gone" is `not.toBeVisible()` or `toHaveCount(0)`.
   - For a value that is not on a locator, use `expect.poll()`.

4. **Snapshot reads.**
   - `isVisible()`, `count()`, `textContent()`, `inputValue()` and `allTextContents()` are one-off reads. Never branch on one, and never assert one with a plain `expect(value)`.
   - Never assert class names, computed styles or markup snapshots.

5. **Hand over the next page object.**
   - A click that navigates waits for the URL and for the destination's `verifyLoaded()`, then returns the destination's page object.
   - Tests never construct a page object with `new`. The entry point is a static `navigateTo(page)`, or a fixture built on it, which goes to the page, verifies it and returns its page object:

     ```ts
     const login = await LoginPage.navigateTo(page)
     const dashboard = await login.loginAndOpenDashboard(email, password)
     const group = await dashboard.openGroup('Flat 3')
     const expense = await group.clickAddExpenseAndOpenForm()
     ```
   - `verifyLoaded()` asserts the URL as well as the landmarks only that page shows.

7. **Never force.**
   - Act through real browser events: `click`, `fill`, `hover`, `press`, tabbing.
   - `force: true` and `dispatchEvent` are forbidden. They skip Playwright's actionability checks.
   - While a fix is pending, an idempotent pair may be retried with `expect(async () => { … }).toPass()`. Never wrap a submit, create or delete in `toPass`.

8. **Sanity checks.**
   - wl-bill-splitter's `ExpenseFormPage.sanityCheck()` is the pattern: it asserts the form is still open before each step.
   - A check that fails catches the assertion error and rethrows one that says what the page showed, with the current URL when it matters.

9. **Stub at the network.**
   - Replace the API at the request boundary, with Mock Service Worker handlers or Playwright's `page.route`.
   - Register stubs before navigation.

10. **Flaky is failing.**
    - Run with `retries: 0`.
    - After a timing fix, run with `--repeat-each=20` and report the count that passed.

*Generated from `npomfret/agent-standards`. Edit the standard there, not this copy.*
