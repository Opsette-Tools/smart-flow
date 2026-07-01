/**
 * The diagram types SmartFlow offers, plus the plain-language chooser logic.
 *
 * Deliberately small: five genuinely-distinct shapes (Figma's "17 types" are
 * mostly the same few diagrams relabeled per industry). Each entry carries the
 * jargon-free description the chooser shows, so a non-flowchart person can pick
 * by what they're trying to show — not by knowing diagram names.
 */

export type DiagramType = "flowchart" | "swimlane" | "decision-tree" | "org-tree" | "timeline";

export interface DiagramTypeInfo {
  type: DiagramType;
  /** Short display name (the label on the card / tab). */
  name: string;
  /** One plain-English line: what this diagram shows. */
  blurb: string;
  /** The "pick me if…" answer the chooser question offers, in the user's words. */
  chooserAnswer: string;
  /** How you get your content in, in plain terms (shown under the answer). */
  inputHint: string;
}

export const DIAGRAM_TYPES: DiagramTypeInfo[] = [
  {
    type: "flowchart",
    name: "Flowchart",
    blurb: "Steps in order, with yes/no points where the path can split.",
    chooserAnswer: "Steps that happen in order, with a few yes/no decision points",
    inputHint: "Paste your steps, one per line. Add a yes/no step and it branches.",
  },
  {
    type: "swimlane",
    name: "Swimlane",
    blurb: "The same process, sorted by who owns each step (by department or role).",
    chooserAnswer: "The same process, but showing which department or person does each part",
    inputHint: "Set up your lanes (departments), then drop each step into a lane.",
  },
  {
    type: "decision-tree",
    name: "Decision Tree",
    blurb: "A path made of yes/no questions that each lead somewhere.",
    chooserAnswer: "A series of yes/no questions that lead to different outcomes",
    inputHint: "Type a question, then what happens on Yes and on No.",
  },
  {
    type: "org-tree",
    name: "Org Chart",
    blurb: "Who reports to whom — a structure or hierarchy.",
    chooserAnswer: "Who reports to whom, or how a structure is organized",
    inputHint: "Paste names; indent the ones that sit under another.",
  },
  {
    type: "timeline",
    name: "Timeline",
    blurb: "Steps or milestones laid out by when they happen.",
    chooserAnswer: "Things laid out by when they happen — a schedule or roadmap",
    inputHint: "Paste milestones in order, one per line, optionally with a date.",
  },
];

export function diagramInfo(type: DiagramType): DiagramTypeInfo {
  return DIAGRAM_TYPES.find((d) => d.type === type)!;
}
