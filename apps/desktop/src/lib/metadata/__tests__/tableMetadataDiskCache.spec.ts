import { describe, expect, it } from "vitest";
import { decodeTableMetadataDiskCache, encodeTableMetadataDiskCache, TABLE_METADATA_DISK_CACHE_TTL_MS, tableMetadataDiskCacheKey } from "@/lib/metadata/tableMetadataDiskCache";
import type { TableMetadata } from "@/lib/metadata/tableMetadataCache";
import type { ColumnInfo } from "@/types/database";

function column(name: string): ColumnInfo {
  return { name, data_type: "integer", is_nullable: false, column_default: null, is_primary_key: true, extra: null };
}

const metadata: TableMetadata = {
  schema: "public",
  tableName: "users",
  tableType: "TABLE",
  catalog: undefined,
  database: "db",
  columns: [column("id"), column("name")],
  indexes: [],
  primaryKeys: ["id"],
  cachedAt: 1_700_000_000_000,
};

describe("tableMetadataDiskCache encode/decode", () => {
  it("round-trips metadata through encode then decode as fresh", () => {
    const now = 1_700_000_000_000;
    const encoded = encodeTableMetadataDiskCache(metadata, now);
    expect(encoded.version).toBe(1);
    expect(encoded.data).toEqual(metadata);
    expect(typeof encoded.cachedAt).toBe("string");

    const decoded = decodeTableMetadataDiskCache(encoded, now);
    expect(decoded).not.toBeNull();
    expect(decoded?.metadata).toEqual(metadata);
    expect(decoded?.isStale).toBe(false);
    expect(decoded?.cachedAtMs).toBe(now);
  });

  it("marks as stale after the TTL elapses", () => {
    const now = 1_700_000_000_000;
    const encoded = encodeTableMetadataDiskCache(metadata, now);
    const decoded = decodeTableMetadataDiskCache(encoded, now + TABLE_METADATA_DISK_CACHE_TTL_MS + 1);
    expect(decoded?.isStale).toBe(true);
    expect(decoded?.metadata).toEqual(metadata);
  });

  it("returns null for invalid payloads", () => {
    expect(decodeTableMetadataDiskCache(null)).toBeNull();
    expect(decodeTableMetadataDiskCache(undefined)).toBeNull();
    expect(decodeTableMetadataDiskCache("string")).toBeNull();
    expect(decodeTableMetadataDiskCache({ version: 2, cachedAt: "x", data: metadata })).toBeNull();
    expect(decodeTableMetadataDiskCache({ version: 1, cachedAt: "not-a-date", data: metadata })).toBeNull();
    expect(decodeTableMetadataDiskCache({ version: 1, cachedAt: new Date().toISOString() })).toBeNull();
  });

  it("still decodes legacy envelopes with the metadata field", () => {
    const now = 1_700_000_000_000;
    const legacy = { version: 1, cachedAt: new Date(now).toISOString(), metadata };
    const decoded = decodeTableMetadataDiskCache(legacy, now);
    expect(decoded?.metadata).toEqual(metadata);
    expect(decoded?.isStale).toBe(false);
  });
});

describe("tableMetadataDiskCacheKey", () => {
  it("produces deterministic, prefixed keys", () => {
    const scope = { kind: "table-metadata", connectionId: "c1", database: "db", schema: "public", tableName: "users" };
    const key = tableMetadataDiskCacheKey(scope);
    expect(key.startsWith("tm:")).toBe(true);
    expect(tableMetadataDiskCacheKey({ ...scope })).toBe(key);
  });

  it("differs by table name", () => {
    const a = tableMetadataDiskCacheKey({ kind: "table-metadata", connectionId: "c1", database: "db", schema: "public", tableName: "users" });
    const b = tableMetadataDiskCacheKey({ kind: "table-metadata", connectionId: "c1", database: "db", schema: "public", tableName: "orders" });
    expect(a).not.toBe(b);
  });
});
