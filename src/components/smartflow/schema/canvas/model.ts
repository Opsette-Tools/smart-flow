/**
 * SchemaDoc -> canvas card model.
 *
 * Deliberately parallel to ../../schemamap/model.ts's split (pure geometry,
 * no React, no DOM — the canvas and the SVG both read these same numbers so
 * a line can never disagree with the card it points at), but the numbers
 * themselves differ: a schema card's rows are typed columns with fixed
 * height (no nested note lines — see docs/SCHEMA-DESIGNER-PLAN.md §6 for why
 * this card reads as a data grid, not a discovery-notes card).
 *
 * Nothing here writes to the doc. Dragging moves pixels; `columns` and
 * `relationships` are only ever changed by explicit edits.
 */

import { columnTypeColor, type Relationship, type SchemaColumn, type SchemaDoc, type SchemaTable } from "../types";

// Widened 2026-09-03 from 260 — real field names ("Federal Tax ID / EIN",
// "D-U-N-S Number") truncated badly at the old width, and a target-specific
// type label ("Single line text", "Multiple select") is wider than the
// neutral one, making the old card read as mostly type-label. See
// docs/SCHEMA-DESIGNER-PLAN.md progress notes, 2026-09-03.
export const CARD_WIDTH = 340;
export const CARD_HEADER_H = 34;
export const ROW_H = 28;
export const CARD_BOTTOM_PAD = 4;

const GRID_X = CARD_WIDTH + 90;
const GRID_TOP = 40;
const GRID_LEFT = 40;
const GRID_COLUMNS = 3;
const GRID_ROW_H = 320;

/** A table's identity color, cycled by its position in the doc — same
 *  "assigned by order, stable across renders" rule as lane colors. */
const TABLE_COLORS = [
  "#3b6ea5",
  "#b4653a",
  "#5c8374",
  "#8b6bab",
  "#a5843b",
  "#437f8c",
  "#a3556f",
  "#6b7f3b",
];

export function tableColor(index: number): string {
  return TABLE_COLORS[index % TABLE_COLORS.length];
}

export interface ColumnRow {
  id: string;
  column: SchemaColumn;
  /** Y of the row's vertical center, relative to the card's top edge —
   *  where a relationship line anchors. */
  anchorY: number;
}

export interface TableCard {
  tableId: string;
  name: string;
  color: string;
  rows: ColumnRow[];
  height: number;
  defaultX: number;
  defaultY: number;
}

/** A relationship, resolved to its two cards and two columns for rendering. */
export interface CanvasEdge {
  id: string;
  relationship: Relationship;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  color: string;
  sameTable: boolean;
}

export interface CanvasModel {
  cards: TableCard[];
  edges: CanvasEdge[];
}

export function typeAccentColor(column: SchemaColumn): string {
  return columnTypeColor(column.type);
}

export function buildCanvasModel(doc: SchemaDoc): CanvasModel {
  const tables = doc.tables;

  const cards: TableCard[] = tables.map((table: SchemaTable, idx) => {
    const rows: ColumnRow[] = [];
    let y = CARD_HEADER_H;
    for (const column of table.columns) {
      rows.push({ id: column.id, column, anchorY: y + ROW_H / 2 });
      y += ROW_H;
    }
    // +ROW_H reserves room for the "Add column" control, which always
    // renders after the last column row — without this the card's fixed
    // CSS height clips it the moment a table has any columns at all (only
    // an empty table's Math.max floor happened to leave enough room, which
    // is why this bug only showed up after the first column was added).
    const height = y + ROW_H + CARD_BOTTOM_PAD;
    const col = idx % GRID_COLUMNS;
    const band = Math.floor(idx / GRID_COLUMNS);
    return {
      tableId: table.id,
      name: table.name,
      color: tableColor(idx),
      rows,
      height,
      defaultX: GRID_LEFT + col * GRID_X,
      defaultY: GRID_TOP + band * GRID_ROW_H,
    };
  });

  const colorByTableId = new Map(cards.map((c) => [c.tableId, c.color] as const));

  const edges: CanvasEdge[] = doc.relationships.map((r) => ({
    id: r.id,
    relationship: r,
    fromTableId: r.fromTableId,
    fromColumnId: r.fromColumnId,
    toTableId: r.toTableId,
    toColumnId: r.toColumnId,
    color: colorByTableId.get(r.fromTableId) ?? tableColor(0),
    sameTable: r.fromTableId === r.toTableId,
  }));

  return { cards, edges };
}
