/**
 * SmartFlowDoc -> schema-map card model.
 *
 * One LANE is one CARD, the way one table is one card in a schema map. The
 * lane's steps are the rows inside it, the way a table's columns are its rows.
 * A handoff between two steps is a line between two ROWS — never between two
 * card centers, which is what makes parallel handoffs stay distinguishable.
 *
 * Everything here is pure geometry and pure derivation. No React, no DOM. The
 * canvas reads these numbers to place divs and to draw SVG paths; because both
 * read the SAME numbers, a line can never disagree with the card it points at.
 *
 * Nothing in this file writes to the doc. Dragging moves pixels; `laneId` and
 * `order` are only ever set on the Build page.
 */

import {
  isCustomMechanism,
  isManualMechanism,
  connectionMechanisms,
  mechanismLabel,
  type Connection,
  type HandoffMechanism,
  type Item,
  type SmartFlowDoc,
} from "../types";

// ── Geometry ──────────────────────────────────────────────────────
// One place to tune the map. The canvas and the SVG both import these, so
// there is exactly one definition of where a row sits.

export const CARD_WIDTH = 260;
export const CARD_HEADER_H = 38;
/** A step row with just its name. */
export const ROW_H = 30;
/** Extra height added to a row for each nested handoff line it carries. */
export const ROW_NOTE_H = 18;
/** Padding under the last row so the card's border doesn't crowd it. */
export const CARD_BOTTOM_PAD = 6;

/** Default grid when a board has never been laid out by hand. */
const GRID_X = CARD_WIDTH + 90;
const GRID_TOP = 40;
const GRID_LEFT = 40;
/** Lanes wrap to a second band rather than running off to the right forever. */
const GRID_COLUMNS = 4;
const GRID_ROW_H = 380;

// ── Lane colors ───────────────────────────────────────────────────
// A lane's identity is its color stripe, as `table.color` is in the reference.
// Assigned by lane order so the same lane keeps the same color across renders.

const LANE_COLORS = [
  "#3b6ea5",
  "#b4653a",
  "#5c8374",
  "#8b6bab",
  "#a5843b",
  "#437f8c",
  "#a3556f",
  "#6b7f3b",
];

export function laneColor(order: number): string {
  return LANE_COLORS[order % LANE_COLORS.length];
}

// ── Model ─────────────────────────────────────────────────────────

/** One nested line under a step: the handoff, in the client's own words. */
export interface RowNote {
  /** e.g. "→ Costing" */
  target: string;
  /** The mechanism as typed/picked, or undefined when nobody has been asked. */
  method?: string;
  /** Manual handoffs read warm — they're the finding. */
  manual: boolean;
}

export interface StepRow {
  id: string;
  label: string;
  /** Y of the row's TOP, relative to the card's top edge. */
  y: number;
  /** Full height of this row including its nested handoff lines. */
  height: number;
  /** Y of the row's vertical center — where a line anchors. */
  anchorY: number;
  notes: RowNote[];
  /** Discovery: where the step's data lives. Rendered as a nested line. */
  systemOfRecord?: string;
  /** Discovery: an unanswered question hangs off this step. */
  openQuestion?: string;
}

export interface LaneCard {
  laneId: string;
  name: string;
  color: string;
  rows: StepRow[];
  /** Total card height, derived from its rows. */
  height: number;
  /** Default position, used until the user drags the card. */
  defaultX: number;
  defaultY: number;
}

/** A handoff, resolved to the two cards and the two rows it joins. */
export interface MapEdge {
  id: string;
  fromLaneId: string;
  fromStepId: string;
  toLaneId: string;
  toStepId: string;
  /** The ORIGINATING lane's accent color — the same one on its card stripe.
   *  Lines are colored by where they come from, because on a wide board a line
   *  can run underneath other cards and its start point is off-screen. Its
   *  color is then the only way to tell which lane sent it. Handoff method is
   *  not encoded here; it's written in words on the card next to the step. */
  color: string;
  /** Warm when a person carries the work; muted when a system does. */
  manual: boolean;
  /** True when nobody has been asked how this handoff moves. */
  unasked: boolean;
  /** Same-lane handoffs still draw, but loop within the one card. */
  sameLane: boolean;
}

export interface MapModel {
  cards: LaneCard[];
  edges: MapEdge[];
}

/** Height a step row needs, given how many nested lines hang under it. */
function rowHeight(noteCount: number): number {
  return ROW_H + noteCount * ROW_NOTE_H;
}

function connectionFor(item: Item, toId: string): Connection | undefined {
  return item.connections?.find((c) => c.toId === toId);
}

/** The words to show for a handoff's method: the system's NAME when one was
 *  given ("QuickBooks" beats the generic "Existing system"), else the label. */
function methodText(conn: Connection | undefined): string | undefined {
  const picked = connectionMechanisms(conn);
  if (picked.length === 0) return undefined;
  const one = (m: HandoffMechanism): string => {
    if (m === "system" && conn?.systemName?.trim()) return conn.systemName.trim();
    if (isCustomMechanism(m)) return m.custom;
    return mechanismLabel(m);
  };
  return picked.map(one).join(" + ");
}

/**
 * Build the whole map from the doc.
 *
 * Inbox steps (laneId null) are excluded: they aren't placed yet, so they have
 * no lane to live in. That matches the swimlane diagram's rule.
 */
export function buildMap(doc: SmartFlowDoc): MapModel {
  const lanes = [...doc.lanes].sort((a, b) => a.order - b.order);
  const byId = new Map(doc.items.map((i) => [i.id, i] as const));

  // Which lane each step sits in — needed to resolve an edge to its two cards.
  const laneOfStep = new Map<string, string>();
  for (const item of doc.items) {
    if (item.laneId) laneOfStep.set(item.id, item.laneId);
  }

  const stepsByLane = new Map<string, Item[]>();
  for (const lane of lanes) stepsByLane.set(lane.id, []);
  for (const item of doc.items) {
    if (item.laneId && stepsByLane.has(item.laneId)) {
      stepsByLane.get(item.laneId)!.push(item);
    }
  }
  for (const list of stepsByLane.values()) list.sort((a, b) => a.order - b.order);

  const cards: LaneCard[] = lanes.map((lane, idx) => {
    const steps = stepsByLane.get(lane.id)!;
    const rows: StepRow[] = [];
    let y = CARD_HEADER_H;

    for (const step of steps) {
      // Nested lines under the step: one per outgoing handoff, plus the
      // storage system when it's known. These are the text Ruthnie asked to
      // keep inline rather than compress into an invented icon.
      const notes: RowNote[] = step.connectsTo
        .filter((toId) => byId.has(toId) && laneOfStep.has(toId))
        .map((toId) => {
          const conn = connectionFor(step, toId);
          return {
            target: byId.get(toId)!.label,
            method: methodText(conn),
            manual: connectionMechanisms(conn).some(isManualMechanism),
          };
        });

      const system = step.systemOfRecord?.trim() || undefined;
      const question = step.openQuestion?.trim() || undefined;
      // System of record and open question each occupy a nested line too.
      const extraLines = (system ? 1 : 0) + (question ? 1 : 0);
      const h = rowHeight(notes.length + extraLines);

      rows.push({
        id: step.id,
        label: step.label,
        y,
        height: h,
        // Anchor on the step's OWN name line, not the middle of its notes —
        // a line should point at the step, not at the text hanging under it.
        anchorY: y + ROW_H / 2,
        notes,
        systemOfRecord: system,
        openQuestion: question,
      });
      y += h;
    }

    const height = y + CARD_BOTTOM_PAD;
    const col = idx % GRID_COLUMNS;
    const band = Math.floor(idx / GRID_COLUMNS);

    return {
      laneId: lane.id,
      name: lane.name,
      color: laneColor(lane.order),
      rows,
      height,
      defaultX: GRID_LEFT + col * GRID_X,
      defaultY: GRID_TOP + band * GRID_ROW_H,
    };
  });

  // Edges: every connection whose both ends are placed in a lane.
  const laneOrder = new Map(doc.lanes.map((l) => [l.id, l.order] as const));
  const edges: MapEdge[] = [];
  for (const item of doc.items) {
    const fromLane = item.laneId;
    if (!fromLane) continue;
    for (const toId of item.connectsTo) {
      const toLane = laneOfStep.get(toId);
      if (!toLane) continue;
      const conn = connectionFor(item, toId);
      edges.push({
        id: `${item.id}->${toId}`,
        fromLaneId: fromLane,
        fromStepId: item.id,
        toLaneId: toLane,
        toStepId: toId,
        color: laneColor(laneOrder.get(fromLane) ?? 0),
        manual: connectionMechanisms(conn).some(isManualMechanism),
        unasked: connectionMechanisms(conn).length === 0,
        sameLane: fromLane === toLane,
      });
    }
  }

  return { cards, edges };
}
