import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const API = "http://localhost:3001/api";
const PAGE_SIZE = 30;

interface Source {
  name: string;
  url: string | null;
}

interface Resource {
  id: number;
  name: string;
  url: string;
  created_at?: string;
  updated_at?: string;
  similarity?: number;
  kinds: string[];
  topics: string[];
  sources: Source[];
  descriptions: string[];
  analysis?: string | null;
}

interface PagedResponse {
  items: Resource[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

interface TopicCount {
  topic: string;
  count: number;
}

interface Stats {
  resources: number;
  apis: number;
  datasets: number;
  topics: number;
  withEmbeddings: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Resource[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [recent, setRecent] = useState<Resource[]>([]);
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Track current search/browse mode for loadMore
  const modeRef = useRef<{ type: "search" | "browse"; query?: string; topic?: string; kind?: string }>({ type: "browse" });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/stats`).then((r) => r.json()).then(setStats);
    fetch(`${API}/topics`).then((r) => r.json()).then(setTopics);
    fetch(`${API}/recent?limit=12`).then((r) => r.json()).then(setRecent);
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setResults([]);
    modeRef.current = { type: "search", query, topic: selectedTopic, kind: selectedKind };
    const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: "0" });
    if (selectedTopic) params.set("topic", selectedTopic);
    if (selectedKind) params.set("kind", selectedKind);
    const res = await fetch(`${API}/search?${params}`);
    const data: PagedResponse = await res.json();
    setResults(data.items);
    setHasMore(data.hasMore);
    setLoading(false);
  }, [query, selectedTopic, selectedKind]);

  const browse = useCallback(
    async (topic?: string, kind?: string) => {
      setLoading(true);
      setSearched(true);
      setResults([]);
      modeRef.current = { type: "browse", topic, kind };
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
      if (topic) params.set("topic", topic);
      if (kind) params.set("kind", kind);
      const res = await fetch(`${API}/resources?${params}`);
      const data: PagedResponse = await res.json();
      setResults(data.items);
      setHasMore(data.hasMore);
      setLoading(false);
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const mode = modeRef.current;
    const offset = results.length;

    let url: string;
    if (mode.type === "search" && mode.query) {
      const params = new URLSearchParams({ q: mode.query, limit: String(PAGE_SIZE), offset: String(offset) });
      if (mode.topic) params.set("topic", mode.topic);
      if (mode.kind) params.set("kind", mode.kind);
      url = `${API}/search?${params}`;
    } else {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (mode.topic) params.set("topic", mode.topic);
      if (mode.kind) params.set("kind", mode.kind);
      url = `${API}/resources?${params}`;
    }

    const res = await fetch(url);
    const data: PagedResponse = await res.json();
    setResults((prev) => [...prev, ...data.items]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }, [loadingMore, hasMore, results.length]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const handleTopicClick = (topic: string) => {
    const next = topic === selectedTopic ? "" : topic;
    setSelectedTopic(next);
    setQuery("");
    browse(next || undefined, selectedKind || undefined);
  };

  const handleKindClick = (kind: string) => {
    const next = kind === selectedKind ? "" : kind;
    setSelectedKind(next);
    if (query) search();
    else browse(selectedTopic || undefined, next || undefined);
  };

  const clearFilters = () => {
    setSelectedTopic("");
    setSelectedKind("");
    setResults([]);
    setHasMore(false);
    setSearched(false);
    setQuery("");
  };

  const renderCard = (r: Resource, showAge?: boolean) => {
    const isExpanded = expandedId === r.id;
    return (
    <div key={r.id} className={`card ${isExpanded ? "card-expanded" : ""}`}>
      <div className="card-header" onClick={() => setExpandedId(isExpanded ? null : r.id)} style={{ cursor: r.analysis ? "pointer" : undefined }}>
        <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {r.name}
        </a>
        {r.similarity != null && (
          <span className="similarity">
            {(r.similarity * 100).toFixed(0)}% match
          </span>
        )}
        {showAge && r.created_at && (
          <span className="card-age">{timeAgo(r.created_at)}</span>
        )}
        {r.analysis && (
          <span className="expand-indicator">{isExpanded ? "\u25B2" : "\u25BC"}</span>
        )}
      </div>
      {r.descriptions.length > 0 && (
        <p className="description">{r.descriptions[0]}</p>
      )}
      {isExpanded && r.analysis && (
        <div className="analysis">{r.analysis}</div>
      )}
      <div className="tags">
        {r.kinds.map((k) => (
          <span key={k} className={`tag kind-${k}`}>
            {k}
          </span>
        ))}
        {r.topics.map((t) => (
          <span
            key={t}
            className="tag topic"
            onClick={() => handleTopicClick(t)}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="card-meta">
        <a href={r.url} className="card-url" target="_blank" rel="noopener noreferrer">{r.url}</a>
        {r.updated_at && (
          <span className="card-updated" title={new Date(r.updated_at).toLocaleString()}>
            updated {timeAgo(r.updated_at)}
          </span>
        )}
      </div>
      {r.sources.length > 0 && (
        <div className="card-sources">
          via{" "}
          {r.sources.slice(0, 3).map((s, i) => (
            <span key={s.name}>
              {i > 0 && ", "}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
              ) : (
                s.name
              )}
            </span>
          ))}
          {r.sources.length > 3 && ` +${r.sources.length - 3}`}
        </div>
      )}
    </div>
  );
  };

  return (
    <div className="app">
      <header>
        <h1>Freestyle Catalog</h1>
        {stats && (
          <div className="stats">
            <span>{stats.resources.toLocaleString()} resources</span>
            <span className="sep">·</span>
            <span>{stats.apis.toLocaleString()} APIs</span>
            <span className="sep">·</span>
            <span>{stats.datasets.toLocaleString()} datasets</span>
            <span className="sep">·</span>
            <span>{stats.topics} topics</span>
          </div>
        )}
      </header>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by meaning... (e.g. 'satellite imagery of crop health')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          autoFocus
        />
        <button onClick={search} disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div className="filters">
        <div className="kind-filters">
          {["api", "dataset", "service", "code"].map((k) => (
            <button
              key={k}
              className={`kind-btn ${selectedKind === k ? "active" : ""}`}
              onClick={() => handleKindClick(k)}
            >
              {k}
            </button>
          ))}
          {(selectedTopic || selectedKind || searched) && (
            <button className="clear-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <div className="topic-filters">
          {topics.map((t) => (
            <button
              key={t.topic}
              className={`topic-btn ${selectedTopic === t.topic ? "active" : ""}`}
              onClick={() => handleTopicClick(t.topic)}
            >
              {t.topic}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {!searched && recent.length > 0 && (
        <section className="recent-section">
          <h2>What's New</h2>
          <div className="recent-grid">
            {recent.map((r) => renderCard(r, true))}
          </div>
        </section>
      )}

      {searched && (
        <div className="results">
          {loading && <div className="status">Searching...</div>}
          {!loading && results.length === 0 && (
            <div className="status">No results found.</div>
          )}
          {results.map((r) => renderCard(r))}
          <div ref={sentinelRef} className="sentinel">
            {loadingMore && <div className="status">Loading more...</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
