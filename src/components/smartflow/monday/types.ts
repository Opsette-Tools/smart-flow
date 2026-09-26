/**
 * Monday board designer data model.
 *
 * A seventh DiagramType built beside the Schema Designer rather than inside
 * it. The two share the ColumnType vocabulary and nothing else: a
 * SchemaTable is a flat list of typed columns, while a Monday board is a
 * container of ordered groups holding items, with a SECOND, separate column
 * set for subitems. Forcing one model to serve both would mean either junk
 * fields SQL mode ignores or a fake "group" concept on SQL tables — see
 * docs/MONDAY-BOARD-DESIGNER-PLAN.md §1 for the full reasoning.
 *
 * Same "nothing is ever inferred" rule as the rest of the app: position is
 * presentational only, and no field guesses another field's value.
 */

import type { ColumnType, SelectOption } from "../schema/types";

/**
 * The plain column types a Monday board can actually hold.
 *
 * This is NOT the Schema Designer's full COLUMN_TYPES list. That list is
 * target-agnostic on purpose — every export target maps FROM it — and four
 * of its entries have no Monday equivalent as a plain column:
 *
 *   - "relation" IS Monday's Connect Boards, modeled here as its own
 *     MondayColumnKind because it carries a target board id.
 *   - "rollup" and "lookup" are both Monday's Mirror, likewise its own kind
 *     (and Monday has no true rollup at all — see MIRROR_NOTE).
 *   - "rich_text" has no Monday column; long text is the closest thing, and
 *     it is plain text.
 *
 * Offering those four in a Monday column picker would let someone author a
 * board Monday cannot build — the exact failure this designer exists to
 * prevent. So the picker reads from this list, and Connect/Mirror are chosen
 * through the column-KIND picker instead, where they can collect the ids
 * they need.
 *
 * The values are canonical ColumnTypes so the two tools keep one vocabulary
 * (and one set of type colors); only the SELECTION and the LABELS are
 * Monday's. Labels are Monday's own words — a builder should read the name
 * they will click in the real product.
 */
export const MONDAY_COLUMN_TYPES: { type: ColumnType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Numbers" },
  { type: "select", label: "Status" },
  { type: "multi-select", label: "Dropdown" },
  { type: "person", label: "People" },
  { type: "date", label: "Date" },
  { type: "boolean", label: "Checkbox" },
  { type: "money", label: "Currency" },
  { type: "attachment", label: "Files" },
  { type: "formula", label: "Formula" },
];

const MONDAY_LABEL = new Map(MONDAY_COLUMN_TYPES.map((t) => [t.type, t.label] as const));

/** Monday's own name for a canonical type. Falls back to the type itself for
 *  anything not in the Monday list — which should not happen through the UI,
 *  but can in a hand-edited or imported doc. */
export function mondayTypeLabel(type: ColumnType): string {
  return MONDAY_LABEL.get(type) ?? type;
}

/**
 * What a Monday column actually is. Three kinds, because Monday's two
 * cross-board column types carry structure a plain `type` cannot express:
 * a Connect names the board it reaches, and a Mirror names both the Connect
 * it rides and the column it reads at the far end.
 */
export type MondayColumnKind =
  /** An ordinary column, typed from the canonical ColumnType vocabulary. */
  | { kind: "plain"; type: ColumnType }
  /** Connect Boards — the "road" between two boards. No cascade delete, no
   *  uniqueness, no referential integrity: it is a link, not a foreign key. */
  | { kind: "connect"; targetBoardId: string }
  /** Mirror — the cargo carried down a Connect. Reads one column from the
   *  board at the far end of a Connect column ON THIS BOARD. Both ids are
   *  required: a Mirror with no Connect beneath it cannot exist in Monday,
   *  so the editor enforces rather than warns (§4). */
  | { kind: "mirror"; viaConnectColumnId: string; sourceColumnId: string };

export interface MondayColumn {
  id: string;
  name: string;
  spec: MondayColumnKind;
  /** Only meaningful when spec.kind === "plain" and the type is
   *  "select" / "multi-select". */
  options?: SelectOption[];
  note?: string;
}

/**
 * A named section inside a board. Ordered, and carries a color the way a
 * real Monday group does. Holds no schema of its own — every item in every
 * group on a board shares the board's one item column set. Groups ARE
 * modeled (unlike items) because a group is structure the builder decides up
 * front; items are content filled in later.
 */
export interface MondayGroup {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  groups: MondayGroup[];
  /** The board's item column set. */
  columns: MondayColumn[];
  /** The board's subitem column set — a SEPARATE schema, shared by every
   *  subitem under every item on this board (Monday allows exactly one
   *  subitem column set per board, and nests exactly one level). Absent =
   *  this board has no subitems, which is the default: in Monday subitems
   *  only exist once the Subitems column is added. */
  subitemColumns?: MondayColumn[];
  /** Canvas position. Presentational only, never inferred — same rule as
   *  SchemaCardPosition and CardPosition elsewhere in the app. */
  position?: { x: number; y: number };
}

export interface MondayDoc {
  boards: MondayBoard[];
  /** The workspace name, when the user wants it recorded. Purely a label —
   *  workspaces are not modeled as containers. */
  workspaceName?: string;
}

export const emptyMondayDoc: MondayDoc = { boards: [] };

/**
 * There is deliberately no MondayItem or MondaySubitem record. This is a
 * SCHEMA designer, not a data entry tool — it models what an item's columns
 * ARE, not which items exist. Same stance the Schema Designer takes: it
 * holds SchemaColumn, never a row of data.
 *
 * Connect lines are likewise DERIVED, not stored. A Relationship[] array
 * would be a second source of truth alongside the `connect` columns that
 * already encode every link, so the canvas walks each board's columns for
 * kind: "connect" instead — a line can never disagree with the column that
 * makes it. (The Schema Designer stores `relationships` separately because a
 * SQL foreign key is genuinely its own object; a Monday Connect is just a
 * column.)
 */

/** Group colors, matching Monday's own muted palette rather than the app's
 *  table colors — a group chip should read as a Monday group. Assigned by
 *  order when a group is created, and editable after. */
export const MONDAY_GROUP_COLORS = [
  "#037f4c",
  "#579bfc",
  "#a25ddc",
  "#e2445c",
  "#fdab3d",
  "#0086c0",
  "#bb3354",
  "#784bd1",
] as const;

export function groupColor(index: number): string {
  return MONDAY_GROUP_COLORS[index % MONDAY_GROUP_COLORS.length];
}

/*
 * There is deliberately NO subitem note constant here.
 *
 * §5.5 of the plan specified a standing note warning that subitems "link and
 * report across boards poorly." It was built, then cut on 2026-09-26: asked
 * what "poorly" concretely means, the honest answer was that the claim comes
 * from prior research rather than hands-on testing, and §5.6 requires
 * verifying it before it reaches a client. Rewording around a gap like that
 * produces a warning nobody can act on, so the note is absent until there is
 * something specific to say.
 *
 * What IS solid, and already lives on MIRROR_NOTE below, is the no-rollup
 * limit: many rows pointing at one thing cannot be summarized into one
 * value, because Monday has no rollup. That is structural, not a judgment
 * about quality. If §5.6's verification lands, the subitem warning should be
 * written the same way — naming the mechanism, not grading it.
 *
 * ColumnBand still accepts a `note` prop, so restoring one is a one-line
 * change at the call site.
 */

/**
 * The capability note shown on every Mirror column. Same pattern
 * capabilityNote() established in the Schema Designer: state the known
 * platform limit, in one sentence, at the point of use — including the
 * "verify current behavior" hedge, because Monday moves this target.
 */
export const MIRROR_NOTE =
  "Read-only, and may not be groupable, filterable or sortable the way a native column is (verify current behavior). Monday has no true rollup — summarizing across boards needs an automation you build.";

/** True when this column is a Connect. Narrowing helper so call sites read
 *  as intent rather than as a discriminant check. */
export function isConnect(
  column: MondayColumn,
): column is MondayColumn & { spec: { kind: "connect"; targetBoardId: string } } {
  return column.spec.kind === "connect";
}

/** True when this column is a Mirror. */
export function isMirror(
  column: MondayColumn,
): column is MondayColumn & {
  spec: { kind: "mirror"; viaConnectColumnId: string; sourceColumnId: string };
} {
  return column.spec.kind === "mirror";
}

/** The canonical ColumnType a column renders as, or undefined for the two
 *  Monday-only kinds — used wherever a type label or type color is wanted. */
export function plainType(column: MondayColumn): ColumnType | undefined {
  return column.spec.kind === "plain" ? column.spec.type : undefined;
}
