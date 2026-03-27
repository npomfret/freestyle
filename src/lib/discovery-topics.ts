// Grouped discovery topics for the discover agent.
// Each group has a name and a list of search terms.
// A topic can appear in multiple groups.

export interface TopicGroup {
    name: string;
    topics: string[];
}

export const TOPIC_GROUPS: TopicGroup[] = [
    // === FINANCE & ECONOMICS ===
    {
        name: 'Banking & Payments',
        topics: ['banking APIs', 'payment processing', 'open banking', 'SWIFT', 'ACH', 'credit scores', 'KYC verification', 'money transfer', 'neobank APIs', 'PSD2'],
    },
    {
        name: 'Capital Markets',
        topics: ['stock market data', 'equities', 'bonds', 'fixed income', 'derivatives', 'options pricing', 'futures data', 'ETF data', 'index data', 'IPO data', 'market microstructure'],
    },
    {
        name: 'Foreign Exchange',
        topics: ['forex rates', 'currency exchange', 'FX historical data', 'cross rates', 'currency conversion', 'exchange rate forecasting'],
    },
    {
        name: 'Commodities',
        topics: [
            'commodity prices',
            'oil prices',
            'natural gas data',
            'precious metals',
            'gold silver prices',
            'agricultural commodities',
            'lumber prices',
            'coal data',
            'iron ore prices',
            'commodity futures',
        ],
    },
    {
        name: 'Economics & Macro',
        topics: [
            'economic indicators',
            'GDP data',
            'inflation data',
            'CPI PPI',
            'unemployment data',
            'interest rates',
            'central bank data',
            'federal reserve',
            'ECB data',
            'trade balance',
            'national accounts',
            'purchasing managers index',
        ],
    },
    {
        name: 'Insurance & Risk',
        topics: ['insurance data', 'actuarial data', 'catastrophe data', 'flood risk', 'wildfire risk', 'earthquake risk', 'property risk', 'claims data', 'reinsurance'],
    },
    {
        name: 'Cryptocurrency & DeFi',
        topics: ['cryptocurrency prices', 'blockchain data', 'DeFi protocols', 'NFT data', 'on-chain analytics', 'token data', 'DEX data', 'wallet analytics', 'crypto sentiment'],
    },
    {
        name: 'Alternative Data (Finance)',
        topics: [
            'satellite imagery finance',
            'web scraping finance',
            'social sentiment trading',
            'credit card transaction data',
            'foot traffic data',
            'job postings economic indicator',
            'shipping container tracking finance',
            'ESG data',
        ],
    },

    // === ENERGY & UTILITIES ===
    {
        name: 'Oil & Gas',
        topics: ['oil production data', 'petroleum data', 'natural gas pipelines', 'refinery data', 'crude oil', 'OPEC data', 'drilling data', 'fracking data', 'LNG data'],
    },
    {
        name: 'Electricity & Grid',
        topics: ['electricity prices', 'power grid data', 'energy consumption', 'smart grid', 'electricity generation', 'power outage data', 'grid frequency', 'load forecasting', 'energy storage'],
    },
    {
        name: 'Renewables & Clean Energy',
        topics: [
            'solar energy data',
            'wind energy data',
            'hydropower',
            'geothermal data',
            'renewable energy capacity',
            'carbon credits',
            'green hydrogen',
            'battery storage data',
            'EV charging stations',
            'solar irradiance',
        ],
    },
    {
        name: 'Utilities & Infrastructure',
        topics: ['water utility data', 'gas utility data', 'telecom infrastructure', 'broadband coverage', 'utility rates', 'smart meters', 'infrastructure monitoring'],
    },

    // === AGRICULTURE & FOOD ===
    {
        name: 'Crops & Farming',
        topics: [
            'crop yield data',
            'agriculture APIs',
            'soil data',
            'crop prices',
            'planting data',
            'harvest data',
            'precision agriculture',
            'farm management',
            'crop disease detection',
            'seed data',
            'irrigation data',
        ],
    },
    {
        name: 'Livestock & Animal',
        topics: ['livestock data', 'cattle prices', 'poultry data', 'dairy data', 'animal health', 'veterinary data', 'feed data', 'meat production', 'aquaculture data', 'fisheries data'],
    },
    {
        name: 'Agrochemicals',
        topics: ['pesticide data', 'fertilizer data', 'herbicide usage', 'agrochemical regulations', 'pesticide residues', 'soil chemistry', 'nutrient data'],
    },
    {
        name: 'Food & Grocery',
        topics: ['food prices', 'grocery data', 'nutrition data', 'food safety', 'food recalls', 'restaurant data', 'recipe APIs', 'food composition', 'food supply chain', 'food waste data'],
    },

    // === ENVIRONMENT & CLIMATE ===
    {
        name: 'Climate & Weather',
        topics: [
            'climate data',
            'weather APIs',
            'historical weather',
            'climate models',
            'temperature records',
            'precipitation data',
            'storm tracking',
            'hurricane data',
            'drought data',
            'weather forecast APIs',
        ],
    },
    {
        name: 'Pollution & Air Quality',
        topics: ['air quality data', 'pollution monitoring', 'PM2.5 data', 'ozone data', 'carbon emissions', 'greenhouse gas data', 'water pollution', 'noise pollution data', 'emissions inventories'],
    },
    {
        name: 'Waste & Recycling',
        topics: ['waste management data', 'recycling rates', 'landfill data', 'e-waste data', 'plastic pollution', 'circular economy data', 'hazardous waste', 'waste composition'],
    },
    {
        name: 'Biodiversity & Ecology',
        topics: ['biodiversity data', 'species data', 'endangered species', 'wildlife tracking', 'ecological data', 'deforestation data', 'forest inventory', 'coral reef data', 'invasive species'],
    },
    {
        name: 'Water & Oceans',
        topics: ['ocean data', 'sea level data', 'ocean temperature', 'salinity data', 'wave data', 'tide data', 'river flow data', 'groundwater data', 'water quality', 'lake data', 'wetland data'],
    },

    // === HEALTH & MEDICINE ===
    {
        name: 'Public Health',
        topics: [
            'disease surveillance',
            'epidemic data',
            'vaccination data',
            'mortality data',
            'morbidity data',
            'health statistics',
            'CDC data',
            'WHO data',
            'pandemic data',
            'syndromic surveillance',
        ],
    },
    {
        name: 'Clinical & Biomedical',
        topics: [
            'clinical trials data',
            'drug data',
            'FDA data',
            'adverse events',
            'medical devices',
            'genomics data',
            'proteomics',
            'electronic health records',
            'medical imaging datasets',
            'pathology data',
        ],
    },
    {
        name: 'Pharmaceuticals',
        topics: ['drug pricing', 'drug interactions', 'pharmacology data', 'drug approval data', 'generic drugs', 'pharmaceutical patents', 'prescription data', 'drug targets'],
    },
    {
        name: 'Mental Health & Wellness',
        topics: ['mental health data', 'substance abuse data', 'suicide prevention data', 'wellness APIs', 'fitness data', 'sleep data', 'nutrition tracking'],
    },

    // === SCIENCE & RESEARCH ===
    {
        name: 'Chemistry & Materials',
        topics: [
            'chemical databases',
            'molecular data',
            'materials science data',
            'crystal structure data',
            'polymer data',
            'spectroscopy data',
            'chemical properties',
            'periodic table APIs',
            'compound data',
        ],
    },
    {
        name: 'Physics & Engineering',
        topics: ['physics datasets', 'particle physics data', 'CERN data', 'engineering datasets', 'mechanical properties', 'fluid dynamics data', 'thermodynamics data', 'acoustics data'],
    },
    {
        name: 'Biology & Life Sciences',
        topics: ['gene expression data', 'protein structure data', 'cell biology data', 'microbiome data', 'taxonomy data', 'phylogenetics', 'bioinformatics tools', 'sequence databases'],
    },
    {
        name: 'Earth Sciences',
        topics: ['geology data', 'seismology data', 'earthquake data', 'volcanic data', 'mineral data', 'soil surveys', 'paleontology data', 'stratigraphy data', 'geomagnetic data'],
    },

    // === SPACE & ASTRONOMY ===
    {
        name: 'Space & Satellites',
        topics: [
            'satellite imagery',
            'satellite tracking',
            'orbit data',
            'space weather',
            'NASA APIs',
            'ESA data',
            'asteroid data',
            'exoplanet data',
            'star catalogs',
            'cosmic ray data',
            'space debris tracking',
        ],
    },
    {
        name: 'Astronomy & Astrophysics',
        topics: ['astronomical catalogs', 'galaxy data', 'supernova data', 'gravitational wave data', 'radio astronomy', 'telescope data', 'spectral data', 'redshift data'],
    },
    {
        name: 'Remote Sensing',
        topics: ['Landsat data', 'Sentinel data', 'SAR data', 'LiDAR data', 'hyperspectral data', 'NDVI vegetation index', 'land use land cover', 'elevation data', 'DEM data', 'aerial imagery'],
    },

    // === TRANSPORT & LOGISTICS ===
    {
        name: 'Roads & Traffic',
        topics: ['traffic data', 'road conditions', 'accident data', 'speed data', 'congestion data', 'toll data', 'parking data', 'EV charging locations', 'fuel prices', 'road network data'],
    },
    {
        name: 'Public Transit',
        topics: ['GTFS data', 'bus routes', 'train schedules', 'metro data', 'transit APIs', 'real-time transit', 'ride sharing data', 'bike sharing data', 'scooter data'],
    },
    {
        name: 'Shipping & Maritime',
        topics: ['AIS ship tracking', 'port data', 'container shipping', 'maritime routes', 'vessel data', 'cargo data', 'shipping rates', 'port congestion', 'maritime safety'],
    },
    {
        name: 'Aviation',
        topics: ['flight tracking', 'airport data', 'airline data', 'flight delays', 'aviation safety', 'airspace data', 'aircraft data', 'NOTAM data', 'aviation weather'],
    },
    {
        name: 'Freight & Logistics',
        topics: ['supply chain data', 'logistics APIs', 'freight rates', 'warehouse data', 'last mile delivery', 'package tracking', 'customs data', 'trade data'],
    },

    // === TECHNOLOGY & COMPUTING ===
    {
        name: 'AI & Machine Learning',
        topics: ['ML datasets', 'NLP datasets', 'computer vision datasets', 'speech datasets', 'benchmark datasets', 'pre-trained models', 'AI APIs', 'synthetic data', 'annotation tools'],
    },
    {
        name: 'IoT & Sensors',
        topics: ['IoT data', 'sensor data', 'smart home data', 'industrial IoT', 'edge computing data', 'MQTT APIs', 'telemetry data', 'environmental sensors', 'wearable data'],
    },
    {
        name: 'Cybersecurity',
        topics: ['threat intelligence', 'vulnerability databases', 'malware data', 'IP reputation', 'DNS data', 'SSL certificate data', 'breach data', 'phishing data', 'CVE data', 'OSINT tools'],
    },
    {
        name: 'Developer Tools',
        topics: [
            'code search APIs',
            'package registry data',
            'GitHub APIs',
            'CI CD data',
            'documentation APIs',
            'programming language stats',
            'open source metrics',
            'license data',
            'dependency data',
        ],
    },
    {
        name: 'Cloud & Infrastructure',
        topics: ['cloud pricing data', 'datacenter locations', 'CDN data', 'DNS APIs', 'IP geolocation', 'BGP data', 'internet routing', 'downtime monitoring', 'SSL APIs'],
    },

    // === GOVERNMENT & PUBLIC SECTOR ===
    {
        name: 'Government Data',
        topics: [
            'census data',
            'government spending',
            'public procurement',
            'legislation data',
            'voting records',
            'election data',
            'lobbying data',
            'FOIA data',
            'government contracts',
            'regulatory data',
        ],
    },
    {
        name: 'Law & Legal',
        topics: ['court decisions', 'case law', 'patent data', 'trademark data', 'legal citations', 'statutory data', 'international law', 'sanctions data', 'legal NLP datasets'],
    },
    {
        name: 'Crime & Safety',
        topics: ['crime statistics', 'police data', 'prison data', 'gun violence data', 'hate crime data', 'missing persons', 'sex offender registries', 'fire incident data', 'emergency calls'],
    },
    {
        name: 'Military & Defense',
        topics: ['defense spending', 'arms trade data', 'conflict data', 'peacekeeping data', 'military bases', 'nuclear data', 'veteran data'],
    },

    // === DEMOGRAPHICS & SOCIETY ===
    {
        name: 'Demographics & Population',
        topics: ['population data', 'migration data', 'birth death rates', 'age distribution', 'ethnicity data', 'household data', 'urbanization data', 'poverty data'],
    },
    {
        name: 'Education',
        topics: ['school data', 'university rankings', 'student data', 'education statistics', 'literacy data', 'research funding', 'scholarship data', 'PISA scores', 'MOOC data'],
    },
    {
        name: 'Employment & Labor',
        topics: ['job market data', 'salary data', 'labor statistics', 'skills data', 'gig economy data', 'remote work data', 'workplace safety', 'union data', 'minimum wage data'],
    },
    {
        name: 'Housing & Real Estate',
        topics: ['property data', 'house prices', 'rental data', 'mortgage rates', 'construction data', 'building permits', 'zoning data', 'homeless data', 'housing inventory'],
    },

    // === MEDIA & COMMUNICATION ===
    {
        name: 'News & Journalism',
        topics: ['news APIs', 'media bias data', 'fact check APIs', 'press freedom data', 'news archives', 'newspaper data', 'media monitoring'],
    },
    {
        name: 'Social Media & Web',
        topics: ['social media APIs', 'web analytics', 'domain data', 'WHOIS data', 'web archive data', 'URL shortener APIs', 'content moderation APIs', 'trending topics'],
    },
    {
        name: 'Language & Text',
        topics: ['translation APIs', 'dictionary APIs', 'text analysis', 'sentiment analysis', 'language detection', 'OCR APIs', 'text to speech', 'speech to text', 'corpus data'],
    },
    {
        name: 'Images & Video',
        topics: ['image APIs', 'stock photo APIs', 'image recognition', 'video data', 'face detection', 'image generation', 'satellite imagery APIs', 'medical imaging'],
    },

    // === COMMERCE & INDUSTRY ===
    {
        name: 'Retail & E-commerce',
        topics: ['product data', 'barcode APIs', 'UPC data', 'price comparison', 'retail analytics', 'consumer spending', 'e-commerce data', 'review data'],
    },
    {
        name: 'Manufacturing & Industry',
        topics: ['manufacturing data', 'factory data', 'industrial production', 'quality control data', 'supply chain data', '3D printing data', 'robotics data', 'automation data'],
    },
    {
        name: 'Consumer Electronics',
        topics: ['device specs data', 'smartphone data', 'laptop benchmarks', 'electronics recycling', 'product recalls electronics', 'tech specs APIs', 'hardware compatibility'],
    },
    {
        name: 'Construction & Mining',
        topics: ['construction data', 'building materials prices', 'mining data', 'mineral production', 'quarry data', 'construction permits', 'infrastructure projects'],
    },

    // === SPORTS & ENTERTAINMENT ===
    {
        name: 'Sports',
        topics: [
            'sports statistics',
            'football data',
            'basketball data',
            'baseball data',
            'soccer data',
            'cricket data',
            'tennis data',
            'Olympics data',
            'sports betting odds',
            'fantasy sports data',
            'esports data',
        ],
    },
    {
        name: 'Entertainment & Culture',
        topics: ['movie data', 'TV show data', 'music APIs', 'book data', 'podcast data', 'event data', 'museum data', 'art data', 'cultural heritage data'],
    },
    {
        name: 'Gaming',
        topics: ['game data APIs', 'Steam data', 'game reviews', 'game prices', 'speedrun data', 'game statistics', 'twitch data', 'gaming hardware'],
    },

    // === GEOSPATIAL & MAPPING ===
    {
        name: 'Geospatial & Mapping',
        topics: [
            'geocoding APIs',
            'map tile APIs',
            'address validation',
            'postal code data',
            'boundary data',
            'points of interest',
            'routing APIs',
            'elevation APIs',
            'place name data',
            'coordinate systems',
        ],
    },
    {
        name: 'Urban & Smart Cities',
        topics: ['urban data', 'city data', 'smart city APIs', 'noise maps', 'green space data', 'street lighting', 'public WiFi', 'pedestrian data', 'bike infrastructure', 'city planning data'],
    },

    // === INTERNATIONAL & HUMANITARIAN ===
    {
        name: 'International Development',
        topics: ['World Bank data', 'UN data', 'IMF data', 'OECD data', 'humanitarian data', 'refugee data', 'foreign aid data', 'SDG indicators', 'global health data'],
    },
    {
        name: 'Trade & Tariffs',
        topics: ['international trade data', 'tariff data', 'customs data', 'import export data', 'trade agreements', 'sanctions data', 'WTO data', 'commodity trade data'],
    },
];

/** Pick a random group */
export function pickRandomGroup(): TopicGroup {
    return TOPIC_GROUPS[Math.floor(Math.random() * TOPIC_GROUPS.length)];
}

/** Pick a random topic from a random group, formatted as a discovery query */
export function generateDiscoveryQuery(): { group: string; query: string; } {
    const group = pickRandomGroup();
    // Pick 2-4 random topics from the group to form a focused query
    const shuffled = [...group.topics].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4 + Math.floor(Math.random() * 5));
    const query = `Find free APIs, datasets, and web services related to: ${selected.join(', ')}. Focus area: ${group.name}`;
    return { group: group.name, query };
}
