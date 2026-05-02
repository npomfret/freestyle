## Hard rule

The **only** filesystem writes you may make are: deleting `.md` files in the ideas directory, and either appending a `<!-- purged: YYYY-MM-DD (score=N/70) -->` marker line at the bottom of a surviving `.md` or appending a single `## Merged Scope (from <other-file.md>)` section when consolidating duplicates. Nothing else — no new files (no `RANKINGS.md`), no edits outside the ideas directory, no non-`.md` edits, no source code, no project scaffolding. Do not implement any of the ideas. If anything below seems to require a different write, abort with a one-line stdout note.

---

**paths**: depending on how you were invoked, your working directory is either the repo root (then ideas live in `./ideas/` and the rubric is `./rubric.md`) or the `ideas/` directory itself (then the rubric is `../rubric.md`). figure out which and use the right paths consistently.

read `rubric.md` first. it defines what makes an idea good vs bad. this prompt builds on it.

## scope

look at every `.md` file in the ideas directory.

your job is to **vet the unpurged ideas** — those whose body does NOT contain a `<!-- purged:` marker. surviving ideas get the marker added so future purge runs skip them.

**do not** re-grade ideas that already have a `<!-- purged:` marker. they've been vetted. (the only time you may touch a purged file is to append a `## Merged Scope` appendix when absorbing a duplicate fresh idea into it.)

if there are zero unpurged ideas, exit cleanly with a one-line note.

## grade each unpurged idea on these 7 axes (/10 each, /70 total)

- commercial potential (market size, competition, potential scale etc)
- ease of implementation, ease of mvp
- very low budget — do they leverage free or extremely low cost datasets and apis?
- revenue sources (ads, subscriptions, pay-per-use etc)
- is there a clear go-to-market strategy — weight automated-acquisition signals heavily (see `rubric.md` self-driving growth section)
- can a MVP be built in a reasonable timescale?
- realistic chances of success — score this against the **achievability checklist** in `rubric.md`, not vibes

## adversarial pass (every unpurged idea)

before you decide on each unpurged idea, write the **single strongest one-sentence kill objection** a sceptical investor would raise. examples:

- "Cloudflare already does this for free"
- "the free tier rate-limits below what one paying customer would consume"
- "the named buyer doesn't have a budget line for this and won't create one"
- "the dataset's licence forbids commercial redistribution and the product *is* the data"

then judge how well the writeup addresses it:

- **answered well** — no penalty
- **acknowledged but weakly answered** — subtract 6 from the total
- **not addressed at all** — subtract 12, or fatal-drop if the objection is unanswerable

print the kill objection and verdict to stdout per idea.

## quality bar (delete if any of these fails)

an unpurged idea is **deleted** if:

- achievability ≤ 4/8 (the `rubric.md` checklist), OR
- 7-axis total (after adversarial penalty) < 35/70, OR
- the adversarial pass produced a fatal-drop

otherwise the idea **survives**: append a single line at the bottom of the file:

```
<!-- purged: YYYY-MM-DD (score=N/70) -->
```

(today's date; N is the integer 7-axis total after any adversarial penalty.)

**there is no quota.** keep all surviving ideas, however many. if 60 ideas survive the bar, leave 60. do not pad and do not over-cull.

## light additional research (borderlines only)

don't waste compute on obvious passes or obvious deletes. concentrate research on borderline ideas (within ±5 of the 35/70 cutoff).

- **verify the headline dataset / API** with one fetch of its docs URL — still alive, free tier still meaningful, the licence permits commercial use, **and the source is actively maintained** (see `rubric.md` staleness discount).
- **competition sweep** with one web search for the wedge name. if a free OSS tool or built-in OS / browser feature already owns the niche, downgrade (see `rubric.md` cheap-incumbent disqualifier).
- **catalog cross-check** with `npm run search -- search "<keywords>"` (or `npm --prefix .. run search -- search "<keywords>"` if your working directory is `ideas/`) to spot stronger or replacement resources the original author missed.

## merge near-duplicates

if an unpurged idea describes substantially the same product as another idea (purged or unpurged), merge: pick the stronger writeup as the survivor, copy in the weaker one's best points, delete the absorbed file, and add a short `## Merged Scope (from <other-file.md>)` appendix to the survivor. if the survivor is already purged, that appendix is the **only** edit allowed to it (don't re-grade or re-mark it).

## output

for each unpurged idea print one line:

```
ideas/foo.md  43/70  (achievability 6/8)  pass
ideas/bar.md  28/70  (achievability 3/8)  delete
ideas/baz.md  37/70  (achievability 5/8)  merged into ideas/quux.md
```

then a final tally: `vetted: V   passed: P   deleted: D   merged: M`.
