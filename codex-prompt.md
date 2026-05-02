## Hard rule

Your sandbox is pinned to this directory (`ideas/`). The **only** filesystem write you may make is editing the **one** existing `.md` file here that you pick below. Do not create, delete, rename, or modify any other file — no source code, no `package.json`, no project scaffolding, no subdirectories, no dotfiles, no other ideas. Your job is to rewrite the markdown, **not** to implement the idea. If anything below seems to require a different write, abort with a one-line stdout note.

---

your working directory is `ideas/`. the rest of the repo is one level up. read these for context:

- `../rubric.md` — defines what makes an idea good vs bad. this prompt builds on it.
- `../README.md` — describes the catalog CLI. invoke it as `npm --prefix .. run search -- search "<keywords>"` to query the dataset/API catalog. it talks to the deployed API by default, no local setup needed.

your job is to **review and enhance one business idea** in this directory. you're a second pair of eyes after the cheap-model author wrote it. assume the writeup is plausible but probably has weak spots.

## pick a target

list `*.md` files here. pick the **first file** whose body contains neither `<!-- reviewed:` nor `<!-- codex-reviewed:` (the latter is the legacy marker; treat both as "already reviewed"). if every file is already marked, exit cleanly with a one-line note — there's nothing to do.

work on **exactly one** file per invocation. don't touch any others.

## research checklist (light, focused)

don't burn a long session on this. one or two of each at most.

1. **catalog cross-check**: `npm --prefix .. run search -- search "<keywords>"` — spot stronger / replacement resources the original author missed. if a clearly better dataset or API exists in the catalog, swap it in or add it as a complement.
2. **dataset / API liveness**: one web search or fetch of the headline data source's docs / repo. confirm it's still alive, free tier still meaningful for a paying customer (not just the demo), commercial-use licence. apply the staleness discount from `rubric.md`.
3. **competition sweep**: one web search for the wedge phrase. if a free OSS or built-in OS / browser feature already owns the niche, name it explicitly in the writeup and explain the wedge against it (specific niche, lower friction, distribution advantage), or say there isn't one.

## edits to make to the file

edit the file in place — keep it as a single coherent writeup, not a sea of "review notes" sections. rewrite weak parts; don't just append commentary.

specifically:

- **sharpen the first 10 customers**: replace "SMBs" / "marketers" / "developers" with named channels — specific subreddit, Shopify category, conference attendee list, MSP partner network, GitHub topic, niche community.
- **sharpen the comparable**: name an existing paid product or category that proves willingness-to-pay. if there isn't one, flag the idea is inventing a new budget line.
- **sharpen the v1**: one concrete feature, not a platform. cut scope creep.
- **sharpen the distribution**: name the existing surface (app store, registry, integration) the product rides on. if customer acquisition needs cold outreach or content marketing from scratch, say so honestly.
- **sharpen the follow-on roadmap**: 2–4 concrete adjacent features / segments / tiers that come after the wedge lands. shows the mountain behind the wedge.
- **flag fatal issues openly**: if your research found a dead dataset, a free incumbent, a regulatory blocker, or an LLM-replaceability risk (see `rubric.md`), write a `## Risks` section that names it directly. don't paper over.
- **fix the dataset/API links if they're wrong or dead** — replace with maintained alternatives where you can.

if the idea is fundamentally broken (dead dataset with no alternative, free incumbent owning the entire niche, requires data the team can't get) — **don't pretend to fix it**. write a short `## Verdict` section saying so plainly. the next purge run will catch it.

## marker

at the very bottom of the file, append a single line:

```
<!-- reviewed: YYYY-MM-DD -->
```

(today's date.) this is how the loop knows the file has been reviewed and won't pick it again.

print a short summary to stdout: the filename you reviewed, the main change you made, and any fatal issue you flagged.
