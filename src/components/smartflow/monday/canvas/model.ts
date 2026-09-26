/**
 * MondayDoc -> canvas card model.
 *
 * A FORK of ../../schema/canvas/model.ts, not an extension of it — the same
 * call docs/MONDAY-BOARD-DESIGNER-PLAN.md §6 makes, for the same reason
 * SCHEMA-DESIGNER-PLAN.md §3 made it about the schema map: the geometry
 * differs enough that one parameterized renderer would be harder to read
 * than two clear ones. A board card has a group chip row in its header and
 * an optional second, visually distinct column band underneath; a schema
 * card has neither.
 *
 * Pure geometry — no React, no DOM. The canvas and the SVG both read these
 * same numbers, so a line can never disagree with the card it points at.
 * Nothing here writes to the doc: dragging moves pixels, and which columns
 * exist is only ever changed by an explicit edit.
 */

import { columnTypeColor } from "../../schema/types";
import type { MondayBoard, MondayColumn, MondayDoc } from "../types";

// Wider than the schema card's 340: a Monday row can carry a target board
// name ("→ Components") or a mirror's via-column, which is more text than a
// bare type label.
export const CARD_WIDTH = 360;
export const CARD_HEADER_H = 34;
/** The group chip row, when a board has any groups. Chips wrap, so this is
 *  per LINE of chips, not a fixed total. */
export const GROUP_ROW_H = 28;
/** A band label ("Item columns" / "Subitem columns") — the divider that
 *  makes the subitem set read as a separate schema rather than more rows. */
export const BAND_LABEL_H = 20;
export const ROW_H = 28;
/** Room for the band's "Add column" control, which always renders after the
 *  last row in that band. Without it the card's fixed height clips the
 *  control the moment the band has any columns — the exact bug the schema
 *  card hit (see schema/canvas/model.ts). */
export const ADD_ROW_H = 28;
export const CARD_BOTTOM_PAD = 6;
/** Vertical gap between the item band and the subitem band, so the tinted
 *  subitem section reads as inset rather than merely adjacent. */
export const BAND_GAP = 6;
/** The subitem band's own chrome — its 1px border top and bottom plus the
 *  bottom margin. Reserved so the card's fixed height covers the inset box,
 *  which would otherwise clip against `overflow: hidden` exactly the way the
 *  schema card's add-column control once did. */
export const SUBITEM_BAND_CHROME_H = 10;

// Default placement for a new board. The gaps are deliberately modest: a
// Connect edge only needs room to route its elbow, and a new board landing
// most of a screen away from the one it relates to reads as an accident.
// (First pass used +100 / 400, which threw board 2 off the visible canvas.)
const GRID_X = CARD_WIDTH + 56;
const GRID_TOP = 32;
const GRID_LEFT = 32;
const GRID_COLUMNS = 3;
const GRID_ROW_H = 300;

/** Groups stack vertically, one per line — a Monday group is a coloured bar
 *  owning a section of rows, not a tag, and the list is flat and ordered
 *  (Monday has no nested groups). So a board reserves one line per group,
 *  plus one for the add-group control. */
const GROUP_ADD_LINES = 1;

/** A board's identity color, cycled by its position in the doc — same
 *  "assigned by order, stable across renders" rule as table and lane
 *  colors. Distinct from MONDAY_GROUP_COLORS: that palette is Monday's, for
 *  group chips, while this one is the app's, for card identity. */
const BOARD_COLORS = [
  "#3b6ea5",
  "#b4653a",
  "#5c8374",
  "#8b6bab",
  "#a5843b",
  "#437f8c",
  "#a3556f",
  "#6b7f3b",
];

export function boardColor(index: number): string {
  return BOARD_COLORS[index % BOARD_COLORS.length];
}

/** Which band a row sits in. Carried on every row so an edge, a hairline or
 *  an edit action always knows which column SET it is acting on — the one
 *  thing that is never inferable from a column id alone. */
export type BandKind = "item" | "subitem";

export interface ColumnRow {
  id: string;
  column: MondayColumn;
  band: BandKind;
  /** 0 for a normal column, 1 for a Mirror nested under the Connect it
   *  rides. See orderedColumns() — presentation only. */
  depth: number;
  /** Y of the row's vertical center, relative to the card's top edge —
   *  where a connect line anchors, and where a mirror hairline starts. */
  anchorY: number;
}

export interface BoardCard {
  boardId: string;
  name: string;
  color: string;
  /** How many lines of group chips the header reserves. 0 = no groups. */
  groupLines: number;
  itemRows: ColumnRow[];
  /** Absent when the board has no subitem column set at all — which is
   *  different from having one that is empty (the band still renders, with
   *  its label and its note, so the structure is visible). */
  subitemRows?: ColumnRow[];
  hasSubitems: boolean;
  height: number;
  defaultX: number;
  defaultY: number;
}

/** A Connect column, resolved to the two cards and the row it leaves from,
 *  for rendering. Derived by walking columns — never stored (§3). */
export interface CanvasEdge {
  id: string;
  fromBoardId: string;
  /** The Connect column's own row — the edge anchors here, not at the card
   *  centre, so parallel connections stay distinguishable (§6). */
  fromColumnId: string;
  fromBand: BandKind;
  toBoardId: string;
  color: string;
  /** A Connect pointing at its own board. Rendered as a self-loop rather
   *  than collapsing into a flat line hidden behind the card. */
  selfLink: boolean;
}

export interface CanvasModel {
  cards: BoardCard[];
  edges: CanvasEdge[];
}

/* A Mirror's dependency on its Connect is NOT modeled here. It is expressed
 * by layout instead: orderedColumns() places each Mirror directly under the
 * Connect it rides, indented. That survives any number of columns sitting
 * between the two in the stored order, needs no hover, and needs no
 * geometry — where a drawn line between two adjacent rows had none to work
 * with. */

/** The accent color for a row. Plain columns take their canonical type
 *  color; the two Monday-only kinds get their own fixed colors, matching
 *  the schema designer's "relation" red and "rollup" blue so the same
 *  concept reads the same way in both tools. */
export function rowAccentColor(column: MondayColumn): string {
  if (column.spec.kind === "connect") return "#c0392b";
  if (column.spec.kind === "mirror") return "#5a7a9e";
  return columnTypeColor(column.spec.type);
}

/**
 * Display order for a column set: every Mirror is pulled up to sit directly
 * under the Connect column it rides, and rendered indented.
 *
 * A Mirror cannot exist without its Connect, reaches only the board that
 * Connect reaches, and is deleted with it (§4) — so showing it as a child of
 * that Connect makes the dependency permanently visible, with no hover and
 * no line to draw. An earlier pass tried a drawn hairline between the two
 * rows; because a Mirror is usually created right after its Connect, the two
 * rows were adjacent and the line had no distance to travel.
 *
 * Note this is PRESENTATION only. Monday's real column list is flat — a
 * Mirror sits beside its Connect, not inside it — and the stored order in
 * `MondayBoard.columns` is untouched. The indent expresses a dependency the
 * flat list hides, which is the whole job of a designer.
 *
 * Mirrors whose Connect is missing (only reachable in a hand-edited or
 * imported doc — the reducer cascades them away) keep their original place
 * rather than vanishing from the card.
 */
export function orderedColumns(columns: MondayColumn[]): { column: MondayColumn; depth: number }[] {
  const mirrorsByConnect = new Map<string, MondayColumn[]>();
  const present = new Set(columns.map((c) => c.id));

  for (const column of columns) {
    if (column.spec.kind !== "mirror") continue;
    const via = column.spec.viaConnectColumnId;
    if (!present.has(via)) continue;
    const list = mirrorsByConnect.get(via);
    if (list) list.push(column);
    else mirrorsByConnect.set(via, [column]);
  }

  const claimed = new Set(
    [...mirrorsByConnect.values()].flat().map((c) => c.id),
  );

  const out: { column: MondayColumn; depth: number }[] = [];
  for (const column of columns) {
    if (claimed.has(column.id)) continue;
    out.push({ column, depth: 0 });
    for (const mirror of mirrorsByConnect.get(column.id) ?? []) {
      out.push({ column: mirror, depth: 1 });
    }
  }
  return out;
}

function buildRows(columns: MondayColumn[], band: BandKind, startY: number): ColumnRow[] {
  const rows: ColumnRow[] = [];
  let y = startY;
  // Walks the DISPLAY order, so a row's anchorY matches where the card
  // actually paints it — otherwise a Connect edge would leave from the wrong
  // row the moment a Mirror was reordered under its Connect.
  for (const { column, depth } of orderedColumns(columns)) {
    rows.push({ id: column.id, column, band, depth, anchorY: y + ROW_H / 2 });
    y += ROW_H;
  }
  return rows;
}

export function buildCanvasModel(doc: MondayDoc): CanvasModel {
  const cards: BoardCard[] = doc.boards.map((board: MondayBoard, idx) => {
    // The group band ALWAYS renders (its empty state is a "+ Group"
    // affordance), and groups stack one per line.
    const groupLines = board.groups.length + GROUP_ADD_LINES;

    // The groups band carries its own "Groups" label, matching the two
    // column bands — so the card names all three structural nouns it holds.
    let y = CARD_HEADER_H + BAND_LABEL_H + groupLines * GROUP_ROW_H;

    // Item band: label, rows, then the add-column control.
    y += BAND_LABEL_H;
    const itemRows = buildRows(board.columns, "item", y);
    y += board.columns.length * ROW_H + ADD_ROW_H;

    // Subitem band, only when the board has one. An EMPTY set still renders
    // the band — "this board has subitems and they have no columns yet" is a
    // real state the card should show, not hide.
    let subitemRows: ColumnRow[] | undefined;
    const hasSubitems = !!board.subitemColumns;
    if (board.subitemColumns) {
      y += BAND_GAP + BAND_LABEL_H;
      subitemRows = buildRows(board.subitemColumns, "subitem", y);
      // No note paragraph to reserve for — the §5.5 guidance now rides the
      // band heading as a tooltip, so the band is just label + rows + add.
      y += board.subitemColumns.length * ROW_H + ADD_ROW_H + SUBITEM_BAND_CHROME_H;
    } else {
      // A board without subitems shows the "Add subitem columns" control
      // instead, which occupies one row of its own.
      y += ADD_ROW_H;
    }

    const col = idx % GRID_COLUMNS;
    const band = Math.floor(idx / GRID_COLUMNS);
    return {
      boardId: board.id,
      name: board.name,
      color: boardColor(idx),
      groupLines,
      itemRows,
      subitemRows,
      hasSubitems,
      height: y + CARD_BOTTOM_PAD,
      defaultX: GRID_LEFT + col * GRID_X,
      defaultY: GRID_TOP + band * GRID_ROW_H,
    };
  });

  const colorByBoardId = new Map(cards.map((c) => [c.boardId, c.color] as const));
  const boardIds = new Set(doc.boards.map((b) => b.id));

  // Edges are DERIVED from the connect columns themselves (§3) — there is no
  // stored relationship array that could drift out of agreement with them.
  const edges: CanvasEdge[] = [];

  for (const board of doc.boards) {
    const bands: { columns: MondayColumn[]; band: BandKind }[] = [
      { columns: board.columns, band: "item" },
      { columns: board.subitemColumns ?? [], band: "subitem" },
    ];
    for (const { columns, band } of bands) {
      for (const column of columns) {
        if (column.spec.kind === "connect") {
          // A Connect whose target was deleted draws nothing. The reducer
          // prunes these on DELETE_BOARD, so this is a guard against a
          // hand-edited or imported doc, not an expected state.
          if (!boardIds.has(column.spec.targetBoardId)) continue;
          edges.push({
            id: column.id,
            fromBoardId: board.id,
            fromColumnId: column.id,
            fromBand: band,
            toBoardId: column.spec.targetBoardId,
            color: colorByBoardId.get(board.id) ?? boardColor(0),
            selfLink: column.spec.targetBoardId === board.id,
          });
        }
      }
    }
  }

  return { cards, edges };
}

/** Find a row by column id across both bands of a card — what an edge needs
 *  to resolve its anchor Y. */
export function findRow(card: BoardCard, columnId: string): ColumnRow | undefined {
  return (
    card.itemRows.find((r) => r.id === columnId) ??
    card.subitemRows?.find((r) => r.id === columnId)
  );
}
