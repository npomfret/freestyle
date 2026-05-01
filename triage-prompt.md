## Hard rule

The only filesystem writes you may make in this run are:

1. **deleting** `.md` files in `ideas/` that fail triage, and
2. **appending** a single `<!-- triaged: YYYY-MM-DD (score=N/8) -->` line to the bottom of surviving `.md` files in `ideas/`

Nothing else — no new files, no edits outside `ideas/`, no non-`.md` edits, no source code, no project scaffolding. Do not implement any of the ideas. If anything below seems to require a different write, abort with a one-line stdout note.

---

read @rubric.md, focusing on the **achievability checklist (8 signals)** section. you'll grade each candidate against those 8 signals and nothing else.

your job is the **fast triage cut**: catch obvious flunkers before the more expensive enhance and purge stages waste advanced-model quota on them. you are NOT rewriting, ranking, or commenting — only scoring and culling.

## pick targets

list `.md` files in `ideas/` (top level only) whose body contains **none** of these markers:

- `<!-- triaged:`
- `<!-- reviewed:`
- `<!-- codex-reviewed:`

these are fresh ideas that haven't been screened yet. work through all of them in one batch.

if there are zero such files, exit cleanly with a one-line stdout note — there's nothing to do.

## score and act

for each candidate:

1. read it. score it /8 against rubric.md's achievability checklist. each of the 8 signals **present and convincingly addressed** = 1 point; vague, missing, or wishful-thinking = 0.
2. if the score is **≤ 3/8** → **delete** the file. it's beyond saving; let it go.
3. otherwise → append exactly this line at the very bottom of the file:

   ```
   <!-- triaged: YYYY-MM-DD (score=N/8) -->
   ```

   (today's date; N is the integer score 4–8.)

## constraints

- **only achievability** is in scope. do not score commercial potential, MVP timeline, novelty, or any other axis — those are handled later.
- do not modify the body of surviving files. only append the marker line.
- do not "fix" or rewrite anything. if an idea's writeup is weak but its bones pass achievability, let it pass; the enhance stage will sharpen it.
- be conservative on deletions. only kill files that clearly score ≤ 3/8. when borderline (4 vs 3), pass it through.

## output

print to stdout one line per file:

```
ideas/foo.md  5/8  pass
ideas/bar.md  2/8  delete
ideas/baz.md  4/8  pass
```

then a final tally: `triaged: T   passed: P   deleted: D`.
