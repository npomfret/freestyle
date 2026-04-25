---
description: Use when editing CLAUDE.md, .claude rules, skills, commands, hooks, settings, or when a new approved project convention should be recorded.
paths:
  - CLAUDE.md
  - .claude/**
user-invocable: true
---

# Config Maintenance

Keep the Claude setup concise, discoverable, and layered.

Layering:

- `CLAUDE.md`: stable root operating contract and routing only.
- `.claude/rules/**`: standing rules that should load automatically or by path.
- `.claude/skills/**`: task-shaped workflows and scoped conventions.
- `.claude/references/**`: detail that supports skills.
- `.claude/commands/**`: manual workflows worth invoking by name.
- `.claude/hooks/**`: deterministic automation only.
- `.claude/settings*.json`: permissions and hook wiring.

Rules:

- Do not bloat `CLAUDE.md` with long playbooks or session notes.
- Every important file needs a routing path from root memory, path scope, skill metadata, or command description.
- Prefer one obvious skill per common task over overlapping skills.
- If Claude repeatedly misses a workflow, fix metadata/routing rather than telling the user to remember more.
- Keep commands repo-specific; remove stale commands from other projects.
