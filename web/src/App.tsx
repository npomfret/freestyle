import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const API = '/api';
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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

// ============================================================
// Custom hooks
// ============================================================

function useRecent() {
    const [recent, setRecent] = useState<Resource[]>([]);

    useEffect(() => {
        fetchJson<Resource[]>(`${API}/recent?limit=12`).then(setRecent).catch(() => {});
    }, []);

    return recent;
}

function useTopicsAndStats() {
    const [topics, setTopics] = useState<TopicCount[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);

    useEffect(() => {
        fetchJson<Stats>(`${API}/stats`).then(setStats).catch(() => {});
        fetchJson<TopicCount[]>(`${API}/topics`).then(setTopics).catch(() => {});
    }, []);

    return { topics, stats };
}

function useResourceSearch() {
    const [results, setResults] = useState<Resource[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modeRef = useRef<{ type: 'search' | 'browse'; query?: string; topic?: string; kind?: string }>({ type: 'browse' });

    const search = useCallback(async (query: string, topic?: string, kind?: string) => {
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        setResults([]);
        setError(null);
        modeRef.current = { type: 'search', query, topic, kind };
        const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: '0' });
        if (topic) params.set('topic', topic);
        if (kind) params.set('kind', kind);
        try {
            const data = await fetchJson<PagedResponse>(`${API}/search?${params}`);
            setResults(data.items);
            setHasMore(data.hasMore);
        } catch (err) {
            setError(String(err));
            setResults([]);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, []);

    const browse = useCallback(async (topic?: string, kind?: string) => {
        setLoading(true);
        setSearched(true);
        setResults([]);
        setError(null);
        modeRef.current = { type: 'browse', topic, kind };
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: '0' });
        if (topic) params.set('topic', topic);
        if (kind) params.set('kind', kind);
        try {
            const data = await fetchJson<PagedResponse>(`${API}/resources?${params}`);
            setResults(data.items);
            setHasMore(data.hasMore);
        } catch (err) {
            setError(String(err));
            setResults([]);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);

        const mode = modeRef.current;
        const offset = results.length;

        let url: string;
        if (mode.type === 'search' && mode.query) {
            const params = new URLSearchParams({ q: mode.query, limit: String(PAGE_SIZE), offset: String(offset) });
            if (mode.topic) params.set('topic', mode.topic);
            if (mode.kind) params.set('kind', mode.kind);
            url = `${API}/search?${params}`;
        } else {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
            if (mode.topic) params.set('topic', mode.topic);
            if (mode.kind) params.set('kind', mode.kind);
            url = `${API}/resources?${params}`;
        }

        try {
            const data = await fetchJson<PagedResponse>(url);
            setResults((prev) => [...prev, ...data.items]);
            setHasMore(data.hasMore);
        } catch {
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, results.length]);

    const clear = useCallback(() => {
        setResults([]);
        setHasMore(false);
        setSearched(false);
        setError(null);
    }, []);

    return { results, hasMore, loading, loadingMore, searched, error, search, browse, loadMore, clear };
}

// ============================================================
// App
// ============================================================

function App() {
    const [query, setQuery] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedKind, setSelectedKind] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const recent = useRecent();
    const { topics, stats } = useTopicsAndStats();
    const rs = useResourceSearch();

    const sentinelRef = useRef<HTMLDivElement>(null);

    // IntersectionObserver for infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && rs.hasMore && !rs.loadingMore) {
                    rs.loadMore();
                }
            },
            { rootMargin: '200px' },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [rs.hasMore, rs.loadingMore, rs.loadMore]);

    const doSearch = useCallback(() => {
        if (query.trim()) rs.search(query, selectedTopic || undefined, selectedKind || undefined);
    }, [query, selectedTopic, selectedKind, rs.search]);

    const handleTopicClick = (topic: string) => {
        const next = topic === selectedTopic ? '' : topic;
        setSelectedTopic(next);
        setQuery('');
        rs.browse(next || undefined, selectedKind || undefined);
    };

    // Fix: pass the new kind directly instead of reading stale state
    const handleKindClick = (kind: string) => {
        const next = kind === selectedKind ? '' : kind;
        setSelectedKind(next);
        if (query) {
            rs.search(query, selectedTopic || undefined, next || undefined);
        } else {
            rs.browse(selectedTopic || undefined, next || undefined);
        }
    };

    const clearFilters = () => {
        setSelectedTopic('');
        setSelectedKind('');
        setQuery('');
        rs.clear();
    };

    const renderCard = (r: Resource, showAge?: boolean) => {
        const isExpanded = expandedId === r.id;
        return (
            <div key={r.id} className={`card ${isExpanded ? 'card-expanded' : ''}`}>
                <div className='card-header' onClick={() => setExpandedId(isExpanded ? null : r.id)} style={{ cursor: r.analysis ? 'pointer' : undefined }}>
                    <a href={r.url} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()}>
                        {r.name}
                    </a>
                    {r.similarity != null && (
                        <span className='similarity'>
                            {(r.similarity * 100).toFixed(0)}% match
                        </span>
                    )}
                    {showAge && r.created_at && <span className='card-age'>{timeAgo(r.created_at)}</span>}
                    {r.analysis && <span className='expand-indicator'>{isExpanded ? '\u25B2' : '\u25BC'}</span>}
                </div>
                {r.descriptions.length > 0 && <p className='description'>{r.descriptions[0]}</p>}
                {isExpanded && r.analysis && <div className='analysis'>{r.analysis}</div>}
                <div className='tags'>
                    {r.kinds.map((k) => (
                        <span key={k} className={`tag kind-${k}`}>
                            {k}
                        </span>
                    ))}
                    {r.topics.map((t) => (
                        <span
                            key={t}
                            className='tag topic'
                            onClick={() => handleTopicClick(t)}
                        >
                            {t}
                        </span>
                    ))}
                </div>
                <div className='card-meta'>
                    <a href={r.url} className='card-url' target='_blank' rel='noopener noreferrer'>{r.url}</a>
                    {r.updated_at && (
                        <span className='card-updated' title={new Date(r.updated_at).toLocaleString()}>
                            updated {timeAgo(r.updated_at)}
                        </span>
                    )}
                </div>
                {r.sources.length > 0 && (
                    <div className='card-sources'>
                        via {r.sources.slice(0, 3).map((s, i) => (
                            <span key={s.name}>
                                {i > 0 && ', '}
                                {s.url ? <a href={s.url} target='_blank' rel='noopener noreferrer'>{s.name}</a> : (
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
        <div className='app'>
            <header>
                <h1>Freestyle Catalog</h1>
                {stats && (
                    <div className='stats'>
                        <span>{stats.resources.toLocaleString()} resources</span>
                        <span className='sep'>·</span>
                        <span>{stats.apis.toLocaleString()} APIs</span>
                        <span className='sep'>·</span>
                        <span>{stats.datasets.toLocaleString()} datasets</span>
                        <span className='sep'>·</span>
                        <span>{stats.topics} topics</span>
                    </div>
                )}
            </header>

            <div className='search-bar'>
                <input
                    type='text'
                    placeholder="Search by meaning... (e.g. 'satellite imagery of crop health')"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                    autoFocus
                />
                <button onClick={doSearch} disabled={rs.loading || !query.trim()}>
                    {rs.loading ? 'Searching...' : 'Search'}
                </button>
            </div>

            <div className='filters'>
                <div className='kind-filters'>
                    {['api', 'dataset', 'service', 'code'].map((k) => (
                        <button
                            key={k}
                            className={`kind-btn ${selectedKind === k ? 'active' : ''}`}
                            onClick={() => handleKindClick(k)}
                        >
                            {k}
                        </button>
                    ))}
                    {(selectedTopic || selectedKind || rs.searched) && (
                        <button className='clear-btn' onClick={clearFilters}>
                            Clear filters
                        </button>
                    )}
                </div>
                <div className='topic-filters'>
                    {topics.map((t) => (
                        <button
                            key={t.topic}
                            className={`topic-btn ${selectedTopic === t.topic ? 'active' : ''}`}
                            onClick={() => handleTopicClick(t.topic)}
                        >
                            {t.topic}
                            <span className='count'>{t.count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {!rs.searched && recent.length > 0 && (
                <section className='recent-section'>
                    <h2>What's New</h2>
                    <div className='recent-grid'>
                        {recent.map((r) => renderCard(r, true))}
                    </div>
                </section>
            )}

            {rs.searched && (
                <div className='results'>
                    {rs.loading && <div className='status'>Searching...</div>}
                    {rs.error && <div className='status error'>Error: {rs.error}</div>}
                    {!rs.loading && !rs.error && rs.results.length === 0 && <div className='status'>No results found.</div>}
                    {rs.results.map((r) => renderCard(r))}
                    <div ref={sentinelRef} className='sentinel'>
                        {rs.loadingMore && <div className='status'>Loading more...</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
