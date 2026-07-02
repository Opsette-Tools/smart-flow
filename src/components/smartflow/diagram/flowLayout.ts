/**
 * Flowchart + timeline layouts from a pasted outline.
 *
 * Flowchart: a top-to-bottom sequence of steps. A line that ends in "?" is a
 * decision — its two indented children become the Yes / No branches (first
 * child = Yes, second = No), drawn side by side, then the flow rejoins the next
 * top-level step. Plain lines just chain downward. This keeps the input dead
 * simple: paste steps; make one a question and indent the two answers under it.
 *
 * Timeline: a left-to-right row of milestones in the order pasted.
 */

import { MarkerType, type Edge, type Node } from "reactflow";
import type { OutlineNode } from "../outline";

const STEP_W = 240;
const STEP_H = 56;
const V_GAP = 64;
const BRANCH_GAP = 88;

export interface FlowLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function isDecision(label: string): boolean {
  return label.trim().endsWith("?");
}

/**
 * A "No" branch is TERMINAL when it ends the path rather than handling an
 * exception that rejoins the flow. We infer this from the words, so the user
 * never learns syntax: a No box that reads like an ending (decline, close,
 * stop, reject, and so on) becomes an endpoint with no loop-back. Anything
 * else is treated as a recoverable exception that resolves and carries on.
 */
const TERMINAL_HINTS = [
  "decline",
  "declined",
  "close",
  "closed",
  "stop",
  "end",
  "reject",
  "rejected",
  "exit",
  "abandon",
  "cancel",
  "cancelled",
  "canceled",
  "walk away",
  "no-go",
  "no go",
  "lost",
  "loss",
  "dead",
  "drop",
  "kill",
];

function isTerminalBranch(label: string): boolean {
  const l = label.toLowerCase();
  return TERMINAL_HINTS.some((h) => l.includes(h));
}

/**
 * A "skip" branch is an either/or fork where the No path DOESN'T do the extra
 * Yes step — it bypasses it and rejoins the flow at the NEXT step (both paths
 * land on the same following box). This is the common "do X only if needed"
 * shape, e.g. "New dietary ingredient? → No: already on the market" skips the
 * NDI-filing step. We infer it from words that mean "not needed / carry on
 * without it" rather than "an exception to resolve first."
 */
const SKIP_HINTS = [
  "skip",
  "already",
  "no need",
  "not needed",
  "not required",
  "n/a",
  "none needed",
  "bypass",
  "continue without",
  "proceed without",
  "keep",
];

function isSkipBranch(label: string): boolean {
  const l = label.toLowerCase();
  return SKIP_HINTS.some((h) => l.includes(h));
}

export function buildFlowchartLayout(roots: OutlineNode[], isDark: boolean): FlowLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeColor = isDark ? "#cfae60" : "#426f62";

  const centerX = 0;
  let y = 0;
  let prevId: string | null = null;
  let prevHandle: "s-bottom" | "s-right" = "s-bottom";

  const pushNode = (n: OutlineNode, x: number, type: string) => {
    nodes.push({
      id: n.id,
      type,
      position: { x, y },
      data: { label: n.label },
      draggable: false,
      selectable: false,
      width: STEP_W,
      style: { width: STEP_W, minHeight: STEP_H, zIndex: 1 },
    });
  };

  const link = (
    from: string,
    to: string,
    label?: string,
    sourceHandle: string = "s-bottom",
    targetHandle: string = "t-top",
  ) => {
    edges.push({
      id: `e:${from}->${to}:${label ?? ""}`,
      source: from,
      target: to,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      label,
      labelStyle: label ? { fontSize: 12, fontWeight: 600, fill: edgeColor } : undefined,
      labelBgStyle: label ? { fill: isDark ? "#0e0e0e" : "#fafafa", fillOpacity: 0.9 } : undefined,
      style: { stroke: edgeColor, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
    });
  };

  // Side offset for a "No" branch box: sits to the right of the spine.
  const SIDE_X = centerX + STEP_W + BRANCH_GAP;

  // "Skip" No boxes waiting to be wired forward into the NEXT spine step they
  // land on (an either/or fork where No bypasses the Yes step).
  let pendingMerges: string[] = [];

  const flushMergesInto = (targetId: string) => {
    for (const fromId of pendingMerges) link(fromId, targetId, undefined, "s-bottom", "t-right");
    pendingMerges = [];
  };

  for (const step of roots) {
    const decision = isDecision(step.label);
    pushNode(step, centerX, decision ? "decisionNode" : "itemNode");
    if (prevId) link(prevId, step.id, undefined, prevHandle);
    // A skip-No from an earlier decision merges forward into this step.
    flushMergesInto(step.id);

    if (decision && step.children.length > 0) {
      // Spine pattern: the FIRST child (the "Yes"/main path) continues straight
      // down the center spine and the flow keeps going from it. The SECOND child
      // (the "No") is one of three shapes, decided by its wording:
      //   - terminal  → a dead-end off-ramp (decline, lost); no outgoing edge.
      //   - skip      → bypasses the Yes step; merges into the NEXT spine step.
      //   - exception → resolves, then loops back to the Yes box (the default).
      const yesChild = step.children[0];
      const noChild = step.children[1];

      // "Yes" — next box on the spine, directly below the decision.
      y += STEP_H + V_GAP;
      pushNode(yesChild, centerX, "itemNode");
      link(step.id, yesChild.id, "Yes", "s-bottom", "t-top");

      // "No" — box to the right, level with the decision's Yes child.
      if (noChild) {
        const terminal = isTerminalBranch(noChild.label);
        const skip = !terminal && isSkipBranch(noChild.label);
        nodes.push({
          id: noChild.id,
          type: terminal ? "endpointNode" : "itemNode",
          position: { x: SIDE_X, y },
          data: { label: noChild.label },
          draggable: false,
          selectable: false,
          width: STEP_W,
          style: { width: STEP_W, minHeight: STEP_H, zIndex: 1 },
        });
        // Decision → No (out the right).
        link(step.id, noChild.id, "No", "s-right", "t-top");
        if (terminal) {
          // Dead-end: no outgoing edge.
        } else if (skip) {
          // Bypass the Yes step — merge forward into the next spine step.
          pendingMerges.push(noChild.id);
        } else {
          // Recoverable exception: resolve, then rejoin at the Yes box.
          link(noChild.id, yesChild.id, undefined, "s-bottom", "t-right");
        }
      }

      // Main flow continues from the Yes box.
      prevId = yesChild.id;
      prevHandle = "s-bottom";
      y += STEP_H + V_GAP;
      // Skip the normal increment at the bottom of the loop (already advanced).
      continue;
    } else {
      y += STEP_H + V_GAP;
      prevId = step.id;
      prevHandle = "s-bottom";
    }
  }

  return { nodes, edges };
}

const TL_W = 200;
const TL_H = 72;
const TL_GAP = 56;

export function buildTimelineLayout(roots: OutlineNode[], isDark: boolean): FlowLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeColor = isDark ? "#cfae60" : "#426f62";

  // Only top-level lines are milestones; any indented lines become a sub-note
  // shown on the milestone label (kept simple — one level).
  roots.forEach((m, i) => {
    const x = i * (TL_W + TL_GAP);
    const note = m.children.map((c) => c.label).join(" · ");
    nodes.push({
      id: m.id,
      type: "milestoneNode",
      position: { x, y: 0 },
      data: { label: m.label, note },
      draggable: false,
      selectable: false,
      width: TL_W,
      height: TL_H,
      style: { width: TL_W, height: TL_H, zIndex: 1 },
    });
    if (i > 0) {
      const prev = roots[i - 1];
      edges.push({
        id: `e:${prev.id}->${m.id}`,
        source: prev.id,
        target: m.id,
        sourceHandle: "s-right",
        targetHandle: "t-left",
        type: "smoothstep",
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
      });
    }
  });

  return { nodes, edges };
}
