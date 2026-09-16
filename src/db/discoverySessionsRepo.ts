/**
 * IndexedDB-backed CRUD for discovery sessions. Mirrors flowsRepo.ts's shape
 * exactly (list/get/create/updateContent/rename/duplicate/remove), against
 * its own database, and bridges to Opsette the same way flowsRepo does — see
 * BridgedDiscoveryValue in db/types.ts.
 */

import { openDB, type IDBPDatabase } from "idb";
import { uuid } from "@/lib/uuid";
import { emptyDoc } from "@/components/discovery/store";
import type { DiscoveryDoc } from "@/components/discovery/types";
import {
  forgetParentKnown,
  getBridgeInstance,
  isBridgeMode,
  isParentKnown,
  markParentKnown,
} from "@/lib/bridgeInstance";
import type { BridgedDiscoveryValue, BridgedValue } from "./types";
import {
  DISCOVERY_DB_NAME,
  DISCOVERY_DB_VERSION,
  DISCOVERY_STORE,
  type DiscoverySession,
} from "./discoveryTypes";

// Fire-and-forget bridge.save for one row — mirrors flowsRepo's
// persistToBridge exactly. Local IDB is already the source of truth for the
// caller by the time this runs, so a bridge failure never blocks the UI.
function persistToBridge(session: DiscoverySession): void {
  const bridge = getBridgeInstance();
  if (!bridge) return;
  const value: BridgedDiscoveryValue = { kind: "discovery", name: session.name, content: session.content };
  bridge
    .save(session.id, value)
    .then(() => markParentKnown(session.id))
    .catch(() => {
      /* onTimeout hook in main.tsx surfaces the toast */
    });
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DISCOVERY_DB_NAME, DISCOVERY_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DISCOVERY_STORE)) {
          const store = db.createObjectStore(DISCOVERY_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
}

export const discoverySessionsRepo = {
  async list(): Promise<DiscoverySession[]> {
    const db = await getDb();
    const all = (await db.getAll(DISCOVERY_STORE)) as DiscoverySession[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<DiscoverySession | undefined> {
    const db = await getDb();
    return (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
  },

  async create(opts: { name?: string; content?: DiscoveryDoc }): Promise<DiscoverySession> {
    const db = await getDb();
    const now = Date.now();
    const session: DiscoverySession = {
      id: uuid(),
      name: opts.name?.trim() || "Untitled session",
      createdAt: now,
      updatedAt: now,
      content: opts.content ?? emptyDoc,
    };
    await db.put(DISCOVERY_STORE, session);
    persistToBridge(session);
    return session;
  },

  async updateContent(id: string, content: DiscoveryDoc): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
    if (!existing) return;
    const updated: DiscoverySession = { ...existing, content, updatedAt: Date.now() };
    await db.put(DISCOVERY_STORE, updated);
    persistToBridge(updated);
  },

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = await getDb();
    const existing = (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
    if (!existing) return;
    const updated: DiscoverySession = { ...existing, name: trimmed, updatedAt: Date.now() };
    await db.put(DISCOVERY_STORE, updated);
    persistToBridge(updated);
  },

  async duplicate(id: string): Promise<DiscoverySession | undefined> {
    const db = await getDb();
    const existing = (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
    if (!existing) return undefined;
    const now = Date.now();
    const copy: DiscoverySession = {
      ...existing,
      id: uuid(),
      name: `${existing.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await db.put(DISCOVERY_STORE, copy);
    persistToBridge(copy);
    return copy;
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(DISCOVERY_STORE, id);
    if (isBridgeMode() && isParentKnown(id)) {
      const bridge = getBridgeInstance();
      forgetParentKnown(id);
      bridge?.delete(id).catch(() => {
        /* optimistic UI already advanced; onTimeout surfaces the toast */
      });
    }
  },
};

/**
 * Called once from main.tsx alongside flowsRepo's hydrateFromBridge, against
 * the same shared bridge.init.items array — see BridgedValue in db/types.ts.
 * A row counts as a discovery session only when explicitly tagged
 * `kind: "discovery"`; every other row (including legacy untagged flow rows)
 * is left for flowsRepo's hydrate to handle. Local IDB rows the parent didn't
 * mention are left untouched, same as flowsRepo.
 *
 * Returns the ids this hydrate consumed so main.tsx can combine them with
 * flowsRepo's and call resetParentKnown ONCE with the full set.
 */
export async function hydrateFromDiscoveryBridge(
  items: Array<{ data_id: string; value: BridgedValue }>,
): Promise<string[]> {
  const discoveryItems = items.filter(
    (item): item is { data_id: string; value: BridgedDiscoveryValue } =>
      !!item.value && typeof item.value === "object" && "kind" in item.value && item.value.kind === "discovery",
  );
  if (discoveryItems.length === 0) return [];
  const db = await getDb();
  const tx = db.transaction(DISCOVERY_STORE, "readwrite");
  const now = Date.now();
  const ids: string[] = [];
  for (const { data_id, value } of discoveryItems) {
    const existing = (await tx.store.get(data_id)) as DiscoverySession | undefined;
    const session: DiscoverySession = {
      id: data_id,
      name: value.name,
      content: value.content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.store.put(session);
    ids.push(data_id);
  }
  await tx.done;
  return ids;
}
