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

The service is built by combining several powerful, free-at-point-of-use UK government datasets.

*   **Core Analysis Data:**
    *   **Resource:** Environment Agency National LiDAR Programme (via Defra Data Services Platform)
    *   **Link:** [https://environment.data.gov.uk/](https://environment.data.gov.uk/)
    *   **Details:** Provides 1m resolution LiDAR data (Digital Surface Models and Point Clouds) covering 100% of England. This is the key dataset for analyzing roof geometry.
    *   **Cost:** Free.

*   **Property Identification and Boundaries:**
    *   **Resource:** Ordnance Survey (OS) Data Hub - Premium Plan
    *   **Link:** [https://osdatahub.os.uk/](https://osdatahub.os.uk/)
    *   **Details:** The **OS Places API** would be used to find a specific address and get its coordinates. The **OS MasterMap Topography Layer** would then be used to retrieve the precise property boundary polygon for that address. This allows us to clip the LiDAR data to just the building of interest.
    *   **Cost:** The Premium Plan includes a **free tier of £1,000 per month**, which is sufficient for a considerable volume of public-facing requests. This fits well within the project's budget constraints.

*   **Contextual Mapping:**
    *   **Resource:** Ordnance Survey (OS) Data Hub - OpenData Plan
    *   **Details:** OS OpenData products (like OS Open Zoomstack) can be used to provide the base maps for the website.
    *   **Cost:** Completely free for commercial use under the Open Government Licence.

## 5. Cost Analysis

*   **Data Costs:** **Effectively £0 initially.** The LiDAR and OpenData are free. The premium OS APIs are covered by the generous £1,000/month free tier. Costs would only be incurred if the service becomes extremely popular, which is a good problem to have and would be covered by revenue.
*   **Development Costs:** Dev time is considered free for this project.
*   **Operational Costs:** Standard cloud hosting and processing fees for storing LiDAR tiles, running the analysis engine, and hosting the web application. These would be minimal to start and would scale with usage.

## 6. AI/ML Angle

There is a strong, clear path for using a bespoke neural network:

1.  **Automated Roof Plane Detection:** A model could be trained on the LiDAR point cloud data to automatically identify and segment individual roof planes.
2.  **Feature Extraction:** The model would extract the key properties of each plane: area, pitch, and aspect.
3.  **Obstruction Classification:** The model could learn to classify non-roof objects like chimneys, dormer windows, and trees to calculate their shading impact.

This AI-driven approach would automate the core analysis pipeline, allowing the entire process from address selection to report generation to happen in seconds.

## 7. Basic Business Model & Marketing

*   **Freemium Model:**
    *   **Free Tier (for Homeowners):** The standard "Solar Score" report would be free to generate, acting as a marketing tool to draw in users.
    *   **Paid Tier (for Professionals):** Solar installers, developers, etc., could subscribe to a "Pro" plan for a monthly fee. This would unlock features like:
        *   Batch processing of multiple addresses.
        *   More detailed reports (e.g., downloadable CAD files of the roof).
        *   An API for integration into their own quoting systems.
        *   Lead generation (connecting homeowners who opt-in with local installers).
*   **Marketing:**
    *   **SEO:** Target keywords like "solar panel calculator UK", "is my roof suitable for solar", "best roof for solar panels".
    *   **Partnerships:** Collaborate with solar installation companies, property websites (like Rightmove/Zoopla), and green energy blogs.

## Merged Scope (from solarscore-canada.md)

SolarScore Canada used the same property-level solar suitability report model. Solar Score UK remains the survivor because the England LiDAR and OS data path is more concrete; the absorbed scope contributes the installer lead-gen pricing model and province/region expansion pattern for later markets.
