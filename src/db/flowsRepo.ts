/**
 * IndexedDB-backed CRUD for the flow library. Replaces the single-slot
 * `smart-flow-doc` / `smart-flow-outline-texts` localStorage keys — see
 * docs/SMARTFLOW_STORAGE_PLAN.md. One row per saved diagram, keyed by `id`,
 * never overwritten by a template pick or a new-diagram action.
 */

import { openDB, type IDBPDatabase } from "idb";
import { uuid } from "@/lib/uuid";
import { diagramInfo, type DiagramType } from "@/components/smartflow/diagramTypes";
import { emptyDoc } from "@/components/smartflow/store";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import { DB_NAME, DB_VERSION, FLOWS_STORE, type Flow } from "./types";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FLOWS_STORE)) {
          const store = db.createObjectStore(FLOWS_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
}

function defaultContent(type: DiagramType): SmartFlowDoc | string {
  return type === "swimlane" ? emptyDoc : "";
}

export const flowsRepo = {
  async list(): Promise<Flow[]> {
    const db = await getDb();
    const all = (await db.getAll(FLOWS_STORE)) as Flow[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<Flow | undefined> {
    const db = await getDb();
    return (await db.get(FLOWS_STORE, id)) as Flow | undefined;
  },

  async create(opts: {
    type: DiagramType;
    name?: string;
    content?: SmartFlowDoc | string;
  }): Promise<Flow> {
    const db = await getDb();
    const now = Date.now();
    const flow: Flow = {
      id: uuid(),
      type: opts.type,
      name: opts.name?.trim() || `Untitled ${diagramInfo(opts.type).name}`,
      createdAt: now,
      updatedAt: now,
      content: opts.content ?? defaultContent(opts.type),
    };
    await db.put(FLOWS_STORE, flow);
    return flow;
  },

  async updateContent(id: string, content: SmartFlowDoc | string): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return;
    await db.put(FLOWS_STORE, { ...existing, content, updatedAt: Date.now() });
  },

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return;
    await db.put(FLOWS_STORE, { ...existing, name: trimmed, updatedAt: Date.now() });
  },

  async duplicate(id: string): Promise<Flow | undefined> {
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return undefined;
    const now = Date.now();
    const copy: Flow = { ...existing, id: uuid(), name: `${existing.name} (copy)`, createdAt: now, updatedAt: now };
    await db.put(FLOWS_STORE, copy);
    return copy;
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(FLOWS_STORE, id);
  },
};
