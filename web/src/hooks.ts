import { useCallback, useEffect, useRef, useState } from 'react';
import { API, PAGE_SIZE, fetchJson } from './api';
import type { Resource, TopicCount, RegionCount, Stats, PagedResponse } from './types';

export function useRelated(id: number | null): Resource[] {
    const [related, setRelated] = useState<Resource[]>([]);
    useEffect(() => {
        if (id == null) { setRelated([]); return; }
        fetchJson<Resource[]>(`${API}/resources/${id}/related`)
            .then(setRelated)
            .catch(() => setRelated([]));
    }, [id]);
    return related;
}

export function useRecent(): Resource[] {
    const [recent, setRecent] = useState<Resource[]>([]);
    useEffect(() => {
        fetchJson<Resource[]>(`${API}/recent?limit=12`).then(setRecent).catch(() => {});
    }, []);
    return recent;
}

export function useTopicsAndStats(): { topics: TopicCount[]; regions: RegionCount[]; stats: Stats | null } {
    const [topics, setTopics] = useState<TopicCount[]>([]);
    const [regions, setRegions] = useState<RegionCount[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);

    useEffect(() => {
        fetchJson<Stats>(`${API}/stats`).then(setStats).catch(() => {});
        fetchJson<TopicCount[]>(`${API}/topics`).then(setTopics).catch(() => {});
        fetchJson<RegionCount[]>(`${API}/regions`).then(setRegions).catch(() => {});
    }, []);

    return { topics, regions, stats };
}

export interface ResourceSearchState {
    results: Resource[];
    hasMore: boolean;
    loading: boolean;
    loadingMore: boolean;
    searched: boolean;
    error: string | null;
    search: (query: string, topic?: string, kind?: string, region?: string) => Promise<void>;
    browse: (topic?: string, kind?: string, region?: string) => Promise<void>;
    loadMore: () => Promise<void>;
    clear: () => void;
}

export function useResourceSearch(): ResourceSearchState {
    const [results, setResults] = useState<Resource[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modeRef = useRef<{ type: 'search' | 'browse'; query?: string; topic?: string; kind?: string; region?: string }>({ type: 'browse' });

    const search = useCallback(async (query: string, topic?: string, kind?: string, region?: string) => {
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        setResults([]);
        setError(null);
        modeRef.current = { type: 'search', query, topic, kind, region };
        const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: '0' });
        if (topic) params.set('topic', topic);
        if (kind) params.set('kind', kind);
        if (region) params.set('region', region);
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

    const browse = useCallback(async (topic?: string, kind?: string, region?: string) => {
        setLoading(true);
        setSearched(true);
        setResults([]);
        setError(null);
        modeRef.current = { type: 'browse', topic, kind, region };
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: '0' });
        if (topic) params.set('topic', topic);
        if (kind) params.set('kind', kind);
        if (region) params.set('region', region);
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
            if (mode.region) params.set('region', mode.region);
            url = `${API}/search?${params}`;
        } else {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
            if (mode.topic) params.set('topic', mode.topic);
            if (mode.kind) params.set('kind', mode.kind);
            if (mode.region) params.set('region', mode.region);
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
