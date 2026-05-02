## Hard rule

The **only** filesystem writes you may make are: deleting `.md` files in `ideas/3-reviewed/`, and appending a single `## Merged Scope (from <other-file.md>)` section to a surviving `.md` in `ideas/3-reviewed/` when consolidating duplicates. Nothing else — no new files, no writes to `ideas/1-raw/` or `ideas/2-triaged/`, no edits outside `ideas/3-reviewed/`, no non-`.md` edits, no source code, no project scaffolding. **Do not write any marker comments.** Do not implement any of the ideas. If anything below seems to require a different write, abort with a one-line stdout note.

---

**paths**: depending on how you were invoked, your working directory is either the repo root (then the target is `./ideas/3-reviewed/` and the rubric is `./rubric.md`) or the `ideas/` directory itself (then the target is `3-reviewed/` and the rubric is `../rubric.md`). figure out which and use the right paths consistently.

read `rubric.md` first. it defines what makes an idea good vs bad. this prompt builds on it.

## scope

read every `.md` file in `ideas/3-reviewed/` and grade it. ignore `ideas/1-raw/` and `ideas/2-triaged/` — those files are mid-pipeline and not yet ready for the full bar. there is no per-file "already purged" memory — every purge run re-evaluates every reviewed idea. that's deliberate: ideas the previous run let through under a looser bar should fall to today's bar; ideas neighbouring a stronger newcomer should be re-judged in that context.

if `ideas/3-reviewed/` is empty, exit cleanly with a one-line note.

## grade each idea on these 7 axes (/10 each, /70 total)

- commercial potential (market size, competition, potential scale etc)
- ease of implementation, ease of mvp
- very low budget — do they leverage free or extremely low cost datasets and apis?
- revenue sources (ads, subscriptions, pay-per-use etc)
- is there a clear go-to-market strategy — weight automated-acquisition signals heavily (see `rubric.md` self-driving growth section)
- can a MVP be built in a reasonable timescale?
- realistic chances of success — score this against the **achievability checklist** in `rubric.md`, not vibes

## adversarial pass (every idea)

before you decide on each idea, write the **single strongest one-sentence kill objection** a sceptical investor would raise. examples:

- "Cloudflare already does this for free"
- "the free tier rate-limits below what one paying customer would consume"
- "the named buyer doesn't have a budget line for this and won't create one"
- "the dataset's licence forbids commercial redistribution and the product *is* the data"

then assign **exactly one** of these three verdicts — no other phrasings, no in-between language like "barely answered" or "acknowledged":

- **answered well** — the writeup explicitly addresses the objection with a concrete mechanism, named differentiator, or specific numbers. no penalty.
- **acknowledged but weakly answered** — the writeup mentions the issue but the response is hand-wavy, generic, or aspirational. subtract 6 from the 7-axis total.
- **not addressed at all** — the writeup does not mention the issue, or the objection is fundamentally unanswerable (e.g. the cited dataset's licence forbids the product). subtract 12, or fatal-drop if unanswerable.

apply the penalty to the 7-axis total **before** deciding pass/fail. the score you print to stdout is the **post-penalty** score.

print the kill objection and verdict to stdout per idea.

## quality bar (delete if any of these fails)

an idea is **deleted** if **any** of these are true:

- achievability ≤ 5/8 (the `rubric.md` checklist), OR
- 7-axis total **after adversarial penalty** < 45/70, OR
- the adversarial verdict is anything other than **answered well** (i.e. "acknowledged but weakly answered" or "not addressed at all" → delete; the penalty alone isn't enough to save it), OR
- the adversarial pass produced a fatal-drop

be ruthless. a "good" idea has a high achievability score, clears the 45/70 bar, AND survives its strongest objection cleanly. mediocre ideas with weakly-answered objections do not pass — there are always more candidates being generated.

surviving ideas are **left untouched** — do not edit them, do not append a marker, do not write a comment. the file content stays exactly as it was.

**there is no quota.** keep all surviving ideas, however many. if 60 ideas survive the bar, leave 60. do not pad and do not over-cull.

## light additional research (borderlines only)

don't waste compute on obvious passes or obvious deletes. concentrate research on borderline ideas (within ±5 of the 45/70 cutoff).

- **verify the headline dataset / API** with one fetch of its docs URL — still alive, free tier still meaningful, the licence permits commercial use, **and the source is actively maintained** (see `rubric.md` staleness discount).
- **competition sweep** with one web search for the wedge name. if a free OSS tool or built-in OS / browser feature already owns the niche, downgrade (see `rubric.md` cheap-incumbent disqualifier).
- **catalog cross-check** with `npm run search -- search "<keywords>"` (or `npm --prefix .. run search -- search "<keywords>"` if your working directory is `ideas/`) to spot stronger or replacement resources the original author missed.

## merge near-duplicates

if two ideas describe substantially the same product, merge: pick the stronger writeup as the survivor, copy in the weaker one's best points, delete the absorbed file, and add a short `## Merged Scope (from <other-file.md>)` appendix to the survivor. both files must be in `ideas/3-reviewed/` — never reach into `1-raw/` or `2-triaged/`. that appendix is the only edit allowed to a surviving file.

## output

for each idea print one line:

```
ideas/3-reviewed/foo.md  43/70  (achievability 6/8)  pass
ideas/3-reviewed/bar.md  28/70  (achievability 3/8)  delete
ideas/3-reviewed/baz.md  37/70  (achievability 5/8)  merged into ideas/3-reviewed/quux.md
```

then a final tally: `vetted: V   passed: P   deleted: D   merged: M`.
