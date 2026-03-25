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
export type SourceName = Brand<string, 'SourceName'>;

// === Known kind values ===
export const KINDS = ['api', 'dataset', 'service', 'code'] as const;
export type KindValue = (typeof KINDS)[number];

// === Constructors (use at system boundaries: DB reads, CLI args, API input) ===
export const ResourceId = (n: number) => n as ResourceId;
export const ProjectId = (n: number) => n as ProjectId;
export const QueueItemId = (n: number) => n as QueueItemId;
export const Url = (s: string) => s as Url;
export const Topic = (s: string) => s as Topic;
export const Kind = (s: string) => s as Kind;
export const SourceName = (s: string) => s as SourceName;
