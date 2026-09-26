/**
 * Monday board designer store — the single source of truth for MondayDoc.
 *
 * Mirrors ../schema/store.ts's shape deliberately: one reducer, one Action
 * union, every mutation funnels through here so components stay thin. Kept
 * as its own file/reducer rather than merged into the schema reducer — the
 * two docs share no fields and no mutation rules (see
 * docs/MONDAY-BOARD-DESIGNER-PLAN.md §1), so one switch covering both would
 * be two unrelated reducers glued together.
 *
 * Two rules live here rather than in the UI, because a component can forget
 * them and a reducer cannot:
 *   1. Deleting a Connect column deletes every Mirror riding it (§4) — the
 *      same cascade rule as pruneRelationshipsForColumn in schema/store.ts.
 *   2. Deleting a board deletes every Connect pointing at it, and therefore
 *      every Mirror riding those Connects.
 */

import { uuid } from "@/lib/uuid";
import type { ColumnType, SelectOption } from "../schema/types";
import type {
  MondayBoard,
  MondayColumn,
  MondayColumnKind,
  MondayDoc,
  MondayGroup,
} from "./types";
import { emptyMondayDoc, groupColor } from "./types";

export { emptyMondayDoc };

/** Which column set an action targets. Every column mutation names one:
 *  a board's item columns and its subitem columns are two separate schemas
 *  (§3), so "which set" is never inferable from the column id alone. */
export type ColumnSet = "item" | "subitem";

function newColumn(name: string, spec: MondayColumnKind): MondayColumn {
  return { id: uuid(), name, spec };
}

/** Read the named column set off a board. `subitemColumns` absent means the
 *  board has no subitems at all, which reads as an empty set. */
function readSet(board: MondayBoard, set: ColumnSet): MondayColumn[] {
  return set === "item" ? board.columns : (board.subitemColumns ?? []);
}

/**
 * Write the named column set back onto a board.
 *
 * Note the asymmetry on `subitem`: an EMPTY subitem set is still meaningful
 * (the board has subitems, they just have no columns yet), so it is stored
 * as `[]` rather than collapsing to undefined. Only REMOVE_SUBITEMS clears
 * the field, because "this board has no subitems" is a deliberate structural
 * statement, not a side effect of deleting the last column.
 */
function writeSet(board: MondayBoard, set: ColumnSet, columns: MondayColumn[]): MondayBoard {
  return set === "item" ? { ...board, columns } : { ...board, subitemColumns: columns };
}

/** Map over one board, leaving the rest untouched. */
function mapBoard(doc: MondayDoc, boardId: string, fn: (b: MondayBoard) => MondayBoard): MondayDoc {
  return { ...doc, boards: doc.boards.map((b) => (b.id === boardId ? fn(b) : b)) };
}

/** Map over one column set on one board. */
function mapColumns(
  doc: MondayDoc,
  boardId: string,
  set: ColumnSet,
  fn: (columns: MondayColumn[]) => MondayColumn[],
): MondayDoc {
  return mapBoard(doc, boardId, (b) => writeSet(b, set, fn(readSet(b, set))));
}

/**
 * Drop the named columns from a set, plus every Mirror left riding a Connect
 * that is no longer there. A Mirror with no Connect beneath it cannot exist
 * in Monday, so leaving one behind would put the doc in a state the real
 * platform has no way to represent. Looped until nothing more falls out, so
 * the rule stays correct if removal ever cascades further than one step.
 */
function pruneColumns(columns: MondayColumn[], removedIds: Set<string>): MondayColumn[] {
  let kept = columns.filter((c) => !removedIds.has(c.id));
  for (;;) {
    const present = new Set(kept.map((c) => c.id));
    const orphanIds = new Set(
      kept
        .filter((c) => c.spec.kind === "mirror" && !present.has(c.spec.viaConnectColumnId))
        .map((c) => c.id),
    );
    if (orphanIds.size === 0) return kept;
    kept = kept.filter((c) => !orphanIds.has(c.id));
  }
}

/** Every column in a set that points at `boardId` via a Connect. Used when a
 *  board is deleted: its inbound Connects go with it. */
function connectIdsTargeting(columns: MondayColumn[], boardId: string): Set<string> {
  return new Set(
    columns
      .filter((c) => c.spec.kind === "connect" && c.spec.targetBoardId === boardId)
      .map((c) => c.id),
  );
}

function findBoard(doc: MondayDoc, id: string): MondayBoard | undefined {
  return doc.boards.find((b) => b.id === id);
}

export type Action =
  | { type: "SET_WORKSPACE_NAME"; name: string }
  | { type: "ADD_BOARD"; name: string }
  | { type: "RENAME_BOARD"; id: string; name: string }
  | { type: "DELETE_BOARD"; id: string }
  | { type: "SET_BOARD_POSITION"; id: string; x: number; y: number }
  | { type: "ADD_GROUP"; boardId: string; name: string }
  | { type: "RENAME_GROUP"; boardId: string; groupId: string; name: string }
  | { type: "SET_GROUP_COLOR"; boardId: string; groupId: string; color: string }
  | { type: "DELETE_GROUP"; boardId: string; groupId: string }
  | { type: "REORDER_GROUPS"; boardId: string; orderedIds: string[] }
  /** Give a board a subitem column set, or take it away. Separate from the
   *  column actions because it is a structural statement about the board,
   *  not an edit to a set that already exists. */
  | { type: "ADD_SUBITEMS"; boardId: string }
  | { type: "REMOVE_SUBITEMS"; boardId: string }
  | { type: "ADD_COLUMN"; boardId: string; set: ColumnSet; name: string; columnType?: ColumnType }
  | { type: "ADD_CONNECT_COLUMN"; boardId: string; set: ColumnSet; name: string; targetBoardId: string }
  | {
      type: "ADD_MIRROR_COLUMN";
      boardId: string;
      set: ColumnSet;
      name: string;
      viaConnectColumnId: string;
      sourceColumnId: string;
    }
  | { type: "RENAME_COLUMN"; boardId: string; set: ColumnSet; columnId: string; name: string }
  | { type: "SET_COLUMN_TYPE"; boardId: string; set: ColumnSet; columnId: string; columnType: ColumnType }
  | { type: "SET_CONNECT_TARGET"; boardId: string; set: ColumnSet; columnId: string; targetBoardId: string }
  | {
      type: "SET_MIRROR_SOURCE";
      boardId: string;
      set: ColumnSet;
      columnId: string;
      viaConnectColumnId: string;
      sourceColumnId: string;
    }
  | { type: "SET_COLUMN_OPTIONS"; boardId: string; set: ColumnSet; columnId: string; options: SelectOption[] }
  | { type: "SET_COLUMN_NOTE"; boardId: string; set: ColumnSet; columnId: string; note: string }
  | { type: "DELETE_COLUMN"; boardId: string; set: ColumnSet; columnId: string }
  | { type: "REORDER_COLUMNS"; boardId: string; set: ColumnSet; orderedIds: string[] }
  | { type: "REPLACE_MONDAY_DOC"; doc: MondayDoc };

export function mondayReducer(doc: MondayDoc, action: Action): MondayDoc {
  switch (action.type) {
    case "SET_WORKSPACE_NAME": {
      const name = action.name.trim();
      return { ...doc, workspaceName: name || undefined };
    }

    case "ADD_BOARD": {
      const name = action.name.trim();
      if (!name) return doc;
      const board: MondayBoard = { id: uuid(), name, groups: [], columns: [] };
      return { ...doc, boards: [...doc.boards, board] };
    }

    case "RENAME_BOARD": {
      const name = action.name.trim();
      if (!name) return doc;
      return mapBoard(doc, action.id, (b) => ({ ...b, name }));
    }

    case "DELETE_BOARD": {
      // Every Connect pointing AT this board goes with it, and pruneColumns
      // then takes the Mirrors riding those Connects. Without this, a
      // surviving board would hold a Connect to a board that no longer
      // exists — the Monday equivalent of the dangling relationship
      // pruneRelationshipsForTable prevents on the schema side.
      const boards = doc.boards
        .filter((b) => b.id !== action.id)
        .map((b) => {
          const inbound = connectIdsTargeting(b.columns, action.id);
          const inboundSub = connectIdsTargeting(b.subitemColumns ?? [], action.id);
          if (inbound.size === 0 && inboundSub.size === 0) return b;
          const next: MondayBoard = { ...b, columns: pruneColumns(b.columns, inbound) };
          return b.subitemColumns
            ? { ...next, subitemColumns: pruneColumns(b.subitemColumns, inboundSub) }
            : next;
        });
      return { ...doc, boards };
    }

    case "SET_BOARD_POSITION": {
      // Pixels only — the canvas is a view of the doc, never an editor of
      // which boards or columns exist. Same rule as SET_TABLE_POSITION.
      return mapBoard(doc, action.id, (b) => ({ ...b, position: { x: action.x, y: action.y } }));
    }

    case "ADD_GROUP": {
      const name = action.name.trim();
      if (!name) return doc;
      return mapBoard(doc, action.boardId, (b) => {
        const group: MondayGroup = {
          id: uuid(),
          name,
          order: b.groups.length,
          color: groupColor(b.groups.length),
        };
        return { ...b, groups: [...b.groups, group] };
      });
    }

    case "RENAME_GROUP": {
      const name = action.name.trim();
      if (!name) return doc;
      return mapBoard(doc, action.boardId, (b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === action.groupId ? { ...g, name } : g)),
      }));
    }

    case "SET_GROUP_COLOR": {
      return mapBoard(doc, action.boardId, (b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === action.groupId ? { ...g, color: action.color } : g)),
      }));
    }

    case "DELETE_GROUP": {
      // Groups hold no schema, so deleting one cascades nowhere — but the
      // survivors are renumbered so `order` stays a dense 0..n-1 sequence
      // rather than developing gaps.
      return mapBoard(doc, action.boardId, (b) => ({
        ...b,
        groups: b.groups.filter((g) => g.id !== action.groupId).map((g, i) => ({ ...g, order: i })),
      }));
    }

    case "REORDER_GROUPS": {
      return mapBoard(doc, action.boardId, (b) => {
        const byId = new Map(b.groups.map((g) => [g.id, g] as const));
        const reordered = action.orderedIds
          .map((id) => byId.get(id))
          .filter((g): g is MondayGroup => !!g);
        // Anything not named stays appended rather than being silently
        // dropped — same totality rule as REORDER_COLUMNS in schema/store.
        const named = new Set(action.orderedIds);
        const leftover = b.groups.filter((g) => !named.has(g.id));
        return { ...b, groups: [...reordered, ...leftover].map((g, i) => ({ ...g, order: i })) };
      });
    }

    case "ADD_SUBITEMS": {
      return mapBoard(doc, action.boardId, (b) => (b.subitemColumns ? b : { ...b, subitemColumns: [] }));
    }

    case "REMOVE_SUBITEMS": {
      return mapBoard(doc, action.boardId, (b) => {
        if (!b.subitemColumns) return b;
        const { subitemColumns: _dropped, ...rest } = b;
        return rest;
      });
    }

    case "ADD_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      const column = newColumn(name, { kind: "plain", type: action.columnType ?? "text" });
      return mapColumns(doc, action.boardId, action.set, (cols) => [...cols, column]);
    }

    case "ADD_CONNECT_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      // The target must be a board that actually exists. A Connect to
      // nothing has no meaning in Monday and would draw an edge to nowhere.
      if (!findBoard(doc, action.targetBoardId)) return doc;
      const column = newColumn(name, { kind: "connect", targetBoardId: action.targetBoardId });
      return mapColumns(doc, action.boardId, action.set, (cols) => [...cols, column]);
    }

    case "ADD_MIRROR_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      // A Mirror rides a Connect ON THIS BOARD, in the SAME column set, and
      // reads a column from the board that Connect reaches. The editor
      // enforces this by construction (§4); this check is the backstop, so
      // no code path can author a Mirror Monday could not hold.
      if (!isValidMirror(doc, action.boardId, action.set, action.viaConnectColumnId, action.sourceColumnId)) {
        return doc;
      }
      const column = newColumn(name, {
        kind: "mirror",
        viaConnectColumnId: action.viaConnectColumnId,
        sourceColumnId: action.sourceColumnId,
      });
      return mapColumns(doc, action.boardId, action.set, (cols) => [...cols, column]);
    }

    case "RENAME_COLUMN": {
      const name = action.name.trim();
      if (!name) return doc;
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        cols.map((c) => (c.id === action.columnId ? { ...c, name } : c)),
      );
    }

    case "SET_COLUMN_TYPE": {
      // Only meaningful for a plain column. Retyping a Connect or a Mirror
      // is not a type change — it would drop the ids that make the column
      // what it is, so that goes through delete-and-re-add instead.
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        cols.map((c) => {
          if (c.id !== action.columnId || c.spec.kind !== "plain") return c;
          return {
            ...c,
            spec: { kind: "plain", type: action.columnType },
            // Options only mean something for select/multi-select — changing
            // away from either drops stale options rather than leaving them
            // invisibly attached. Same rule as schema/store's SET_COLUMN_TYPE.
            options:
              action.columnType === "select" || action.columnType === "multi-select"
                ? c.options
                : undefined,
          };
        }),
      );
    }

    case "SET_CONNECT_TARGET": {
      if (!findBoard(doc, action.targetBoardId)) return doc;
      return mapBoard(doc, action.boardId, (b) => {
        const retargeted = readSet(b, action.set).map((c) =>
          c.id === action.columnId && c.spec.kind === "connect"
            ? { ...c, spec: { kind: "connect" as const, targetBoardId: action.targetBoardId } }
            : c,
        );
        // Repointing a Connect invalidates every Mirror riding it: those
        // Mirrors name a source column on the OLD target board, which the
        // new one knows nothing about. Dropping them is the honest move —
        // keeping a Mirror whose source no longer exists is exactly the
        // "looks fine, isn't" failure this designer exists to prevent.
        const ridingIds = new Set(
          retargeted
            .filter((c) => c.spec.kind === "mirror" && c.spec.viaConnectColumnId === action.columnId)
            .map((c) => c.id),
        );
        return writeSet(b, action.set, pruneColumns(retargeted, ridingIds));
      });
    }

    case "SET_MIRROR_SOURCE": {
      if (!isValidMirror(doc, action.boardId, action.set, action.viaConnectColumnId, action.sourceColumnId)) {
        return doc;
      }
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        cols.map((c) =>
          c.id === action.columnId && c.spec.kind === "mirror"
            ? {
                ...c,
                spec: {
                  kind: "mirror" as const,
                  viaConnectColumnId: action.viaConnectColumnId,
                  sourceColumnId: action.sourceColumnId,
                },
              }
            : c,
        ),
      );
    }

    case "SET_COLUMN_OPTIONS": {
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        cols.map((c) =>
          c.id === action.columnId
            ? { ...c, options: action.options.length > 0 ? action.options : undefined }
            : c,
        ),
      );
    }

    case "SET_COLUMN_NOTE": {
      const value = action.note.trim();
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        cols.map((c) => (c.id === action.columnId ? { ...c, note: value || undefined } : c)),
      );
    }

    case "DELETE_COLUMN": {
      // Deleting a Connect takes every Mirror riding it — the cascade in §4.
      return mapColumns(doc, action.boardId, action.set, (cols) =>
        pruneColumns(cols, new Set([action.columnId])),
      );
    }

    case "REORDER_COLUMNS": {
      return mapColumns(doc, action.boardId, action.set, (cols) => {
        const byId = new Map(cols.map((c) => [c.id, c] as const));
        const reordered = action.orderedIds
          .map((id) => byId.get(id))
          .filter((c): c is MondayColumn => !!c);
        const named = new Set(action.orderedIds);
        const leftover = cols.filter((c) => !named.has(c.id));
        return [...reordered, ...leftover];
      });
    }

    case "REPLACE_MONDAY_DOC":
      return action.doc;

    default:
      return doc;
  }
}

/**
 * The board at the far end of a Connect column, or undefined if that column
 * is missing or is not a Connect. This is the one hop a Mirror may travel:
 * it reaches ONLY this board, never one further along (§4).
 */
export function mirrorTargetBoard(
  doc: MondayDoc,
  boardId: string,
  set: ColumnSet,
  viaConnectColumnId: string,
): MondayBoard | undefined {
  const board = findBoard(doc, boardId);
  if (!board) return undefined;
  const via = readSet(board, set).find((c) => c.id === viaConnectColumnId);
  if (!via || via.spec.kind !== "connect") return undefined;
  return findBoard(doc, via.spec.targetBoardId);
}

/**
 * Can this Mirror exist in Monday? Three conditions, all structural:
 *   1. The named Connect column exists on this board, in this column set.
 *   2. It really is a Connect.
 *   3. The named source column exists on the board that Connect reaches.
 *
 * Exported because the Mirror editor uses the same rule to decide what to
 * OFFER — one definition of "valid", read both by the UI that prevents the
 * mistake and by the reducer that refuses it (§4).
 */
export function isValidMirror(
  doc: MondayDoc,
  boardId: string,
  set: ColumnSet,
  viaConnectColumnId: string,
  sourceColumnId: string,
): boolean {
  const target = mirrorTargetBoard(doc, boardId, set, viaConnectColumnId);
  if (!target) return false;
  // A Mirror reads an ITEM column on the far board. Subitem columns are not
  // reachable across a Connect — that is the §5.1 weak spot, and offering
  // them here would author exactly the structure the subitem note warns off.
  return target.columns.some((c) => c.id === sourceColumnId);
}

/** Every Connect column in a set — what the Mirror editor offers as "ride
 *  which road?". An empty result is why the Mirror option is unavailable. */
export function connectColumnsIn(board: MondayBoard, set: ColumnSet): MondayColumn[] {
  return readSet(board, set).filter((c) => c.spec.kind === "connect");
}

/** Read a board's column set from outside the reducer — the canvas and the
 *  editors both need it, and neither should re-derive the
 *  `subitemColumns ?? []` rule for itself. */
export function columnsIn(board: MondayBoard, set: ColumnSet): MondayColumn[] {
  return readSet(board, set);
}
