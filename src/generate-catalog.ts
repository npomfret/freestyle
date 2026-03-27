import { execSync } from 'child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { log } from './lib/logger.js';

const ROOT = resolve(import.meta.dirname, '..');
const FREE_STUFF = join(ROOT, 'free-stuff');
const CATALOG_MD_PATH = join(ROOT, 'CATALOG.md');
const CATALOG_JSON_PATH = join(ROOT, 'catalog.json');

// ============================================================
// Types
// ============================================================

interface Item {
    label: string;
    url: string;
}

interface Project {
    name: string;
    repoUrl: string;
    description: string;
    labels: string[];
    listBased: boolean;
    items: Item[];
}

interface Resource {
    name: string;
    url: string;
    kinds: string[];
    topics: string[];
    sources: string[];
    directDescriptions: string[];
}

// ============================================================
// Configuration
// ============================================================

const LIST_PREFIXES = ['awesome', 'awosome', 'best-of'];

const KNOWN_LIST_PROJECTS = new Set([
    'ai-audio-datasets',
    'ai-audio-datasets-list',
    'astro_datasets',
    'climate-change-data',
    'datasets',
    'digital-agriculture-datasets',
    'EEG-Datasets',
    'free-for-dev',
    'legal-ml-datasets',
    'open-archaeo',
    'open-access-fMRI-database',
    'open-computational-neuroscience-resources',
    'open-science-resources',
    'open-sustainable-technology',
    'public-api-list',
    'public-api-lists',
    'public-apis',
    'public_sport_science_datasets',
    'resources',
    'security-apis',
    'The-Databases-for-Drug-Discovery',
    'voice_datasets',
    'football_analytics',
    'python-resources-for-earth-sciences',
    'papers_for_protein_design_using_DL',
]);

const DIRECT_PROJECTS = new Set([
    'ais-vessel-traffic',
    'aisstream',
    'alphafold',
    'openalex-api-tutorials',
    'opendata',
    'openelections-core',
    'openaccess',
    'POP909-Dataset',
    'STEAD',
]);

const SKIP_DOMAINS = [
    'img.shields.io',
    'cdn.jsdelivr.net',
    'raw.githubusercontent.com',
    'github.com/user-attachments',
    'visitor-badge.glitch.me',
    'trackgit.com',
    'zenodo.org/badge',
    'mybinder.org',
    'colab.research.google.com/assets',
    'deepnote.com/buttons',
];

const SKIP_URL_PARTS = [
    '/issues',
    '/pulls',
    '/actions',
    '/releases',
    '/blob/main/README',
    '/blob/master/README',
    '/CONTRIBUTING',
    '/LICENSE',
    '/maintainerRole.md',
    '/free-stuff/',
];

const SKIP_ITEM_LABELS = new Set([
    'link',
    'github',
    'website',
    'paper',
    'doi',
    'docs',
    'documentation',
    'contributing',
    'contributors',
]);

const GENERIC_LABELS = new Set([
    ...SKIP_ITEM_LABELS,
    'download',
    'downloads',
    'source',
    'sources',
    'repo',
    'repository',
    'home',
    'homepage',
    'site',
]);

const NON_RESOURCE_LABEL_PARTS = [
    'about page',
    'webpage',
    'documentation',
    'docs',
    'tutorial',
    'course',
    'book',
    'paper',
    'survey',
    'slide',
    'talk',
    'video',
    'blog',
    'newsletter',
    'community',
    'conference',
    'workshop',
    'forum',
    'meetup',
    'discord',
    'slack',
    'tool',
    'software',
    'library',
    'framework',
    'sdk',
    'wrapper',
    'client',
];

const NON_RESOURCE_URL_PARTS = [
    'arxiv.org',
    'youtube.com',
    'youtu.be',
    'medium.com',
    'substack.com',
    'readthedocs.io',
    'wikipedia.org',
    'meetup.com',
    'discord.gg',
];

const API_HINTS = ['api', 'apis', 'graphql', 'rest', 'websocket', 'websockets', 'openapi'];
const DATASET_HINTS = [
    'dataset',
    'datasets',
    'database',
    'databases',
    'corpus',
    'corpora',
    'csv',
    'json',
    'parquet',
    'records',
    'open-data',
    'open data',
];

const STRONG_API_SOURCE_PROJECTS = new Set([
    'Awesome_APIs',
    'aisstream',
    'free-for-dev',
    'openalex-api-tutorials',
    'public-api-list',
    'public-api-lists',
    'public-apis',
    'security-apis',
    'awesome-open-source-space-data-apis',
]);

const TYPE_LABELS = new Set([
    'awesome-list',
    'dataset-list',
    'api-list',
    'tooling',
    'reference',
    'open-data',
    'codebase',
    'notebooks',
    'services',
    'real-time',
    'archived',
]);

const TOPIC_LABEL_ORDER = [
    'ai-ml',
    'audio',
    'bioinformatics',
    'chemistry',
    'climate',
    'crops',
    'crypto',
    'cybersecurity',
    'demographics',
    'developer',
    'drug-discovery',
    'banking',
    'food',
    'gaming',
    'geospatial',
    'earth-science',
    'government',
    'public-health',
    'humanities',
    'journalism',
    'law',
    'maritime',
    'materials',
    'neuroscience',
    'nlp',
    'open-science',
    'remote-sensing',
    'robotics',
    'semantic-web',
    'space',
    'sports',
    'logistics',
];

const TOPIC_RULES: [string, string[]][] = [
    ['ai-ml', ['artificial intelligence', 'machine learning', 'llm', 'deep learning', 'foundation models', 'data science', 'analytics', 'bibliometric']],
    ['audio', ['audio', 'speech', 'music', 'voice', 'sound effect', 'pop-song']],
    ['bioinformatics', ['bioinformatics', 'biomedical', 'genomic', 'genetics', 'protein', 'single-cell', 'omics']],
    ['chemistry', ['chemistry', 'chemical', 'cheminformatics']],
    ['climate', ['climate', 'sustainable', 'biodiversity', 'forest', 'hydrology', 'meteorology', 'climatology']],
    ['crops', ['agriculture', 'agritech', 'crop', 'farming']],
    ['crypto', ['blockchain', 'ethereum', 'bitcoin', 'crypto']],
    ['cybersecurity', ['security', 'cyber', 'osint', 'threat', 'hunting', 'pwned']],
    ['demographics', ['social science', 'democracy', 'twitter']],
    ['developer', ['developer', 'developers', 'open source authors']],
    ['drug-discovery', ['drug discovery', 'drug design']],
    ['banking', ['finance', 'quant', 'trading', 'market', 'fintech']],
    ['food', ['food', 'recipe', 'nutrition', 'cookbook']],
    ['gaming', ['game', 'gaming']],
    ['geospatial', ['geospatial', 'gis', 'openstreetmap', 'cartographic', 'urban ', 'mapping']],
    ['earth-science', ['geoscience', 'earth sciences', 'earth science', 'earthquake', 'seismic', 'seismology', 'geology']],
    ['government', ['government', 'procurement', 'election', 'electoral', 'parliament', 'ogd', 'civic']],
    ['public-health', ['health', 'medical', 'healthcare', 'clinical', 'patient', 'fmri', 'mri', 'brain-imaging']],
    ['humanities', ['humanities', 'archaeology', 'archaeo', 'bible', 'heritage', 'art history', 'museum', 'gallery']],
    ['journalism', ['journalism', 'media', 'communication research', 'data journalism']],
    ['law', ['legal', 'law', 'judgment', 'patent']],
    ['maritime', ['ais', 'vessel', 'maritime']],
    ['materials', ['materials science', 'materials informatics', 'atomistic', 'crystal', 'materials properties']],
    ['neuroscience', ['neuro', 'eeg', 'meg', 'ecog', 'lfp', 'neuroscience', 'connectome']],
    ['nlp', ['nlp', 'language model', 'large language model', 'text analytics', 'instruction tuning', 'chatbot']],
    ['open-science', ['open science', 'reproducibility', 'open research', 'scholarly']],
    ['remote-sensing', ['satellite', 'aerial imagery', 'remote sensing', 'earth observation']],
    ['robotics', ['robotics', 'autonomous', 'driving', 'vehicle']],
    ['semantic-web', ['semantic web', 'linked data', 'knowledge graph', 'wikibase', 'ontology']],
    ['space', ['space', 'astronomy', 'astro', 'cosmo', 'planetary']],
    ['sports', ['sport', 'football', 'soccer']],
    ['logistics', ['transport', 'transit', 'mobility']],
];

const MANUAL_DESC: Record<string, string> = {
    'awesome-datascience': 'Open-source study guide for learning data science, with tutorials, courses, tools, literature, and community resources.',
    'awesome-public-datasets': 'Large, topic-centric catalog of public datasets collected from many disciplines and generated from structured metadata.',
    'awesome-twitter-data': 'Curated links for collecting, studying, and working with Twitter/X data and related social media resources.',
    'football_analytics': 'Football analytics hub with learning materials, data sources, code, notebooks, dashboards, and community-curated references.',
    'llm-datasets': 'Curated list of datasets and tools for LLM post-training, including instruction, math, code, reasoning, and preference data.',
    'LLMDataHub': 'Curated collection of datasets for LLM pretraining, alignment, domain-specific tuning, and multimodal model development.',
    'Materials-Databases': 'Archived catalog of materials-science databases, APIs, codes, and machine-learning resources, kept mainly as a reference list.',
    'open-access-fMRI-database': 'Rough collection of open-access fMRI, MRI, EEG, and brain-imaging databases plus a few related analysis tools.',
    'python-resources-for-earth-sciences': 'Curated list of open-source Python libraries for geospatial work, hydrology, meteorology, climatology, oceanography, and seismology.',
    'best-of-atomistic-machine-learning': 'Ranked best-of index of atomistic machine-learning projects covering datasets, tools, methods, and community resources.',
    'awosome-bioinformatics': 'Typo-named but useful list of bioinformatics learning resources, software, databases, and practical references.',
    'alphafold': 'Implementation of the AlphaFold inference pipeline for protein structure prediction from amino-acid sequences.',
    'Awesome-Medical-Dataset': 'Large catalog of public medical datasets, benchmarks, and some related APIs for healthcare AI and research.',
    'awesome-ai-for-science': 'Curated papers, datasets, tools, and benchmarks spanning the fast-growing AI-for-science landscape.',
    'awesome-autonomous-driving-datasets': 'Work-in-progress directory of datasets relevant to autonomous driving research.',
    'awesome-chemistry-datasets': 'Curated collection of chemistry datasets and references for data-driven chemistry work.',
    'awesome-computational-social-science': 'Curated collection of datasets, tools, papers, and organizations for computational social science.',
    'Awesome-Datasets': 'General-purpose index of open datasets across many domains, maintained as an awesome-style collection.',
    'awesome-legal-nlp': 'List of legal NLP datasets and tasks, with emphasis on legal judgment prediction and related benchmarks.',
    'Awesome-LLMs-Datasets': 'Survey-style inventory of representative datasets for LLM pretraining, instruction tuning, preference learning, and evaluation.',
    'awesome-robotics-datasets': 'Collection of robotics dataset references and repositories for research use.',
    'awesome-single-cell': 'Collection of software packages and developer references for single-cell omics analysis workflows.',
    'climate-change-data': 'Collection of climate-change datasets, APIs, and open-source projects relevant to environmental analysis and ML work.',
    'HEP-ASTRO-COSMO': 'Community-maintained list of open-source packages, libraries, and tools for high-energy physics, astronomy, and cosmology.',
    'open-computational-neuroscience-resources': 'Resource list for computational neuroscience datasets, tools, papers, and community links.',
    'open-science-resources': 'Broad open-science directory covering open data repositories, code, publishing, search, policy, and collaboration tools.',
    'openalex-api-tutorials': 'Jupyter notebook tutorials showing common bibliometric analyses built on the OpenAlex scholarly API.',
    'STEAD': 'Large global earthquake waveform dataset for AI, with downloads, metadata, and examples for seismic modeling.',
    'resources': 'Opinionated resource list for materials informatics, including getting-started guides, tools, databases, and research groups.',
    'awesome-bio-datasets': 'Reference list of biological datasets and databases, especially genomics, expression, and molecular-function resources.',
    'awesome-expression-browser': 'Curated software and resources for browsing, visualizing, and exploring biological expression data.',
    'Awesome-Fashion-AI': 'Curated papers, datasets, code, and tutorials for AI applications in fashion and e-commerce.',
    'awesome-materials-informatics': 'Resource list for materials informatics, linking tools, learning materials, datasets, and community references.',
    'awesome-open-science': 'Curated tools, platforms, and communities that support transparent, reproducible, and collaborative open science.',
    'awesome-real-estate': 'Curated real-estate resources and projects, including data, tooling, and industry references.',
    'POP909-Dataset': 'Dataset repository for POP909, a pop-song dataset designed for music arrangement generation research.',
    'papers_for_protein_design_using_DL': 'Reading list of papers focused on protein design using deep learning methods.',
    'awesome-seismology': 'Curated seismology resources covering earthquakes, Earth structure, methods, software, and data.',
    'data-resources-for-materials-science': 'Collection of online and offline databases and datasets for physical, chemical, mechanical, and related materials properties.',
    'game-datasets': 'Curated game datasets intended for AI and machine-learning research on games and interactive systems.',
    'open-sustainable-technology': 'Directory and analysis of open-source technology related to climate, biodiversity, energy, and natural resources.',
    'public-datasets': 'Registry of public blockchain datasets and associated ETL/indexing infrastructure, mostly centered on BigQuery-accessible chains.',
    'awesome-public-real-time-datasets': 'Public real-time dataset list covering feeds and sources typically accessed over HTTP or WebSockets.',
    'awesome-open-geoscience': 'Curated geoscience repositories spanning software, data repositories, tutorials, books, and community resources.',
    'open-archaeo': 'Directory of open archaeology software and related resources, generated from a maintained structured source list.',
    'opendata': 'National Gallery of Art open collection dataset with frequently updated CSV exports and documentation.',
    'openaccess': 'Metropolitan Museum of Art open-access CSV export of collection records for research and reuse.',
    'free-for-dev': 'Directory of SaaS, PaaS, IaaS, and other developer services that offer meaningful free tiers.',
    'public-apis': 'Community-maintained directory of public APIs spanning many domains, intended for exploration and product building.',
    'public-api-list': 'Curated catalog of public APIs with free, freemium, and paid options for developers.',
    'public-api-lists': 'Hand-curated set of free and developer-friendly public API lists for side projects and production apps.',
    'The-Databases-for-Drug-Discovery': 'Draft directory of databases and reference sources used in drug-discovery work.',
};

const MANUAL_LABELS: Record<string, string[]> = {
    'alphafold': ['codebase', 'bioinformatics', 'ai-ml'],
    'ais-vessel-traffic': ['reference', 'maritime', 'geospatial'],
    'awesome-bio-datasets': ['awesome-list', 'dataset-list', 'bioinformatics'],
    'awesome-bioinfo-tools': ['awesome-list', 'tooling', 'bioinformatics'],
    'awesome-expression-browser': ['awesome-list', 'tooling', 'bioinformatics'],
    'Awesome-Fashion-AI': ['awesome-list', 'ai-ml', 'reference'],
    'Awesome-LLMs-Datasets': ['awesome-list', 'dataset-list', 'ai-ml', 'nlp'],
    'awesome-materials-informatics': ['awesome-list', 'materials', 'data-science'],
    'awesome-open-geoscience': ['awesome-list', 'geoscience', 'reference'],
    'awesome-open-science': ['awesome-list', 'open-data', 'reference', 'open-science'],
    'awesome-patent-retrieval': ['awesome-list', 'law', 'reference'],
    'awesome-real-estate': ['awesome-list', 'reference', 'open-data'],
    'awesome-seismology': ['awesome-list', 'geoscience', 'dataset-list'],
    'awosome-bioinformatics': ['awesome-list', 'bioinformatics', 'reference'],
    'best-of-atomistic-machine-learning': ['awesome-list', 'materials', 'ai-ml'],
    'climate-change-data': ['dataset-list', 'api-list', 'reference', 'climate'],
    'data-resources-for-materials-science': ['dataset-list', 'materials', 'reference'],
    'HEP-ASTRO-COSMO': ['tooling', 'reference', 'space'],
    'LLMDataHub': ['dataset-list', 'ai-ml', 'nlp'],
    'llm-datasets': ['dataset-list', 'ai-ml', 'nlp'],
    'Materials-Databases': ['dataset-list', 'materials', 'archived'],
    'open-access-fMRI-database': ['dataset-list', 'neuroscience', 'health'],
    'open-computational-neuroscience-resources': ['reference', 'tooling', 'neuroscience'],
    'openalex-api-tutorials': ['notebooks', 'api-list', 'open-data', 'reference'],
    'opendata': ['dataset-list', 'open-data', 'humanities'],
    'openaccess': ['dataset-list', 'open-data', 'humanities'],
    'papers_for_protein_design_using_DL': ['reference', 'bioinformatics', 'ai-ml'],
    'POP909-Dataset': ['dataset-list', 'audio', 'ai-ml'],
    'python-resources-for-earth-sciences': ['reference', 'tooling', 'geoscience'],
    'resources': ['reference', 'materials', 'data-science'],
    'STEAD': ['dataset-list', 'geoscience', 'ai-ml'],
    'The-Databases-for-Drug-Discovery': ['dataset-list', 'drug-discovery', 'health'],
    'free-for-dev': ['services', 'developer', 'reference'],
    'public-apis': ['api-list', 'developer', 'reference'],
    'public-api-list': ['api-list', 'developer', 'reference'],
    'public-api-lists': ['api-list', 'developer', 'reference'],
    'awesome-robotics-datasets': ['awesome-list', 'dataset-list', 'robotics'],
    'awesome-autonomous-driving-datasets': ['awesome-list', 'dataset-list', 'robotics'],
    'awesome-chemistry-datasets': ['awesome-list', 'dataset-list', 'chemistry'],
};

// ============================================================
// Link extraction regexes
// ============================================================

const INLINE_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const AUTO_LINK_RE = /<(https?:\/\/[^>]+)>/g;
const HTML_HREF_RE = /href=["'](https?:\/\/[^"']+)["']/gi;
const REF_DEF_RE = /^\[([^\]]+)\]:\s*(https?:\/\/\S+)/gm;
const BARE_URL_RE = /(?<!\()(?<!href=["'])\bhttps?:\/\/[^\s<>)\]]+/g;

// ============================================================
// HTML entity decoding (basic)
// ============================================================

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': '\'',
    '&apos;': '\'',
    '&nbsp;': ' ',
};

function decodeHtmlEntities(s: string): string {
    return s.replace(/&[#\w]+;/g, (m) => HTML_ENTITIES[m] ?? m);
}

// ============================================================
// Text utilities
// ============================================================

function cleanText(text: string): string {
    let s = decodeHtmlEntities(text);
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
    s = s.replace(/\[[^\]]+\]\([^)]+\)/g, (m) => m.split('](')[0].slice(1));
    s = s.replace(/[`*_>#|]/g, ' ');
    s = s.replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
    return s;
}

function finalizeSentence(text: string): string {
    let s = text.replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length > 165) s = s.slice(0, 165).replace(/\s+\S*$/, '') + '...';
    if (!/[.!?]$/.test(s)) s += '.';
    return s[0].toUpperCase() + s.slice(1);
}

function normalizeLabel(label: string, url: string): string {
    let s = cleanText(label) || url;
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > 120) s = s.slice(0, 120).replace(/\s+\S*$/, '') + '...';
    return s;
}

// ============================================================
// Project loading
// ============================================================

function gitOriginUrl(dirPath: string): string {
    let url = execSync(`git -C "${dirPath}" config --get remote.origin.url`, {
        encoding: 'utf-8',
    })
        .trim();
    if (url.startsWith('git@github.com:')) {
        url = 'https://github.com/' + url.slice('git@github.com:'.length);
    }
    if (url.endsWith('.git')) url = url.slice(0, -4);
    return url;
}

function primaryReadme(dirPath: string): string | null {
    const entries = readdirSync(dirPath).filter((name) => {
        const full = join(dirPath, name);
        return statSync(full).isFile() && name.toLowerCase().startsWith('readme');
    });
    entries.sort((a, b) => {
        const aGood = ['.md', '.rst'].includes(extname(a).toLowerCase()) ? 0 : 1;
        const bGood = ['.md', '.rst'].includes(extname(b).toLowerCase()) ? 0 : 1;
        return aGood - bGood || a.toLowerCase().localeCompare(b.toLowerCase());
    });
    return entries.length ? join(dirPath, entries[0]) : null;
}

function firstDescription(projectName: string, text: string): string {
    if (MANUAL_DESC[projectName]) return MANUAL_DESC[projectName];

    let title = '';
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#') && !title) {
            title = cleanText(line.replace(/^#+\s*/, ''));
            if (['about', 'content', 'dataset collections'].includes(title.toLowerCase())) {
                title = '';
            }
            continue;
        }
        const cleaned = cleanText(line);
        if (!cleaned) continue;
        const low = cleaned.toLowerCase();
        if (low.startsWith(':target:')) continue;
        const badgeWords = [
            'badge',
            'track awesome list',
            'visitor',
            'follow me on x',
            'github last commit',
            'github stars',
        ];
        if (badgeWords.some((w) => low.includes(w)) && cleaned.length < 140) continue;
        if (cleaned.length < 28) continue;
        return finalizeSentence(cleaned);
    }
    return finalizeSentence(title || projectName);
}

function labelsFor(projectName: string, description: string): string[] {
    if (MANUAL_LABELS[projectName]) return MANUAL_LABELS[projectName];

    const text = `${projectName} ${description}`.toLowerCase();
    const labels: string[] = [];
    const add = (l: string) => {
        if (!labels.includes(l)) labels.push(l);
    };

    if (LIST_PREFIXES.some((p) => projectName.toLowerCase().startsWith(p))) add('awesome-list');
    if (['dataset', 'datasets', 'corpus', 'database', 'metadata', 'waveform'].some((k) => text.includes(k))) add('dataset-list');
    if (['api', 'apis', 'websocket', 'websockets'].some((k) => text.includes(k))) add('api-list');
    if (['tool', 'tools', 'software', 'libraries', 'library', 'framework', 'platform', 'notebooks'].some((k) => text.includes(k))) add('tooling');
    if (['curated', 'resource', 'resources', 'guide', 'directory', 'collection', 'catalog', 'inventory', 'hub'].some((k) => text.includes(k))) add('reference');
    if (['open data', 'open access', 'open-access', 'public data', 'cc0', 'public domain'].some((k) => text.includes(k))) add('open-data');
    if (['implementation', 'pipeline', 'core repo', 'source code'].some((k) => text.includes(k))) add('codebase');
    if (['free api', 'free tier', 'service', 'services'].some((k) => text.includes(k))) add('services');
    if (text.includes('real-time') || text.includes('real time')) add('real-time');
    if (text.includes('archived') || text.includes('no longer maintained')) add('archived');

    for (const [label, needles] of TOPIC_RULES) {
        if (needles.some((n) => text.includes(n))) add(label);
    }

    return labels.slice(0, 5);
}

function isListBased(
    projectName: string,
    description: string,
    items: Item[],
    labels: string[],
): boolean {
    if (DIRECT_PROJECTS.has(projectName)) return false;

    const low = description.toLowerCase();
    const listPhrases = [
        'curated list',
        'list of',
        'directory',
        'collection',
        'collection of',
        'catalog',
        'index',
        'resource list',
        'dataset list',
        'resource hub',
    ];
    const datasetPhrases = [
        'list of',
        'directory',
        'collection',
        'catalog',
        'index',
        'gathers',
        'compilation',
    ];
    const listLang = listPhrases.some((p) => low.includes(p));
    const datasetSignal = datasetPhrases.some((p) => low.includes(p))
        || projectName.toLowerCase().includes('datasets');

    if (LIST_PREFIXES.some((p) => projectName.toLowerCase().startsWith(p))) return true;
    if (KNOWN_LIST_PROJECTS.has(projectName)) return true;
    if (items.length >= 3 && listLang) return true;
    if (items.length >= 10 && (listLang || labels.includes('reference') || labels.includes('dataset-list') || labels.includes('api-list'))) {
        if (labels.includes('dataset-list') && datasetSignal) return true;
        if (labels.includes('api-list') && listLang) return true;
        if (labels.includes('reference') && listLang) return true;
    }
    return false;
}

// ============================================================
// Link extraction & filtering
// ============================================================

function shouldSkipUrl(
    projectName: string,
    repoUrl: string,
    label: string,
    url: string,
): boolean {
    const lowUrl = url.toLowerCase();
    const lowLabel = label.toLowerCase();
    if (url.startsWith('mailto:')) return true;
    if (lowUrl.includes('github.com/npomfret/freestyle')) return true;
    if (SKIP_DOMAINS.some((d) => lowUrl.includes(d))) return true;
    if (SKIP_URL_PARTS.some((p) => lowUrl.includes(p))) return true;
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((e) => lowUrl.endsWith(e))) return true;
    if (SKIP_ITEM_LABELS.has(lowLabel)) return true;
    if (repoUrl && lowUrl.replace(/\/+$/, '') === repoUrl.toLowerCase().replace(/\/+$/, '')) return true;
    if (lowUrl.includes(`github.com/${projectName.toLowerCase()}`)) return true;
    if (lowUrl.includes('twitter.com') || lowUrl.includes('x.com')) return true;
    if (lowUrl.includes('linkedin.com')) return true;
    return false;
}

function extractItems(projectName: string, repoUrl: string, text: string): Item[] {
    const candidates: [string, string][] = [];

    for (const m of text.matchAll(INLINE_LINK_RE)) candidates.push([m[1], m[2]]);
    for (const m of text.matchAll(AUTO_LINK_RE)) candidates.push([m[1], m[1]]);
    for (const m of text.matchAll(HTML_HREF_RE)) candidates.push([m[1], m[1]]);
    for (const m of text.matchAll(REF_DEF_RE)) candidates.push([m[1], m[2]]);
    for (const m of text.matchAll(BARE_URL_RE)) candidates.push([m[0], m[0]]);

    const items: Item[] = [];
    const seen = new Set<string>();

    for (const [rawLabel, rawUrl] of candidates) {
        const url = rawUrl.trim().replace(/[).,;]+$/, '');
        const label = normalizeLabel(rawLabel, url);
        if (!url.startsWith('http')) continue;
        if (shouldSkipUrl(projectName, repoUrl, label, url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        items.push({ label, url });
    }

    items.sort((a, b) =>
        a.label.toLowerCase().localeCompare(b.label.toLowerCase())
        || a.url.toLowerCase().localeCompare(b.url.toLowerCase())
    );
    return items;
}

function loadProjects(): Project[] {
    const dirs = readdirSync(FREE_STUFF)
        .filter((name) => {
            if (name.startsWith('.')) return false;
            return statSync(join(FREE_STUFF, name)).isDirectory();
        })
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return dirs.map((name) => {
        const dirPath = join(FREE_STUFF, name);
        const repoUrl = gitOriginUrl(dirPath);
        const readmePath = primaryReadme(dirPath);
        const text = readmePath ? readFileSync(readmePath, 'utf-8') : '';
        const description = firstDescription(name, text);
        const labels = labelsFor(name, description);
        const items = extractItems(name, repoUrl, text);
        const listBased = isListBased(name, description, items, labels);
        return {
            name,
            repoUrl,
            description,
            labels,
            listBased,
            items: listBased ? items : [],
        };
    });
}

// ============================================================
// Resource building
// ============================================================

function projectResourceKinds(project: Project): Set<string> {
    const labels = new Set(project.labels);
    const kinds = new Set<string>();
    if (labels.has('api-list') || labels.has('services')) kinds.add('api');
    if (labels.has('dataset-list') || labels.has('open-data')) kinds.add('dataset');
    return kinds;
}

function projectTopics(project: Project): string[] {
    return project.labels.filter((l) => !TYPE_LABELS.has(l));
}

function itemResourceKinds(project: Project, item: Item): Set<string> {
    const kinds = new Set(projectResourceKinds(project));
    const text = `${item.label} ${item.url}`.toLowerCase();
    const apiHint = API_HINTS.some((h) => text.includes(h));
    const datasetHint = DATASET_HINTS.some((h) => text.includes(h));

    if (kinds.size === 1 && kinds.has('api') && project.listBased && !STRONG_API_SOURCE_PROJECTS.has(project.name)) {
        return apiHint ? new Set(['api']) : new Set();
    }
    if (kinds.has('api') && kinds.has('dataset')) {
        if (apiHint && !datasetHint) return new Set(['api']);
        if (datasetHint && !apiHint) return new Set(['dataset']);
        if (apiHint && datasetHint) return new Set(['api', 'dataset']);
        return new Set();
    }
    if (kinds.size === 0) {
        if (apiHint) kinds.add('api');
        if (datasetHint) kinds.add('dataset');
    }
    return kinds;
}

function looksNonResource(label: string, url: string): boolean {
    const lowLabel = label.toLowerCase();
    const lowUrl = url.toLowerCase();
    return NON_RESOURCE_LABEL_PARTS.some((p) => lowLabel.includes(p))
        || NON_RESOURCE_URL_PARTS.some((p) => lowUrl.includes(p));
}

function fallbackNameFromUrl(url: string): string {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let candidate: string;
    if (u.hostname.endsWith('github.com') && parts.length >= 2) {
        if (parts.length >= 5 && ['tree', 'blob'].includes(parts[2])) {
            candidate = parts[parts.length - 1];
        } else {
            candidate = parts[1];
        }
    } else if (parts.length > 0) {
        candidate = parts[parts.length - 1];
    } else {
        candidate = u.hostname;
    }
    candidate = candidate.replace(/[-_]+/g, ' ').trim();
    return candidate || u.hostname;
}

function chooseResourceName(url: string, names: string[]): string {
    const cleaned = names
        .map(cleanText)
        .filter((n) => n && !GENERIC_LABELS.has(n.toLowerCase()));
    if (cleaned.length) {
        cleaned.sort((a, b) => a.length - b.length || a.toLowerCase().localeCompare(b.toLowerCase()));
        return cleaned[0];
    }
    return fallbackNameFromUrl(url);
}

function buildResources(projects: Project[]): Resource[] {
    const catalog = new Map<string, {
        names: string[];
        kinds: Set<string>;
        topics: Set<string>;
        sources: Set<string>;
        descriptions: Set<string>;
    }>();

    function ensure(url: string) {
        if (!catalog.has(url)) {
            catalog.set(url, {
                names: [],
                kinds: new Set(),
                topics: new Set(),
                sources: new Set(),
                descriptions: new Set(),
            });
        }
        return catalog.get(url)!;
    }

    for (const project of projects) {
        const kinds = projectResourceKinds(project);
        const topics = projectTopics(project);
        if (kinds.size === 0) continue;

        if (!project.listBased) {
            const entry = ensure(project.repoUrl);
            entry.names.push(project.name);
            kinds.forEach((k) => entry.kinds.add(k));
            topics.forEach((t) => entry.topics.add(t));
            entry.sources.add(project.name);
            entry.descriptions.add(project.description);
            continue;
        }

        for (const item of project.items) {
            const itemKinds = itemResourceKinds(project, item);
            if (itemKinds.size === 0) continue;
            if (looksNonResource(item.label, item.url)) continue;
            const entry = ensure(item.url);
            entry.names.push(item.label);
            itemKinds.forEach((k) => entry.kinds.add(k));
            topics.forEach((t) => entry.topics.add(t));
            entry.sources.add(project.name);
        }
    }

    const resources: Resource[] = [];
    for (const [url, raw] of catalog) {
        const name = chooseResourceName(url, raw.names);
        if (GENERIC_LABELS.has(name.toLowerCase())) continue;
        resources.push({
            name,
            url,
            kinds: [...raw.kinds].sort(),
            topics: TOPIC_LABEL_ORDER.filter((l) => raw.topics.has(l)).slice(0, 4),
            sources: [...raw.sources].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
            directDescriptions: [...raw.descriptions].sort(),
        });
    }

    resources.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        || a.url.toLowerCase().localeCompare(b.url.toLowerCase())
    );
    return resources;
}

// ============================================================
// README rendering
// ============================================================

function formatSources(sources: string[], limit = 4): string {
    const shown = sources.slice(0, limit).map((s) => `\`${s}\``);
    if (sources.length > limit) shown.push(`+${sources.length - limit} more`);
    return shown.join(', ');
}

function bucketFor(name: string): string {
    for (const ch of name) {
        if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
        if (/\d/.test(ch)) return '0-9';
    }
    return 'Other';
}

function renderResourceSection(lines: string[], title: string, kind: string, resources: Resource[]): void {
    lines.push(`## ${title}`, '');
    const filtered = resources.filter((r) => r.kinds.includes(kind));
    if (!filtered.length) {
        lines.push('_No resources matched this category._', '');
        return;
    }

    const buckets = new Map<string, Resource[]>();
    for (const r of filtered) {
        const b = bucketFor(r.name);
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b)!.push(r);
    }

    const bucketOrder = ['0-9', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)), 'Other'];
    for (const bucket of bucketOrder) {
        const items = buckets.get(bucket);
        if (!items?.length) continue;
        lines.push(`### ${bucket}`, '');
        for (const r of items) {
            const details: string[] = [];
            if (r.directDescriptions.length) details.push(r.directDescriptions[0]);
            if (r.topics.length) details.push('topics: ' + r.topics.map((t) => `\`${t}\``).join(', '));
            details.push('sources: ' + formatSources(r.sources));
            lines.push(`- [${r.name}](${r.url}) — ${details.join('; ')}`);
        }
        lines.push('');
    }
}

function render(projects: Project[], resources: Resource[]): string {
    const apiCount = resources.filter((r) => r.kinds.includes('api')).length;
    const datasetCount = resources.filter((r) => r.kinds.includes('dataset')).length;
    const bothCount = resources.filter((r) => r.kinds.includes('api') && r.kinds.includes('dataset') && r.kinds.length === 2).length;
    const sourceProjects = projects.filter((p) => projectResourceKinds(p).size > 0);

    const lines: string[] = [
        '# Free API And Dataset Catalog',
        '',
        `This catalog consolidates likely free APIs and public/open datasets from the ${projects.length} visible top-level subprojects currently inside \`free-stuff\`. It deduplicates resources by URL, keeps direct API/dataset repos, and records which source lists each entry came from.`,
        '',
        'Generated by `src/generate-catalog.ts` from the local `free-stuff` checkout.',
        'All links are emitted as original upstream repository URLs or external resource URLs, never local mirror paths.',
        '',
        '## Scope',
        '',
        '- Focused on resource endpoints and repositories rather than fully mirroring every source list.',
        '- Includes direct repos that are themselves APIs or datasets, plus extracted links from list-based projects that look like API or dataset resources.',
        '- Excludes obvious papers, tutorials, courses, communities, and general tooling where heuristics can identify them.',
        '',
        '## Summary',
        '',
        `- Source subprojects scanned: ${projects.length}`,
        `- Source projects contributing likely API/dataset resources: ${sourceProjects.length}`,
        `- Unique API entries: ${apiCount.toLocaleString()}`,
        `- Unique dataset entries: ${datasetCount.toLocaleString()}`,
        `- Resources appearing in both categories: ${bothCount.toLocaleString()}`,
        '',
        '## Topic Labels',
        '',
        '- ' + TOPIC_LABEL_ORDER.map((l) => `\`${l}\``).join(', '),
        '',
    ];

    renderResourceSection(lines, 'APIs', 'api', resources);
    renderResourceSection(lines, 'Datasets', 'dataset', resources);

    return lines.join('\n');
}

// ============================================================
// Main
// ============================================================

function main(): void {
    const projects = loadProjects();
    const resources = buildResources(projects);

    writeFileSync(CATALOG_MD_PATH, render(projects, resources));
    const listCount = projects.filter((p) => p.listBased).length;
    log.info('catalog generated', {
        markdownPath: CATALOG_MD_PATH,
        jsonPath: CATALOG_JSON_PATH,
        projects: projects.length,
        listBased: listCount,
        direct: projects.length - listCount,
        resources: resources.length,
    });

    writeFileSync(CATALOG_JSON_PATH, JSON.stringify({ projects, resources }, null, 2));
}

main();
