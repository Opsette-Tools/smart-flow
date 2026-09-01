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
import {
  forgetParentKnown,
  getBridgeInstance,
  isBridgeMode,
  isParentKnown,
  markParentKnown,
  resetParentKnown,
} from "@/lib/bridgeInstance";
import { DB_NAME, DB_VERSION, FLOWS_STORE, type BridgedFlowValue, type Flow } from "./types";

// Fire-and-forget bridge.save for one row. Local IDB is already the source of
// truth for the caller by the time this runs, so a bridge failure (timeout,
// parent error) never blocks the UI — onTimeout in main.tsx surfaces a toast.
// type + name ride along with content (BridgedFlowValue) — content alone
// isn't self-describing enough to reconstruct a Flow row on hydrate.
function persistToBridge(flow: Flow): void {
  const bridge = getBridgeInstance();
  if (!bridge) return;
  const value: BridgedFlowValue = { type: flow.type, name: flow.name, content: flow.content };
  bridge
    .save(flow.id, value)
    .then(() => markParentKnown(flow.id))
    .catch(() => {
      /* onTimeout hook in main.tsx surfaces the toast */
    });
}

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
    persistToBridge(flow);
    return flow;
  },

  async updateContent(id: string, content: SmartFlowDoc | string): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return;
    const updated: Flow = { ...existing, content, updatedAt: Date.now() };
    await db.put(FLOWS_STORE, updated);
    persistToBridge(updated);
  },

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return;
    const updated: Flow = { ...existing, name: trimmed, updatedAt: Date.now() };
    await db.put(FLOWS_STORE, updated);
    persistToBridge(updated);
  },

  async duplicate(id: string): Promise<Flow | undefined> {
    const db = await getDb();
    const existing = (await db.get(FLOWS_STORE, id)) as Flow | undefined;
    if (!existing) return undefined;
    const now = Date.now();
    const copy: Flow = { ...existing, id: uuid(), name: `${existing.name} (copy)`, createdAt: now, updatedAt: now };
    await db.put(FLOWS_STORE, copy);
    persistToBridge(copy);
    return copy;
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(FLOWS_STORE, id);
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
 * Called once from main.tsx right after connectBridge resolves with a live
 * Bridge, before the app renders. Per SMARTFLOW_STORAGE_PLAN.md §8.2, local
 * IndexedDB rows are NOT auto-migrated: this only writes the rows the parent
 * sent (`init.items`), and never clears or touches anything already in IDB
 * that the parent didn't mention — a local-only flow stays exactly as it was.
 */
export async function hydrateFromBridge(items: Array<{ data_id: string; value: BridgedFlowValue }>): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(FLOWS_STORE, "readwrite");
  const now = Date.now();
  const ids: string[] = [];
  for (const { data_id, value } of items) {
    if (!value || typeof value !== "object") continue;
    const existing = (await tx.store.get(data_id)) as Flow | undefined;
    const flow: Flow = {
      id: data_id,
      type: value.type,
      name: value.name,
      content: value.content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.store.put(flow);
    ids.push(data_id);
  }
  await tx.done;
  resetParentKnown(ids);
}
