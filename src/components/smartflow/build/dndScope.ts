/**
 * dnd-kit scope helpers.
 *
 * Every draggable item is identified by its own item id. Every droppable
 * *scope* (a lane, or the inbox) is identified by a prefixed string so we can
 * tell, on drag-end, whether something landed on another item or on an empty
 * lane's background. Lanes also get reordered via dnd, keyed by their own ids.
 */

export const INBOX_SCOPE = "scope:inbox";

/** Droppable id for a lane's column background (accepts drops on empty space). */
export function laneScopeId(laneId: string): string {
  return `scope:lane:${laneId}`;
}

/** Parse a droppable scope id back into a laneId | null (inbox). Returns
 *  undefined when the id isn't a scope id (i.e. it's an item id). */
export function parseScopeId(id: string): { laneId: string | null } | undefined {
  if (id === INBOX_SCOPE) return { laneId: null };
  if (id.startsWith("scope:lane:")) return { laneId: id.slice("scope:lane:".length) };
  return undefined;
}
