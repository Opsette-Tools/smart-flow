/**
 * IndexedDB-backed CRUD for discovery sessions. Mirrors flowsRepo.ts's shape
 * exactly (list/get/create/updateContent/rename/duplicate/remove) but against
 * its own database — see discoveryTypes.ts for why this isn't bridged.
 */

import { openDB, type IDBPDatabase } from "idb";
import { uuid } from "@/lib/uuid";
import { emptyDoc } from "@/components/discovery/store";
import type { DiscoveryDoc } from "@/components/discovery/types";
import {
  DISCOVERY_DB_NAME,
  DISCOVERY_DB_VERSION,
  DISCOVERY_STORE,
  type DiscoverySession,
} from "./discoveryTypes";

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
    return session;
  },

  async updateContent(id: string, content: DiscoveryDoc): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
    if (!existing) return;
    const updated: DiscoverySession = { ...existing, content, updatedAt: Date.now() };
    await db.put(DISCOVERY_STORE, updated);
  },

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = await getDb();
    const existing = (await db.get(DISCOVERY_STORE, id)) as DiscoverySession | undefined;
    if (!existing) return;
    const updated: DiscoverySession = { ...existing, name: trimmed, updatedAt: Date.now() };
    await db.put(DISCOVERY_STORE, updated);
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
    return copy;
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(DISCOVERY_STORE, id);
  },
};
