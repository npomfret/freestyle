#!/usr/bin/env python3

from __future__ import annotations

import html
import re
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
FREE_STUFF = ROOT / "free-stuff"
README_PATH = ROOT / "README.md"


INLINE_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
AUTO_LINK_RE = re.compile(r"<(https?://[^>]+)>")
HTML_HREF_RE = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.I)
REF_DEF_RE = re.compile(r"^\[([^\]]+)\]:\s*(https?://\S+)", re.M)
BARE_URL_RE = re.compile(r"(?<!\()(?<!href=[\"'])\bhttps?://[^\s<>)\]]+")

LIST_PREFIXES = ("awesome", "awosome", "best-of")
KNOWN_LIST_PROJECTS = {
    "ai-audio-datasets",
    "ai-audio-datasets-list",
    "astro_datasets",
    "climate-change-data",
    "datasets",
    "digital-agriculture-datasets",
    "EEG-Datasets",
    "free-for-dev",
    "legal-ml-datasets",
    "open-archaeo",
    "open-access-fMRI-database",
    "open-computational-neuroscience-resources",
    "open-science-resources",
    "open-sustainable-technology",
    "public-api-list",
    "public-api-lists",
    "public-apis",
    "public_sport_science_datasets",
    "resources",
    "security-apis",
    "The-Databases-for-Drug-Discovery",
    "voice_datasets",
    "football_analytics",
    "python-resources-for-earth-sciences",
    "papers_for_protein_design_using_DL",
}
DIRECT_PROJECTS = {
    "ais-vessel-traffic",
    "aisstream",
    "alphafold",
    "openalex-api-tutorials",
    "opendata",
    "openelections-core",
    "openaccess",
    "POP909-Dataset",
    "STEAD",
}

SKIP_DOMAINS = (
    "img.shields.io",
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
    "github.com/user-attachments",
    "visitor-badge.glitch.me",
    "trackgit.com",
    "zenodo.org/badge",
    "mybinder.org",
    "colab.research.google.com/assets",
    "deepnote.com/buttons",
)
SKIP_URL_PARTS = (
    "/issues",
    "/pulls",
    "/actions",
    "/releases",
    "/blob/main/README",
    "/blob/master/README",
    "/CONTRIBUTING",
    "/LICENSE",
    "/maintainerRole.md",
    "/free-stuff/",
)
SKIP_SCHEMES = ("mailto:",)
SKIP_ITEM_LABELS = {
    "link",
    "github",
    "website",
    "paper",
    "doi",
    "docs",
    "documentation",
    "contributing",
    "contributors",
}
GENERIC_RESOURCE_LABELS = SKIP_ITEM_LABELS | {
    "download",
    "downloads",
    "source",
    "sources",
    "repo",
    "repository",
    "home",
    "homepage",
    "site",
}
TYPE_LABELS = {
    "awesome-list",
    "dataset-list",
    "api-list",
    "tooling",
    "reference",
    "open-data",
    "codebase",
    "notebooks",
    "services",
    "real-time",
    "archived",
}
TOPIC_LABEL_ORDER = [
    "ai-ml",
    "agriculture",
    "audio",
    "bioinformatics",
    "blockchain",
    "chemistry",
    "climate",
    "cybersecurity",
    "data-science",
    "developer",
    "drug-discovery",
    "finance",
    "food",
    "games",
    "geospatial",
    "geoscience",
    "government",
    "health",
    "humanities",
    "journalism",
    "law",
    "maritime",
    "materials",
    "neuroscience",
    "nlp",
    "open-science",
    "remote-sensing",
    "robotics",
    "semantic-web",
    "social-science",
    "space",
    "sports",
    "transport",
]
NON_RESOURCE_LABEL_PARTS = (
    "about page",
    "webpage",
    "documentation",
    "docs",
    "tutorial",
    "course",
    "book",
    "paper",
    "survey",
    "slide",
    "talk",
    "video",
    "blog",
    "newsletter",
    "community",
    "conference",
    "workshop",
    "forum",
    "meetup",
    "discord",
    "slack",
    "tool",
    "software",
    "library",
    "framework",
    "sdk",
    "wrapper",
    "client",
)
NON_RESOURCE_URL_PARTS = (
    "arxiv.org",
    "youtube.com",
    "youtu.be",
    "medium.com",
    "substack.com",
    "readthedocs.io",
    "wikipedia.org",
    "meetup.com",
    "discord.gg",
)
API_HINTS = ("api", "apis", "graphql", "rest", "websocket", "websockets", "openapi")
STRONG_API_SOURCE_PROJECTS = {
    "Awesome_APIs",
    "aisstream",
    "free-for-dev",
    "openalex-api-tutorials",
    "public-api-list",
    "public-api-lists",
    "public-apis",
    "security-apis",
    "awesome-open-source-space-data-apis",
}
DATASET_HINTS = (
    "dataset",
    "datasets",
    "database",
    "databases",
    "corpus",
    "corpora",
    "csv",
    "json",
    "parquet",
    "records",
    "open-data",
    "open data",
)


MANUAL_DESC = {
    "awesome-datascience": "Open-source study guide for learning data science, with tutorials, courses, tools, literature, and community resources.",
    "awesome-public-datasets": "Large, topic-centric catalog of public datasets collected from many disciplines and generated from structured metadata.",
    "awesome-twitter-data": "Curated links for collecting, studying, and working with Twitter/X data and related social media resources.",
    "football_analytics": "Football analytics hub with learning materials, data sources, code, notebooks, dashboards, and community-curated references.",
    "llm-datasets": "Curated list of datasets and tools for LLM post-training, including instruction, math, code, reasoning, and preference data.",
    "LLMDataHub": "Curated collection of datasets for LLM pretraining, alignment, domain-specific tuning, and multimodal model development.",
    "Materials-Databases": "Archived catalog of materials-science databases, APIs, codes, and machine-learning resources, kept mainly as a reference list.",
    "open-access-fMRI-database": "Rough collection of open-access fMRI, MRI, EEG, and brain-imaging databases plus a few related analysis tools.",
    "python-resources-for-earth-sciences": "Curated list of open-source Python libraries for geospatial work, hydrology, meteorology, climatology, oceanography, and seismology.",
    "best-of-atomistic-machine-learning": "Ranked best-of index of atomistic machine-learning projects covering datasets, tools, methods, and community resources.",
    "awosome-bioinformatics": "Typo-named but useful list of bioinformatics learning resources, software, databases, and practical references.",
    "alphafold": "Implementation of the AlphaFold inference pipeline for protein structure prediction from amino-acid sequences.",
    "Awesome-Medical-Dataset": "Large catalog of public medical datasets, benchmarks, and some related APIs for healthcare AI and research.",
    "awesome-ai-for-science": "Curated papers, datasets, tools, and benchmarks spanning the fast-growing AI-for-science landscape.",
    "awesome-autonomous-driving-datasets": "Work-in-progress directory of datasets relevant to autonomous driving research.",
    "awesome-chemistry-datasets": "Curated collection of chemistry datasets and references for data-driven chemistry work.",
    "awesome-computational-social-science": "Curated collection of datasets, tools, papers, and organizations for computational social science.",
    "Awesome-Datasets": "General-purpose index of open datasets across many domains, maintained as an awesome-style collection.",
    "awesome-legal-nlp": "List of legal NLP datasets and tasks, with emphasis on legal judgment prediction and related benchmarks.",
    "Awesome-LLMs-Datasets": "Survey-style inventory of representative datasets for LLM pretraining, instruction tuning, preference learning, and evaluation.",
    "awesome-robotics-datasets": "Collection of robotics dataset references and repositories for research use.",
    "awesome-single-cell": "Collection of software packages and developer references for single-cell omics analysis workflows.",
    "climate-change-data": "Collection of climate-change datasets, APIs, and open-source projects relevant to environmental analysis and ML work.",
    "HEP-ASTRO-COSMO": "Community-maintained list of open-source packages, libraries, and tools for high-energy physics, astronomy, and cosmology.",
    "open-computational-neuroscience-resources": "Resource list for computational neuroscience datasets, tools, papers, and community links.",
    "open-science-resources": "Broad open-science directory covering open data repositories, code, publishing, search, policy, and collaboration tools.",
    "openalex-api-tutorials": "Jupyter notebook tutorials showing common bibliometric analyses built on the OpenAlex scholarly API.",
    "STEAD": "Large global earthquake waveform dataset for AI, with downloads, metadata, and examples for seismic modeling.",
    "resources": "Opinionated resource list for materials informatics, including getting-started guides, tools, databases, and research groups.",
    "awesome-bio-datasets": "Reference list of biological datasets and databases, especially genomics, expression, and molecular-function resources.",
    "awesome-expression-browser": "Curated software and resources for browsing, visualizing, and exploring biological expression data.",
    "Awesome-Fashion-AI": "Curated papers, datasets, code, and tutorials for AI applications in fashion and e-commerce.",
    "awesome-materials-informatics": "Resource list for materials informatics, linking tools, learning materials, datasets, and community references.",
    "awesome-open-science": "Curated tools, platforms, and communities that support transparent, reproducible, and collaborative open science.",
    "awesome-real-estate": "Curated real-estate resources and projects, including data, tooling, and industry references.",
    "POP909-Dataset": "Dataset repository for POP909, a pop-song dataset designed for music arrangement generation research.",
    "papers_for_protein_design_using_DL": "Reading list of papers focused on protein design using deep learning methods.",
    "awesome-seismology": "Curated seismology resources covering earthquakes, Earth structure, methods, software, and data.",
    "data-resources-for-materials-science": "Collection of online and offline databases and datasets for physical, chemical, mechanical, and related materials properties.",
    "game-datasets": "Curated game datasets intended for AI and machine-learning research on games and interactive systems.",
    "open-sustainable-technology": "Directory and analysis of open-source technology related to climate, biodiversity, energy, and natural resources.",
    "public-datasets": "Registry of public blockchain datasets and associated ETL/indexing infrastructure, mostly centered on BigQuery-accessible chains.",
    "awesome-public-real-time-datasets": "Public real-time dataset list covering feeds and sources typically accessed over HTTP or WebSockets.",
    "awesome-open-geoscience": "Curated geoscience repositories spanning software, data repositories, tutorials, books, and community resources.",
    "open-archaeo": "Directory of open archaeology software and related resources, generated from a maintained structured source list.",
    "opendata": "National Gallery of Art open collection dataset with frequently updated CSV exports and documentation.",
    "openaccess": "Metropolitan Museum of Art open-access CSV export of collection records for research and reuse.",
    "free-for-dev": "Directory of SaaS, PaaS, IaaS, and other developer services that offer meaningful free tiers.",
    "public-apis": "Community-maintained directory of public APIs spanning many domains, intended for exploration and product building.",
    "public-api-list": "Curated catalog of public APIs with free, freemium, and paid options for developers.",
    "public-api-lists": "Hand-curated set of free and developer-friendly public API lists for side projects and production apps.",
    "The-Databases-for-Drug-Discovery": "Draft directory of databases and reference sources used in drug-discovery work.",
}

MANUAL_LABELS = {
    "alphafold": ["codebase", "bioinformatics", "ai-ml"],
    "ais-vessel-traffic": ["reference", "maritime", "geospatial"],
    "awesome-bio-datasets": ["awesome-list", "dataset-list", "bioinformatics"],
    "awesome-bioinfo-tools": ["awesome-list", "tooling", "bioinformatics"],
    "awesome-expression-browser": ["awesome-list", "tooling", "bioinformatics"],
    "Awesome-Fashion-AI": ["awesome-list", "ai-ml", "reference"],
    "Awesome-LLMs-Datasets": ["awesome-list", "dataset-list", "ai-ml", "nlp"],
    "awesome-materials-informatics": ["awesome-list", "materials", "data-science"],
    "awesome-open-geoscience": ["awesome-list", "geoscience", "reference"],
    "awesome-open-science": ["awesome-list", "open-data", "reference", "open-science"],
    "awesome-patent-retrieval": ["awesome-list", "law", "reference"],
    "awesome-real-estate": ["awesome-list", "reference", "open-data"],
    "awesome-seismology": ["awesome-list", "geoscience", "dataset-list"],
    "awosome-bioinformatics": ["awesome-list", "bioinformatics", "reference"],
    "best-of-atomistic-machine-learning": ["awesome-list", "materials", "ai-ml"],
    "climate-change-data": ["dataset-list", "api-list", "reference", "climate"],
    "data-resources-for-materials-science": ["dataset-list", "materials", "reference"],
    "HEP-ASTRO-COSMO": ["tooling", "reference", "space"],
    "LLMDataHub": ["dataset-list", "ai-ml", "nlp"],
    "llm-datasets": ["dataset-list", "ai-ml", "nlp"],
    "Materials-Databases": ["dataset-list", "materials", "archived"],
    "open-access-fMRI-database": ["dataset-list", "neuroscience", "health"],
    "open-computational-neuroscience-resources": ["reference", "tooling", "neuroscience"],
    "openalex-api-tutorials": ["notebooks", "api-list", "open-data", "reference"],
    "opendata": ["dataset-list", "open-data", "humanities"],
    "openaccess": ["dataset-list", "open-data", "humanities"],
    "papers_for_protein_design_using_DL": ["reference", "bioinformatics", "ai-ml"],
    "POP909-Dataset": ["dataset-list", "audio", "ai-ml"],
    "python-resources-for-earth-sciences": ["reference", "tooling", "geoscience"],
    "resources": ["reference", "materials", "data-science"],
    "STEAD": ["dataset-list", "geoscience", "ai-ml"],
    "The-Databases-for-Drug-Discovery": ["dataset-list", "drug-discovery", "health"],
    "free-for-dev": ["services", "developer", "reference"],
    "public-apis": ["api-list", "developer", "reference"],
    "public-api-list": ["api-list", "developer", "reference"],
    "public-api-lists": ["api-list", "developer", "reference"],
    "awesome-robotics-datasets": ["awesome-list", "dataset-list", "robotics"],
    "awesome-autonomous-driving-datasets": ["awesome-list", "dataset-list", "robotics"],
    "awesome-chemistry-datasets": ["awesome-list", "dataset-list", "chemistry"],
}


@dataclass
class Item:
    label: str
    url: str


@dataclass
class Project:
    name: str
    repo_url: str
    description: str
    labels: list[str]
    list_based: bool
    items: list[Item]


@dataclass
class Resource:
    name: str
    url: str
    kinds: list[str]
    topics: list[str]
    sources: list[str]
    direct_descriptions: list[str]


def git_origin_url(path: Path) -> str:
    url = subprocess.check_output(
        ["git", "-C", str(path), "config", "--get", "remote.origin.url"],
        text=True,
    ).strip()
    if url.startswith("git@github.com:"):
        url = "https://github.com/" + url[len("git@github.com:") :]
    if url.endswith(".git"):
        url = url[:-4]
    return url


def primary_readme(path: Path) -> Path | None:
    readmes = sorted(
        [p for p in path.iterdir() if p.is_file() and p.name.lower().startswith("readme")],
        key=lambda p: (p.suffix.lower() not in {".md", ".rst"}, p.name.lower()),
    )
    return readmes[0] if readmes else None


def clean_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[[^\]]+\]\([^)]+\)", lambda m: m.group(0).split("](")[0][1:], text)
    text = re.sub(r"[`*_>#|]", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -")
    return text


def first_description(project_name: str, text: str) -> str:
    if project_name in MANUAL_DESC:
        return MANUAL_DESC[project_name]

    title = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#") and not title:
            title = clean_text(re.sub(r"^#+\s*", "", line))
            if title.lower() in {"about", "content", "dataset collections"}:
                title = ""
            continue
        cleaned = clean_text(line)
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered.startswith(":target:"):
            continue
        if any(
            token in lowered
            for token in (
                "badge",
                "track awesome list",
                "visitor",
                "follow me on x",
                "github last commit",
                "github stars",
            )
        ) and len(cleaned) < 140:
            continue
        if len(cleaned) < 28:
            continue
        return finalize_sentence(cleaned)
    return finalize_sentence(title or project_name)


def finalize_sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    if len(text) > 165:
        text = text[:165].rsplit(" ", 1)[0] + "..."
    if text[-1] not in ".!?":
        text += "."
    return text[0].upper() + text[1:]


def labels_for(project_name: str, description: str) -> list[str]:
    if project_name in MANUAL_LABELS:
        return MANUAL_LABELS[project_name]

    text = f"{project_name} {description}".lower()
    labels: list[str] = []

    def add(label: str) -> None:
        if label not in labels:
            labels.append(label)

    if project_name.lower().startswith(LIST_PREFIXES):
        add("awesome-list")
    if any(k in text for k in ("dataset", "datasets", "corpus", "database", "metadata", "waveform")):
        add("dataset-list")
    if any(k in text for k in ("api", "apis", "websocket", "websockets")):
        add("api-list")
    if any(k in text for k in ("tool", "tools", "software", "libraries", "library", "framework", "platform", "notebooks")):
        add("tooling")
    if any(k in text for k in ("curated", "resource", "resources", "guide", "directory", "collection", "catalog", "inventory", "hub")):
        add("reference")
    if any(k in text for k in ("open data", "open access", "open-access", "public data", "cc0", "public domain")):
        add("open-data")
    if any(k in text for k in ("implementation", "pipeline", "core repo", "source code")):
        add("codebase")
    if any(k in text for k in ("free api", "free tier", "service", "services")):
        add("services")
    if "real-time" in text or "real time" in text:
        add("real-time")
    if "archived" in text or "no longer maintained" in text:
        add("archived")

    topic_rules = [
        ("ai-ml", ("artificial intelligence", "machine learning", "llm", "deep learning", "foundation models")),
        ("agriculture", ("agriculture", "agritech", "crop", "farming")),
        ("audio", ("audio", "speech", "music", "voice", "sound effect", "pop-song")),
        ("bioinformatics", ("bioinformatics", "biomedical", "genomic", "genetics", "protein", "single-cell", "omics")),
        ("blockchain", ("blockchain", "ethereum", "bitcoin", "crypto")),
        ("chemistry", ("chemistry", "chemical", "cheminformatics")),
        ("climate", ("climate", "sustainable", "biodiversity", "forest", "hydrology", "meteorology", "climatology")),
        ("cybersecurity", ("security", "cyber", "osint", "threat", "hunting", "pwned")),
        ("data-science", ("data science", "analytics", "bibliometric")),
        ("developer", ("developer", "developers", "open source authors")),
        ("drug-discovery", ("drug discovery", "drug design")),
        ("finance", ("finance", "quant", "trading", "market", "fintech")),
        ("food", ("food", "recipe", "nutrition", "cookbook")),
        ("games", ("game", "gaming")),
        ("geospatial", ("geospatial", "gis", "openstreetmap", "cartographic", "urban ", "mapping")),
        ("geoscience", ("geoscience", "earth sciences", "earth science", "earthquake", "seismic", "seismology", "geology")),
        ("government", ("government", "procurement", "election", "electoral", "parliament", "ogd", "civic")),
        ("health", ("health", "medical", "healthcare", "clinical", "patient", "fmri", "mri", "brain-imaging")),
        ("humanities", ("humanities", "archaeology", "archaeo", "bible", "heritage", "art history", "museum", "gallery")),
        ("journalism", ("journalism", "media", "communication research", "data journalism")),
        ("law", ("legal", "law", "judgment", "patent")),
        ("maritime", ("ais", "vessel", "maritime")),
        ("materials", ("materials science", "materials informatics", "atomistic", "crystal", "materials properties")),
        ("neuroscience", ("neuro", "eeg", "meg", "ecog", "lfp", "neuroscience", "connectome")),
        ("nlp", ("nlp", "language model", "large language model", "text analytics", "instruction tuning", "chatbot")),
        ("open-science", ("open science", "reproducibility", "open research", "scholarly")),
        ("remote-sensing", ("satellite", "aerial imagery", "remote sensing", "earth observation")),
        ("robotics", ("robotics", "autonomous", "driving", "vehicle")),
        ("semantic-web", ("semantic web", "linked data", "knowledge graph", "wikibase", "ontology")),
        ("social-science", ("social science", "social media", "democracy", "twitter")),
        ("space", ("space", "astronomy", "astro", "cosmo", "planetary")),
        ("sports", ("sport", "football", "soccer")),
        ("transport", ("transport", "transit", "mobility")),
    ]
    for label, needles in topic_rules:
        if any(needle in text for needle in needles):
            add(label)

    return labels[:5]


def normalize_label(label: str, url: str) -> str:
    label = clean_text(label)
    if not label:
        label = url
    label = re.sub(r"\s+", " ", label).strip()
    if len(label) > 120:
        label = label[:120].rsplit(" ", 1)[0] + "..."
    return label


def should_skip_url(project_name: str, repo_url: str, label: str, url: str) -> bool:
    lowered_url = url.lower()
    lowered_label = label.lower()

    if any(url.startswith(prefix) for prefix in SKIP_SCHEMES):
        return True
    if "github.com/npomfret/freestyle" in lowered_url:
        return True
    if any(domain in lowered_url for domain in SKIP_DOMAINS):
        return True
    if any(part in lowered_url for part in SKIP_URL_PARTS):
        return True
    if any(lowered_url.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
        return True
    if lowered_label in SKIP_ITEM_LABELS:
        return True
    if repo_url and lowered_url.rstrip("/") == repo_url.lower().rstrip("/"):
        return True
    if f"github.com/{project_name.lower()}" in lowered_url:
        return True
    if "twitter.com" in lowered_url or "x.com" in lowered_url:
        return True
    if "linkedin.com" in lowered_url:
        return True
    return False


def extract_items(project_name: str, repo_url: str, text: str) -> list[Item]:
    candidates: list[tuple[str, str]] = []

    for match in INLINE_LINK_RE.finditer(text):
        candidates.append((match.group(1), match.group(2)))
    for match in AUTO_LINK_RE.finditer(text):
        candidates.append((match.group(1), match.group(1)))
    for match in HTML_HREF_RE.finditer(text):
        candidates.append((match.group(1), match.group(1)))
    for match in REF_DEF_RE.finditer(text):
        candidates.append((match.group(1), match.group(2)))
    for match in BARE_URL_RE.finditer(text):
        candidates.append((match.group(0), match.group(0)))

    items: list[Item] = []
    seen_urls: set[str] = set()
    for raw_label, raw_url in candidates:
        url = raw_url.strip().rstrip(").,;")
        label = normalize_label(raw_label, url)
        if not url.startswith("http"):
            continue
        if should_skip_url(project_name, repo_url, label, url):
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        items.append(Item(label=label, url=url))

    items.sort(key=lambda item: (item.label.lower(), item.url.lower()))
    return items


def is_list_based(project_name: str, description: str, items: list[Item], labels: list[str]) -> bool:
    if project_name in DIRECT_PROJECTS:
        return False

    lowered = description.lower()
    list_language = any(
        phrase in lowered
        for phrase in (
            "curated list",
            "list of",
            "directory",
            "collection",
            "collection of",
            "catalog",
            "index",
            "resource list",
            "dataset list",
            "resource hub",
        )
    )
    dataset_signal = any(
        phrase in lowered
        for phrase in (
            "list of",
            "directory",
            "collection",
            "catalog",
            "index",
            "gathers",
            "compilation",
        )
    ) or "datasets" in project_name.lower()

    if project_name.lower().startswith(LIST_PREFIXES):
        return True
    if project_name in KNOWN_LIST_PROJECTS:
        return True
    if len(items) >= 3 and list_language:
        return True
    if len(items) >= 10 and (list_language or "reference" in labels or "dataset-list" in labels or "api-list" in labels):
        if "dataset-list" in labels and dataset_signal:
            return True
        if "api-list" in labels and list_language:
            return True
        if "reference" in labels and list_language:
            return True
    return False


def load_projects() -> list[Project]:
    projects: list[Project] = []
    for path in sorted([p for p in FREE_STUFF.iterdir() if p.is_dir() and not p.name.startswith(".")], key=lambda p: p.name.lower()):
        repo_url = git_origin_url(path)
        readme = primary_readme(path)
        text = readme.read_text(errors="ignore") if readme else ""
        description = first_description(path.name, text)
        labels = labels_for(path.name, description)
        items = extract_items(path.name, repo_url, text)
        list_based = is_list_based(path.name, description, items, labels)
        projects.append(
            Project(
                name=path.name,
                repo_url=repo_url,
                description=description,
                labels=labels,
                list_based=list_based,
                items=items if list_based else [],
            )
        )
    return projects


def section_for(project: Project) -> str:
    labels = set(project.labels)
    name = project.name.lower()
    if "awesome-list" in labels or name.startswith(LIST_PREFIXES):
        if any(x in labels for x in ("ai-ml", "bioinformatics", "chemistry", "materials", "nlp")):
            return "Curated Lists: AI, Science, And Technical Domains"
        if any(x in labels for x in ("geospatial", "geoscience", "space", "transport", "climate", "government")):
            return "Curated Lists: Data, Geography, Government, And Science Domains"
        return "Curated Lists: General, Industry, And Community Resources"
    if "dataset-list" in labels and "codebase" not in labels and "services" not in labels:
        return "Data Repositories And Dataset Hubs"
    if any(x in labels for x in ("api-list", "codebase", "notebooks", "services")):
        return "APIs, Codebases, Tutorials, And Utilities"
    return "Other Open Data And Resource Projects"


def project_topics(project: Project) -> list[str]:
    return [label for label in project.labels if label not in TYPE_LABELS]


def project_resource_kinds(project: Project) -> set[str]:
    labels = set(project.labels)
    kinds: set[str] = set()
    if "api-list" in labels or "services" in labels:
        kinds.add("api")
    if "dataset-list" in labels or "open-data" in labels:
        kinds.add("dataset")
    return kinds


def item_resource_kinds(project: Project, item: Item) -> set[str]:
    kinds = set(project_resource_kinds(project))
    text = f"{item.label} {item.url}".lower()
    api_hint = any(hint in text for hint in API_HINTS)
    dataset_hint = any(hint in text for hint in DATASET_HINTS)

    if kinds == {"api"} and project.list_based and project.name not in STRONG_API_SOURCE_PROJECTS:
        return {"api"} if api_hint else set()

    if kinds == {"api", "dataset"}:
        if api_hint and not dataset_hint:
            return {"api"}
        if dataset_hint and not api_hint:
            return {"dataset"}
        if api_hint and dataset_hint:
            return {"api", "dataset"}
        return set()
    if not kinds:
        if api_hint:
            kinds.add("api")
        if dataset_hint:
            kinds.add("dataset")
    return kinds


def looks_non_resource(label: str, url: str) -> bool:
    lowered_label = label.lower()
    lowered_url = url.lower()
    if any(part in lowered_label for part in NON_RESOURCE_LABEL_PARTS):
        return True
    if any(part in lowered_url for part in NON_RESOURCE_URL_PARTS):
        return True
    return False


def fallback_name_from_url(url: str) -> str:
    parsed = urlparse(url)
    parts = [unquote(part) for part in parsed.path.split("/") if part]
    if parsed.netloc.endswith("github.com") and len(parts) >= 2:
        if len(parts) >= 5 and parts[2] in {"tree", "blob"}:
            candidate = parts[-1]
        else:
            candidate = parts[1]
    elif parts:
        candidate = parts[-1]
    else:
        candidate = parsed.netloc
    candidate = re.sub(r"[_\-]+", " ", candidate).strip()
    return candidate or parsed.netloc


def choose_resource_name(url: str, names: list[str]) -> str:
    cleaned: list[str] = []
    for name in names:
        normalized = clean_text(name)
        lowered = normalized.lower()
        if not normalized or lowered in GENERIC_RESOURCE_LABELS:
            continue
        cleaned.append(normalized)
    if cleaned:
        cleaned.sort(key=lambda value: (len(value), value.lower()))
        return cleaned[0]
    return fallback_name_from_url(url)


def format_sources(sources: list[str], limit: int = 4) -> str:
    shown = [f"`{source}`" for source in sources[:limit]]
    if len(sources) > limit:
        shown.append(f"+{len(sources) - limit} more")
    return ", ".join(shown)


def bucket_for(name: str) -> str:
    for char in name:
        if char.isalpha():
            return char.upper()
        if char.isdigit():
            return "0-9"
    return "Other"


def build_resources(projects: list[Project]) -> list[Resource]:
    catalog: dict[str, dict[str, object]] = {}

    def ensure(url: str) -> dict[str, object]:
        return catalog.setdefault(
            url,
            {
                "names": [],
                "kinds": set(),
                "topics": set(),
                "sources": set(),
                "descriptions": set(),
            },
        )

    for project in projects:
        kinds = project_resource_kinds(project)
        topics = project_topics(project)
        if not kinds:
            continue

        if not project.list_based:
            entry = ensure(project.repo_url)
            entry["names"].append(project.name)
            entry["kinds"].update(kinds)
            entry["topics"].update(topics)
            entry["sources"].add(project.name)
            entry["descriptions"].add(project.description)
            continue

        for item in project.items:
            item_kinds = item_resource_kinds(project, item)
            if not item_kinds:
                continue
            if looks_non_resource(item.label, item.url):
                continue
            entry = ensure(item.url)
            entry["names"].append(item.label)
            entry["kinds"].update(item_kinds)
            entry["topics"].update(topics)
            entry["sources"].add(project.name)

    resources: list[Resource] = []
    for url, raw in catalog.items():
        name = choose_resource_name(url, list(raw["names"]))
        if name.lower() in GENERIC_RESOURCE_LABELS:
            continue
        resources.append(
            Resource(
                name=name,
                url=url,
                kinds=sorted(raw["kinds"]),
                topics=[label for label in TOPIC_LABEL_ORDER if label in raw["topics"]][:4],
                sources=sorted(raw["sources"], key=str.lower),
                direct_descriptions=sorted(raw["descriptions"]),
            )
        )

    resources.sort(key=lambda resource: (resource.name.lower(), resource.url.lower()))
    return resources


def render_resource_section(lines: list[str], title: str, kind: str, resources: list[Resource]) -> None:
    lines.append(f"## {title}")
    lines.append("")
    filtered = [resource for resource in resources if kind in resource.kinds]
    if not filtered:
        lines.append("_No resources matched this category._")
        lines.append("")
        return

    buckets: dict[str, list[Resource]] = {}
    for resource in filtered:
        buckets.setdefault(bucket_for(resource.name), []).append(resource)

    for bucket in ["0-9"] + [chr(code) for code in range(ord("A"), ord("Z") + 1)] + ["Other"]:
        bucket_resources = buckets.get(bucket, [])
        if not bucket_resources:
            continue
        lines.append(f"### {bucket}")
        lines.append("")
        for resource in bucket_resources:
            details: list[str] = []
            if resource.direct_descriptions:
                details.append(resource.direct_descriptions[0])
            if resource.topics:
                details.append("topics: " + ", ".join(f"`{topic}`" for topic in resource.topics))
            details.append("sources: " + format_sources(resource.sources))
            lines.append(f"- [{resource.name}]({resource.url}) — {'; '.join(details)}")
        lines.append("")


def render(projects: list[Project]) -> str:
    resources = build_resources(projects)
    api_resources = [resource for resource in resources if "api" in resource.kinds]
    dataset_resources = [resource for resource in resources if "dataset" in resource.kinds]
    source_projects = [project for project in projects if project_resource_kinds(project)]

    lines: list[str] = []
    lines.append("# Free API And Dataset Catalog")
    lines.append("")
    lines.append(
        f"This catalog consolidates likely free APIs and public/open datasets from the {len(projects)} visible top-level"
        f" subprojects currently inside `free-stuff`. It deduplicates resources by URL, keeps direct API/dataset repos,"
        f" and records which source lists each entry came from."
    )
    lines.append("")
    lines.append("Generated by `scripts/generate_free_stuff_catalog.py` from the local `free-stuff` checkout.")
    lines.append("All links are emitted as original upstream repository URLs or external resource URLs, never local mirror paths.")
    lines.append("")
    lines.append("## Scope")
    lines.append("")
    lines.append("- Focused on resource endpoints and repositories rather than fully mirroring every source list.")
    lines.append("- Includes direct repos that are themselves APIs or datasets, plus extracted links from list-based projects that look like API or dataset resources.")
    lines.append("- Excludes obvious papers, tutorials, courses, communities, and general tooling where heuristics can identify them.")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Source subprojects scanned: {len(projects)}")
    lines.append(f"- Source projects contributing likely API/dataset resources: {len(source_projects)}")
    lines.append(f"- Unique API entries: {len(api_resources):,}")
    lines.append(f"- Unique dataset entries: {len(dataset_resources):,}")
    lines.append(f"- Resources appearing in both categories: {sum(1 for resource in resources if set(resource.kinds) == {'api', 'dataset'}):,}")
    lines.append("")
    lines.append("## Topic Labels")
    lines.append("")
    lines.append("- " + ", ".join(f"`{label}`" for label in TOPIC_LABEL_ORDER))
    lines.append("")

    render_resource_section(lines, "APIs", "api", resources)
    render_resource_section(lines, "Datasets", "dataset", resources)

    return "\n".join(lines)


def github_heading_slug(text: str) -> str:
    # Match GitHub's documented README heading rules:
    # lower-case, spaces -> hyphens, and remove punctuation such as underscores.
    slug_chars: list[str] = []
    pending_hyphen = False
    for char in text.strip().lower():
        if char.isspace():
            pending_hyphen = True
            continue
        if char.isalnum():
            if pending_hyphen and slug_chars:
                slug_chars.append("-")
            slug_chars.append(char)
            pending_hyphen = False
            continue
        if char == "-":
            slug_chars.append("-")
            pending_hyphen = False
    return "".join(slug_chars).strip("-")


def main() -> None:
    projects = load_projects()
    README_PATH.write_text(render(projects))
    counts = Counter("list" if project.list_based else "direct" for project in projects)
    print(f"Wrote {README_PATH}")
    print(f"Projects: {len(projects)}")
    print(f"List-based: {counts['list']}")
    print(f"Direct: {counts['direct']}")


if __name__ == "__main__":
    main()
