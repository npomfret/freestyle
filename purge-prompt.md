read the business ideas in the local ideas directory

your job is to leave **at most 20** *achievable* ideas behind — fewer if quality is thin. don't pad to 20 just because the slot exists.

the discriminator is **achievable** vs **grand**:

- **achievable** = a solo dev or 2-person team can ship and sell something a real user pays for in 4–12 weeks, on free public data, via an existing distribution surface.
- **grand** = TAM-rich vision, multi-stakeholder coordination, brand-new buyer category, regulatory blocker, two-sided cold-start, or anything that needs sales / procurement / partnerships to launch.

if there are very similar and/or overlapping ideas: merge, combine and remove duplication. the absorbed file gets deleted; the survivor gets a short `## Merged Scope (from <other-file.md>)` appendix. that appendix is the **only** permitted edit to surviving idea files.

## grade each idea on these 7 axes (/10 each, /70 total)

- commercial potential (market size, competition, potential scale etc)
- ease of implementation, ease of mvp
- very low budget — do they leverage free or extremely low cost datasets and apis?
- revenue sources (ads, subscriptions, pay-per-use etc)
- is there a clear go-to-market strategy
- can a MVP be built in a reasonable timescale?
- realistic chances of success — score this against the **achievability checklist** below, not vibes

## achievability checklist (drives axis 7; also a hard filter)

each signal present and convincingly addressed in the writeup = 1 point. vague or missing = 0. total /8.

1. a solo dev or 2-person team can ship a saleable v1 in 4–12 weeks
2. the MVP is **one concrete feature**, not a platform / ecosystem / marketplace
3. the first 10 customers are nameable today (specific subreddit, Shopify category, conference attendee list, MSP partner network — not "SMBs", "marketers", "developers")
4. free public APIs / data tiers are sufficient for the first **paying** tier, not just the demo
5. an existing paid product or category proves willingness-to-pay — the idea isn't inventing a new budget line
6. the product delivers value to a single user with no other users present (no two-sided cold-start)
7. no regulatory / compliance / certification / mass data-labelling blocker before the first dollar
8. distribution rides on an existing surface (Shopify app store, Chrome Web Store, GitHub Action, npm, MSP partner, niche community), not a new audience to build

**hard filter**: any idea scoring ≤ 4/8 is a strong deletion candidate regardless of how it scores elsewhere. a high commercial-potential score does not rescue an idea that can't pass achievability.

## grand-vision detector — auto-downgrade signals

downgrade hard for any of these:

- pitch language signalling scope creep: "platform", "ecosystem", "OS for X", "marketplace", "operating system for Y", "all-in-one suite"
- two-sided / network-effects product (both supply and demand have to be unlocked cold)
- multi-stakeholder coordination required to launch ("we partner with X, Y, Z, then…")
- replaces an entrenched incumbent head-on rather than carving a sub-niche
- brand-new buyer category — nothing comparable is paid for today
- requires data-licensing deals to function (the data isn't free or self-serve)
- sales motion required (BDRs, enterprise procurement, RFPs, custom contracts)
- built around training a custom ML model on data the team can't acquire cheaply

## small-dataset constraint

penalise ideas whose viability depends on training models on **large datasets**. we have the skills to build custom models but the budget only stretches to training on relatively small datasets — anything that needs GPU clusters, massive labelled corpora, or foundation-model-scale training is out. fine-tuning small open-source models or training compact bespoke models on a few thousand examples is fine.

## light additional research (borderlines only, #15–#30)

don't waste compute on obvious top-tier or obvious bottom-tier ideas. concentrate the extra checks on the borderline middle.

- **verify the headline dataset / API** with one `web_fetch` of its docs URL — still alive, free tier still meaningful, and the licence permits commercial use. if a key dataset has gone paid-only above the budget or is non-commercial, downgrade aggressively.
- **competition sweep** with one `google_web_search` for the wedge name. if a free OSS tool or built-in OS / browser feature already owns the niche, downgrade.
- **catalog cross-check** with `npm run search -- search "<keywords>"` to spot stronger or replacement resources the original author missed.

the catalog CLI is read-only. **do not** run `npm run server`, `npm run db:tunnel`, `discover`, `repair`, `validity-check`, `add-url`, `embed`, or any DB-mutating script. do not read or write `.env` files.

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

## constraints

- do **not** write a `RANKINGS.md` or any aggregate report file. print the ranking and reasoning to stdout for the run log; do not persist it to the repo.
- do **not** modify the surviving idea files except to add a `## Merged Scope` appendix when consolidating duplicates.
- do **not** touch any subdirectories.
- do **not** create any files outside `ideas/`.
- do **not** write any code.
- if the directory already has ≤ 20 files when you start, exit cleanly with a brief note — no deletions needed.
