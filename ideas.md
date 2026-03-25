# Research-Backed Project Ideas From The Free API And Dataset Catalog

I filtered for ideas that can plausibly launch for less than `$5,000/year` in data and infrastructure costs by leaning on public/open datasets, light ETL, a Postgres/PostGIS stack, and narrow initial market focus.

The strongest ideas are below. Each one references datasets that appear in `README.md`, checks whether those sources are actually usable, compares the market against existing products, and explains where the commercial wedge is.

---

## 1. TransitCatchment Pro

**What it is**

A B2B location-intelligence product for real-estate teams, employers, healthcare operators, and local consultants. Give it an address or shortlist of sites and it scores real access to workers, patients, students, and customers by transit, walking, and driving time. The useful version is not a generic map. It is a reportable decision product: "how many people can reach this site in 30/45/60 minutes, how reliable is service, and how does this compare with nearby alternatives?"

**Datasets from the catalog**

- [GTFS](https://openmobilitydata.org/p/capital-metro/24/latest)
- [GTFS-RT](https://openmobilitydata.org/p/capital-metro/495)
- [National Transit Database](https://www.transit.dot.gov/ntd)
- [Census.gov developer datasets](https://www.census.gov/data/developers/data-sets.html)
- [US Census Commuting Flow](https://www.census.gov/topics/employment/commuting/guidance/flows.html)
- [TIGER/Line](https://www.census.gov/geo/maps-data/data/tiger-line.html)
- [OpenStreetMap](http://wiki.openstreetmap.org/wiki/API)
- [OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Server-api)

**Why these sources are good enough**

- `GTFS` and `GTFS-Realtime` are the de facto standard formats for static schedules and live trip updates. That is exactly the format commercial routing and accessibility tools rely on.
- `National Transit Database` is official U.S. transit reporting, with annual and monthly data on ridership, service, assets, safety, and stations. It is good for agency quality benchmarking, not just routing.
- `Census` and `commuting flow` datasets are strong enough to estimate reachable worker and resident pools by tract/block group.
- `OpenStreetMap` plus `OSRM` keeps routing costs low and auditable.
- Main caveat: feed quality varies by city. The correct launch plan is not "all cities." Start with 20-50 U.S. metros where GTFS feeds are actively maintained.

**Existing products**

- [Walk Score Professional](https://www.walkscore.com/professional/contact.php)
- [TravelTime](https://docs.traveltime.com/docs/arcgis/quick-tools/quick-time-map)
- [Targomo](https://www.targomo.com/)
- [Esri Business Analyst](https://www.esri.com/en-us/arcgis/products/arcgis-business-analyst/overview)

**Why this can still win**

- Existing tools are either generic travel-time tooling or enterprise GIS products.
- A cheaper vertical product can win by packaging the answer buyers actually need: labor access, patient access, student access, or planning-board evidence.
- A strong wedge is self-serve site comparison reports for buyers priced out of enterprise GIS: independent developers, franchise groups, clinic rollups, universities, and local consultancies.

**Commercial viability**

- Likely pricing: `$99-$299/report` or `$149-$499/month` for saved portfolios, watchlists, exports, and branded PDFs.
- Buyers already spend money on site selection and accessibility scoring. This is a real budget line, just usually overserved by heavier software.

**Cost check**

- Postgres/PostGIS, scheduled feed ingestion, object storage, one or two app workers, and a small routing box should fit roughly `$1,500-$3,000/year`.
- The business works without paid proprietary map data.

---

## 2. TrialScout

**What it is**

A biotech and life-science intelligence tool that tracks competitive clinical activity by indication, mechanism, investigator, and site. The useful version is not "search ClinicalTrials." It is "tell me which programs are accelerating, which investigators keep appearing across competing studies, which sponsors are publishing first, and where safety/regulatory signals are emerging."

**Datasets from the catalog**

- [ClinicalTrials.gov](https://clinicaltrials.gov/)
- [PubMed](https://pubmed.ncbi.nlm.nih.gov/)
- [PubMed Central Open Access Subset](https://www.ncbi.nlm.nih.gov/pmc/tools/openftlist/)
- [OpenAlex](https://openalex.org/)
- [Crossref Metadata Search](https://github.com/CrossRef/rest-api-doc)
- [openFDA](https://open.fda.gov)
- [MeSH download files](https://www.nlm.nih.gov/mesh/filelist.html)

**Why these sources are good enough**

- `ClinicalTrials.gov` is still the canonical public registry. Its modern data structure and API make it usable for structured monitoring.
- `PubMed` gives the literature spine; `PMC` adds free full text for many papers; `MeSH` helps normalize therapy-area language.
- `OpenAlex` adds large-scale entity linking across works, authors, institutions, concepts, and citations. Its own documentation describes hundreds of millions of works with tens of thousands added daily.
- `Crossref` is large and current enough to support DOI matching and citation backfilling. Crossref stated in November 2025 that its public REST API serves metadata across roughly `180 million` records and handles about `1 billion` monthly hits.
- `openFDA` is not a complete regulatory intelligence replacement, but it is useful for product labels, enforcement reports, and adverse-event-adjacent monitoring. FDA states some endpoints update weekly and expose machine-readable harmonized fields.
- Main caveat: trial records are sponsor-submitted and uneven in completeness. That is manageable if the product explicitly cross-checks registry data against publications, citations, and FDA signals.

**Existing products**

- [Citeline Trialtrove](https://www.citeline.com/en/products-services/clinical/trialtrove)
- [Clarivate Cortellis Clinical Trials Intelligence](https://clarivate.com/products/biopharma-intelligence/cortellis/cortellis-clinical-trials-intelligence/)
- [GlobalData Clinical Trials](https://www.globaldata.com/store/report/clinical-trials-market-analysis/)

**Why this can still win**

- The incumbents are strong, but they are enterprise-heavy and expensive.
- A cheaper product can target smaller biotech teams, CRO business-development teams, specialist consultants, recruiters, and healthcare-focused micro-funds.
- The best wedge is not full enterprise trial intelligence. It is fast competitive monitoring in one therapy area with investigator maps, publication lag tracking, and sponsor watchlists.

**Commercial viability**

- Likely pricing: `$299-$999/month` depending on saved dashboards, API access, alert volume, and number of indications.
- Even a small number of customers can support the business because the buyer value per decision is high.

**Cost check**

- Nightly ETL, text indexing, graph/entity resolution, and a modest app stack should stay around `$2,000-$4,000/year`.
- Optional LLM summarization can be tightly rate-limited and added later without breaking the budget.

---

## 3. PatentPulse

**What it is**

A lightweight patent and filing radar for startup founders, product teams, micro-VCs, specialist agencies, and small IP firms. It watches a technology theme or named competitor set and summarizes new patents, assignments, PTAB activity, SEC disclosures, and related company events into plain-English alerts.

**Datasets from the catalog**

- [USPTO Open Data and Mobility](https://www.uspto.gov/learning-and-resources/open-data-and-mobility)
- [U.S. Patent and Trademark Office Bulk Data Products](https://www.uspto.gov/learning-and-resources/bulk-data-products)
- [SEC EDGAR Data](https://www.sec.gov/edgar/sec-api-documentation)
- [UK Companies House](https://developer.company-information.service.gov.uk/)

**Why these sources are good enough**

- `USPTO` data is authoritative, broad, and commercially useful. The USPTO developer portal now routes users to the newer Open Data Portal, which is a sign the platform is active even though some older endpoints are being retired.
- `SEC` disclosure APIs are already useful for production. The SEC announced that its disclosure API provides real-time entity information, submission details, XBRL financial data in JSON, and a nightly bulk zip.
- `Companies House` is a good low-cost complement for UK entity changes, directors, charges, and filing events.
- Main caveat: the hard problem is not raw access. It is entity resolution across assignees, subsidiaries, and filing names. That is where product value lives.

**Existing products**

- [PatSnap](https://www.patsnap.com/)
- [Questel Orbit Intellixir](https://www.questel.com/patent/ip-intelligence-software/orbit-intellixir/)
- [The Lens](https://www.lens.org/)
- [Google Patents](https://patents.google.com/)

**Why this can still win**

- Patent search itself is commoditized. Monitoring, explanation, and workflow are not.
- A smaller product can win by focusing on practical alerts for non-enterprise users: "your top three competitors filed here," "this family expanded internationally," "a board filing suggests a product pivot," or "this patent cluster is getting crowded."
- This is especially plausible for agencies, consultants, search funds, and B2B founders who want signals, not a full enterprise IP suite.

**Commercial viability**

- Likely pricing: `$99-$399/month` or premium diligence reports for funds and agencies.
- The market already pays for patent intelligence, but many smaller buyers are underserved by enterprise-first vendors.

**Cost check**

- Bulk ingest, search indexing, and nightly entity matching should stay around `$1,500-$3,500/year`.
- The data itself is public; the main cost is compute and storage.

---

## 4. Airshed Watch

**What it is**

An air-quality and weather risk console for schools, camps, outdoor employers, sports venues, and multi-site property operators. It turns open sensor and weather feeds into operational decisions: should we move practice indoors, warn outdoor crews, alter ventilation plans, or reschedule site work?

**Datasets from the catalog**

- [OpenAQ](https://docs.openaq.org/)
- [AQICN](https://aqicn.org/api/)
- [NOAA Climate Data](https://www.ncdc.noaa.gov/cdo-web/webservices/v2)
- [OpenWeatherMap](https://openweathermap.org/api)
- [OpenStreetMap](http://wiki.openstreetmap.org/wiki/API)

**Why these sources are good enough**

- `OpenAQ` is one of the best open air-quality aggregation layers available and is built specifically for harmonized, machine-readable air-quality access.
- `AQICN` is a useful supplemental source for broader monitoring and public AQI distribution.
- `NOAA` gives reliable historical and contextual weather data; `OpenWeatherMap` can help with forecast UX if needed.
- `OpenStreetMap` provides site geometry, nearby schools/facilities, and operational context.
- Main caveat: station density is uneven. The right launch plan is to start where public monitor coverage is dense and be transparent about confidence.

**Existing products**

- [Tomorrow.io Weather API](https://www.tomorrow.io/weather-api/weather-forecast-api//)
- [BreezoMeter Air Quality API](https://docs.breezometer.com/api-documentation/air-quality-api/v1/)
- [IQAir](https://www.iqair.com/)

**Why this can still win**

- The incumbents tend to be either broad weather platforms or consumer-facing air-quality brands.
- A cheaper vertical tool can package air quality into policies and workflows for schools, camp operators, sports clubs, and outdoor labor teams.
- The wedge is operational simplicity: location watchlists, threshold-based alerts, printable policy logs, and historical exposure summaries for risk/compliance.

**Commercial viability**

- Likely pricing: `$25-$99/location/month` or seasonal plans for schools, camps, and sports organizations.
- The buyer problem is concrete and recurring, especially in wildfire-prone or pollution-heavy regions.

**Cost check**

- Cached ingest, notifications, and a small dashboard should stay around `$1,000-$2,500/year`.
- No expensive proprietary forecast model is required to get an initial paid product live.

---

## Best Starting Point

If I had to pick the best first build, I would start with **TransitCatchment Pro** or **PatentPulse**.

- `TransitCatchment Pro` has the clearest low-cost data stack and a very understandable output buyers can act on immediately.
- `PatentPulse` has the strongest "do this manually today, but it is annoying" pain point and can be sold with very little UI if the alerts are good.
- `TrialScout` may have the highest customer value per account, but it also needs the most careful entity resolution and domain-specific UX.
- `Airshed Watch` is the easiest operational product to build, but the market may need tighter targeting by region and buyer type.
