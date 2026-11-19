#!/usr/bin/env python3
"""PostToolUse hook: send a session to the web-factoring skill the first time it touches browser code.

The skill's description is enough when the request is plainly UI work: measured on
a React web app, ten headless sessions given one loaded the skill before editing,
with or without this hook. It is not enough when the work reaches the browser
partway through: asked to add a field to the API and then show it on the page, one
session in five loaded the skill before its first web edit, and with this hook
five in five did (2026-09-12). So the first time a session reads or writes browser
code, this names the skill. It does not paste the standard: an additionalContext
of 11.5 KB was not shown inline but saved to a file behind a preview, and only
read because the prompt asked for it.

It says so once per context. A marker per session remembers that it spoke;
compaction drops the context, so SessionStart with source `compact` clears the
marker (`--forget`). It stays silent when the transcript already shows the skill
loaded, or when the file is not browser code.
"""
import json
import os
import pathlib
import re
import sys
import tempfile

UI_SUFFIXES = {".tsx", ".jsx", ".vue", ".svelte", ".astro", ".css", ".scss", ".sass", ".less"}
SCRIPT_SUFFIXES = {".ts", ".mts", ".js", ".mjs"}
UI_FRAMEWORKS = ("react", "preact", "vue", "svelte", "solid-js", "lit", "next", "astro", "@angular/core")
SKIPPED = {"node_modules", "dist", "build"}
LOADED = re.compile(r'"skill"\s*:\s*"(web-factoring:)?web-factoring"')

NUDGE = """\
You are working on browser code, and this project follows the web factoring \
standard. If you have not loaded it in this session, load it now with the Skill \
tool (`web-factoring:web-factoring`) before writing or changing any component, \
stylesheet, hook, store, client module, on-screen text or test. In short: search \
for the existing implementation before writing; design values, primitives and \
application concepts each have one shared home; no plain logic in templates; all \
on-screen text comes from the message catalogue; test in a real browser, finding \
elements by what the user sees."""


def marker(event):
    key = event.get("session_id") or "unknown"
    if event.get("agent_id"):
        key += "-" + event["agent_id"]
    return pathlib.Path(tempfile.gettempdir()) / "web-factoring" / key


def declares_ui(package_json):
    try:
        manifest = json.loads(package_json.read_text())
    except (OSError, ValueError):
        return False
    declared = {}
    for field in ("dependencies", "devDependencies", "peerDependencies"):
        declared.update(manifest.get(field) or {})
    return any(name in declared for name in UI_FRAMEWORKS)


def browser_code(path, root):
    path = pathlib.Path(path)
    try:
        inside = path.resolve().relative_to(pathlib.Path(root).resolve())
    except ValueError:
        return False
    if SKIPPED.intersection(inside.parts):
        return False
    if path.suffix in UI_SUFFIXES:
        return True
    if path.suffix not in SCRIPT_SUFFIXES:
        return False
    for folder in path.resolve().parents:
        if (folder / "package.json").is_file():
            return declares_ui(folder / "package.json")
        if folder == pathlib.Path(root).resolve():
            return False
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
    root = os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd()
    path = (event.get("tool_input") or {}).get("file_path")
    if not path or spoken.exists() or not browser_code(path, root):
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
