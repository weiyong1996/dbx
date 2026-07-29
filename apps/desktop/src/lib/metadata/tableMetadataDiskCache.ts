import { type MetadataScopeInput } from "./metadataLoadScope";
import type { TableMetadata } from "./tableMetadataCache";
import { clearMetadataDiskCache, decodeMetadataDiskCache, deleteMetadataDiskCacheByScopeKeys, encodeMetadataDiskCache, loadMetadataFromDisk, METADATA_DISK_CACHE_TTL_MS, metadataDiskCacheKey, saveMetadataToDisk } from "./metadataDiskCache";

export { METADATA_DISK_CACHE_TTL_MS as TABLE_METADATA_DISK_CACHE_TTL_MS } from "./metadataDiskCache";

const DISK_KEY_PREFIX = "tm:";

// 旧格式兼容：version 1, cachedAt, metadata 字段
interface LegacyTableMetadataDiskEnvelope {
  version: 1;
  cachedAt: string;
  metadata: TableMetadata;
}

export interface DecodedTableMetadataDiskCache {
  metadata: TableMetadata;
  isStale: boolean;
  cachedAtMs: number;
}

export function tableMetadataDiskCacheKey(scope: MetadataScopeInput): string {
  return metadataDiskCacheKey(DISK_KEY_PREFIX, scope);
}

export function encodeTableMetadataDiskCache(metadata: TableMetadata, nowMs = Date.now()) {
  return encodeMetadataDiskCache(metadata, nowMs);
}

export function decodeTableMetadataDiskCache(payload: unknown, nowMs = Date.now(), ttlMs = METADATA_DISK_CACHE_TTL_MS): DecodedTableMetadataDiskCache | null {
  // 尝试新格式（通用 envelope: version 1, cachedAt, data）
  const decoded = decodeMetadataDiskCache<TableMetadata>(payload, nowMs, ttlMs);
  if (decoded) {
    return { metadata: decoded.data, isStale: decoded.isStale, cachedAtMs: decoded.cachedAtMs };
  }
  // 兼容旧格式（version 1, cachedAt, metadata）
  if (!payload || typeof payload !== "object") return null;
  const legacy = payload as Partial<LegacyTableMetadataDiskEnvelope>;
  if (legacy.version !== 1 || !legacy.metadata || typeof legacy.cachedAt !== "string") return null;
  const cachedAtMs = Date.parse(legacy.cachedAt);
  if (!Number.isFinite(cachedAtMs)) return null;
  return { metadata: legacy.metadata, isStale: nowMs - cachedAtMs >= ttlMs, cachedAtMs };
}

export async function loadTableMetadataFromDisk(scope: MetadataScopeInput): Promise<DecodedTableMetadataDiskCache | null> {
  const result = await loadMetadataFromDisk<TableMetadata>(DISK_KEY_PREFIX, scope);
  if (!result) return null;
  return { metadata: result.data, isStale: result.isStale, cachedAtMs: result.cachedAtMs };
}

export async function saveTableMetadataToDisk(scope: MetadataScopeInput, metadata: TableMetadata): Promise<void> {
  return saveMetadataToDisk(DISK_KEY_PREFIX, scope, metadata);
}

export async function deleteTableMetadataDiskCacheByScopeKeys(scopeKeys: string[]): Promise<void> {
  return deleteMetadataDiskCacheByScopeKeys(DISK_KEY_PREFIX, scopeKeys);
}

export async function clearTableMetadataDiskCache(): Promise<void> {
  return clearMetadataDiskCache(DISK_KEY_PREFIX);
}
