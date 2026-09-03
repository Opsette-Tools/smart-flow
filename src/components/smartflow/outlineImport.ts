/**
 * One-time paste→doc import for the outline-shaped diagram types (flowchart,
 * decision-tree, org-tree, timeline).
 *
 * This used to be the whole data model: outline.ts's parseOutline() ran on
 * every render and the tree it produced was thrown away immediately after
 * layout. Now it runs exactly once, when text is pasted into a diagram's
 * Build tab — the OutlineNode tree it makes here is turned into real Item[]
 * records with stable ids, and from that point on the doc (not the text) is
 * the source of truth, the same relationship swimlane already has between
 * seedDoc()/buildSwimDoc() and its reducer.
 *
 * Each type keeps the exact branch inference its outline parser already used,
 * just moved from "recomputed at render" to "decided once at import":
 *   - flowchart: `?`-suffixed line is a decision; first indented child is
 *     Yes, second is No. Connection.label carries "Yes"/"No" on that edge.
 *   - decision-tree: identical shape, every node is presumed a question.
 *   - org-tree: parent -> child via connectsTo, no branch labels.
 *   - timeline: flat sequence in paste order; a milestone's indented children
 *     join into that item's `dateNote`.
 */

import { uuid } from "@/lib/uuid";
import { parseOutline, type OutlineNode } from "./outline";
import { findGraphRoots, isDecisionStep } from "./diagram/itemGraph";
import type { DiagramType } from "./diagramTypes";
import type { Connection, Item, SmartFlowDoc } from "./types";

/** Flowchart + decision-tree share one shape: a top-down spine where a `?`
 *  line's first child is Yes and second is No. Both branches are walked so
 *  nested decisions (a No branch that is itself a question) still import,
 *  even though today's renderer only ever nests one level deep in practice.
 *
 *  Top-level lines are the spine itself, not siblings of each other — each
 *  must link to the one before it. A decision's Yes child becomes the spine's
 *  new tail (matching the old render-time layout, which continued the outer
 *  loop from the Yes box); a plain line is its own tail. */
function buildBranchingItems(roots: OutlineNode[]): Item[] {
  const items: Item[] = [];
  const idFor = new Map<OutlineNode, string>();
  const ensureId = (n: OutlineNode) => {
    let id = idFor.get(n);
    if (!id) {
      id = uuid();
      idFor.set(n, id);
    }
    return id;
  };

  let order = 0;
  /** Walks one node and its branch subtree; returns the spine tail id — the
   *  item the NEXT top-level line should chain from. */
  const walk = (n: OutlineNode, parentId: string | null, edgeLabel: string | undefined): string => {
    const id = ensureId(n);
    const decision = isDecisionStep(n.label);
    const item: Item = {
      id,
      label: n.label,
      laneId: null,
      order: order++,
      connectsTo: [],
    };
    items.push(item);

    if (parentId) {
      const parent = items.find((i) => i.id === parentId)!;
      parent.connectsTo = [...parent.connectsTo, id];
      if (edgeLabel) {
        const connection: Connection = { toId: id, label: edgeLabel };
        parent.connections = [...(parent.connections ?? []), connection];
      }
    }

    if (decision && n.children.length > 0) {
      const yesTail = walk(n.children[0], id, "Yes");
      if (n.children[1]) walk(n.children[1], id, "No");
      // Any further children beyond the yes/no pair (rare, malformed paste)
      // still import as plain unlabeled continuations rather than being
      // silently dropped.
      for (const extra of n.children.slice(2)) walk(extra, id, undefined);
      return yesTail;
    }
    for (const child of n.children) walk(child, id, undefined);
    return id;
  };

  let spineTail: string | null = null;
  for (const root of roots) {
    const tail = walk(root, spineTail, undefined);
    spineTail = tail;
  }
  return items;
}

/** Org chart: a strict parent -> child tree, no branch semantics. */
function buildTreeItems(roots: OutlineNode[]): Item[] {
  const items: Item[] = [];
  const idFor = new Map<OutlineNode, string>();
  let order = 0;

  const walk = (n: OutlineNode, parentId: string | null) => {
    const id = uuid();
    idFor.set(n, id);
    items.push({ id, label: n.label, laneId: null, order: order++, connectsTo: [] });
    if (parentId) {
      const parent = items.find((i) => i.id === parentId)!;
      parent.connectsTo = [...parent.connectsTo, id];
    }
    for (const child of n.children) walk(child, id);
  };

  roots.forEach((root) => walk(root, null));
  return items;
}

/** Timeline: flat ordered sequence. A milestone's indented children used to
 *  be joined into a display-only note recomputed at render time; that note
 *  now lives on the item itself as `dateNote`, so it survives a reload. */
function buildTimelineItems(roots: OutlineNode[]): Item[] {
  return roots.map((m, i) => ({
    id: uuid(),
    label: m.label,
    laneId: null,
    order: i,
    connectsTo: [],
    dateNote: m.children.map((c) => c.label).join(" · ") || undefined,
  }));
}

/** Convert pasted outline text into a real doc for one outline-shaped type.
 *  Called once, at the moment text is pasted/imported — not on every render. */
export function outlineTextToDoc(type: Exclude<DiagramType, "swimlane">, text: string): SmartFlowDoc {
  const roots = parseOutline(text);
  let items: Item[];
  switch (type) {
    case "flowchart":
    case "decision-tree":
      items = buildBranchingItems(roots);
      break;
    case "org-tree":
      items = buildTreeItems(roots);
      break;
    case "timeline":
      items = buildTimelineItems(roots);
      break;
  }
  return { lanes: [], items };
}

/** The reverse of outlineTextToDoc — renders a doc back into the same
 *  indented text shape, so the textarea can show real content when a saved
 *  flow is reopened. Indentation is two spaces per depth, matching what
 *  parseOutline already accepts. Timeline's dateNote round-trips as an
 *  indented child line, exactly the shape it was imported from. */
export function docToOutlineText(type: Exclude<DiagramType, "swimlane">, doc: SmartFlowDoc): string {
  if (doc.items.length === 0) return "";
  const byId = new Map(doc.items.map((i) => [i.id, i]));
  const lines: string[] = [];

  if (type === "timeline") {
    for (const item of [...doc.items].sort((a, b) => a.order - b.order)) {
      lines.push(item.label);
      if (item.dateNote) lines.push(`  ${item.dateNote}`);
    }
    return lines.join("\n");
  }

  const visited = new Set<string>();
  const walk = (item: Item, depth: number) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    lines.push(`${"  ".repeat(depth)}${item.label}`);
    const children = item.connectsTo.map((id) => byId.get(id)).filter((c): c is Item => !!c);
    for (const child of children) walk(child, depth + 1);
  };

  for (const root of findGraphRoots(doc.items)) walk(root, 0);
  return lines.join("\n");
}
