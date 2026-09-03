/**
 * Schema designer data model.
 *
 * Kept in its own file rather than folded into ../types.ts: a SchemaColumn
 * has nothing in common with an Item (see docs/SCHEMA-DESIGNER-PLAN.md §2 for
 * the full reasoning) — cramming both into one file would make neither easier
 * to read.
 *
 * Same "nothing is ever inferred" rule as the rest of the app: position is
 * presentational only, and no field guesses another field's value.
 */

/**
 * Canonical field types — human-readable, target-agnostic. Every export
 * target (SQL, Airtable, Monday) maps FROM this list; the list itself never
 * speaks any one target's vocabulary. See docs/SCHEMA-DESIGNER-PLAN.md §4 for
 * the full per-target mapping table and §4.0 for how `buildingFor` (on
 * SchemaDoc, below) drives the capability notes attached to some of these.
 */
export type ColumnType =
  | "text"
  | "rich_text"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "multi-select"
  | "money"
  | "person"
  | "attachment"
  | "relation"
  | "formula"
  | "rollup"
  | "lookup";

/** Which platform this schema is being designed for. Absent/"undecided" is
 *  the only state where the canvas stays purely canonical with no
 *  target-specific capability notes — see docs/SCHEMA-DESIGNER-PLAN.md §4.0
 *  for why this is set upfront rather than inferred or backloaded to export
 *  time. Set on SchemaDoc, not per-column: the target describes the whole
 *  schema's destination, not one field's. */
export type BuildTarget = "sql" | "airtable" | "monday";

export interface ColumnTypeInfo {
  type: ColumnType;
  /** The neutral, canonical label — shown when buildingFor is undecided,
   *  and always used as the underlying concept name regardless of target.
   *  "Relation" rather than any one target's word for it (Monday's "Connect
   *  boards", Airtable's "Linked record") — renamed 2026-09-03 at Ruthnie's
   *  request after the tool briefly defaulted to Monday's vocabulary; see
   *  docs/SCHEMA-DESIGNER-PLAN.md §4.0. */
  label: string;
}

export const COLUMN_TYPES: ColumnTypeInfo[] = [
  { type: "text", label: "Text" },
  { type: "rich_text", label: "Rich text" },
  { type: "number", label: "Number" },
  { type: "boolean", label: "Checkbox" },
  { type: "date", label: "Date" },
  { type: "select", label: "Status" },
  { type: "multi-select", label: "Dropdown" },
  { type: "money", label: "Currency" },
  { type: "person", label: "Person" },
  { type: "attachment", label: "Files" },
  { type: "relation", label: "Relation" },
  { type: "formula", label: "Formula" },
  { type: "rollup", label: "Rollup" },
  { type: "lookup", label: "Lookup" },
];

const COLUMN_TYPE_LABEL = new Map(COLUMN_TYPES.map((t) => [t.type, t.label] as const));

export function columnTypeLabel(type: ColumnType): string {
  return COLUMN_TYPE_LABEL.get(type) ?? type;
}

/** How a target actually renders a canonical type, when that differs from
 *  the neutral label. Shown alongside the neutral label once `buildingFor`
 *  is set — never replaces it, so the underlying concept stays visible. */
const TARGET_LABEL: Partial<Record<ColumnType, Partial<Record<BuildTarget, string>>>> = {
  // Only entries where the target's name is a genuinely different WORD are
  // listed — a plural/singular or capitalization difference (Monday's
  // "Numbers" for Number, "Checkbox" for Checkbox) isn't information a
  // builder needs called out on every row. Trimmed 2026-09-03 after Ruthnie
  // flagged "Number → Numbers" as noise, not a real distinction.
  text: { airtable: "Single line text", sql: "text" },
  rich_text: { airtable: "Long text", sql: "text (or jsonb for structured rich content)" },
  select: { monday: "Status", airtable: "Single select", sql: "ENUM" },
  "multi-select": { monday: "Dropdown", airtable: "Multiple select", sql: "text[]" },
  person: { monday: "People", airtable: "Collaborator", sql: "text / FK to users" },
  attachment: { airtable: "Attachment", sql: "text (URL/path)" },
  relation: { monday: "Connect boards", airtable: "Linked record", sql: "foreign key" },
  rollup: { monday: "Mirror" },
  lookup: { monday: "Mirror" },
};

export function targetLabel(type: ColumnType, target: BuildTarget): string | undefined {
  return TARGET_LABEL[type]?.[target];
}

/**
 * Capability notes: where a target's real rendering of a canonical type is
 * not just a different name but a different (usually lesser) set of
 * capabilities. Absent = no known gap for that pairing — most pairings have
 * none. These are sourced, not guessed: Monday's Mirror limitations (no
 * grouping, limited filter/sort, historically unreliable in formulas) come
 * from Ruthnie's own research, 2026-09-03 — see
 * docs/SCHEMA-DESIGNER-PLAN.md §4.0. Surfaced live on the canvas the moment
 * a type is picked, never backloaded to an export-time report.
 */
const CAPABILITY_NOTE: Partial<Record<ColumnType, Partial<Record<BuildTarget, string>>>> = {
  lookup: {
    monday:
      "Renders as a Mirror column: read-only, can't be grouped by, limited filter/sort, and formulas have historically been unable to reference it (verify current behavior before relying on it).",
  },
  rollup: {
    monday:
      "Renders as a Mirror column: read-only, can't be grouped by, limited filter/sort, and formulas have historically been unable to reference it (verify current behavior before relying on it).",
  },
  relation: {
    monday: "Connect Boards links items across boards — no cascade delete, no uniqueness enforcement.",
    airtable: "A genuine bidirectional link, but Airtable enforces no referential integrity either — nothing stops a duplicate on the other side.",
  },
  select: {
    sql: "Native ENUM on Postgres/MySQL. Some engines (older MySQL, portability-sensitive projects) prefer text + CHECK instead — a smaller, more portable constraint at the cost of being less self-documenting.",
  },
  rich_text: {
    sql: "No native rich-text type. Plain text (formatting as embedded markup, e.g. HTML/Markdown) is the simplest honest mapping; jsonb is the better fit only if the content is genuinely structured (e.g. a Slate/ProseMirror document tree), not just formatted prose.",
  },
  formula: {
    sql: "No native equivalent. A computed/generated column is the closest SQL mechanism, but it's a different feature — the SQL export will need a real decision per formula, not an automatic conversion.",
  },
  "multi-select": {
    // Corrected 2026-09-03 — see docs/SCHEMA-DESIGNER-PLAN.md §4.0: a join
    // table is what a many-to-many RELATIONSHIP needs (already modeled via
    // Relationship.kind), not what a multi-value COLUMN needs. Conflating
    // the two was a real modeling error, caught by Ruthnie building a real
    // table. If the real intent is "this links to many rows of another
    // entity," that's a Relation column with a many-to-many kind, not this.
    sql: "text[] (or ENUM[] if the values are a fixed set) — no separate table implied. If this should really link to rows of another table, use a Relation column instead.",
  },
  attachment: {
    sql: "No native file type. The SQL export falls back to a text column holding a URL or path.",
  },
  person: {
    sql: "No native equivalent. Falls back to a plain text column, or a foreign key to a users table if one exists.",
  },
};

export function capabilityNote(type: ColumnType, target: BuildTarget): string | undefined {
  return CAPABILITY_NOTE[type]?.[target];
}

/** One fixed color per column type, reused on the canvas card, the alignment
 *  grid, and any future export preview — one decision, not three ad hoc
 *  ones. Muted, matching the app's existing accent-not-saturated palette. */
const COLUMN_TYPE_COLORS: Record<ColumnType, string> = {
  text: "#5c8374",
  rich_text: "#4a8f7a",
  number: "#3b6ea5",
  boolean: "#8b6bab",
  date: "#a5843b",
  select: "#437f8c",
  "multi-select": "#a3556f",
  money: "#6b7f3b",
  person: "#b4653a",
  attachment: "#7a7a7a",
  relation: "#c0392b",
  formula: "#8a6d3b",
  rollup: "#5a7a9e",
  lookup: "#6b8e7a",
};

export function columnTypeColor(type: ColumnType): string {
  return COLUMN_TYPE_COLORS[type];
}

export interface SelectOption {
  id: string;
  label: string;
}

/** What a "rollup" or "lookup" column pulls from — a relationship plus
 *  which column on the far side. Absent on any column that isn't one of
 *  those two types. `aggregate` is only meaningful for "rollup" (a "lookup"
 *  just reads the value with no aggregation). */
export interface RollupSource {
  relationshipId: string;
  sourceColumnId: string;
  aggregate?: "sum" | "count" | "avg" | "min" | "max";
}

export interface SchemaColumn {
  id: string;
  name: string;
  type: ColumnType;
  /** Only meaningful when type is "select" or "multi-select". */
  options?: SelectOption[];
  /** Only meaningful when type is "rollup" or "lookup". */
  rollupSource?: RollupSource;
  primaryKey?: boolean;
  required?: boolean;
  unique?: boolean;
  /** Free text, e.g. "today", "0", "Pending" — stored verbatim, never parsed
   *  or validated against `type`, matching the app's existing stance on
   *  free-text discovery fields (see HandoffMechanism in ../types.ts). */
  defaultValue?: string;
  /** Which source field(s) this column was reconciled from, in field-
   *  alignment mode. Absent on a column authored directly on the canvas. */
  sourceRefs?: SourceFieldRef[];
  note?: string;
}

/** Where a table card sits on the canvas. Same shape and same
 *  "presentational only, never inferred" rule as CardPosition in ../types.ts —
 *  moving a card never changes anything about the table itself. */
export interface SchemaCardPosition {
  x: number;
  y: number;
}

export interface SchemaTable {
  id: string;
  name: string;
  columns: SchemaColumn[];
  position?: SchemaCardPosition;
}

export type RelationshipKind = "one-to-one" | "one-to-many" | "many-to-many";

export interface Relationship {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  kind: RelationshipKind;
  /** Optional label on the connector line, e.g. "assigned to". */
  label?: string;
}

/** One brief/source document, imported or pasted, in field-alignment mode
 *  (Phase 3 — not built yet, modeled now so Phase 1's shape doesn't need a
 *  breaking change later). */
export interface SchemaSource {
  id: string;
  name: string;
  /** Raw pasted text, kept verbatim so re-reading the original wording is
   *  always possible — the parsed fields below are a derived view, not a
   *  replacement for the source. */
  rawText: string;
  fields: SourceField[];
}

export interface SourceField {
  id: string;
  /** The field name exactly as it appeared in that brief. */
  label: string;
  /** Free-text notes carried alongside the field in the brief, if any. */
  note?: string;
}

/** Points a schema column back at the source field(s) it was reconciled
 *  from. A column can point at more than one source field when two briefs
 *  named the same concept differently and were merged into one column. */
export interface SourceFieldRef {
  sourceId: string;
  fieldId: string;
}

export interface SchemaDoc {
  tables: SchemaTable[];
  relationships: Relationship[];
  /** Which platform this schema targets — see BuildTarget above and
   *  docs/SCHEMA-DESIGNER-PLAN.md §4.0. Absent = undecided, the only state
   *  with no target-specific capability notes shown. */
  buildingFor?: BuildTarget;
  /** Field-alignment mode's own data — absent doc-wide until the first brief
   *  is imported (Phase 3). */
  sources?: SchemaSource[];
}

export const emptySchemaDoc: SchemaDoc = { tables: [], relationships: [] };
