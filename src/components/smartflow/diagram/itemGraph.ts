/**
 * Small shared reads over Item[] used by the outline-type layout functions.
 * Kept separate from store.ts (which owns mutation) — this file is read-only
 * helpers for turning the graph into a diagram.
 */

import type { Item } from "../types";

/** The edge label (e.g. "Yes"/"No") stored for one outgoing connection, if any. */
export function connectionLabel(item: Item, toId: string): string | undefined {
  return item.connections?.find((c) => c.toId === toId)?.label;
}

/** A step reads as a yes/no decision when its label ends in "?" — the same
 *  rule the paste-import and the flowchart layout both use. Shared here so a
 *  step's own detail editor (branch labels vs. handoff mechanism) never
 *  disagrees with how the diagram renders it. */
export function isDecisionStep(label: string): boolean {
  return label.trim().endsWith("?");
}

/** The item(s) with no incoming connectsTo edge — where a graph walk starts.
 *  Falls back to the lowest-order item so a cycle or bad import still walks
 *  something rather than nothing. Shared by every outline-type board/layout
 *  so they can never disagree about where the graph begins. */
export function findGraphRoots(items: Item[]): Item[] {
  const hasIncoming = new Set<string>();
  for (const item of items) for (const toId of item.connectsTo) hasIncoming.add(toId);
  const roots = items.filter((i) => !hasIncoming.has(i.id));
  if (roots.length > 0) return roots.sort((a, b) => a.order - b.order);
  const first = [...items].sort((a, b) => a.order - b.order)[0];
  return first ? [first] : [];
}

export interface ReadingOrderRow {
  item: Item;
  /** The edge label ("Yes"/"No") on the connection that reached this item
   *  from its parent in the walk, if any. Undefined for a root or a plain
   *  (unlabeled) handoff. */
  branchLabel?: string;
}

/** Depth-first reading order: each root, then its children in connectsTo
 *  order, recursively — the same order a person reads the pasted outline
 *  top-to-bottom. Used by the Build tab's list view, which shows the graph as
 *  a simple sequence rather than a 2D diagram, with each row's incoming
 *  branch label so a Yes/No fork still reads clearly as a flat list. */
export function walkReadingOrder(items: Item[]): ReadingOrderRow[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const visited = new Set<string>();
  const out: ReadingOrderRow[] = [];
  const walk = (item: Item, branchLabel: string | undefined) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    out.push({ item, branchLabel });
    for (const childId of item.connectsTo) {
      const child = byId.get(childId);
      if (child) walk(child, connectionLabel(item, childId));
    }
  };
  for (const root of findGraphRoots(items)) walk(root, undefined);
  // Anything unreached (orphaned by a cycle elsewhere) still shows up, so
  // editing never silently hides a step.
  for (const item of [...items].sort((a, b) => a.order - b.order)) walk(item, undefined);
  return out;
}
