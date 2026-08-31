/**
 * Pure derivation: SmartFlowDoc → the discovery findings.
 *
 * No new state and nothing stored — everything here is computed from fields the
 * user already filled in during the interview. This is the half that makes
 * SmartFlow a discovery tool rather than a drawing tool: the diagram says what
 * the process is, this says what is wrong with it.
 *
 * Scope note: only *placed* items count. An item still sitting in the inbox
 * has not been assigned to a lane, so calling it an orphan or flagging its
 * missing system of record would be noise, not a finding.
 */

import {
  connectionMechanisms,
  isCustomMechanism,
  isManualMechanism,
  mechanismLabel,
  mechanismListLabel,
  MECHANISMS,
  type HandoffMechanism,
  type Item,
  type KnownMechanism,
  type SmartFlowDoc,
} from "../types";

export interface HandoffFinding {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  fromLane: string;
  toLane: string;
  mechanism: HandoffMechanism;
  /** Every mechanism on this handoff when the answer was compound. */
  mechanisms?: HandoffMechanism[];
  systemName?: string;
  /** True when the handoff crosses a lane boundary — a board-to-board seam. */
  crossLane: boolean;
  /** True when a person carries the work. Automation candidate on a Monday build. */
  manual: boolean;
}

export interface LaneEdgePoints {
  laneId: string;
  laneName: string;
  /** Steps in this lane receiving work from another lane. */
  entries: { itemId: string; label: string; fromLane: string }[];
  /** Steps in this lane handing work to another lane. */
  exits: { itemId: string; label: string; toLane: string }[];
}

export interface OpenQuestionFinding {
  laneId: string;
  laneName: string;
  items: { itemId: string; label: string; question: string }[];
}

export interface GapsReport {
  /** Placed steps with no inbound and no outbound connector. */
  orphans: { itemId: string; label: string; laneName: string }[];
  /** Where each lane's work arrives and leaves — the board-to-board connections. */
  laneEdges: LaneEdgePoints[];
  /** Every handoff you have recorded an answer for, whatever the answer was.
   *  Nothing is filtered out — an automated handoff is a real finding too. */
  answeredHandoffs: HandoffFinding[];
  /** The subset that moves by hand. A view over answeredHandoffs, not a filter
   *  applied to what gets collected. */
  manualHandoffs: HandoffFinding[];
  /** Handoffs drawn but never asked about. Not a finding — a to-do. */
  unaskedHandoffs: { fromLabel: string; toLabel: string }[];
  /** Steps where the client said the data lives NOWHERE. A real finding about
   *  their business, and the strongest argument for building them a system. */
  recordedNowhere: { itemId: string; label: string; laneName: string }[];
  /** Steps where YOU have not filled the field in yet. A to-do for you, not a
   *  finding about them — the two must never be conflated. */
  systemNotAsked: { itemId: string; label: string; laneName: string }[];
  /** Systems named anywhere in the doc, with how many steps each holds. */
  systemInventory: { name: string; count: number }[];
  /** Open questions, grouped by lane — the agenda for meeting two. */
  openQuestions: OpenQuestionFinding[];
  /** Total count of open questions across every lane. */
  openQuestionCount: number;
  /** Steps a department person named as where the process actually breaks. */
  breakPoints: { itemId: string; label: string; laneName: string; note: string }[];
  /** Steps grouped by owner, in first-seen order. Unowned steps are excluded —
   *  this counts who's on the hook, not who's missing an answer. */
  ownerTally: { owner: string; count: number }[];
  /** How many placed steps the report covers. */
  placedCount: number;
  /** Every known mechanism rung, in ladder order, with how many answered
   *  handoffs use it as their primary mechanism. Custom answers are tallied
   *  separately since they don't fit a rung. */
  mechanismTally: { mechanism: KnownMechanism; label: string; count: number }[];
  /** Answered handoffs whose primary mechanism was a custom, typed-in answer. */
  customMechanismCount: number;
}

const INBOX_LANE = "Inbox";

export function computeGaps(doc: SmartFlowDoc): GapsReport {
  const lanes = [...doc.lanes].sort((a, b) => a.order - b.order);
  const laneName = new Map(lanes.map((l) => [l.id, l.name] as const));
  const byId = new Map(doc.items.map((i) => [i.id, i] as const));

  const placed = doc.items.filter((i) => i.laneId !== null && laneName.has(i.laneId));
  const isPlaced = (id: string): boolean => {
    const i = byId.get(id);
    return !!i && i.laneId !== null && laneName.has(i.laneId);
  };
  const laneOf = (i: Item): string => (i.laneId ? laneName.get(i.laneId) ?? INBOX_LANE : INBOX_LANE);

  // --- Orphans: no inbound, no outbound. Either a dead end or a missed handoff.
  const hasInbound = new Set<string>();
  for (const item of placed) {
    for (const toId of item.connectsTo) if (isPlaced(toId)) hasInbound.add(toId);
  }
  const orphans = placed
    .filter((i) => i.connectsTo.filter(isPlaced).length === 0 && !hasInbound.has(i.id))
    .map((i) => ({ itemId: i.id, label: i.label, laneName: laneOf(i) }));

  // --- Walk every rendered handoff once; it feeds three sections at a time.
  const answeredHandoffs: HandoffFinding[] = [];
  const unaskedHandoffs: { fromLabel: string; toLabel: string }[] = [];
  const entriesByLane = new Map<string, LaneEdgePoints["entries"]>();
  const exitsByLane = new Map<string, LaneEdgePoints["exits"]>();
  for (const lane of lanes) {
    entriesByLane.set(lane.id, []);
    exitsByLane.set(lane.id, []);
  }

  for (const item of placed) {
    const detail = new Map((item.connections ?? []).map((c) => [c.toId, c] as const));
    for (const toId of item.connectsTo) {
      const target = byId.get(toId);
      if (!target || !isPlaced(toId)) continue;
      const crossLane = item.laneId !== target.laneId;

      if (crossLane) {
        exitsByLane.get(item.laneId!)?.push({
          itemId: item.id,
          label: item.label,
          toLane: laneOf(target),
        });
        entriesByLane.get(target.laneId!)?.push({
          itemId: target.id,
          label: target.label,
          fromLane: laneOf(item),
        });
      }

      // A handoff can carry several mechanisms ("a spreadsheet, sent by
      // email"). The first is the primary for ranking; all of them are kept so
      // the sentence can name the whole answer.
      const picked = connectionMechanisms(detail.get(toId));
      const mechanism = picked[0];
      if (mechanism === undefined) {
        unaskedHandoffs.push({ fromLabel: item.label, toLabel: target.label });
      } else {
        // Every answered handoff is kept, whatever the answer. An earlier cut
        // only collected the manual ones, so marking something "automated" made
        // it vanish from the report — indistinguishable from never asking.
        answeredHandoffs.push({
          fromId: item.id,
          toId,
          fromLabel: item.label,
          toLabel: target.label,
          fromLane: laneOf(item),
          toLane: laneOf(target),
          mechanism,
          mechanisms: picked.length > 1 ? picked : undefined,
          systemName: detail.get(toId)?.systemName,
          crossLane,
          // Compound answers are manual if ANY leg is carried by a person.
          manual: picked.some(isManualMechanism),
        });
      }
    }
  }

  // Manual handoffs ranked worst-first, so the backlog reads as a priority list.
  const severity: Record<KnownMechanism, number> = {
    verbal: 0,
    paper: 1,
    chat: 2,
    email: 3,
    spreadsheet: 4,
    file: 5,
    system: 6,
    automated: 7,
  };
  // A custom answer sorts just after "verbal": it did not fit any rung, which
  // usually means something ad-hoc. This orders within a lane group only — it is
  // presentation, not a claim that one handoff matters more than another.
  const rank = (m: HandoffMechanism): number => (isCustomMechanism(m) ? 0.5 : severity[m]);
  answeredHandoffs.sort((a, b) => rank(a.mechanism) - rank(b.mechanism));
  const manualHandoffs = answeredHandoffs.filter((h) => h.manual);

  const laneEdges: LaneEdgePoints[] = lanes.map((lane) => ({
    laneId: lane.id,
    laneName: lane.name,
    entries: dedupeEdgePoints(entriesByLane.get(lane.id) ?? [], "fromLane"),
    exits: dedupeEdgePoints(exitsByLane.get(lane.id) ?? [], "toLane"),
  }));

  // --- Systems: what the client told you, vs. what you have not asked yet.
  //
  // These are NOT the same thing and collapsing them would report your own
  // blank form fields as findings about the client's business. A blank field
  // means "not asked". Only an explicit answer along the lines of "nowhere"
  // is a finding.
  const NOWHERE = /^(nowhere|nothing|none|n\/a|na|no system|not recorded|nobody|no one)$/i;
  const asRow = (i: Item) => ({ itemId: i.id, label: i.label, laneName: laneOf(i) });

  const recordedNowhere = placed
    .filter((i) => {
      const v = i.systemOfRecord?.trim();
      return !!v && NOWHERE.test(v);
    })
    .map(asRow);

  const systemNotAsked = placed.filter((i) => !i.systemOfRecord?.trim()).map(asRow);

  // Case-insensitive tally, but display the first spelling the user typed —
  // "QuickBooks" and "quickbooks" are one system, not two.
  const systemCounts = new Map<string, { name: string; count: number }>();
  for (const i of placed) {
    const raw = i.systemOfRecord?.trim();
    // "Nowhere" is an answer, but it is not a system — it belongs to the
    // findings above, not to the inventory of tools they actually run on.
    if (!raw || NOWHERE.test(raw)) continue;
    const key = raw.toLowerCase();
    const found = systemCounts.get(key);
    if (found) found.count += 1;
    else systemCounts.set(key, { name: raw, count: 1 });
  }
  const systemInventory = [...systemCounts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  // --- Open questions, grouped by lane, in lane order.
  const openQuestions: OpenQuestionFinding[] = lanes
    .map((lane) => ({
      laneId: lane.id,
      laneName: lane.name,
      items: placed
        .filter((i) => i.laneId === lane.id && i.openQuestion?.trim())
        .sort((a, b) => a.order - b.order)
        .map((i) => ({ itemId: i.id, label: i.label, question: i.openQuestion!.trim() })),
    }))
    .filter((g) => g.items.length > 0);

  // --- Mechanism tally: how each answered handoff's primary rung is used.
  // Ladder order (not count order) so the chart reads as the maturity ladder
  // it is — a bar that jumps around by frequency would hide the story.
  const mechanismCounts = new Map<KnownMechanism, number>();
  let customMechanismCount = 0;
  for (const h of answeredHandoffs) {
    if (isCustomMechanism(h.mechanism)) {
      customMechanismCount += 1;
    } else {
      mechanismCounts.set(h.mechanism, (mechanismCounts.get(h.mechanism) ?? 0) + 1);
    }
  }
  const mechanismTally = MECHANISMS.map((m) => ({
    mechanism: m.value,
    label: mechanismLabel(m.value),
    count: mechanismCounts.get(m.value) ?? 0,
  }));

  // --- Break points: a first-person "this is where it breaks", not an
  // inferred finding. Only placed steps count, same as everything else here.
  const breakPoints = placed
    .filter((i) => i.breakPoint)
    .map((i) => ({ itemId: i.id, label: i.label, laneName: laneOf(i), note: i.breakPoint!.note }));

  // --- Owner tally: case-insensitive, first-typed spelling kept, same shape
  // as the system inventory above. Unowned steps are excluded on purpose.
  const ownerCounts = new Map<string, { owner: string; count: number }>();
  for (const i of placed) {
    const raw = i.owner?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const found = ownerCounts.get(key);
    if (found) found.count += 1;
    else ownerCounts.set(key, { owner: raw, count: 1 });
  }
  const ownerTally = [...ownerCounts.values()].sort(
    (a, b) => b.count - a.count || a.owner.localeCompare(b.owner),
  );

  return {
    orphans,
    laneEdges,
    answeredHandoffs,
    manualHandoffs,
    unaskedHandoffs,
    recordedNowhere,
    systemNotAsked,
    systemInventory,
    openQuestions,
    openQuestionCount: openQuestions.reduce((n, g) => n + g.items.length, 0),
    breakPoints,
    ownerTally,
    placedCount: placed.length,
    mechanismTally,
    customMechanismCount,
  };
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------
//
// The panel has every fact it needs to say something in plain words: which step
// hands to which, whether it crosses a lane, and how the work moves. Rendering
// that as "Spreadsheet | Deal won → Send deposit invoice | Sales" makes the
// reader reassemble the sentence in their head. These helpers assemble it here
// instead, once, so both the panel and any future export read the same way.

/** "Deal won hands off to Send deposit invoice through a shared spreadsheet."
 *  Automated handoffs get a different verb — nobody hands anything off. */
export function handoffSentence(h: HandoffFinding): string {
  if (h.mechanism === "automated") {
    return `${h.fromLabel} moves to ${h.toLabel} automatically.`;
  }
  if (h.mechanism === "system") {
    const where = h.systemName ? h.systemName : "an existing system";
    return `${h.fromLabel} passes to ${h.toLabel} through ${where}.`;
  }
  // A compound handoff ("a spreadsheet, sent by email") reads as one phrase.
  if (h.mechanisms && h.mechanisms.length > 1) {
    return `${h.fromLabel} hands off to ${h.toLabel} via ${mechanismListLabel(h.mechanisms)}.`;
  }
  return `${h.fromLabel} hands off to ${h.toLabel} ${mechanismPhrase(h.mechanism)}.`;
}

/** Which lanes the handoff touches. States the fact and stops — whether a
 *  crossing is a problem is the reader's call, not this function's. */
export function handoffContext(h: HandoffFinding): string {
  return h.crossLane
    ? `Crosses from ${h.fromLane} to ${h.toLane}.`
    : `Stays inside ${h.fromLane}.`;
}

/** The "by ..." clause. Custom answers are quoted so they read as the client's
 *  own words rather than as one of our categories. */
function mechanismPhrase(m: HandoffMechanism): string {
  if (isCustomMechanism(m)) return `by ${m.custom}`;
  switch (m) {
    case "verbal":
      return "in person";
    case "email":
      return "by email";
    case "chat":
      return "by text or chat";
    case "spreadsheet":
      return "by spreadsheet";
    case "paper":
      return "by paper form";
    case "file":
      return "by shared drive";
    case "system":
      return "through an existing system";
    case "automated":
      return "automatically";
  }
}

// ---------------------------------------------------------------------------
// The written summary
// ---------------------------------------------------------------------------

/** Escape text going into generated HTML — step labels and questions are user
 *  input and must never be able to inject markup. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Turn the findings into HTML, grouped by lane.
 *
 * HTML rather than plain text so the summary opens in the editor as real bold
 * and real bullets, and pastes into Monday, Notion, Docs, and email carrying
 * that formatting. The to-do half (handoffs and steps not filled in) is
 * deliberately left out — that is a working list, not part of a summary.
 */
export function buildSummary(doc: SmartFlowDoc): string {
  const g = computeGaps(doc);
  if (g.placedCount === 0) return "";

  const lanes = [...doc.lanes].sort((a, b) => a.order - b.order);
  const out: string[] = [];

  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    out.push(`<p><strong>${esc(title)}</strong></p>`);
    out.push(`<ul>${rows.map((r) => `<li>${r}</li>`).join("")}</ul>`);
  };

  for (const lane of lanes) {
    const rows: string[] = [];
    for (const h of g.answeredHandoffs.filter((x) => x.fromLane === lane.name)) {
      rows.push(esc(handoffSentence(h)));
    }
    for (const s of g.recordedNowhere.filter((x) => x.laneName === lane.name)) {
      rows.push(`${esc(s.label)} keeps no record.`);
    }
    for (const o of g.orphans.filter((x) => x.laneName === lane.name)) {
      rows.push(`${esc(o.label)} has no step before or after.`);
    }
    section(lane.name, rows);
  }

  section(
    "Systems in use",
    g.systemInventory.map(
      (s) => `${esc(s.name)} holds ${s.count} step${s.count === 1 ? "" : "s"}.`,
    ),
  );

  section(
    "Outstanding questions",
    g.openQuestions.flatMap((group) =>
      group.items.map(
        (q) => `${esc(q.label)} (${esc(group.laneName)}) — ${esc(q.question)}`,
      ),
    ),
  );

  return out.join("");
}

/** One row per (step, other-lane) pair — a step feeding the same lane twice is
 *  one entry point, not two. */
function dedupeEdgePoints<T extends { itemId: string }>(rows: T[], laneKey: keyof T): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = `${row.itemId}|${String(row[laneKey])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
