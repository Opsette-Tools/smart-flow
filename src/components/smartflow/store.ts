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

import type { CardPosition, Connection, HandoffMechanism, Item, Lane, PersistedDoc, SmartFlowDoc } from "./types";
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

/** Validate persisted schema-map positions. A NaN or a non-numeric entry would
 *  strand a card at an unreachable coordinate, so bad entries are dropped
 *  rather than trusted — the card falls back to its computed grid slot. */
function readPositions(raw: unknown): Record<string, CardPosition> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, CardPosition> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[key] = { x, y };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Read the saved doc. Returns null when nothing valid is stored. */
export function loadDoc(): SmartFlowDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDoc>;
    if ((parsed?.v !== 1 && parsed?.v !== 2) || !parsed.doc) return null;
    const doc = parsed.doc;
    if (!Array.isArray(doc.lanes) || !Array.isArray(doc.items)) return null;
    // v1 -> v2 is a no-op read: every discovery field is optional, so a v1 doc
    // loads untouched. All this does is re-assert the invariants.
    return {
      lanes: doc.lanes,
      items: doc.items.map((i) => ({
        ...i,
        connectsTo: Array.isArray(i.connectsTo) ? i.connectsTo : [],
        connections: Array.isArray(i.connections) ? i.connections : undefined,
      })),
      discovery: doc.discovery === true,
      summary: typeof doc.summary === "string" ? doc.summary : undefined,
      lanePositions: readPositions(doc.lanePositions),
    };
  } catch {
    return null;
  }
}

/** Write the doc (versioned). Silently ignores quota / private-mode errors. */
export function saveDoc(doc: SmartFlowDoc): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedDoc = { v: 2, doc };
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
  // Spread the doc rather than rebuilding it: renormalizing is about `order`,
  // and must not quietly drop discovery mode, the summary, or the map layout.
  return { ...doc, lanes: renormalizeLanes(doc.lanes), items };
}

/** Strip a list of item IDs out of every other item's connectsTo, and out of
 *  the `connections` sidecar so no orphan detail survives a deleted step. */
function pruneConnections(items: Item[], removedIds: Set<string>): Item[] {
  return items.map((i) => {
    const hitsEdge = i.connectsTo.some((id) => removedIds.has(id));
    const hitsDetail = i.connections?.some((c) => removedIds.has(c.toId)) ?? false;
    if (!hitsEdge && !hitsDetail) return i;
    return {
      ...i,
      connectsTo: i.connectsTo.filter((id) => !removedIds.has(id)),
      connections: dropEmpty(i.connections?.filter((c) => !removedIds.has(c.toId))),
    };
  });
}

/** An empty sidecar is stored as undefined, never [] — "no detail" and "not
 *  asked yet" are the same state, and one representation keeps them that way. */
function dropEmpty(list: Connection[] | undefined): Connection[] | undefined {
  return list && list.length > 0 ? list : undefined;
}

/** Merge a patch into the sidecar entry for one target, creating it if absent.
 *  An entry that ends up carrying no information is removed entirely. */
function upsertConnection(
  item: Item,
  toId: string,
  patch: Partial<Omit<Connection, "toId">>,
): Item {
  const existing = item.connections ?? [];
  const found = existing.find((c) => c.toId === toId);
  const merged: Connection = { ...(found ?? { toId }), ...patch };
  // Clearing the mechanism clears the system name with it — a bare name with
  // no mechanism is meaningless and would linger invisibly.
  if (merged.mechanism === undefined) delete merged.systemName;
  if (merged.mechanism !== "system") delete merged.systemName;

  const isEmpty = merged.mechanism === undefined && !merged.systemName;
  const next = isEmpty
    ? existing.filter((c) => c.toId !== toId)
    : found
      ? existing.map((c) => (c.toId === toId ? merged : c))
      : [...existing, merged];
  return { ...item, connections: dropEmpty(next) };
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
  // --- Discovery layer ---
  | { type: "SET_DISCOVERY"; on: boolean }
  /** Schema map: remember where a lane card was dragged to. */
  | { type: "SET_LANE_POSITION"; laneId: string; x: number; y: number }
  /** Schema map: forget every hand-placement, back to the computed grid. */
  | { type: "RESET_LANE_POSITIONS" }
  | { type: "SET_SUMMARY"; text: string }
  | { type: "SET_MECHANISM"; id: string; toId: string; mechanism?: HandoffMechanism }
  | { type: "SET_SYSTEM_NAME"; id: string; toId: string; systemName: string }
  | { type: "SET_SYSTEM_OF_RECORD"; id: string; systemOfRecord: string }
  | { type: "SET_OPEN_QUESTION"; id: string; openQuestion: string }
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
      // Drop the deleted lane's map placement too, so re-adding a lane with a
      // recycled id can't inherit a stale position.
      let lanePositions = doc.lanePositions;
      if (lanePositions && action.id in lanePositions) {
        const { [action.id]: _gone, ...rest } = lanePositions;
        lanePositions = Object.keys(rest).length > 0 ? rest : undefined;
      }
      return renormalizeAll({ ...doc, lanes, items, lanePositions });
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
      // Removing an arrow removes its discovery detail with it — a mechanism
      // for an edge that no longer exists would sit invisible in the gaps count.
      const keep = new Set(cleaned);
      return {
        ...doc,
        items: doc.items.map((i) =>
          i.id === action.id
            ? {
                ...i,
                connectsTo: cleaned,
                connections: dropEmpty(i.connections?.filter((c) => keep.has(c.toId))),
              }
            : i,
        ),
      };
    }

    case "SET_DISCOVERY":
      return { ...doc, discovery: action.on };

    case "SET_SUMMARY":
      return { ...doc, summary: action.text || undefined };

    case "SET_MECHANISM": {
      // Only annotate an arrow that actually exists.
      const source = doc.items.find((i) => i.id === action.id);
      if (!source || !source.connectsTo.includes(action.toId)) return doc;
      return {
        ...doc,
        items: doc.items.map((i) =>
          i.id === action.id ? upsertConnection(i, action.toId, { mechanism: action.mechanism }) : i,
        ),
      };
    }

    case "SET_SYSTEM_NAME": {
      const source = doc.items.find((i) => i.id === action.id);
      if (!source || !source.connectsTo.includes(action.toId)) return doc;
      const name = action.systemName.trim();
      return {
        ...doc,
        items: doc.items.map((i) =>
          i.id === action.id
            ? upsertConnection(i, action.toId, { systemName: name || undefined })
            : i,
        ),
      };
    }

    case "SET_SYSTEM_OF_RECORD": {
      const value = action.systemOfRecord.trim();
      return {
        ...doc,
        items: doc.items.map((i) =>
          i.id === action.id ? { ...i, systemOfRecord: value || undefined } : i,
        ),
      };
    }

    case "SET_OPEN_QUESTION": {
      const value = action.openQuestion.trim();
      return {
        ...doc,
        items: doc.items.map((i) =>
          i.id === action.id ? { ...i, openQuestion: value || undefined } : i,
        ),
      };
    }

    case "SET_LANE_POSITION": {
      // Pixels only. `laneId` and `order` are untouched by dragging — the map
      // is a view of the board, never an editor of it.
      return {
        ...doc,
        lanePositions: {
          ...doc.lanePositions,
          [action.laneId]: { x: action.x, y: action.y },
        },
      };
    }

    case "RESET_LANE_POSITIONS": {
      if (!doc.lanePositions) return doc;
      const { lanePositions: _dropped, ...rest } = doc;
      return rest;
    }

    case "RESET":
      // Start over clears content, not the mode. Wiping the board mid-interview
      // shouldn't silently drop you out of discovery.
      return { ...emptyDoc, discovery: doc.discovery };

    case "REPLACE_DOC":
      return action.doc;

    default:
      return doc;
  }
}
