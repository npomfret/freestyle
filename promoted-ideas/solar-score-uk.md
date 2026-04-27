# Business Idea: Solar Score UK

## 1. The Idea

An automated service, "Solar Score UK," that provides instant, detailed solar suitability analysis for any residential or commercial property in England.

Users would enter a postcode and select an address. The service would then generate a "Solar Score" from 0-100 and a detailed report covering:

*   **Total suitable roof area:** The surface area (in m²) of the roof suitable for solar panels.
*   **Roof geometry:** The slope (pitch) and orientation (aspect) of all roof sections.
*   **Obstructions:** Identification of obstructions like chimneys, skylights, and significant shading from nearby trees or buildings.
*   **Estimated annual energy generation:** A projection of the kWh that could be generated.
*   **Potential financial savings:** An estimate of annual savings on electricity bills based on current energy prices.
*   **3D visualization:** A simple 3D model of the property's roof showing the suitable areas and potential panel layouts.

## 2. Target Market

*   **Primary:** Homeowners in England considering solar panel installation.
*   **Secondary (Commercial):**
    *   **Solar Panel Installers:** To use as a high-quality, instant quoting and lead-generation tool.
    *   **Property Developers:** To assess the solar potential of new builds or existing stock.
    *   **Estate Agents:** As a value-add feature for property listings.

## 3. Unique Selling Proposition (USP)

While many simple solar calculators exist, they typically rely on satellite imagery and basic user input (e.g., "south-facing roof").

Our USP is the use of **high-resolution government LiDAR data**. This allows for a far more accurate and automated analysis of the actual 3D geometry of a roof, including its precise pitch, aspect, and the impact of shading from nearby structures and vegetation. This provides a data-driven, objective assessment that is significantly more reliable than a simple estimate.

## 4. Datasets and APIs

The service is built by combining Environment Agency LiDAR, Ordnance Survey building/address data, and an established solar-yield model. The dataset story is real, but it is not as simple as "all free public data": the core LiDAR is open, while the best address/building boundary path uses OS premium APIs with a meaningful free monthly allowance.

*   **Core Analysis Data:**
    *   **Resource:** Environment Agency National LiDAR Programme (via Defra Data Services Platform)
    *   **Link:** [https://environment.data.gov.uk/](https://environment.data.gov.uk/)
    *   **Details:** Provides 1m resolution LiDAR data for England. The National LiDAR Programme captured the original national survey blocks mainly between January 2017 and February 2023, with some later repeat surveys. Products include Digital Surface Models (DSM), Digital Terrain Models (DTM), first-return DSM, intensity surfaces, and point clouds in 5km OS grid tiles. This is the key dataset for roof geometry and shading analysis.
    *   **Cost/licence:** Free under the Open Government Licence, with attribution.
    *   **Reality check:** Good enough for roof pitch, aspect, broad suitable-area calculation, and nearby building/tree shading. It should not be assumed accurate enough to detect every small chimney, vent, skylight, or roof obstruction without visual QA.

*   **Property Identification and Boundaries:**
    *   **Resource:** Ordnance Survey (OS) Data Hub - Premium Plan
    *   **Link:** [https://osdatahub.os.uk/](https://osdatahub.os.uk/)
    *   **Details:** The **OS Places API** can find a specific address and UPRN. **OS Linked Identifiers** can help connect addresses/properties to OS MasterMap identifiers. **OS Features API / OS MasterMap Topography Layer** can retrieve building polygons and attributes for clipping the LiDAR to the relevant building footprint.
    *   **Cost/licence:** OS Data Hub Premium currently includes free premium API transactions up to **£1,000 per month**. This is credible for validation and early paid pilots, but it is a premium licensed data path rather than unrestricted open data.
    *   **Reality check:** The business needs per-report OS transaction accounting from day one. If the free allowance is consumed by a public homeowner calculator, data costs could appear before revenue. The safer first wedge is paid batch analysis for installers.

*   **Solar Yield Model:**
    *   **Resource:** PVGIS API from the European Commission Joint Research Centre
    *   **Link:** [https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en)
    *   **Details:** PVGIS provides free solar radiation and PV performance estimates by location. It can estimate annual/monthly output when given location, tilt, azimuth, installed capacity, and loss assumptions.
    *   **Cost/licence:** Free to use, no registration required, with attribution/citation.
    *   **Reality check:** Do not build an irradiance model for v1. Use LiDAR to derive roof geometry and use PVGIS for energy generation estimates.

*   **Contextual Mapping:**
    *   **Resource:** Ordnance Survey (OS) Data Hub - OpenData Plan
    *   **Details:** OS OpenData products (like OS Open Zoomstack) can be used to provide the base maps for the website.
    *   **Cost:** Completely free for commercial use under the Open Government Licence.

## 4a. Dataset Feasibility Assessment

The data stack is feasible for an MVP, but the v1 promise should be "high-quality pre-screening" rather than survey-grade design automation.

Recommended processing path:

1.  User enters address or uploads a batch of addresses.
2.  Resolve address to UPRN/location with OS Places.
3.  Resolve to building footprint using OS Linked Identifiers and/or OS Features API.
4.  Download/cache the relevant Environment Agency LiDAR tiles.
5.  Clip DSM/DTM to the building footprint and immediate surroundings.
6.  Segment roof planes using deterministic geometry first: raster slope/aspect, connected components, RANSAC/plane fitting, and confidence thresholds.
7.  Estimate shade from nearby LiDAR height surfaces at representative sun angles.
8.  Send roof tilt/aspect, location, and assumed system size to PVGIS for yield.
9.  Return score, estimated kWh, usable roof area, suggested system size, and confidence band.

Important limitations:

*   **LiDAR recency:** Some areas may be several years old. Extensions, loft conversions, new builds, removed trees, and new nearby buildings can be missed.
*   **Resolution:** 1m LiDAR is strong for roof planes and broad shading, but weak for small roof obstructions.
*   **Boundary ambiguity:** Multi-occupancy buildings, terraces, flats, garages, outbuildings, and shared roofs need careful handling.
*   **OS costs:** OS premium data is acceptable for pilots, but public free usage should be rate-limited or deferred until paid conversion is proven.
*   **Liability:** Reports should be framed as pre-screening, not installation design, structural assessment, planning advice, or a guaranteed savings quote.

## 5. Cost Analysis

*   **Data Costs:** **Low initially, not zero forever.** Environment Agency LiDAR and PVGIS are free with attribution. OS OpenData is free. OS premium APIs have a generous free monthly allowance, but the service should track OS transaction cost per report from the first prototype.
*   **Development Costs:** Dev time is considered free for this project.
*   **Operational Costs:** Standard cloud hosting and processing fees for storing/caching LiDAR tiles, running the analysis engine, and hosting the web application. Processing can be kept cheap by starting with one region and pre-caching the required LiDAR tiles.
*   **Recommended v1 cost control:** Start in one dense region, avoid a national public free calculator, and sell batch reports before opening self-serve consumer traffic.

## 6. AI/ML Angle

There is a plausible ML path, but v1 should not depend on training a bespoke neural network.

Better v1 approach:

1.  Use deterministic geospatial methods first: GDAL/rasterio, slope/aspect rasters, connected-component segmentation, RANSAC plane fitting, and hand-tuned confidence thresholds.
2.  Use a small ML model later only where it clearly helps, such as roof-plane cleanup, obstruction classification, or confidence scoring against a labelled sample.
3.  Keep LLMs out of the critical geometry path. They can help explain reports in plain English, but they should not decide the measurements.

This keeps the first version achievable with a small dataset and avoids a large labelled training dependency.

## 7. Basic Business Model & Marketing

*   **Recommended first wedge:**
    *   Sell to small and mid-sized solar installers as a **pre-quote triage tool**.
    *   Let them upload 25-500 addresses and receive ranked opportunities with roof score, likely system size, estimated kWh, confidence level, and obvious disqualifiers.
    *   Price per batch or per seat before offering a public free homeowner funnel.
*   **Possible later freemium model:**
    *   **Free Tier (for Homeowners):** A limited standard "Solar Score" report, rate-limited to protect OS API spend.
    *   **Paid Tier (for Professionals):** Batch processing, more detailed reports, exports, API access, CRM integration, and lead capture from opted-in homeowners.
*   **Marketing:**
    *   **Direct installer outreach:** Target installers in one launch region and offer to score their old inbound leads, dead quotes, or postcode canvassing lists.
    *   **Niche SEO:** Target practical long-tail searches like "solar panel suitability checker for installers", "bulk solar roof assessment", and "solar lead qualification UK".
    *   **Later partnerships:** Solar installation companies, retrofit consultants, estate-agent energy-efficiency add-ons, and green finance brokers.

## 7a. Lead Generation Variant: Proactive Commercial Roof Search

There is a stronger commercial variant where Solar Score UK does not wait for users to enter addresses. Instead, it searches a defined area for unusually good commercial solar opportunities, then turns those findings into qualified leads for solar installers.

The product would scan commercial rooftops in a target region and rank properties by:

*   Large usable roof area.
*   Flat or favourable roof geometry.
*   Low shading from nearby trees/buildings.
*   Likely system size, e.g. 30kW, 50kW, 100kW+.
*   Estimated annual generation via PVGIS.
*   Confidence score based on LiDAR quality, footprint ambiguity, and roof complexity.
*   Business/property enrichment quality.

The output is not just a solar score. It is a sales-ready opportunity note: "This warehouse appears to support roughly 80-110kW of rooftop solar, with low shading and strong roof suitability; worth a proper site survey."

Best first niches:

*   Industrial estates and warehouses.
*   Retail parks and supermarkets.
*   Agricultural sheds and farm buildings.
*   Leisure centres, gyms, and large hospitality venues.
*   Schools, academies, and care homes where budget cycles may support energy-saving projects.
*   Manufacturing businesses with high daytime electricity demand.

Business model options:

*   **Sell ranked lead lists to installers:** Per region, per batch, or monthly subscription.
*   **Qualified appointment setting:** Solar Score UK runs the prospecting and outreach; installers pay per qualified meeting or accepted opportunity.
*   **White-label installer territory reports:** "Top 250 commercial solar prospects in Greater Manchester" sold to one installer per territory.
*   **Internal sales intelligence:** Installers use the tool to prioritise canvassing, outbound email, direct mail, and field sales.

This is probably more commercially attractive than a homeowner-first calculator because commercial installs have larger contract values and installers already understand paid lead generation.

## 7b. Outreach and Data Caution

The proactive lead-gen model is feasible, but outreach compliance and property-owner identification are major execution details.

Safer outreach assumptions for the UK:

*   Focus on incorporated businesses, not sole traders or unincorporated partnerships.
*   Prefer generic business addresses such as `info@`, `hello@`, `facilities@`, or published contact forms where available.
*   If using named contacts or personal business emails, treat it as personal data and comply with UK GDPR: lawful basis, transparency, opt-out handling, and suppression lists.
*   Include clear identity, reason for contact, and opt-out in every message.
*   Avoid tracking pixels initially to keep PECR/cookie compliance simpler.
*   Maintain a strict "do not contact" list across all campaigns.
*   Avoid automated calls unless consent is already in place.

The email must be specific enough to avoid looking like generic solar spam. A good message should cite the actual finding:

*   Estimated usable roof area.
*   Indicative system size.
*   Estimated annual generation.
*   Confidence level.
*   A clear disclaimer that it is a desktop pre-screen, not a quote or structural survey.

Hard part: identifying the right business.

The building occupier, freeholder, landlord, estate manager, asset owner, and operating company may all be different. Companies House is not enough. Useful enrichment sources may include business websites, Google/Bing business listings, EPC/non-domestic property data, Valuation Office Agency data, planning portals, commercial property listings, and manual verification for top-ranked prospects.

## 8. Recommended MVP

Build a regional B2B tool first:

*   Pick one dense launch region with strong LiDAR coverage.
*   Allow CSV upload of addresses/postcodes.
*   Produce a ranked table: address, roof score, suitable roof area, estimated system size, annual kWh, confidence, and notes.
*   Provide one simple map/roof overlay per property, not a full 3D design environment.
*   Include "needs manual review" and "not enough confidence" states.
*   Export CSV/PDF for sales teams.

Alternative lead-gen MVP:

*   Pick one region and one commercial property type, for example industrial estates in the West Midlands.
*   Pre-cache LiDAR and OS building data for that region.
*   Generate the top 100-250 commercial rooftop opportunities.
*   Manually verify the top 25 using aerial imagery and business/property enrichment.
*   Create one-page opportunity notes.
*   Test two offers: sell the list to installers, or contact the businesses directly and sell qualified meetings to installers.

Avoid in v1:

*   National consumer launch.
*   CAD exports.
*   Marketplace/lead brokerage.
*   Claiming exact obstruction detection.
*   Survey-grade installation layouts.
*   Bespoke neural-network training as a launch dependency.

## 9. Open Questions

*   What is the true OS API transaction cost per completed report after address lookup, identifier resolution, and building footprint retrieval?
*   Can OS Linked Identifiers reliably bridge from UPRN/address to the right building footprint for terraces, flats, and mixed-use buildings?
*   How often do installers reject properties for reasons this product cannot detect, such as roof condition, electrical constraints, conservation areas, or customer credit?
*   What confidence threshold is good enough for installers to pay for pre-screening?
*   Which launch region gives the best mix of LiDAR freshness, solar demand, installer density, and property variety?
*   Is the buyer more likely to pay per scored property, per batch, or per monthly seat?
*   Can we reliably identify the occupier or decision-maker for a commercial roof without paid property ownership data?
*   Will installers pay more for raw ranked prospects, qualified meetings, or exclusive territory intelligence?
*   What outreach channel works best for commercial roof owners: email, direct mail, phone, LinkedIn, installer-branded outreach, or a mix?
*   What minimum system size makes a lead valuable enough to support manual verification and outreach?

## Merged Scope (from solarscore-canada.md)

SolarScore Canada used the same property-level solar suitability report model. Solar Score UK remains the survivor because the England LiDAR and OS data path is more concrete; the absorbed scope contributes the installer lead-gen pricing model and province/region expansion pattern for later markets.
