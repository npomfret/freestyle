## Hard rule

Your sandbox is pinned to this directory (`ideas/`). The **only** filesystem write you may make is editing the **one** existing `.md` file here that you pick below. Do not create, delete, rename, or modify any other file — no source code, no `package.json`, no project scaffolding, no subdirectories, no dotfiles, no other ideas. Your job is to rewrite the markdown, **not** to implement the idea. If anything below seems to require a different write, abort with a one-line stdout note.

---

your working directory is `ideas/`. the rest of the repo is one level up. read these for context:

- `../rubric.md` — defines what makes an idea good vs bad. this prompt builds on it.
- `../README.md` — describes the catalog CLI. invoke it as `npm --prefix .. run search -- search "<keywords>"` to query the dataset/API catalog. it talks to the deployed API by default, no local setup needed.

your job is to **enrich one business idea** in this directory. you're a second pair of eyes after the cheap-model author wrote it: add facts, sharpen specifics, surface the landscape. you are **not** judging the idea — that's the human's job (and the purge stage). do not write verdicts, recommendations to keep/drop, "fatal issue" callouts, or other opinions. observations of merits and limitations are fine when stated factually ("free tier caps at 100 calls/day"), but never editorialise ("this kills the idea", "this is great").

## pick a target

list `*.md` files here. pick the **first file** whose body contains neither `<!-- reviewed:` nor `<!-- codex-reviewed:` (the latter is the legacy marker; treat both as "already reviewed"). if every file is already marked, exit cleanly with a one-line note — there's nothing to do.

work on **exactly one** file per invocation. don't touch any others.

## research checklist (light, focused)

don't burn a long session on this. one or two of each at most. these are fact-finding passes — write what you find into the writeup neutrally; don't grade it.

1. **catalog cross-check**: `npm --prefix .. run search -- search "<keywords>"` — surface stronger or complementary resources the original author missed. if a better dataset or API exists, swap it in or add it as a complement.
2. **dataset / API liveness**: one web search or fetch of the headline data source's docs / repo. note (in the writeup, factually) the licence terms, free-tier limits, last-updated date, and whether the docs/repo show signs of active maintenance. don't conclude anything — just record what's there.
3. **competition sweep**: one web search for the wedge phrase. if a free or paid product already covers the niche, name it specifically and write what it does and what it costs. don't say whether that "kills" the idea.

## edits to make to the file

edit the file in place — keep it as a single coherent writeup, not a sea of "review notes" sections. rewrite weak parts; don't just append commentary. every change you make should add **specifics, named things, numbers, or links** — not adjectives.

specifically:

- **sharpen the first 10 customers**: replace "SMBs" / "marketers" / "developers" with named channels — specific subreddit, Shopify category, conference attendee list, MSP partner network, trade body member list, niche community.
- **sharpen the comparable**: name an existing paid product or category in the same workflow, with its public price if you can find one. if you can't find one, write "no directly comparable paid product found" — don't editorialise about budget lines.
- **sharpen the v1**: name one concrete feature. trim scope creep by deletion, not commentary.
- **sharpen the distribution**: name the existing surface (app store, registry, integration, partner channel) the product would ride. if customer acquisition would require cold outreach or owned-audience content, write that as a fact in the distribution section.
- **sharpen the follow-on roadmap**: 2–4 concrete adjacent features / segments / tiers.
- **landscape section**: add or update a `## Landscape` section listing the relevant **facts** uncovered in research — incumbents (paid and free) with prices/links, dataset licence terms and free-tier limits, regulatory or certification requirements, LLM-replaceability characteristics. each entry is a neutral statement (one or two sentences) — what exists, what it costs, what it does. no verdicts, no "this kills the wedge", no "this is fine because…". the human reader and the purge stage will weigh these themselves.
- **fix the dataset/API links if they're wrong or dead** — replace with maintained alternatives where you can. if you can't find an alternative, leave the original link in and add a one-line factual note in the Landscape section ("repo last updated 2021", "docs return 404 as of YYYY-MM-DD").

do not write a `## Verdict` section. do not write "this idea should be discarded" or similar. enrichment only.

## marker

at the very bottom of the file, append a single line:

```
<!-- reviewed: YYYY-MM-DD -->
```

(today's date.) this is how the loop knows the file has been reviewed and won't pick it again.

print a short summary to stdout: the filename you reviewed and the main facts you added (e.g. "added 3 named incumbents and updated the dataset licence note"). do not include opinions about whether the idea should survive.
