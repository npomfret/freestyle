# Idea Rubric

Shared criteria for what makes a Freestyle business idea **good** vs **bad**. Loaded by `idea-prompt.md`, `triage-prompt.md`, `purge-prompt.md`, and `codex-prompt.md`. Action-specific instructions live in those prompts.

## target buyer profile

we are highly technical operators with **few business skills** — no sales muscle, no marketing audience, no industry network. our edge is software, not commerce. the strongest ideas serve **non-technical owners of established, revenue-generating businesses** who can't build software themselves but can recognise ROI in concrete £/$ terms.

reward these buyers:

- independent owner-operated businesses with revenue (single-location restaurants, dental practices, plumbers, electricians, kennels, breweries, garages, opticians, picture framers, taxi operators, equipment rental yards, scrap dealers, small accounting/legal firms…)
- regulated trades and licensed professionals where compliance is part of the daily job (surveyors, conveyancers, MOT centres, home inspectors, food-hygiene-rated operators, registered installers, EPC assessors…)
- niche manufacturers, fishing fleets, regional construction firms, family wholesalers, agricultural operators — unsexy, established, busy, allergic to software demos
- the operator does the books themselves or pays a part-time bookkeeper. they spend on tools when the spend has an obvious payback inside one quarter

penalise these buyers:

- **"developers"** / engineering teams — they build their own and don't pay for prosumer tools
- **VC-backed startups** / scale-ups — they have ops people; we can't reach them and won't out-iterate their incumbents
- **"SMBs"** / **"marketers"** as a category — too vague to reach with self-serve, no shared distribution surface
- **consumers** — no ROI mental model, high price sensitivity, support load too heavy for a 1–2 person team

every writeup must be able to answer, in concrete numbers, **"this saves the buyer £X/month"** OR **"this earns the buyer £X/month more"**. if the value can only be expressed as soft benefits (*better insights*, *improved efficiency*, *unlocks workflows*), the buyer won't pay. ROI must be visible from the marketing page, not buried in a deck.

## the discriminator: achievable vs grand

- **achievable** = a solo dev or 2-person team can ship and sell something a real user pays for in 4–12 weeks, on free public data, via an existing distribution surface.
- **grand** = TAM-rich vision, multi-stakeholder coordination, brand-new buyer category, regulatory blocker, two-sided cold-start, or anything that needs sales / procurement / partnerships to launch.

we want **achievable**.

## achievability checklist (8 signals)

each signal present and convincingly addressed in the writeup = 1 point. vague or missing = 0. total /8.

1. a solo dev or 2-person team can ship a saleable v1 in 4–12 weeks
2. the MVP is **one concrete feature**, not a platform / ecosystem / marketplace
3. the first 10 customers are nameable today (specific trade body member list, regional federation, niche subreddit, Shopify category, conference attendee list, MSP partner network — not "SMBs", "marketers", "developers")
4. free public APIs / data tiers are sufficient for the first **paying** tier, not just the demo
5. an existing paid product or category proves willingness-to-pay — the idea isn't inventing a new budget line
6. the product delivers value to a single user with no other users present (no two-sided cold-start)
7. no regulatory / compliance / certification / mass data-labelling blocker before the first dollar
8. distribution rides on an existing surface (Shopify app store, Chrome Web Store, GitHub Action, npm, MSP partner, niche community), not a new audience to build

ideas scoring ≤ 4/8 are deletion / rejection candidates regardless of how attractive they otherwise look.

## self-driving growth (operator has near-zero time for manual work)

the operator has close to zero time for manual lead-gen and marketing — no cold outreach, no sales calls, no hand-curated content campaigns, no conference circuit. **strongly prefer ideas where customer acquisition can be automated** so the product grows largely on its own once seeded.

reward these signals:

- **programmatic SEO**: data-driven landing pages that index naturally (one page per ticker, per location, per error code, per dataset, per slug…)
- **marketplace-native distribution**: discoverable in an existing app store / extension store / package registry where users find it themselves — Chrome Web Store, Shopify app store, GitHub Marketplace, npm, MSP partner channels, browser extension stores
- **API-as-product**: developers discover via Google search for "<problem> API" and self-onboard from docs
- **embed / share loops**: every use produces a public artefact (badge, widget, public report, share link) that links back
- **open-source / freemium top of funnel**: a free tier or open-source tool that funnels naturally toward paid features
- **integrations on platforms with existing audiences** (Stripe app, Slack app, Zapier connector) where the host platform surfaces the product

penalise these signals:

- "we'll do content marketing / SEO" with no concrete programmatic mechanism
- requires building an owned audience from scratch (newsletter, podcast, blog) before sales
- requires named-account outbound, BDR motion, sales calls, RFPs
- onboarding needs a demo call or hand-holding for every customer
- partnerships are the GTM ("we'll partner with X, Y, Z, then…")

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

## boring is good

reward unglamorous, mundane, well-defined ideas — invoice reconciliation, niche compliance reports, scheduling for an obscure trade, data clean-up for a specific tool, lookup tables for a small profession. they're overlooked because they're not fun to pitch, which means weak competition, identifiable buyers, and clear willingness-to-pay. when two ideas have similar achievability scores, prefer the boring one. do not down-rank an idea for being unsexy; do down-rank an idea for being flashy with no clear buyer.

## pre-diligence products are good

reward **pre-diligence** tools: cheap, fast, self-serve products that find obvious red flags before the user spends real money on formal due diligence, expert review, surveys, legal advice, engineering work, procurement, or enterprise software.

these products do not replace the professional step. they help the buyer decide whether an asset, site, supplier, property, counterparty, permit, or opportunity is worth deeper investigation.

good examples:

- property flood / crime / seismic / water-quality pre-screening before a buyer pays for surveys or legal work
- solar roof suitability pre-screening before an installer sends a salesperson or surveyor
- EUDR supplier-plot preflight before a full compliance platform or consultant review
- construction material carbon/cost substitution memo before a paid LCA or quantity-surveyor review
- food hygiene portfolio monitoring before a landlord, operator, or consultant investigates a tenant/site
- niche compliance readiness packet before a business pays a lawyer or specialist consultant

reward these signals:

- the output is a cited report, checklist, scorecard, evidence pack, or red-flag memo
- the product is explicitly framed as screening / triage / preflight, not final advice
- the next expensive due-diligence step is obvious and already paid for in the market
- public or cheap maintained data can reveal enough red flags to be useful
- the user can self-serve without calls, custom onboarding, or manual analysis
- every report creates programmatic SEO or shareable artefacts

penalise:

- claims that replace legal, engineering, survey, medical, safety, or compliance judgment
- black-box scores with no citations or explainable inputs
- red-flag products where false positives would destroy trust or false negatives create unacceptable liability
- products where the user has no clear expensive next step to avoid or prioritize

## pure data is good

ideas that involve creating datasets, leveraging datasets in a unique or creative way, state-of-the-art knowledge bases, etc are well suited to the developer.

## small-dataset constraint

penalise ideas whose viability depends on training models on **large datasets**. we have the skills to build custom models but the budget only stretches to training on relatively small datasets — anything that needs GPU clusters, massive labelled corpora, or foundation-model-scale training is out. fine-tuning small open-source models or training compact bespoke models on a few thousand examples is fine.

## dataset / API staleness discount

apply a heavy discount when the headline data source shows staleness signals: last update years ago, dormant GitHub repo, dead maintainers, deprecated endpoints, docs that haven't moved in 3+ years. a stale data source is a hidden time-bomb under the product. if a key dataset has gone paid-only above the budget, is non-commercial, or is dormant — downgrade aggressively or reject.

## LLM-replaceability

reject ideas that are at risk of being completely replaceable by a state-of-the-art LLM — i.e. the "product" is something a user could ask ChatGPT directly and get a comparable answer for free. the defensible value has to live in maintained data, integrations, distribution, or workflow — not in narrative summaries an LLM can reproduce.

## cheap-incumbent disqualifier

if there is **already a very low-cost or free, widely-used solution** that does most of what's proposed, drop the idea. "slightly better" is not a wedge against a cheap incumbent everyone already uses; nobody switches for marginal gains. the opening only exists when the incumbent is expensive, niche-blind, or absent — not when it's free, ubiquitous, and good enough.

## wedge shape

prefer ideas where v1 is small and concrete but the roadmap behind it goes a long way: adjacent features, deeper integrations, premium tiers, neighbouring customer segments. an idea with a hard ceiling (one feature, no clear extension path) is weaker than one whose first step is small but whose mountain behind the wedge is big. the writeup should sketch 2–4 concrete follow-on directions.

## constraints on tools

the catalog CLI (`npm run search`) is **read-only**. **do not** run `npm run server`, `npm run db:tunnel`, `discover`, `repair`, `validity-check`, `add-url`, `embed`, or any DB-mutating script. do not read or write `.env` files. do not write code.
