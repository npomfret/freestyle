## Hard rule

The only filesystem writes you may make in this run are:

1. **deleting** `.md` files in `ideas/1-raw/` that fail triage, and
2. **moving** surviving `.md` files from `ideas/1-raw/` to `ideas/2-triaged/` (filename unchanged).

Nothing else — no new files, no edits to file contents, no edits outside `ideas/1-raw/` and `ideas/2-triaged/`, no non-`.md` edits, no source code, no project scaffolding. Do not implement any of the ideas. If anything below seems to require a different write, abort with a one-line stdout note.

---

**paths**: depending on how you were invoked, your working directory is either the repo root (then targets are `./ideas/1-raw/` and `./ideas/2-triaged/`, the rubric is `./rubric.md`) or the `ideas/` directory itself (then targets are `1-raw/` and `2-triaged/`, the rubric is `../rubric.md`). figure out which and use the right paths consistently.

read `rubric.md`, focusing on the **achievability checklist (8 signals)** section. you'll grade each candidate against those 8 signals and nothing else.

your job is the **fast triage cut**: catch obvious flunkers before the more expensive enhance and purge stages waste advanced-model quota on them. you are NOT rewriting, ranking, or commenting — only scoring and culling.

## pick targets

list every `.md` file in `ideas/1-raw/` (top level only). these are fresh ideas straight from the generator, awaiting triage. work through all of them in one batch.

if `ideas/1-raw/` is empty, exit cleanly with a one-line stdout note — there's nothing to do.

## score and act

for each candidate:

1. read it. score it /8 against rubric.md's achievability checklist. each of the 8 signals **present and convincingly addressed** = 1 point; vague, missing, or wishful-thinking = 0.
2. if the score is **≤ 3/8** → **delete** the file from `ideas/1-raw/`. it's beyond saving; let it go.
3. otherwise → **move** the file from `ideas/1-raw/` to `ideas/2-triaged/`, filename unchanged. do not edit the file's contents.

## constraints

- **only achievability** is in scope. do not score commercial potential, MVP timeline, novelty, or any other axis — those are handled later.
- do not modify the body of surviving files. only `mv` them to the next subdir.
- do not "fix" or rewrite anything. if an idea's writeup is weak but its bones pass achievability, let it pass; the enhance stage will sharpen it.
- be conservative on deletions. only kill files that clearly score ≤ 3/8. when borderline (4 vs 3), pass it through.

## output

print to stdout one line per file:

```
ideas/1-raw/foo.md  5/8  → 2-triaged/
ideas/1-raw/bar.md  2/8  delete
ideas/1-raw/baz.md  4/8  → 2-triaged/
```

then a final tally: `triaged: T   passed: P   deleted: D`.
