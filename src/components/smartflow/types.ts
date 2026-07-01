/**
 * SmartFlow data model.
 *
 * Everything the diagram is made of lives in one SmartFlowDoc. There is no
 * derived/inferred structure — `laneId`, `order`, and `connectsTo` are only
 * ever written by explicit user actions (no model guesses placement for you).
 */

export interface Lane {
  id: string;
  name: string;
  /** Left-to-right column position. Lower = further left. */
  order: number;
}

export interface Item {
  id: string;
  label: string;
  /** null = still in the unsorted inbox, not yet placed in a lane. */
  laneId: string | null;
  /** Vertical position within its lane (lower = higher up). */
  order: number;
  /** Item IDs this step hands off to — cross-lane or same-lane connectors. */
  connectsTo: string[];
}

export interface SmartFlowDoc {
  lanes: Lane[];
  items: Item[];
}

/** Versioned wrapper persisted to localStorage so future schemas can migrate. */
export interface PersistedDoc {
  v: 1;
  doc: SmartFlowDoc;
}
