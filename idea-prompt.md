Read @README.md and make sure you understand how to use the cli to exercise our api.

Your task is to generate a business idea for a software (only) product. ic could be any of

 - a new dataset that has commercial value, potentially combined with a predictive ML model
 - pure data solutions ie state of the art knowledge bases leveraging existing datasts, hybrid data sets etc potentially with some predictive models and/or llm integration
 - b2b / b2c website or saas platform
 - mobile app
 - other...

 * They don't need to be original ideas.  Sometimes being much better and much cheaper than an existing product is a valid approach.
 * Having said that: highly saturated markets are difficult to break into.
 * It can be trivial (just a few days work) or highly complex (several months work).
 * it must not be at risk of being completely replaceable by a state of the art llm
 * data sources must be free (or cheap) and maintained
 * undercutting existing businesses is a perfectly valid strategy - our costs are VERY low

You will use our database via the CLI to pick 3 random items from the db. You will pick one that you consider to "look interesting".

Then you will

 * search for other complimentary sources in the database using the cli
 * use googlesearch to do your own research
 * Check the quality of any suggested datasets, our db might be out of date... they must be suitable
 * Apply a heavy discount to datasets / APIs that are **old or unmaintained** — last update years ago, dormant GitHub repo, dead maintainers, deprecated endpoints, docs that haven't moved in 3+ years. A stale data source is a hidden time-bomb under the product. If the headline dataset shows these signals, find a maintained alternative or discard the idea.
 * consider which geographic region(s) the project might be suitable for
 * consider budget - dev time is free, but we have a very small budget

Datasets don't need to be 100% free. But they must have a free tier, and the full cost must not exceed $5000 per year.

One angle to consider is: is there a use for a bespoke neural network in the project? We have the skills to build custom / novel models, but the budget only stretches to training on **relatively small datasets** — anything that needs large-scale training compute, GPU clusters, or massive labelled corpora is out of scope. Fine-tuning small open-source models or training compact bespoke models on a few hundred thousand examples is fine; building a foundation model is not. Similarly agentic LLM based approaches are possible, but these can have a significant cost.

But: an AI angle is not mandatory, or even desirable - do not get hung up on this.

The strongest ideas are **wedge-shaped**: a small achievable MVP that, if the wedge lands, opens up months or years of follow-on work — adjacent features, deeper integrations, premium tiers, neighbouring customer segments. Start narrow, but pick a niche with a big mountain behind it. An idea with a hard ceiling (one feature, no clear extension path) is weaker than one whose first step is small but whose roadmap goes a long way if it gets traction. Sketch the follow-on path briefly in the writeup so the growth shape is visible.

Be ruthless about the competitive landscape: if there is **already a very low-cost or free, widely-used solution** that does most of what you're proposing, drop the idea and start again. "Slightly better" is not a wedge against a cheap incumbent everyone already uses; nobody switches for marginal gains. The opening only exists when the incumbent is expensive, niche-blind, or absent — not when it's free, ubiquitous, and good enough.

**Boring is good.** Unglamorous, mundane, well-defined problems — invoice reconciliation, niche compliance reports, scheduling for an obscure trade, data clean-up for a specific tool, lookup tables for a small profession — are routinely overlooked because they're not fun to pitch. They often have weak competition for that exact reason, a clearly identifiable buyer, and obvious willingness-to-pay. Don't over-index on novelty: a dull problem with a real buyer beats a flashy idea with no one to sell it to. Lean toward boring.

Consider existing competition, potential customers, basic marketing strategies, how it could scale etc

If you hit a dead end, just discard and start again.

If you have a reasonable idea about a potential business, stop:
 - present it in a markdown file in the local ideas directory
 - provide links to the datasets and APIs involved
 - provide estimate costs

Do not write any code. Do not create any files.