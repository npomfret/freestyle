import { useState, useEffect, useCallback } from "react";
import "./App.css";

const API = "http://localhost:3001/api";

interface Resource {
  id: number;
  name: string;
  url: string;
  similarity?: number;
  kinds: string[];
  topics: string[];
  sources: string[];
  descriptions: string[];
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

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Resource[]>([]);
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    fetch(`${API}/stats`).then((r) => r.json()).then(setStats);
    fetch(`${API}/topics`).then((r) => r.json()).then(setTopics);
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams({ q: query, limit: "50" });
    if (selectedTopic) params.set("topic", selectedTopic);
    if (selectedKind) params.set("kind", selectedKind);
    const res = await fetch(`${API}/search?${params}`);
    setResults(await res.json());
    setLoading(false);
  }, [query, selectedTopic, selectedKind]);

  const browse = useCallback(
    async (topic?: string, kind?: string) => {
      setLoading(true);
      setSearched(true);
      const params = new URLSearchParams({ limit: "50" });
      if (topic) params.set("topic", topic);
      if (kind) params.set("kind", kind);
      const res = await fetch(`${API}/resources?${params}`);
      setResults(await res.json());
      setLoading(false);
    },
    [],
  );

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
          {(selectedTopic || selectedKind) && (
            <button
              className="clear-btn"
              onClick={() => {
                setSelectedTopic("");
                setSelectedKind("");
                setResults([]);
                setSearched(false);
              }}
            >
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

      <div className="results">
        {loading && <div className="status">Searching...</div>}
        {!loading && searched && results.length === 0 && (
          <div className="status">No results found.</div>
        )}
        {results.map((r) => (
          <div key={r.id} className="card">
            <div className="card-header">
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.name}
              </a>
              {r.similarity != null && (
                <span className="similarity">
                  {(r.similarity * 100).toFixed(0)}% match
                </span>
              )}
            </div>
            {r.descriptions.length > 0 && (
              <p className="description">{r.descriptions[0]}</p>
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
            <div className="card-url">{r.url}</div>
            {r.sources.length > 0 && (
              <div className="card-sources">
                via {r.sources.slice(0, 3).join(", ")}
                {r.sources.length > 3 && ` +${r.sources.length - 3}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
