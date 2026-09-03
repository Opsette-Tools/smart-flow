/**
 * Schema designer store — the single source of truth for SchemaDoc.
 *
 * Mirrors ../store.ts's shape deliberately: one reducer, one Action union,
 * every mutation funnels through here so components stay thin. Kept as its
 * own file/reducer rather than merged into the SmartFlowDoc reducer — the
 * two docs share no fields and no mutation rules, so one switch statement
 * covering both would just be two unrelated reducers glued together.
 */

import { uuid } from "@/lib/uuid";
import type {
  BuildTarget,
  ColumnType,
  Relationship,
  RelationshipKind,
  RollupSource,
  SchemaColumn,
  SchemaDoc,
  SchemaTable,
  SelectOption,
} from "./types";
import { emptySchemaDoc } from "./types";

export { emptySchemaDoc };

function newColumn(name: string, type: ColumnType = "text"): SchemaColumn {
  return { id: uuid(), name, type };
}

/** Strip a table out of every relationship that touches it, so no
 *  relationship can point at a table that no longer exists. */
function pruneRelationshipsForTable(relationships: Relationship[], tableId: string): Relationship[] {
  return relationships.filter((r) => r.fromTableId !== tableId && r.toTableId !== tableId);
}

/** Strip a column out of every relationship that references it — deleting a
 *  column deletes the relationships anchored to it, the same way deleting a
 *  step prunes its connections in ../store.ts. */
function pruneRelationshipsForColumn(relationships: Relationship[], columnId: string): Relationship[] {
  return relationships.filter((r) => r.fromColumnId !== columnId && r.toColumnId !== columnId);
}

export type Action =
  | { type: "SET_BUILDING_FOR"; target: BuildTarget | undefined }
  | { type: "ADD_TABLE"; name: string }
  | { type: "RENAME_TABLE"; id: string; name: string }
  | { type: "DELETE_TABLE"; id: string }
  | { type: "SET_TABLE_POSITION"; id: string; x: number; y: number }
  | { type: "ADD_COLUMN"; tableId: string; name: string; columnType?: ColumnType }
  | { type: "RENAME_COLUMN"; tableId: string; columnId: string; name: string }
  | { type: "SET_COLUMN_TYPE"; tableId: string; columnId: string; columnType: ColumnType }
  | { type: "SET_COLUMN_OPTIONS"; tableId: string; columnId: string; options: SelectOption[] }
  | { type: "SET_COLUMN_ROLLUP_SOURCE"; tableId: string; columnId: string; rollupSource: RollupSource }
  | { type: "SET_COLUMN_FLAGS"; tableId: string; columnId: string; primaryKey?: boolean; required?: boolean; unique?: boolean }
  | { type: "SET_COLUMN_DEFAULT"; tableId: string; columnId: string; defaultValue: string }
  | { type: "SET_COLUMN_NOTE"; tableId: string; columnId: string; note: string }
  | { type: "DELETE_COLUMN"; tableId: string; columnId: string }
  | { type: "REORDER_COLUMNS"; tableId: string; orderedIds: string[] }
  | {
      type: "ADD_RELATIONSHIP";
      fromTableId: string;
      fromColumnId: string;
      toTableId: string;
      toColumnId: string;
      kind: RelationshipKind;
    }
  | { type: "SET_RELATIONSHIP_KIND"; id: string; kind: RelationshipKind }
  | { type: "SET_RELATIONSHIP_LABEL"; id: string; label: string }
  | { type: "DELETE_RELATIONSHIP"; id: string }
  | { type: "REPLACE_SCHEMA_DOC"; doc: SchemaDoc };

export function schemaReducer(doc: SchemaDoc, action: Action): SchemaDoc {
  switch (action.type) {
    case "SET_BUILDING_FOR": {
      return { ...doc, buildingFor: action.target };
    }

    case "ADD_TABLE": {
      const name = action.name.trim();
      if (!name) return doc;
      const table: SchemaTable = { id: uuid(), name, columns: [] };
      return { ...doc, tables: [...doc.tables, table] };
    }

    case "RENAME_TABLE": {
      const name = action.name.trim();
      if (!name) return doc;
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, name } : t)),
      };
    }

    case "DELETE_TABLE": {
      const tables = doc.tables.filter((t) => t.id !== action.id);
      const relationships = pruneRelationshipsForTable(doc.relationships, action.id);
      return { ...doc, tables, relationships };
    }

    case "SET_TABLE_POSITION": {
      // Pixels only — the canvas is a view of the schema, never an editor of
      // which columns/relationships exist. Same rule as SET_LANE_POSITION.
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.id ? { ...t, position: { x: action.x, y: action.y } } : t,
        ),
      };
    }

    case "ADD_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      const column = newColumn(name, action.columnType);
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId ? { ...t, columns: [...t.columns, column] } : t,
        ),
      };
    }

    case "RENAME_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? { ...t, columns: t.columns.map((c) => (c.id === action.columnId ? { ...c, name } : c)) }
            : t,
        ),
      };
    }

    case "SET_COLUMN_TYPE": {
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId
                    ? {
                        ...c,
                        type: action.columnType,
                        // Options only mean something for select/multi-select —
                        // changing away from either drops stale options rather
                        // than leaving them invisibly attached to the column.
                        options:
                          action.columnType === "select" || action.columnType === "multi-select"
                            ? c.options
                            : undefined,
                        // Same rule for rollupSource: only rollup/lookup use it.
                        rollupSource:
                          action.columnType === "rollup" || action.columnType === "lookup"
                            ? c.rollupSource
                            : undefined,
                      }
                    : c,
                ),
              }
            : t,
        ),
      };
    }

    case "SET_COLUMN_OPTIONS": {
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId
                    ? { ...c, options: action.options.length > 0 ? action.options : undefined }
                    : c,
                ),
              }
            : t,
        ),
      };
    }

    case "SET_COLUMN_ROLLUP_SOURCE": {
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId ? { ...c, rollupSource: action.rollupSource } : c,
                ),
              }
            : t,
        ),
      };
    }

    case "SET_COLUMN_FLAGS": {
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId
                    ? {
                        ...c,
                        primaryKey: action.primaryKey ?? c.primaryKey,
                        required: action.required ?? c.required,
                        unique: action.unique ?? c.unique,
                      }
                    : c,
                ),
              }
            : t,
        ),
      };
    }

    case "SET_COLUMN_DEFAULT": {
      const value = action.defaultValue.trim();
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId ? { ...c, defaultValue: value || undefined } : c,
                ),
              }
            : t,
        ),
      };
    }

    case "SET_COLUMN_NOTE": {
      const value = action.note.trim();
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === action.columnId ? { ...c, note: value || undefined } : c,
                ),
              }
            : t,
        ),
      };
    }

    case "DELETE_COLUMN": {
      const relationships = pruneRelationshipsForColumn(doc.relationships, action.columnId);
      return {
        ...doc,
        tables: doc.tables.map((t) =>
          t.id === action.tableId
            ? { ...t, columns: t.columns.filter((c) => c.id !== action.columnId) }
            : t,
        ),
        relationships,
      };
    }

    case "REORDER_COLUMNS": {
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (t.id !== action.tableId) return t;
          const byId = new Map(t.columns.map((c) => [c.id, c] as const));
          const reordered = action.orderedIds.map((id) => byId.get(id)).filter((c): c is SchemaColumn => !!c);
          // Any column not named in orderedIds (shouldn't happen, but keeps
          // this total rather than silently dropping data) stays appended.
          const named = new Set(action.orderedIds);
          const leftover = t.columns.filter((c) => !named.has(c.id));
          return { ...t, columns: [...reordered, ...leftover] };
        }),
      };
    }

    case "ADD_RELATIONSHIP": {
      // A relationship needs both ends to exist and be different columns —
      // a column can't relate to itself.
      if (action.fromColumnId === action.toColumnId && action.fromTableId === action.toTableId) return doc;
      const relationship: Relationship = {
        id: uuid(),
        fromTableId: action.fromTableId,
        fromColumnId: action.fromColumnId,
        toTableId: action.toTableId,
        toColumnId: action.toColumnId,
        kind: action.kind,
      };
      return { ...doc, relationships: [...doc.relationships, relationship] };
    }

    case "SET_RELATIONSHIP_KIND": {
      return {
        ...doc,
        relationships: doc.relationships.map((r) => (r.id === action.id ? { ...r, kind: action.kind } : r)),
      };
    }

    case "SET_RELATIONSHIP_LABEL": {
      const label = action.label.trim();
      return {
        ...doc,
        relationships: doc.relationships.map((r) =>
          r.id === action.id ? { ...r, label: label || undefined } : r,
        ),
      };
    }

    case "DELETE_RELATIONSHIP": {
      return { ...doc, relationships: doc.relationships.filter((r) => r.id !== action.id) };
    }

    case "REPLACE_SCHEMA_DOC":
      return action.doc;

    default:
      return doc;
  }
}
