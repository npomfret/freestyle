import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import ResourceCard from './ResourceCard';
import ResourceModal from './ResourceModal';
import { useRecent, useRelated, useTopicsAndStats, useResourceSearch } from './hooks';

function App() {
    const [query, setQuery] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedKind, setSelectedKind] = useState('');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const recent = useRecent();
    const related = useRelated(expandedId);
    const { topics, regions, stats } = useTopicsAndStats();
    const rs = useResourceSearch();

    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && rs.hasMore && !rs.loadingMore) rs.loadMore();
            },
            { rootMargin: '200px' },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [rs]);

    const doSearch = useCallback(() => {
        if (query.trim()) rs.search(query, selectedTopic || undefined, selectedKind || undefined, selectedRegion || undefined);
    }, [query, selectedTopic, selectedKind, selectedRegion, rs]);

    const handleTopicClick = (topic: string) => {
        const next = topic === selectedTopic ? '' : topic;
        setSelectedTopic(next);
        setQuery('');
        rs.browse(next || undefined, selectedKind || undefined, selectedRegion || undefined);
    };

    const handleKindClick = (kind: string) => {
        const next = kind === selectedKind ? '' : kind;
        setSelectedKind(next);
        if (query) {
            rs.search(query, selectedTopic || undefined, next || undefined, selectedRegion || undefined);
        } else {
            rs.browse(selectedTopic || undefined, next || undefined, selectedRegion || undefined);
        }
    };

    const handleRegionChange = (region: string) => {
        setSelectedRegion(region);
        if (query) {
            rs.search(query, selectedTopic || undefined, selectedKind || undefined, region || undefined);
        } else {
            rs.browse(selectedTopic || undefined, selectedKind || undefined, region || undefined);
        }
    };

    const clearFilters = () => {
        setSelectedTopic('');
        setSelectedKind('');
        setSelectedRegion('');
        setQuery('');
        rs.clear();
    };

    const expandedResource = expandedId != null
        ? [...recent, ...rs.results].find((r) => r.id === expandedId) ?? null
        : null;

    return (
        <div className='app'>
            {expandedResource && (
                <ResourceModal
                    resource={expandedResource}
                    related={related}
                    onClose={() => setExpandedId(null)}
                />
            )}

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
                        {(stats.added24h > 0 || stats.checked24h > 0) && (
                            <>
                                <span className='sep'>·</span>
                                <span>{stats.added24h} added today</span>
                                <span className='sep'>·</span>
                                <span>{stats.checked24h} checked today</span>
                                {stats.dead24h > 0 && (
                                    <>
                                        <span className='sep'>·</span>
                                        <span>{stats.dead24h} marked dead today</span>
                                    </>
                                )}
                            </>
                        )}
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
                    {regions.length > 0 && (
                        <select
                            className='region-select'
                            value={selectedRegion}
                            onChange={(e) => handleRegionChange(e.target.value)}
                        >
                            <option value=''>All regions</option>
                            {regions.map((r) => (
                                <option key={r.region} value={r.region}>
                                    {r.region} ({r.count})
                                </option>
                            ))}
                        </select>
                    )}
                    {(selectedTopic || selectedKind || selectedRegion || rs.searched) && (
                        <button className='clear-btn' onClick={clearFilters}>Clear filters</button>
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
                        {recent.map((r) => (
                            <ResourceCard
                                key={r.id}
                                resource={r}
                                showAge
                                onTopicClick={handleTopicClick}
                                onRegionClick={handleRegionChange}
                                onSelect={setExpandedId}
                            />
                        ))}
                    </div>
                </section>
            )}

            {rs.searched && (
                <div className='results'>
                    {rs.loading && <div className='status'>Searching...</div>}
                    {rs.error && <div className='status error'>Error: {rs.error}</div>}
                    {!rs.loading && !rs.error && rs.results.length === 0 && <div className='status'>No results found.</div>}
                    {rs.results.map((r) => (
                        <ResourceCard
                            key={r.id}
                            resource={r}
                            onTopicClick={handleTopicClick}
                            onRegionClick={handleRegionChange}
                            onSelect={setExpandedId}
                        />
                    ))}
                    <div ref={sentinelRef} className='sentinel'>
                        {rs.loadingMore && <div className='status'>Loading more...</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
