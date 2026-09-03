/**
 * Discovery capture sheet — data model.
 *
 * A DiscoverySession is filled out LIVE, in a client meeting, often on a
 * phone. It is deliberately NOT graph-shaped the way SmartFlowDoc's Item is:
 * `nextStepLabel` is a plain string the interviewer writes down ("S3"), not a
 * resolved item id, because the target step may not exist as a row yet and
 * nobody should be asked to maintain referential integrity mid-conversation.
 *
 * This is upstream of a Flow, not a replacement for one. A session transforms
 * into a swimlane/flowchart afterward (see transform.ts) by resolving these
 * labels into real Item ids at that point, not before.
 */

import { uuid } from "@/lib/uuid";

export interface SessionHeader {
  division: string;
  date: string;
  /** Free text, one line per attendee is typical: "Jane Doe — AP Manager". */
  attendees: string;
  processName: string;
  /** Free text (e.g. "2:05 PM") — not parsed, just recorded. */
  recordingStart: string;
}

export function emptySessionHeader(): SessionHeader {
  return { division: "", date: "", attendees: "", processName: "", recordingStart: "" };
}

/** A step can branch: more than one (condition, target) pair means the next
 *  step depends on something. A single entry with no condition is the plain
 *  linear case. */
export interface StepBranch {
  id: string;
  /** Blank = linear (only meaningful when this is the step's only branch). */
  condition: string;
  /** The OTHER step's `stepLabel` (e.g. "S3") — not an id. Resolved at
   *  transform time, same reasoning as the file doc comment above. */
  nextStepLabel: string;
}

export type Confidence = "confirmed" | "assumed";

export interface CaptureStep {
  id: string;
  /** User-facing sequence label ("S1", "S2"...). Editable, not required to
   *  stay strictly sequential — a step inserted later in the meeting can
   *  still get "S2b" if that's what makes sense in the room. */
  stepLabel: string;
  order: number;
  branches: StepBranch[];
  /** RoleValue against the session's own roles list (see roles.ts) — a
   *  session-scoped vocabulary, not a global enum. Free text still accepted;
   *  see roles.ts for why a global list can't work here. */
  role?: string;
  whatHappens: string;
  /** Controlled list (session-scoped, same reasoning as role), multi-select. */
  systems: string[];
  painFlag?: { note?: string };
  // Backfilled from the transcript after the meeting — optional by design.
  trigger?: string;
  input?: string;
  output?: string;
  notification?: string;
  waitTime?: string;
  confidence?: Confidence;
}

export function newStep(order: number, stepLabel: string): CaptureStep {
  return {
    id: uuid(),
    stepLabel,
    order,
    branches: [],
    systems: [],
    whatHappens: "",
  };
}

export interface Artifact {
  id: string;
  name: string;
  type: string;
  owner: string;
  location: string;
  requested: boolean;
  received: boolean;
}

export interface DecisionRule {
  id: string;
  rule: string;
  appliedBy: string;
  trigger: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  whereUsed: string;
}

export interface ExceptionCase {
  id: string;
  /** The normal-path step this deviates from — a `CaptureStep.stepLabel`,
   *  same "not yet resolved" reference style as StepBranch.nextStepLabel. */
  stepLabel: string;
  condition: string;
  whatHappensInstead: string;
  /** Free text on purpose — "rare", "~2x a month" are real answers a strict
   *  number field would reject. */
  frequency: string;
}

export interface VolumeRow {
  id: string;
  process: string;
  frequency: string;
  countPerPeriod: string;
  peakPeriods: string;
}

/** A session-scoped controlled-list option — same shape MECHANISMS uses in
 *  smartflow/types.ts, but the list itself lives on the doc (see roles.ts). */
export interface ListOption {
  value: string;
  label: string;
}

export interface DiscoveryDoc {
  header: SessionHeader;
  steps: CaptureStep[];
  roles: ListOption[];
  systemsList: ListOption[];
  artifacts: Artifact[];
  decisionRules: DecisionRule[];
  glossary: GlossaryTerm[];
  exceptions: ExceptionCase[];
  volume: VolumeRow[];
}

export function emptyDiscoveryDoc(): DiscoveryDoc {
  return {
    header: emptySessionHeader(),
    steps: [],
    roles: [],
    systemsList: [],
    artifacts: [],
    decisionRules: [],
    glossary: [],
    exceptions: [],
    volume: [],
  };
}
