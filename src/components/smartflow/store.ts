/**
 * SmartFlow store — the single source of truth for the diagram doc.
 *
 * One reducer owns the whole SmartFlowDoc; every build-mode action funnels
 * through here so the components stay thin and the mutation rules live in one
 * place. localStorage helpers (load / save / clear) sit alongside it.
 *
 * Ordering convention: `order` is a dense 0..n-1 sequence within each scope
 * (lanes left-to-right, items within a lane top-to-bottom). After any structural
 * change we renormalize so there are never gaps or duplicate orders — this keeps
 * the diagram layout deterministic.
 */

import type { Item, Lane, PersistedDoc, SmartFlowDoc } from "./types";
import { uuid } from "@/lib/uuid";
import { leadToClientDoc } from "./templates";

const STORAGE_KEY = "smart-flow-doc";

// ---------------------------------------------------------------------------
// Initial / seed
// ---------------------------------------------------------------------------

export const emptyDoc: SmartFlowDoc = { lanes: [], items: [] };

/**
 * First-run swimlane example, so a user who opens the swimlane can see a real
 * process rather than a blank board. This is the same content as the
 * "Lead to paying client" template — kept in one place in templates.ts.
 */
export function seedDoc(): SmartFlowDoc {
  return leadToClientDoc();
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

/** Read the saved doc. Returns null when nothing valid is stored. */
export function loadDoc(): SmartFlowDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDoc>;
    if (parsed?.v !== 1 || !parsed.doc) return null;
    const doc = parsed.doc;
    if (!Array.isArray(doc.lanes) || !Array.isArray(doc.items)) return null;
    // Defensive: ensure connectsTo is always an array on every item.
    return {
      lanes: doc.lanes,
      items: doc.items.map((i) => ({ ...i, connectsTo: Array.isArray(i.connectsTo) ? i.connectsTo : [] })),
    };
  } catch {
    return null;
  }
}

/** Write the doc (versioned). Silently ignores quota / private-mode errors. */
export function saveDoc(doc: SmartFlowDoc): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedDoc = { v: 1, doc };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

/** Remove the persisted doc (used by Start over). */
export function clearDoc(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Lazy initializer: saved doc if present, else a clean empty board. The
 *  seeded example (seedDoc) is offered via a "load example" affordance instead
 *  of force-filling a first-time user's canvas. */
export function initDoc(): SmartFlowDoc {
  return loadDoc() ?? emptyDoc;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renumber lanes to a dense 0..n-1 sequence, preserving current order. */
function renormalizeLanes(lanes: Lane[]): Lane[] {
  return [...lanes]
    .sort((a, b) => a.order - b.order)
    .map((lane, idx) => ({ ...lane, order: idx }));
}

/** Renumber items within a single lane (or the inbox, laneId null). */
function renormalizeItemsInScope(items: Item[], laneId: string | null): Item[] {
  const inScope = items
    .filter((i) => i.laneId === laneId)
    .sort((a, b) => a.order - b.order);
  const orderById = new Map(inScope.map((i, idx) => [i.id, idx]));
  return items.map((i) => (i.laneId === laneId ? { ...i, order: orderById.get(i.id)! } : i));
}

/** Renumber every scope (inbox + each lane). Used after broad changes. */
function renormalizeAll(doc: SmartFlowDoc): SmartFlowDoc {
  let items = doc.items;
  const scopes: (string | null)[] = [null, ...doc.lanes.map((l) => l.id)];
  for (const scope of scopes) items = renormalizeItemsInScope(items, scope);
  return { lanes: renormalizeLanes(doc.lanes), items };
}

/** Strip a list of item IDs out of every other item's connectsTo. */
function pruneConnections(items: Item[], removedIds: Set<string>): Item[] {
  return items.map((i) =>
    i.connectsTo.some((id) => removedIds.has(id))
      ? { ...i, connectsTo: i.connectsTo.filter((id) => !removedIds.has(id)) }
      : i,
  );
}

function maxOrderInScope(items: Item[], laneId: string | null): number {
  const inScope = items.filter((i) => i.laneId === laneId);
  return inScope.length === 0 ? -1 : Math.max(...inScope.map((i) => i.order));
}

// ---------------------------------------------------------------------------
// Actions + reducer
// ---------------------------------------------------------------------------

export type Action =
  | { type: "ADD_LANE"; name: string }
  | { type: "RENAME_LANE"; id: string; name: string }
  | { type: "DELETE_LANE"; id: string }
  | { type: "REORDER_LANES"; orderedIds: string[] }
  // Add one item to the inbox (laneId null) or straight into a lane.
  | { type: "ADD_ITEM"; label: string; laneId: string | null }
  // Add many at once from a pasted textarea (one per line).
  | { type: "ADD_ITEMS"; labels: string[]; laneId: string | null }
  | { type: "RENAME_ITEM"; id: string; label: string }
  | { type: "DELETE_ITEM"; id: string }
  // Move an item to a lane (or back to inbox) at a target index.
  | { type: "ASSIGN_ITEM"; id: string; laneId: string | null; index?: number }
  // Reorder items within one scope to the given id sequence.
  | { type: "REORDER_ITEMS"; laneId: string | null; orderedIds: string[] }
  | { type: "SET_CONNECTIONS"; id: string; connectsTo: string[] }
  | { type: "RESET" }
  | { type: "REPLACE_DOC"; doc: SmartFlowDoc };

export function reducer(doc: SmartFlowDoc, action: Action): SmartFlowDoc {
  switch (action.type) {
    case "ADD_LANE": {
      const name = action.name.trim();
      if (!name) return doc;
      const lane: Lane = { id: uuid(), name, order: doc.lanes.length };
      return { ...doc, lanes: renormalizeLanes([...doc.lanes, lane]) };
    }

    case "RENAME_LANE": {
      const name = action.name.trim();
      if (!name) return doc;
      return {
        ...doc,
        lanes: doc.lanes.map((l) => (l.id === action.id ? { ...l, name } : l)),
      };
    }

    case "DELETE_LANE": {
      // Items in the deleted lane fall back to the inbox (never silently dropped).
      const items = doc.items.map((i) =>
        i.laneId === action.id ? { ...i, laneId: null, order: 0 } : i,
      );
      const lanes = doc.lanes.filter((l) => l.id !== action.id);
      return renormalizeAll({ lanes, items });
    }

    case "REORDER_LANES": {
      const indexById = new Map(action.orderedIds.map((id, idx) => [id, idx]));
      const lanes = doc.lanes.map((l) => ({
        ...l,
        order: indexById.get(l.id) ?? l.order,
      }));
      return { ...doc, lanes: renormalizeLanes(lanes) };
    }

    case "ADD_ITEM": {
      const label = action.label.trim();
      if (!label) return doc;
      const item: Item = {
        id: uuid(),
        label,
        laneId: action.laneId,
        order: maxOrderInScope(doc.items, action.laneId) + 1,
        connectsTo: [],
      };
      return { ...doc, items: [...doc.items, item] };
    }

    case "ADD_ITEMS": {
      const labels = action.labels.map((l) => l.trim()).filter(Boolean);
      if (labels.length === 0) return doc;
      let nextOrder = maxOrderInScope(doc.items, action.laneId) + 1;
      const added: Item[] = labels.map((label) => ({
        id: uuid(),
        label,
        laneId: action.laneId,
        order: nextOrder++,
        connectsTo: [],
      }));
      return { ...doc, items: [...doc.items, ...added] };
    }

    case "RENAME_ITEM": {
      const label = action.label.trim();
      if (!label) return doc;
      return {
        ...doc,
        items: doc.items.map((i) => (i.id === action.id ? { ...i, label } : i)),
      };
    }

    case "DELETE_ITEM": {
      const removed = new Set([action.id]);
      const remaining = doc.items.filter((i) => i.id !== action.id);
      const items = pruneConnections(remaining, removed);
      return renormalizeAll({ ...doc, items });
    }

    case "ASSIGN_ITEM": {
      const moving = doc.items.find((i) => i.id === action.id);
      if (!moving) return doc;
      const fromLane = moving.laneId;
      const toLane = action.laneId;

      // Pull the moving item out, place it at the requested index in the target
      // scope, then renormalize both the source and target scopes.
      const targetExisting = doc.items
        .filter((i) => i.laneId === toLane && i.id !== action.id)
        .sort((a, b) => a.order - b.order);
      const insertAt =
        action.index === undefined
          ? targetExisting.length
          : Math.max(0, Math.min(action.index, targetExisting.length));
      const targetIds = [
        ...targetExisting.slice(0, insertAt).map((i) => i.id),
        action.id,
        ...targetExisting.slice(insertAt).map((i) => i.id),
      ];
      const targetOrder = new Map(targetIds.map((id, idx) => [id, idx]));

      let items = doc.items.map((i) => {
        if (i.id === action.id) return { ...i, laneId: toLane, order: targetOrder.get(i.id)! };
        if (i.laneId === toLane) return { ...i, order: targetOrder.get(i.id)! };
        return i;
      });
      // Source scope may now have gaps — renormalize it too (if it changed).
      if (fromLane !== toLane) items = renormalizeItemsInScope(items, fromLane);
      return { ...doc, items };
    }

    case "REORDER_ITEMS": {
      const orderById = new Map(action.orderedIds.map((id, idx) => [id, idx]));
      const items = doc.items.map((i) =>
        i.laneId === action.laneId && orderById.has(i.id)
          ? { ...i, order: orderById.get(i.id)! }
          : i,
      );
      return { ...doc, items: renormalizeItemsInScope(items, action.laneId) };
    }

    case "SET_CONNECTIONS": {
      // Dedupe, drop self-reference, and keep only IDs that still exist.
      const valid = new Set(doc.items.map((i) => i.id));
      const cleaned = Array.from(new Set(action.connectsTo)).filter(
        (id) => id !== action.id && valid.has(id),
      );
      return {
        ...doc,
        items: doc.items.map((i) => (i.id === action.id ? { ...i, connectsTo: cleaned } : i)),
      };
    }

    case "RESET":
      return emptyDoc;

    case "REPLACE_DOC":
      return action.doc;

    default:
      return doc;
  }
}
