## Hard rule

The **only** filesystem writes you may make are: deleting `.md` files in `ideas/`, and appending a single `## Merged Scope (from <other-file.md>)` section to a surviving `.md` in `ideas/` when consolidating duplicates. Nothing else — no new files (no `RANKINGS.md`), no edits outside `ideas/`, no non-`.md` edits, no source code, no project scaffolding. Do not implement any of the ideas. If anything below seems to require a different write, abort with a one-line stdout note.

---

read @rubric.md first. it defines what makes an idea good vs bad. this prompt builds on it.

read all the business ideas in the local `ideas/` directory.

your job is to leave **at most 20** *achievable* ideas behind — fewer if quality is thin. don't pad to 20 just because the slot exists.

if there are very similar and/or overlapping ideas: merge, combine and remove duplication. the absorbed file gets deleted; the survivor gets a short `## Merged Scope (from <other-file.md>)` appendix. that appendix is the **only** permitted edit to surviving idea files.

## grade each idea on these 7 axes (/10 each, /70 total)

- commercial potential (market size, competition, potential scale etc)
- ease of implementation, ease of mvp
- very low budget — do they leverage free or extremely low cost datasets and apis?
- revenue sources (ads, subscriptions, pay-per-use etc)
- is there a clear go-to-market strategy — weight automated-acquisition signals heavily (see `rubric.md` self-driving growth section)
- can a MVP be built in a reasonable timescale?
- realistic chances of success — score this against the **achievability checklist** in `rubric.md`, not vibes

**hard filter**: any idea scoring ≤ 4/8 on the achievability checklist is a strong deletion candidate regardless of how it scores elsewhere. a high commercial-potential score does not rescue an idea that can't pass achievability.

## light additional research (borderlines only, #15–#30)

don't waste compute on obvious top-tier or obvious bottom-tier ideas. concentrate the extra checks on the borderline middle.

- **verify the headline dataset / API** with one `web_fetch` of its docs URL — still alive, free tier still meaningful, the licence permits commercial use, **and the source is actively maintained** (see `rubric.md` staleness discount).
- **competition sweep** with one `google_web_search` for the wedge name. if a free OSS tool or built-in OS / browser feature already owns the niche, downgrade (see `rubric.md` cheap-incumbent disqualifier).
- **catalog cross-check** with `npm run search -- search "<keywords>"` to spot stronger or replacement resources the original author missed.

## adversarial pass (top ~25 only)

after the first-pass grading, take the top ~25 candidates and run an adversarial pass. for each:

1. write the **single strongest one-sentence kill objection** — the line a sceptical investor would say to dismiss the idea in 10 seconds. examples:
   - "Cloudflare already does this for free"
   - "the free tier rate-limits below what one paying customer would consume"
   - "the named buyer doesn't have a budget line for this and won't create one"
   - "the dataset's licence forbids commercial redistribution and the product *is* the data"
2. judge how well the writeup already addresses the objection:
   - **answered well** — no score change
   - **acknowledged but weakly answered** — subtract 3 from the total
   - **not addressed at all** — subtract 6, or fatal-drop if the objection is unanswerable
3. print the kill objection and verdict to stdout per finalist.

this is the main quality gate. the achievability checklist catches obviously thin writeups; the adversarial pass catches plausible-looking writeups whose central premise doesn't survive contact with one good objection.

## cull

delete the lowest-scoring files until **at most 20** `*.md` files remain in `ideas/` (count files only, ignore subdirectories). **keep fewer than 20 if quality demands it** — if only 14 ideas survive the achievability + adversarial filter without a fatal kill objection, leave 14. do not promote weaker ideas just to fill the quota.

confirm the final count and print, for each survivor: rank, total score, achievability /8, grand-vision flags, kill-objection verdict.

if the directory already has ≤ 20 files when you start, exit cleanly with a brief note — no deletions needed.
