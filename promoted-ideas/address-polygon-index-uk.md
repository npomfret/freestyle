# Business Idea: Address Polygon Index UK

## 1. The Idea

Create a clean, queryable dataset and API that returns the best available polygon for a UK address or UPRN.

The core product would answer a simple question that current UK property datasets do not answer cleanly:

> Given this address or UPRN, what spatial polygon best represents it, and how confident are we?

The output should not claim to be a legal boundary. It should return a practical spatial envelope with source metadata and confidence:

*   **UPRN and normalised address**
*   **Best matching title/index polygon**, where available
*   **Best matching building footprint**, where licensed data allows
*   **Candidate alternative polygons**
*   **Confidence score and reason codes**
*   **Tenure/title context where available**
*   **Source, licence, and update timestamp**

The defensible positioning is "best available property/address polygon intelligence", not "official legal boundary for an address".

## 2. Problem

UK property data is rich but fragmented. Address datasets, title boundary datasets, building footprint datasets, and land registry datasets use different identifiers, update cycles, licences, and geometry models.

Common pain points:

*   Address records are usually points, not polygons.
*   Land Registry polygons describe registered title extents, not postal addresses.
*   One address can map to multiple title polygons.
*   One title polygon can contain multiple addresses.
*   Flats, leaseholds, shared freeholds, estates, rural properties, garages, and new builds create ambiguity.
*   Official polygon data is usually bulk GIS data, not a simple developer API.

The gap is not that polygons do not exist. The gap is that there is no simple, production-ready address/UPRN-to-polygon index with ambiguity handled explicitly.

## 3. Target Customers

Primary buyers are organisations that need to link UK addresses to physical space for valuation, risk, or logistics.

*   **Insurers and Insurtech**: For property risk (flood, subsidence), exposure analysis, and rebuild cost modelling. Target data teams at established insurers (e.g., Aviva, AXA) and underwriting teams at startups (e.g., FloodFlash, Laka).
*   **Energy and Retrofit**: For solar potential, heat pump eligibility, insulation sales territories, and grid connection planning. A specific channel would be targeting members of trade bodies like **Solar Energy UK** or exhibitors at conferences like **Futurebuild**.
*   **Proptech and Conveyancing Tech**: For pre-diligence checks, site context, and automating parts of the title search process. Target product managers at companies like **Searchland** or **Thirdfort**.
*   **Planning and Development**: For site finding, ownership adjacency analysis, and reconciling planning applications with registered land parcels.
*   **Utilities and Telecoms**: For service eligibility checks (e.g., fibre rollout) and mapping assets to premises.
*   **Public Sector**: For data matching in local authorities, asset management, and housing analytics.

The best early wedge is a narrow B2B workflow where polygon quality has direct commercial value, such as insurance risk enrichment or retrofit lead qualification.

## 4. Product

### MVP

A batch enrichment service:

1.  Customer uploads UPRNs, addresses, or postcodes plus address lines.
2.  Service resolves each record to a canonical UPRN/address point.
3.  Service joins that point to candidate title/index polygons and, where licensed, building footprints.
4.  Service returns a CSV/GeoPackage/API response with:
    *   matched polygon geometry
    *   candidate polygon IDs
    *   confidence score
    *   ambiguity flags
    *   source attribution
    *   match method

Start with England and Wales because HM Land Registry data is the strongest immediate polygon source.

### Later Product

*   Live API: `GET /polygon?uprn=...`
*   Address search widget with geometry preview
*   Web map QA interface for ambiguous matches
*   Change detection feed for newly registered or changed polygons
*   Sector-specific enrichments: flood, EPC, planning, solar, roof/building footprint, conservation constraints
*   Confidence model trained on verified matches and manual QA feedback

## 5. Research and Datasets

### England and Wales: HM Land Registry INSPIRE Index Polygons

HM Land Registry publishes **INSPIRE Index Polygons** as open data. These are polygons showing the indicative position and extent of registered freehold properties in England and Wales.

*   Source: `https://use-land-property-data.service.gov.uk/datasets/inspire`
*   Licence: Open Government Licence with required HMLR and OS attribution
*   Format: GML by local authority
*   Update cycle: monthly
*   Limitation: freehold subset only; does not provide a clean address-to-polygon mapping; polygons are indicative and not definitive legal boundaries

This is the best open starting point for a proof of concept.

### England and Wales: HM Land Registry National Polygon Service

The **National Polygon Service** is the stronger commercial route. It includes:

*   National Polygon dataset
*   Title Descriptor dataset
*   Title Number and UPRN Look Up dataset

Source: `https://use-land-property-data.service.gov.uk/datasets/nps`

This is much closer to the ideal product because it includes leasehold and freehold title polygons and an official UPRN lookup component. It is licensed and chargeable, so it is more suitable for a commercial API or enterprise product than an open redistributed dataset.

### Great Britain: Ordnance Survey AddressBase Premium / OS NGD Address

OS AddressBase Premium provides authoritative address lifecycle data for England, Wales, and Scotland, with UPRNs and property-level coordinates.

*   Source: `https://docs.os.uk/os-downloads/addressing-and-location/addressbase-premium`
*   Coverage: Great Britain
*   Format: CSV, GeoPackage, GML
*   Limitation: vector point address data, not address polygons
*   Value: canonical address and UPRN resolution layer

For commercial-grade matching, AddressBase is likely necessary.

### Scotland: Registers of Scotland Cadastral Parcels

Registers of Scotland publishes an INSPIRE cadastral parcels dataset. It contains ownership polygons at ground level in Scotland.

*   Source: `https://www.data.gov.uk/dataset/29a78bcd-2ab3-4f15-92fc-7fd9cb3d470a/ros-cadastral-parcels-dataset`
*   Update cycle: quarterly, according to data.gov.uk metadata
*   Limitation: cadastral/title polygons, not a simple address-to-polygon product

This can support a Scotland expansion, but matching and licensing need separate validation.

### Building Footprints

For many use cases, the desired polygon is not a land title. It is the physical building footprint. The likely high-quality commercial path is OS MasterMap Topography Layer or OS NGD building data, joined to UPRNs/address data. OpenStreetMap building footprints may support an open proof of concept, but quality and attribution vary by area.

## 6. Why This Dataset Does Not Already Exist Cleanly

The hard part is entity resolution, not drawing polygons.

Specific complexities:

*   **Address vs title mismatch:** postal addresses, UPRNs, buildings, and registered titles are different concepts.
*   **Multi-occupancy:** flats and HMOs often share one building footprint but have many UPRNs.
*   **Tenure complexity:** leasehold, freehold, commonhold, garages, parking spaces, and shared land can produce multiple relevant polygons.
*   **Indicative boundaries:** index polygons are not definitive legal title boundaries.
*   **Licensing:** the best identifiers and building/address datasets are often OS/GeoPlace/Royal Mail derived.
*   **Update handling:** title, address, building, planning, and local authority datasets update on different schedules.

This complexity creates the business opportunity: customers do not want raw GIS datasets; they want a reliable, explainable answer with confidence.

## 7. Business Model

Recommended first model: B2B batch enrichment.

Pricing options:

*   **Per-record enrichment:** e.g. 5p-50p per address depending on geometry depth and licence costs.
*   **Monthly subscription:** includes a record allowance and API access.
*   **Enterprise licence:** custom refreshes, private deployment, SLA, and sector-specific enrichments.
*   **QA premium:** human-reviewed matches for high-value properties or legal-adjacent workflows.

Avoid a public free API at the start. It would create data licensing and cost exposure before proving willingness to pay.

## 8. Go-To-Market

Start with one region and one workflow.

Best first wedge:

*   Pick England and Wales.
*   Use HMLR INSPIRE polygons plus an address/UPRN source available under the intended licence.
*   Target a customer segment with clear ROI, such as flood-risk enrichment for insurers or rooftop/retrofit targeting for energy companies.
*   Offer a sample batch of 1,000-10,000 addresses with match confidence and manual review of edge cases.

Sales message:

> "Turn your address list into reliable property polygons with confidence scores, candidate alternatives, and source provenance."

Marketing channels:

*   Direct outreach to proptech, insurtech, energy, and geospatial data teams
*   Technical blog posts showing match accuracy and edge cases
*   Sample open dashboard for one local authority
*   Partnerships with GIS consultancies and OS/HMLR data users

## 9. Landscape

The problem of linking addresses to polygons is addressed by a mix of official sources and commercial aggregators. There is no single, free, public API that cleanly provides this service.

### Incumbents & Comparables

*   **[PropertyData.co.uk](https://propertydata.co.uk/api)**: Offers a developer API that includes UPRN lookup and can return property boundaries. This is a direct commercial comparable.
*   **[Street.co.uk](https://docs.data.street.co.uk/)**: Provides a modern property data API, including spatial information, aimed at estate agents and developers.
*   **[Searchland.co.uk](https://searchland.co.uk/)**: A platform focused on land sourcing for property developers, offering a developer API for title boundaries and UPRN data.
*   **Ordnance Survey (OS) & HM Land Registry (HMLR)**: The official sources. They provide the highest quality data via commercial APIs (**OS NGD API**, **HMLR National Polygon Service**) but require complex integration and significant licensing fees (e.g., HMLR NPS is ~£20,000/year). Their free offerings require significant DIY data joining.

### Data Sources & Licensing

*   **HMLR INSPIRE Index Polygons (E&W)**: Free (OGL), updated monthly. Freehold only, indicative boundaries.
*   **Registers of Scotland Cadastral Parcels (Scotland)**: Free (OGL), updated quarterly.
*   **OS Open UPRN**: Free (OGL), contains the UPRN and its point coordinate, but no polygon. The essential link for a DIY open-data solution.
*   **HMLR National Polygon Service (E&W)**: Commercial (~£20,000/year), updated monthly. The premium source, including leaseholds.
*   **OS AddressBase Premium & OS NGD API**: Commercial (with a free tier), updated frequently. The most authoritative source for address and building feature data.

The opportunity lies in offering a developer-first product that bridges the gap between the complex, expensive official APIs and the incomplete, DIY-heavy open data route, with a clear model for confidence and ambiguity.

## 10. Risks

*   **Licensing risk:** derived data redistribution may be restricted, especially with AddressBase, OS MasterMap, and Royal Mail-derived data.
*   **Correctness risk:** users may overinterpret polygons as legal boundaries.
*   **Coverage risk:** open data will not cover all tenure/address cases.
*   **Liability risk:** conveyancing/legal-adjacent uses need careful disclaimers and possibly excluded use cases.
*   **Data cost risk:** premium data costs may make low-value consumer queries uneconomic.
*   **Operational risk:** national polygon processing and monthly refreshes require robust geospatial ETL.

Mitigations:

*   Keep provenance and confidence in the core schema.
*   Avoid legal-boundary language.
*   Start with paid B2B pilots.
*   Validate licensing before building a redistributed dataset.
*   Offer hosted API responses rather than raw bulk redistribution if licences require it.

## 11. Validation Plan

### Week 1: Desk Research and Licence Check

*   Confirm HMLR INSPIRE reuse rules and required attribution.
*   Confirm whether the intended OS/AddressBase licence permits API-derived match outputs.
*   Identify whether target customers already hold OS/HMLR licences, allowing a bring-your-own-data model.

### Week 2: Technical Prototype

*   Choose one local authority.
*   Load HMLR INSPIRE GML into PostGIS.
*   Load an address/UPRN point source.
*   Spatially join address points to candidate polygons.
*   Generate confidence flags:
    *   point inside one polygon
    *   point inside multiple polygons
    *   nearest polygon within threshold
    *   no match
    *   multi-occupancy suspected

### Week 3: Customer Discovery

Interview 10-15 target users:

*   insurers
*   retrofit/solar companies
*   proptech platforms
*   conveyancing data providers
*   local government GIS/data teams

Key questions:

*   What polygon do they actually need: title, parcel, building, land envelope, or all candidates?
*   What confidence level is commercially useful?
*   What do they currently pay for this or build manually?
*   Are they allowed to use premium OS/HMLR data internally?

### Week 4: Paid Pilot

Offer a fixed-price pilot:

*   10,000-100,000 addresses
*   One region or customer portfolio
*   CSV plus GeoPackage output
*   Match confidence summary
*   Manual review of a small ambiguous sample
*   Recommendations for production API integration

## 12. Initial Technical Architecture

Core stack:

*   PostGIS for polygon and spatial index storage
*   GDAL/ogr2ogr for GML/Shapefile/GeoPackage ingestion
*   Python or Node ETL for matching pipeline
*   API layer for lookup and batch jobs
*   Object storage for source files, exports, and refresh snapshots

Core tables:

*   `addresses`
*   `uprns`
*   `title_polygons`
*   `building_footprints`
*   `address_polygon_matches`
*   `match_candidates`
*   `source_versions`

Core match methods:

*   point-in-polygon
*   nearest polygon
*   parent/child UPRN handling
*   title-to-UPRN lookup where licensed
*   building footprint containment
*   manual QA override

<!-- reviewed: 2026-05-02 -->
