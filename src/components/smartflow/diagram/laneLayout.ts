/**
 * Pure layout: SmartFlowDoc → React Flow nodes + edges.
 *
 * Lanes become full-height background nodes laid out left-to-right by
 * `lane.order`. Each item becomes a card node positioned by its lane's column
 * and its own `item.order` (vertical slot). Connections become edges with
 * arrowheads. Nothing here mutates the doc — placement is read straight from
 * the explicit user-assigned fields.
 */

import { MarkerType, type Edge, type Node } from "reactflow";
import { isManualMechanism, mechanismLabel, type HandoffMechanism, type SmartFlowDoc } from "../types";

// Layout constants — one place to tune the diagram's geometry.
export const LANE_WIDTH = 240;
export const LANE_GAP = 32;
export const LANE_HEADER_H = 40;
export const LANE_TOP = 0;
export const ITEM_HEIGHT = 56;
export const ITEM_GAP = 16;
export const ITEM_INSET_X = 20; // horizontal padding of a card inside its lane
export const ITEM_TOP_PAD = 16; // gap below the lane header before the first card
export const LANE_BOTTOM_PAD = 24;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
}

/**
 * Edge color by mechanism. The manual end of the ladder reads warm (a finding),
 * the automated end reads neutral (fine as-is) — so a discovery diagram is a
 * gap map at a glance: the warm arrows ARE the pitch. An arrow nobody has been
 * asked about keeps the default color; "not asked yet" is not a finding.
 */
function edgeColorFor(
  mechanism: HandoffMechanism | undefined,
  isDark: boolean,
  fallback: string,
): string {
  if (mechanism === undefined) return fallback;
  // Warm = manual (a finding). Muted sage = system or automated (fine as-is).
  if (isManualMechanism(mechanism)) return isDark ? "#d98c5f" : "#b4653a";
  return "#7f9b90";
}

export function buildLayout(
  doc: SmartFlowDoc,
  isDark: boolean,
  /** Discovery mode: label + color the edges, and flag steps with a question. */
  annotate = false,
): LayoutResult {
  const lanes = [...doc.lanes].sort((a, b) => a.order - b.order);

  // Items grouped by lane, ordered. Inbox items are NOT rendered (they aren't
  // placed yet) — the diagram only shows assigned steps.
  const itemsByLane = new Map<string, typeof doc.items>();
  for (const lane of lanes) itemsByLane.set(lane.id, []);
  for (const item of doc.items) {
    if (item.laneId && itemsByLane.has(item.laneId)) itemsByLane.get(item.laneId)!.push(item);
  }
  for (const list of itemsByLane.values()) list.sort((a, b) => a.order - b.order);

  // Tallest lane drives the shared lane-background height so columns align.
  const maxItems = Math.max(0, ...lanes.map((l) => itemsByLane.get(l.id)!.length));
  const laneBodyH = ITEM_TOP_PAD + maxItems * ITEM_HEIGHT + Math.max(0, maxItems - 1) * ITEM_GAP;
  const laneHeight = LANE_HEADER_H + laneBodyH + LANE_BOTTOM_PAD;

  const nodes: Node[] = [];
  const itemX = new Map<string, number>();
  const itemY = new Map<string, number>();

  lanes.forEach((lane, colIdx) => {
    const laneX = colIdx * (LANE_WIDTH + LANE_GAP);

    // Lane background node (non-interactive, sits behind item nodes).
    nodes.push({
      id: `lane:${lane.id}`,
      type: "laneNode",
      position: { x: laneX, y: LANE_TOP },
      data: { name: lane.name },
      draggable: false,
      selectable: false,
      style: { width: LANE_WIDTH, height: laneHeight, zIndex: 0 },
    });

    const items = itemsByLane.get(lane.id)!;
    items.forEach((item, rowIdx) => {
      const x = laneX + ITEM_INSET_X;
      const y = LANE_TOP + LANE_HEADER_H + ITEM_TOP_PAD + rowIdx * (ITEM_HEIGHT + ITEM_GAP);
      itemX.set(item.id, x);
      itemY.set(item.id, y);
      nodes.push({
        id: item.id,
        type: "itemNode",
        position: { x, y },
        data: {
          label: item.label,
          flagged: annotate && Boolean(item.openQuestion?.trim()),
        },
        draggable: false,
        selectable: false,
        width: LANE_WIDTH - ITEM_INSET_X * 2,
        height: ITEM_HEIGHT,
        style: { width: LANE_WIDTH - ITEM_INSET_X * 2, height: ITEM_HEIGHT, zIndex: 1 },
      });
    });
  });

  // Edges — one per connection that points at a rendered (placed) item.
  // Pick handles by geometry so routing reads naturally: a same-column handoff
  // that flows downward exits the bottom and enters the top; anything else
  // (cross-lane, or pointing left/up) exits the right and enters the left.
  const placed = new Set(itemX.keys());
  const edgeColor = isDark ? "#cfae60" : "#426f62";
  const edges: Edge[] = [];
  for (const item of doc.items) {
    if (!placed.has(item.id)) continue;
    const detail = new Map((item.connections ?? []).map((c) => [c.toId, c] as const));
    for (const targetId of item.connectsTo) {
      if (!placed.has(targetId)) continue;
      const sameColumn = itemX.get(item.id) === itemX.get(targetId);
      const downward = (itemY.get(targetId) ?? 0) > (itemY.get(item.id) ?? 0);
      const vertical = sameColumn && downward;

      const conn = annotate ? detail.get(targetId) : undefined;
      const stroke = annotate ? edgeColorFor(conn?.mechanism, isDark, edgeColor) : edgeColor;
      // "Existing system" carries its name — the name is the finding, not the
      // category, so show "QuickBooks" rather than the generic word.
      const label =
        conn?.mechanism === undefined
          ? undefined
          : conn.mechanism === "system" && conn.systemName
            ? conn.systemName
            : mechanismLabel(conn.mechanism);

      edges.push({
        id: `e:${item.id}->${targetId}`,
        source: item.id,
        target: targetId,
        sourceHandle: vertical ? "s-bottom" : "s-right",
        targetHandle: vertical ? "t-top" : "t-left",
        type: "smoothstep",
        animated: false,
        label,
        labelShowBg: true,
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: isDark ? "#1d1d1d" : "#ffffff", fillOpacity: 0.92 },
        labelStyle: { fill: stroke, fontSize: 11, fontWeight: 600 },
        style: { stroke, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 },
      });
    }
  }

  const width = lanes.length * LANE_WIDTH + Math.max(0, lanes.length - 1) * LANE_GAP;
  return { nodes, edges, width, height: laneHeight };
}
