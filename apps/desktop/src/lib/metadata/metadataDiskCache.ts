import { metadataScopeKey, type MetadataScopeInput } from "./metadataLoadScope";
import * as api from "@/lib/backend/api";

export const METADATA_DISK_CACHE_TTL_MS = 100 * 24 * 60 * 60 * 1000; // 100 days

interface MetadataDiskEnvelope<T> {
  version: 1;
  cachedAt: string;
  data: T;
}

export interface DecodedMetadataDiskCache<T> {
  data: T;
  isStale: boolean;
  cachedAtMs: number;
}

export function metadataDiskCacheKey(prefix: string, scope: MetadataScopeInput): string {
  return `${prefix}${metadataScopeKey(scope)}`;
}

export function encodeMetadataDiskCache<T>(data: T, nowMs = Date.now()): MetadataDiskEnvelope<T> {
  return {
    version: 1,
    cachedAt: new Date(nowMs).toISOString(),
    data,
  };
}

export function decodeMetadataDiskCache<T>(payload: unknown, nowMs = Date.now(), ttlMs = METADATA_DISK_CACHE_TTL_MS): DecodedMetadataDiskCache<T> | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Partial<MetadataDiskEnvelope<unknown>>;
  if (envelope.version !== 1 || envelope.data === undefined || typeof envelope.cachedAt !== "string") return null;

  const cachedAtMs = Date.parse(envelope.cachedAt);
  if (!Number.isFinite(cachedAtMs)) return null;

  const isStale = nowMs - cachedAtMs >= ttlMs;
  return { data: envelope.data as T, isStale, cachedAtMs };
}

export async function loadMetadataFromDisk<T>(prefix: string, scope: MetadataScopeInput): Promise<DecodedMetadataDiskCache<T> | null> {
  const key = metadataDiskCacheKey(prefix, scope);
  let payload: unknown;
  try {
    payload = await api.loadSchemaCache<unknown>(key);
  } catch {
    return null;
  }
  if (!payload) return null;
  return decodeMetadataDiskCache<T>(payload);
}

export async function saveMetadataToDisk<T>(prefix: string, scope: MetadataScopeInput, data: T): Promise<void> {
  const key = metadataDiskCacheKey(prefix, scope);
  try {
    await api.saveSchemaCache(key, encodeMetadataDiskCache(data));
  } catch {
    // 磁盘写入失败不影响主流程
  }
}

export async function deleteMetadataDiskCacheByScopeKeys(prefix: string, scopeKeys: string[]): Promise<void> {
  if (!scopeKeys.length) return;
  try {
    const deletes = scopeKeys.map((key) => api.deleteSchemaCachePrefix(`${prefix}${key}`).catch(() => undefined));
    await Promise.all(deletes);
  } catch {
    // 磁盘删除失败不影响主流程
  }
}

export async function clearMetadataDiskCache(prefix: string): Promise<void> {
  try {
    await api.deleteSchemaCachePrefix(prefix);
  } catch {
    // 磁盘清空失败不影响主流程
  }
}
