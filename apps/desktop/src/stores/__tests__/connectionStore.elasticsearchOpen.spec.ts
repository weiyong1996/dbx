import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig, TreeNode } from "@/types/database";

function installLocalStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    removeItem: vi.fn((key: string) => data.delete(key)),
  });
}

function esConnection(): ConnectionConfig {
  return {
    id: "es-1",
    name: "Elasticsearch",
    db_type: "elasticsearch",
    host: "127.0.0.1",
    port: 9200,
    username: "",
    password: "",
    database: "",
  } as ConnectionConfig;
}

function seedConnectionNode(store: { treeNodes: TreeNode[]; connectedIds: Set<string> }, id = "es-1") {
  store.connectedIds.add(id);
  store.treeNodes.push({
    id,
    label: "Elasticsearch",
    type: "connection",
    connectionId: id,
    isExpanded: false,
    children: [],
  });
}

describe("connectionStore Elasticsearch open/expand", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installLocalStorage();
    setActivePinia(createPinia());
  });

  it("openElasticsearchConnectionTree does not list indices", async () => {
    const elasticsearchListIndices = vi.fn().mockResolvedValue(["orders", "users"]);
    const checkConnectionHealth = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/backend/tauriRuntime", () => ({ isTauriRuntime: () => false }));
    vi.doMock("@/lib/backend/api", () => ({
      checkConnectionHealth,
      elasticsearchListIndices,
      deleteSchemaCachePrefix: vi.fn().mockResolvedValue(undefined),
      loadSchemaCache: vi.fn().mockResolvedValue(null),
      saveSchemaCache: vi.fn().mockResolvedValue(undefined),
      saveConnections: vi.fn().mockResolvedValue(undefined),
      saveSidebarLayout: vi.fn().mockResolvedValue(undefined),
    }));

    const { useConnectionStore } = await import("@/stores/connectionStore");
    const store = useConnectionStore();
    store.addEphemeralConnection(esConnection());
    seedConnectionNode(store);

    await store.openElasticsearchConnectionTree("es-1");

    expect(elasticsearchListIndices).not.toHaveBeenCalled();
    const node = store.treeNodes.find((n) => n.id === "es-1");
    expect(node?.isExpanded).toBe(true);
    expect(node?.children?.some((c) => c.type === "elasticsearch-index")).toBe(false);
  });

  it("refreshTreeNode lists indices", async () => {
    const elasticsearchListIndices = vi.fn().mockResolvedValue(["orders", "users"]);
    const checkConnectionHealth = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/backend/tauriRuntime", () => ({ isTauriRuntime: () => false }));
    vi.doMock("@/lib/backend/api", () => ({
      checkConnectionHealth,
      elasticsearchListIndices,
      deleteSchemaCachePrefix: vi.fn().mockResolvedValue(undefined),
      loadSchemaCache: vi.fn().mockResolvedValue(null),
      saveSchemaCache: vi.fn().mockResolvedValue(undefined),
      saveConnections: vi.fn().mockResolvedValue(undefined),
      saveSidebarLayout: vi.fn().mockResolvedValue(undefined),
    }));

    const { useConnectionStore } = await import("@/stores/connectionStore");
    const store = useConnectionStore();
    store.addEphemeralConnection(esConnection());
    seedConnectionNode(store);
    const node = store.treeNodes.find((n) => n.id === "es-1")!;

    await store.refreshTreeNode(node);

    expect(elasticsearchListIndices).toHaveBeenCalledWith("es-1");
    expect(
      node.children
        ?.filter((c) => c.type === "elasticsearch-index")
        .map((c) => c.label)
        .sort(),
    ).toEqual(["orders", "users"]);
  });

  it("re-expand preserves previously refreshed index children without re-listing", async () => {
    const elasticsearchListIndices = vi.fn().mockResolvedValue(["orders"]);
    const checkConnectionHealth = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/backend/tauriRuntime", () => ({ isTauriRuntime: () => false }));
    vi.doMock("@/lib/backend/api", () => ({
      checkConnectionHealth,
      elasticsearchListIndices,
      deleteSchemaCachePrefix: vi.fn().mockResolvedValue(undefined),
      loadSchemaCache: vi.fn().mockResolvedValue(null),
      saveSchemaCache: vi.fn().mockResolvedValue(undefined),
      saveConnections: vi.fn().mockResolvedValue(undefined),
      saveSidebarLayout: vi.fn().mockResolvedValue(undefined),
    }));

    const { useConnectionStore } = await import("@/stores/connectionStore");
    const store = useConnectionStore();
    store.addEphemeralConnection(esConnection());
    seedConnectionNode(store);
    const node = store.treeNodes.find((n) => n.id === "es-1")!;

    await store.loadElasticsearchIndices("es-1");
    expect(elasticsearchListIndices).toHaveBeenCalledTimes(1);

    node.isExpanded = false;
    await store.openElasticsearchConnectionTree("es-1");

    expect(elasticsearchListIndices).toHaveBeenCalledTimes(1);
    expect(node.children?.some((c) => c.type === "elasticsearch-index" && c.label === "orders")).toBe(true);
  });
});
