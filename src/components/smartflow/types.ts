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

/**
 * How work physically moves across a handoff.
 *
 * The eight known values are ordered worst → best so they read as a maturity
 * ladder. But this is a DISCOVERY tool: the whole point is to capture mess, and
 * mess does not fit a list written in advance. "It goes on the whiteboard in the
 * break room" is a real answer and a real finding — so the field also accepts
 * free text. The known values are suggestions, never a cage.
 *
 * A custom value is stored verbatim (as `{ custom: "..." }`) and treated as
 * manual for ranking, because an answer that did not fit the ladder is almost
 * always a person carrying something.
 */
export type KnownMechanism =
  | "verbal"
  | "email"
  | "chat"
  | "spreadsheet"
  | "paper"
  | "file"
  | "system"
  | "automated";

/** A mechanism is either one of the known rungs or whatever the client said. */
export type HandoffMechanism = KnownMechanism | { custom: string };

/** Display order + label for the known mechanisms. Single source for the
 *  select's suggestions, the edge labels, and the gaps read-out. */
export const MECHANISMS: { value: KnownMechanism; label: string }[] = [
  { value: "verbal", label: "Verbal / hallway" },
  { value: "email", label: "Email" },
  { value: "chat", label: "Text / chat" },
  { value: "spreadsheet", label: "Spreadsheet" },
  { value: "paper", label: "Paper form" },
  { value: "file", label: "Shared drive / file" },
  { value: "system", label: "Existing system" },
  { value: "automated", label: "Automated" },
];

const MECHANISM_LABEL = new Map(MECHANISMS.map((m) => [m.value, m.label] as const));

/** True when the value is one the client typed rather than one we offered. */
export function isCustomMechanism(m: HandoffMechanism): m is { custom: string } {
  return typeof m === "object" && m !== null && "custom" in m;
}

/** What to show the user — the ladder's label, or their own words verbatim. */
export function mechanismLabel(m: HandoffMechanism): string {
  if (isCustomMechanism(m)) return m.custom;
  return MECHANISM_LABEL.get(m) ?? m;
}

/**
 * Everything except "system" and "automated" is a manual handoff — work moving
 * by a person carrying it. These are the improvement backlog.
 */
const MANUAL: ReadonlySet<KnownMechanism> = new Set<KnownMechanism>([
  "verbal",
  "email",
  "chat",
  "spreadsheet",
  "paper",
  "file",
]);

export function isManualMechanism(m: HandoffMechanism): boolean {
  // An answer that did not fit the ladder is almost always someone carrying
  // something, so custom values count as manual and land on the backlog.
  if (isCustomMechanism(m)) return true;
  return MANUAL.has(m);
}

/** Round-trip a mechanism through the select, which speaks plain strings.
 *  A known key stays itself; anything else becomes a custom value. */
export function parseMechanism(raw: string): HandoffMechanism | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (MECHANISM_LABEL.has(value as KnownMechanism)) return value as KnownMechanism;
  // The user may pick a suggestion by its LABEL (antd sends back the typed text
  // on free entry), so match that too before falling back to custom.
  const byLabel = MECHANISMS.find((m) => m.label.toLowerCase() === value.toLowerCase());
  return byLabel ? byLabel.value : { custom: value };
}

/** The select's current string value for a stored mechanism. */
export function mechanismToValue(m: HandoffMechanism | undefined): string | undefined {
  if (m === undefined) return undefined;
  return isCustomMechanism(m) ? m.custom : m;
}

/** Per-connection discovery detail. Keyed by `toId` against the item's
 *  `connectsTo` list — a connection with no entry here means "not asked yet",
 *  which is a real and different state from "asked, and it's manual". */
export interface Connection {
  toId: string;
  /** The primary mechanism. Kept as the first entry of `mechanisms` so every
   *  existing reader (gaps, map, summary) keeps working unchanged, and so v1/v2
   *  docs that only ever wrote this field still read correctly. */
  mechanism?: HandoffMechanism;
  /** Every mechanism on this handoff, in the order they were picked. A real
   *  answer is often compound: "a spreadsheet, sent by email" is two rungs, not
   *  one, and forcing a single pick loses half the finding. Absent means the
   *  handoff has at most the single `mechanism` above. */
  mechanisms?: HandoffMechanism[];
  /** Free text when mechanism is "system" — e.g. "QuickBooks". */
  systemName?: string;
  /** Edge label for a branching diagram (flowchart, decision tree) — e.g.
   *  "Yes" / "No". Absent on a plain sequential handoff. This is a display
   *  label on the arrow, not a discovery finding, so it lives here rather
   *  than being re-inferred from wording at render time. */
  label?: string;
}

export interface Item {
  id: string;
  label: string;
  /** null = still in the unsorted inbox, not yet placed in a lane. */
  laneId: string | null;
  /** Vertical position within its lane (lower = higher up). */
  order: number;
  /** Item IDs this step hands off to — cross-lane or same-lane connectors.
   *  Still the source of truth for which edges exist. */
  connectsTo: string[];
  /** Discovery sidecar: per-connection detail for arrows that have any. */
  connections?: Connection[];
  /** Discovery: where this step's data actually lives ("nowhere" is a finding). */
  systemOfRecord?: string;
  /** Discovery: what you couldn't answer in the room. */
  openQuestion?: string;
  /** Discovery: whose job this is, in the department's own words. */
  owner?: string;
  /** Discovery: a department person named this step as where things break down.
   *  Presence of the object means "flagged"; the note holds what they said. */
  breakPoint?: { note: string };
  /** Discovery: you've verified this step is accurate — as opposed to your
   *  best read from the interview, not yet checked. */
  validated?: boolean;
  /** Timeline only: a date or date range shown under the milestone label
   *  (e.g. "Mar - Apr"). Meaningless for every other type. */
  dateNote?: string;
}

/** Every mechanism on a connection, single or compound, in pick order. The one
 *  place that reconciles `mechanism` with `mechanisms`, so no caller has to. */
export function connectionMechanisms(c: Connection | undefined): HandoffMechanism[] {
  if (!c) return [];
  if (c.mechanisms && c.mechanisms.length > 0) return c.mechanisms;
  return c.mechanism ? [c.mechanism] : [];
}

/** "a spreadsheet", "a spreadsheet and email", "a spreadsheet, email and chat".
 *  Written out rather than joined with commas so the drawer and the summary
 *  read as sentences. */
export function mechanismListLabel(list: HandoffMechanism[]): string {
  const labels = list.map(mechanismLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Where a lane's card sits on the schema map, once it has been dragged. */
export interface CardPosition {
  x: number;
  y: number;
}

export interface SmartFlowDoc {
  lanes: Lane[];
  items: Item[];
  /** Schema-map layout, keyed by lane id. Absent = never dragged, so the card
   *  falls back to its computed grid slot. Purely presentational: moving a card
   *  never changes which lane a step belongs to. */
  lanePositions?: Record<string, CardPosition>;
  /** Legacy: discovery used to be a mode you toggled. Every step now always
   *  carries the handoff, record, and question fields, so nothing reads this.
   *  Kept optional so saved docs still parse. */
  discovery?: boolean;
  /** The written summary. Generated from the findings, then freely edited —
   *  once it exists only an explicit Regenerate overwrites it. */
  summary?: string;
}

/** Versioned wrapper persisted to localStorage so future schemas can migrate.
 *  v1 docs read as v2 untouched (every new field is optional). */
export interface PersistedDoc {
  v: 1 | 2;
  doc: SmartFlowDoc;
}
