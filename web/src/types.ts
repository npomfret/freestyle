export interface Source {
    name: string;
    url: string | null;
}

export interface Resource {
    id: number;
    name: string;
    url: string;
    created_at?: string;
    updated_at?: string;
    similarity?: number;
    kinds: string[];
    topics: string[];
    regions: string[];
    sources: Source[];
    descriptions: string[];
    analysis?: string | null;
}

export interface PagedResponse {
    items: Resource[];
    hasMore: boolean;
    offset: number;
    limit: number;
}

export interface TopicCount {
    topic: string;
    count: number;
}

export interface RegionCount {
    region: string;
    count: number;
}

export interface Stats {
    resources: number;
    apis: number;
    datasets: number;
    topics: number;
    withEmbeddings: number;
    added24h: number;
    checked24h: number;
    dead24h: number;
    repaired24h: number;
}
