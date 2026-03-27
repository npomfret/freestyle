// Branded types to prevent mixing up IDs and domain strings at compile time.

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B; };

// === Numeric IDs ===
export type ResourceId = Brand<number, 'ResourceId'>;
export type ProjectId = Brand<number, 'ProjectId'>;
export type QueueItemId = Brand<number, 'QueueItemId'>;

// === String domains ===
export type Url = Brand<string, 'Url'>;
export type Topic = Brand<string, 'Topic'>;
export type Kind = Brand<string, 'Kind'>;
export type Region = Brand<string, 'Region'>;
export type SourceName = Brand<string, 'SourceName'>;

// === Known kind values ===
export const KINDS = ['api', 'dataset', 'service', 'code'] as const;
export type KindValue = (typeof KINDS)[number];

// === Known topic labels ===
export const TOPICS = [
    // Finance & Economics
    'banking', 'capital-markets', 'forex', 'commodities', 'economics',
    'insurance', 'crypto', 'alternative-data',
    // Energy
    'oil-gas', 'electricity', 'renewables', 'utilities',
    // Agriculture & Food
    'crops', 'livestock', 'food',
    // Environment & Climate
    'climate', 'pollution', 'biodiversity', 'oceans',
    // Health & Medicine
    'public-health', 'clinical', 'pharma', 'mental-health',
    // Science & Research
    'chemistry', 'physics', 'biology', 'earth-science', 'materials',
    'neuroscience', 'drug-discovery', 'open-science',
    // Space & Remote Sensing
    'space', 'astronomy', 'remote-sensing',
    // Transport & Logistics
    'roads-traffic', 'public-transit', 'maritime', 'aviation', 'logistics',
    // Technology & Computing
    'ai-ml', 'nlp', 'iot', 'cybersecurity', 'developer', 'cloud',
    // Government & Public Sector
    'government', 'law', 'crime', 'military',
    // Demographics & Society
    'demographics', 'education', 'employment', 'housing',
    // Media & Communication
    'journalism', 'social-media', 'audio', 'images-video',
    // Commerce & Industry
    'retail', 'manufacturing', 'construction',
    // Sports & Entertainment
    'sports', 'entertainment', 'gaming',
    // Geospatial
    'geospatial', 'urban',
    // International
    'humanitarian', 'trade',
    // Other
    'bioinformatics', 'semantic-web', 'humanities', 'robotics',
] as const;

// === Constructors (use at system boundaries: DB reads, CLI args, API input) ===
export const ResourceId = (n: number) => n as ResourceId;
export const ProjectId = (n: number) => n as ProjectId;
export const QueueItemId = (n: number) => n as QueueItemId;
export const Url = (s: string) => s as Url;
export const Topic = (s: string) => s as Topic;
export const Kind = (s: string) => s as Kind;
export const Region = (s: string) => s as Region;
export const SourceName = (s: string) => s as SourceName;
