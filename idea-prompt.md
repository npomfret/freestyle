## Hard rule

The **only** filesystem write you may make is creating one new `.md` file inside `ideas/1-raw/`. Do not modify, create, delete, or rename any other file — no source code, no `package.json`, no project scaffolding, no subdirectories, no dotfiles, no files in `ideas/2-triaged/` or `ideas/3-reviewed/`. Your job is to write the markdown, not implement the idea. If anything below seems to require a different write, abort with a one-line stdout note.

---

Read @rubric.md first — it defines what makes a Freestyle idea good vs bad and is the same bar the triage and purge stages will apply to your output. Read @README.md and make sure you understand how to use the cli to exercise our api.

## who you are selling to

We are highly technical with **few business skills** — no sales muscle, no marketing audience, no industry network. Our edge is software, data, and modelling. Reward **two** buyer archetypes equally — over time the pipeline should produce a healthy mix of both, not 90% archetype A:

**A. non-technical owners of revenue-generating businesses** — independent operators of small businesses (single-location restaurants, dental practices, plumbers, garages, kennels, breweries, opticians, picture framers, accountants, surveyors, MOT centres, fishing fleets, family wholesalers, agricultural operators, regional construction firms…). They already have revenue and a routine; they pay for tools when the payback is visible inside one quarter. The deal is simple: **"this saves you £X/month"** or **"this earns you £X/month more"**.

**B. technical buyers paying for high-leverage data, APIs, datasets, and compact models** they can't be bothered to assemble themselves — data teams, analytics engineers, quants, applied researchers, ML engineers, infra/ops/security engineers, indie devs integrating a domain-specific capability, analysts/journalists/policy users buying primary-source data. They buy on **per-call / per-row / per-seat unit economics**, capability unlock, freshness, accuracy, or coverage uplift over a named cheap incumbent — not on £/month savings narratives. Distribution rides docs, SEO, npm/PyPI/Hugging Face/RapidAPI, GitHub topics, niche dev communities — surfaces where buyers find products themselves.

Either archetype is welcome on any given idea — pick the one that fits the catalog seed best, don't force everything into archetype A. Every writeup must state the concrete value visible on the landing page in whichever form fits: £/month for A; per-call / per-row pricing with a named comparable, or measurable accuracy / coverage / freshness uplift, for B. "Better insights" or "improved workflow" with no quantifier kills the writeup either way.

Lean against generic developer-tooling that competes with free OSS, VC-backed startups, vague "SMBs" / "marketers", and consumers — see `rubric.md` "target buyer profiles" for the full reward/penalise lists. Note: **developer-buyers of niche data/API/model products are welcome under archetype B** — only generic dev-tooling is penalised.

## what kind of product

Software-only. It could be:

- a new dataset (or hybrid dataset) with commercial value, optionally combined with a small predictive model
- a state-of-the-art knowledge base leveraging existing datasets, with optional ML or LLM glue
- a B2B SaaS, micro-SaaS, web app, browser extension, Shopify app, or similar
- a mobile app where the buyer's workflow is mobile-first
- a pre-diligence / screening tool that finds red flags before the buyer pays for formal due diligence (see `rubric.md` "pre-diligence products")

Constraints:

- **boring beats novel**. Unsexy, well-defined problems with an identifiable buyer routinely beat flashy ideas with no one to sell to. See `rubric.md` "boring is good".
- **wedge-shaped**: small concrete v1 with a visible mountain of follow-on work behind it. See `rubric.md` "wedge shape".
- **must not be LLM-replaceable**: if the buyer could ask ChatGPT and get a comparable answer for free, the idea is dead. The defensible value lives in maintained data, integrations, distribution, or workflow.
- **data sources must be free or cheap and actively maintained** — apply the staleness discount in `rubric.md`.
- **undercutting existing paid incumbents is fine** — our costs are very low. But "slightly better than a free incumbent" is not a wedge; nobody switches for marginal gains.
- It can be a few days' work or several months' work; either is acceptable if the wedge is sharp.

## process

1. Pick 3 random items from the catalog via the CLI. Pick one that looks interesting **for one of the two buyer archetypes** above — pick whichever archetype the seed naturally fits. Do not default to archetype A. If the seed is a clean structured dataset, an API surface, a data feed, a regulatory filing source, a benchmark, or anything else where a technical buyer would self-onboard from docs, lean to archetype B. If the seed is a paper-based workflow, a regulated trade, or a sector-specific operational pain, lean to archetype A. Don't pick on technical novelty — pick on whether you can name a concrete buyer and a concrete unit of value.
2. Search the catalog for complementary sources, then do your own web research.
3. Sanity-check the headline dataset / API: still alive, free tier sufficient for a paying tier (not just a demo), commercial-use licence, actively maintained. Apply the staleness discount in `rubric.md`. If the headline source is dormant or licence-blocked, find a maintained alternative or discard.
4. Decide which geographic region(s) the product fits — buyer regulations and behaviour vary.
5. If you hit a dead end, discard and start again. Don't force a thin idea over the line.

## budget

- Datasets don't need to be 100% free. They must have a free tier; full cost must not exceed **$5000/year**.
- Dev time is free. Operational compute should fit on a small VPS / serverless free tier for the first paying customers.
- Bespoke ML is allowed but only on **small datasets** (a few thousand to low hundreds of thousands of examples). No GPU clusters, no foundation-model training. Fine-tuning small open-source models or training compact bespoke models is fine. Agentic LLM workflows are possible but watch the per-customer cost.
- An AI angle is **not** mandatory and often not desirable. Don't get hung up on it.

## the writeup

If you have a reasonable idea, write a single markdown file in `ideas/1-raw/` (the inbox the triage stage consumes) containing:

- a short pitch (one paragraph) that names the buyer and the concrete unit of value (£/$ ROI for archetype A; per-call / per-row / per-seat pricing with a named comparable, or measurable accuracy / coverage / freshness uplift for archetype B)
- the v1 feature (one thing, not a platform)
- the named first 10 customers — specific channels, trade bodies, niche communities for A; named dev/data communities, package registries, GitHub topics, niche newsletters for B. never vague "SMBs" / "developers" / "data teams"
- the existing paid comparable that proves willingness-to-pay
- the distribution surface the product rides (app store, integration, niche community)
- 2–4 follow-on directions that show the mountain behind the wedge
- links to the datasets / APIs involved with cost estimates
- the strongest one-sentence kill objection and how the writeup addresses it
