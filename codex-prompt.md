read @README.md so you understand the catalog CLI (`npm run search`) — that's how you query the dataset/API catalog. it talks to the deployed API by default, no local setup needed.

your job is to **review and enhance one business idea** in the local `ideas/` directory. you're a second pair of eyes after the cheap-model author wrote it. assume the writeup is plausible but probably has weak spots.

## pick a target

list `ideas/*.md`. pick the **first file** whose body does not contain the marker `<!-- codex-reviewed:`. if every file is already marked, exit cleanly with a one-line note — there's nothing to do.

work on **exactly one** file per invocation. don't touch any others.

## what "good" looks like

we're optimising for **achievable** ideas (a small team can ship and sell something a real user pays for in 4–12 weeks on free public data, with self-driving distribution) over **grand** ones (TAM-rich vision, sales motion, multi-stakeholder coordination, brand-new buyer category, regulatory blocker).

reward:
- **boring + specific**: invoice reconciliation for a niche trade, lookup tables for a small profession, scheduling for an obscure industry. weak competition, identifiable buyers, clear willingness-to-pay.
- **self-driving growth**: programmatic SEO (one page per slug/ticker/error code), marketplace-native distribution (Chrome Web Store, Shopify app store, GitHub Marketplace, npm), API-as-product where developers self-onboard from docs, embed/share loops, freemium top-of-funnel.
- **wedge shape**: small concrete v1, but a clear roadmap of follow-on features / customer segments / premium tiers if the wedge lands.
- **pure data leverage**: novel datasets, hybrid/derived datasets, state-of-the-art knowledge bases.

penalise:
- "platform" / "ecosystem" / "all-in-one suite" language without a concrete v1 feature
- two-sided / network-effects products (cold-start on both sides)
- requires sales calls, BDRs, RFPs, partnerships, or hand-holding onboarding
- requires training a custom ML model on data that needs GPU clusters or massive labelled corpora (small fine-tunes are fine)
- already has a free, widely-used incumbent doing most of what's proposed — "slightly better" is not a wedge against a free incumbent
- the headline dataset / API is **stale or unmaintained**: last update years ago, dormant repo, dead maintainers, deprecated endpoints, docs that haven't moved in 3+ years. a stale data source is a hidden time-bomb.
- **at risk of being completely replaceable by a state-of-the-art LLM** (i.e. the "product" is something a user could ask ChatGPT directly and get a comparable answer for free)

## research checklist (be light, focused)

do **not** burn a long session on this. one or two of each at most.

1. **catalog cross-check**: `npm run search -- search "<keywords>"` — spot stronger / replacement resources the original author missed. if a clearly better dataset or API exists in the catalog, swap it in or add it as a complement.
2. **dataset / API liveness**: one web search or fetch of the headline data source's docs / repo. confirm it's still alive, free tier still meaningful for a paying customer (not just the demo), commercial-use licence. if it's gone paid-only above the budget, dormant, or non-commercial, **say so explicitly** in the writeup and propose a maintained alternative — or downgrade the idea's confidence.
3. **competition sweep**: one web search for the wedge phrase. if a free OSS or built-in OS / browser feature already owns the niche, name it explicitly in the writeup and explain the wedge against it (specific niche, lower friction, distribution advantage), or say there isn't one.

the catalog CLI is read-only. **do not** run `npm run server`, `npm run db:tunnel`, `discover`, `repair`, `validity-check`, `add-url`, `embed`, or any DB-mutating script. do not read or write `.env` files.

## edits to make to the file

edit the file in place — keep it as a single coherent writeup, not a sea of "review notes" sections. rewrite weak parts; don't just append commentary.

specifically:
- **sharpen the first 10 customers**: replace "SMBs" / "marketers" / "developers" with named channels — specific subreddit, Shopify category, conference attendee list, MSP partner network, GitHub topic, niche community.
- **sharpen the comparable**: name an existing paid product or category that proves willingness-to-pay. if there isn't one, flag the idea is inventing a new budget line.
- **sharpen the v1**: one concrete feature, not a platform. cut scope creep.
- **sharpen the distribution**: name the existing surface (app store, registry, integration) the product rides on. if customer acquisition needs cold outreach or content marketing from scratch, say so honestly.
- **sharpen the follow-on roadmap**: 2–4 concrete adjacent features / segments / tiers that come after the wedge lands. shows the mountain behind the wedge.
- **flag fatal issues openly**: if your research found a dead dataset, a free incumbent, a regulatory blocker, or an LLM-replaceability risk, write a `## Risks` section that names it directly. don't paper over.
- **fix the dataset/API links if they're wrong or dead** — replace with maintained alternatives where you can.

if the idea is fundamentally broken (dead dataset with no alternative, free incumbent owning the entire niche, requires data the team can't get) — **don't pretend to fix it**. write a short `## Verdict` section saying so plainly. the next purge run will catch it.

do **not**:
- delete the file
- create new files
- merge multiple files
- edit other files in `ideas/`
- write code

## marker

at the very bottom of the file, append a single line:

```
<!-- codex-reviewed: YYYY-MM-DD -->
```

(today's date.) this is how the loop knows the file has been reviewed and won't pick it again.

print a short summary to stdout: the filename you reviewed, the main change you made, and any fatal issue you flagged.
