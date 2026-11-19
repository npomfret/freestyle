#!/usr/bin/env python3
"""PostToolUse hook: send a session to the browser-testing skill the first time it touches a browser test.

The same shape as web-factoring's nudge, and for the same measured reason: a
skill description loads reliably when the request is plainly about the thing,
and not when the work reaches it partway through (2026-09-12, fantasy-football).
A request to fix a bug and "add a test for it" reaches a Playwright spec only at
the end, after the session has stopped thinking about which skills apply.

A file is a browser test when it imports a browser driver: Playwright's test
runner, Playwright's component testing, or Vitest browser mode. That covers
specs and page objects alike, and it is read from the file rather than guessed
from its name, because `*.test.ts` is just as often a pure-logic unit test, and
page objects carry no naming convention across the fleet. A playwright.config is
a browser test file too: it is where retries and timeouts are set.

It says so once per context. A marker per session remembers that it spoke;
compaction drops the context, so SessionStart with source `compact` clears the
marker (`--forget`). It stays silent when the transcript already shows the skill
loaded.
"""
import json
import pathlib
import re
import sys
import tempfile

SCRIPT_SUFFIXES = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}
SKIPPED = {"node_modules", "dist", "build"}
DRIVER = re.compile(r"""['"](@playwright/test|@playwright/experimental-ct-[\w-]+|@vitest/browser[\w/-]*|vitest/browser)['"]""")
CONFIG = re.compile(r"^playwright(-ct)?\.config\.")
LOADED = re.compile(r'"skill"\s*:\s*"(browser-testing:)?browser-testing"')

NUDGE = """\
You are working on a browser test, and this project follows the browser testing \
standard. If you have not loaded it in this session, load it now with the Skill \
tool (`browser-testing:browser-testing`) before writing or changing any test, \
page object or test config. In short: tests never touch the page - finding, \
clicking, filling, reading or asserting on an element happens only in a page \
object; elements are found the way a person finds them, narrowing from a \
heading, label or title into its section, never by HTML attributes, and each \
locator matches exactly one element - never first(), last() or nth(); no change \
is instant, so every check polls with a retrying assertion and never sleeps; \
every page-object action waits for its own effect and returns the page object \
for where the user lands, so a test never constructs one with `new`; never \
force a click or \
retry a side effect; page objects are full of sanity checks so a failure names \
its real cause; a flaky test is a failing test."""


def marker(event):
    key = event.get("session_id") or "unknown"
    if event.get("agent_id"):
        key += "-" + event["agent_id"]
    return pathlib.Path(tempfile.gettempdir()) / "browser-testing" / key


def browser_test(path):
    path = pathlib.Path(path)
    if SKIPPED.intersection(path.parts) or path.suffix not in SCRIPT_SUFFIXES:
        return False
    if CONFIG.match(path.name):
        return True
    try:
        return bool(DRIVER.search(path.read_text(errors="ignore")))
    except OSError:
        return False


def skill_loaded(transcript):
    try:
        with open(transcript, errors="ignore") as f:
            return any(LOADED.search(line) for line in f)
    except (OSError, TypeError):
        return False


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return
    spoken = marker(event)
    if "--forget" in sys.argv:
        spoken.unlink(missing_ok=True)
        return
    path = (event.get("tool_input") or {}).get("file_path")
    if not path or spoken.exists() or not browser_test(path):
        return
    spoken.parent.mkdir(parents=True, exist_ok=True)
    spoken.touch()
    if skill_loaded(event.get("transcript_path")):
        return
    print(json.dumps({
        "hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": NUDGE}
    }))


if __name__ == "__main__":
    main()
