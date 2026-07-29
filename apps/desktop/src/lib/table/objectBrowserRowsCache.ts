import { metadataScopeKey, metadataScopeParts, type MetadataScopeInput } from "@/lib/metadata/metadataLoadScope";
import { metadataCacheInvalidationMatcher, MetadataResultCache, type MetadataCacheInvalidation } from "@/lib/metadata/metadataResultCache";
import type { ObjectBrowserRow } from "@/lib/table/objectBrowserRows";
import { clearMetadataDiskCache, deleteMetadataDiskCacheByScopeKeys, loadMetadataFromDisk, saveMetadataToDisk } from "@/lib/metadata/metadataDiskCache";

const OBJECT_BROWSER_ROWS_CACHE_TTL_MS = 30_000;
const OBJECT_BROWSER_ROWS_CACHE_MAX_ENTRIES = 24;
const OBJECT_BROWSER_ROWS_DISK_KEY_PREFIX = "obr:";

export interface ObjectBrowserRowsCacheScope {
  connectionId: string;
  database: string;
  schema: string;
  catalog?: string;
}

export interface ObjectBrowserRowsCacheWriteToken {
  generation: number;
  scope: Readonly<ObjectBrowserRowsCacheScope>;
}

interface ObjectBrowserRowsCacheGeneration {
  generation: number;
  scope: ReturnType<typeof metadataScopeParts>;
}

const objectBrowserRowsCache = new MetadataResultCache<ObjectBrowserRow[]>({
  ttlMs: OBJECT_BROWSER_ROWS_CACHE_TTL_MS,
  maxEntries: OBJECT_BROWSER_ROWS_CACHE_MAX_ENTRIES,
  now: () => Date.now(),
});
const objectBrowserRowsCacheGenerations = new Map<string, ObjectBrowserRowsCacheGeneration>();

function objectBrowserRowsScope(scope: ObjectBrowserRowsCacheScope): MetadataScopeInput {
  return {
    kind: "object-browser-rows",
    connectionId: scope.connectionId,
    database: scope.database,
    schema: scope.schema,
    extra: scope.catalog ? { catalog: scope.catalog } : undefined,
  };
}

function cloneRows(rows: readonly ObjectBrowserRow[]): ObjectBrowserRow[] {
  return rows.map((row) => ({ ...row }));
}

function objectBrowserRowsCacheGeneration(scope: ObjectBrowserRowsCacheScope): ObjectBrowserRowsCacheGeneration {
  const cacheScope = objectBrowserRowsScope(scope);
  const key = metadataScopeKey(cacheScope);
  let state = objectBrowserRowsCacheGenerations.get(key);
  if (!state) {
    state = { generation: 0, scope: metadataScopeParts(cacheScope) };
    objectBrowserRowsCacheGenerations.set(key, state);
  }
  return state;
}

function objectBrowserRowsCacheInvalidation(match: MetadataCacheInvalidation): MetadataCacheInvalidation {
  const projected: MetadataCacheInvalidation = {};
  if (match.kind !== undefined) projected.kind = match.kind;
  if (match.connectionId !== undefined) projected.connectionId = match.connectionId;
  if (match.database !== undefined) projected.database = match.database;
  if (match.schema !== undefined) projected.schema = match.schema;
  return projected;
}

export function getCachedObjectBrowserRows(scope: ObjectBrowserRowsCacheScope): ObjectBrowserRow[] | undefined {
  const hit = objectBrowserRowsCache.get(objectBrowserRowsScope(scope));
  return hit ? cloneRows(hit.value) : undefined;
}

export async function loadObjectBrowserRowsFromDisk(scope: ObjectBrowserRowsCacheScope): Promise<ObjectBrowserRow[] | null> {
  const result = await loadMetadataFromDisk<ObjectBrowserRow[]>(OBJECT_BROWSER_ROWS_DISK_KEY_PREFIX, objectBrowserRowsScope(scope));
  if (!result) return null;
  return cloneRows(result.data);
}

export function createObjectBrowserRowsCacheWriteToken(scope: ObjectBrowserRowsCacheScope): ObjectBrowserRowsCacheWriteToken {
  const frozenScope = Object.freeze({ ...scope });
  return Object.freeze({ generation: objectBrowserRowsCacheGeneration(frozenScope).generation, scope: frozenScope });
}

export function cacheObjectBrowserRows(token: ObjectBrowserRowsCacheWriteToken, rows: readonly ObjectBrowserRow[], options?: { cachedAt?: number }): number | undefined {
  if (objectBrowserRowsCacheGeneration(token.scope).generation !== token.generation) return undefined;
  const cachedAt = options?.cachedAt ?? Date.now();
  objectBrowserRowsCache.set(objectBrowserRowsScope(token.scope), cloneRows(rows), { cachedAt });
  // 写磁盘缓存（100 天 TTL），失败不影响主流程
  void saveMetadataToDisk(OBJECT_BROWSER_ROWS_DISK_KEY_PREFIX, objectBrowserRowsScope(token.scope), rows);
  return cachedAt;
}

export function invalidateObjectBrowserRowsCache(match: MetadataCacheInvalidation): number {
  const projected = objectBrowserRowsCacheInvalidation(match);
  const matches = metadataCacheInvalidationMatcher(projected);
  // 收集将被删除条目的 scopeKey，用于同步删除对应磁盘缓存
  const deletedScopeKeys: string[] = [];
  objectBrowserRowsCache.forEachEntry((key, entry) => {
    if (matches(entry.scope)) deletedScopeKeys.push(key);
  });
  for (const state of objectBrowserRowsCacheGenerations.values()) {
    if (matches(state.scope)) state.generation++;
  }
  const removed = objectBrowserRowsCache.invalidate(projected);
  if (deletedScopeKeys.length) {
    void deleteMetadataDiskCacheByScopeKeys(OBJECT_BROWSER_ROWS_DISK_KEY_PREFIX, deletedScopeKeys);
  }
  return removed;
}

export function clearObjectBrowserRowsCache(): void {
  objectBrowserRowsCache.clear();
  for (const state of objectBrowserRowsCacheGenerations.values()) state.generation++;
  // 清磁盘缓存
  void clearMetadataDiskCache(OBJECT_BROWSER_ROWS_DISK_KEY_PREFIX);
}
