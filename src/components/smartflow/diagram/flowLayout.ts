/**
 * Flowchart + timeline layouts, reading directly from Item[].
 *
 * Flowchart: a top-to-bottom sequence of steps. A decision item (isDecision)
 * has two outgoing connections labeled "Yes" and "No" — Yes continues down the
 * center spine, No is drawn to the side. Plain items just chain downward via
 * their single connectsTo target. The graph itself carries the shape now
 * (connectsTo + Connection.label) — this file only turns that graph into
 * positioned nodes, it doesn't infer structure from indentation any more.
 *
 * Timeline: a left-to-right row of milestones in `order`.
 */

import { MarkerType, type Edge, type Node } from "reactflow";
import type { Item } from "../types";
import { connectionLabel, findGraphRoots, isDecisionStep } from "./itemGraph";

const STEP_W = 240;
const STEP_H = 56;
const V_GAP = 64;
const BRANCH_GAP = 88;

export interface FlowLayoutResult {
  nodes: Node[];
  edges: Edge[];
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

export function buildFlowchartLayout(items: Item[], isDark: boolean): FlowLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeColor = isDark ? "#cfae60" : "#426f62";
  const byId = new Map(items.map((i) => [i.id, i]));
  const placed = new Set<string>();

  const centerX = 0;
  let y = 0;
  let prevId: string | null = null;
  let prevHandle: "s-bottom" | "s-right" = "s-bottom";

  const pushNode = (item: Item, x: number, type: string) => {
    nodes.push({
      id: item.id,
      type,
      position: { x, y },
      data: { label: item.label },
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

  // Walk the spine: at each step, follow its single "continues the flow"
  // successor. A decision step's Yes target becomes that successor; its No
  // target (if any) is drawn as a side branch off the same row.
  let current: Item | undefined = findGraphRoots(items)[0];

  while (current && !placed.has(current.id)) {
    const step: Item = current;
    placed.add(step.id);
    const decision = isDecisionStep(step.label);
    pushNode(step, centerX, decision ? "decisionNode" : "itemNode");
    if (prevId) link(prevId, step.id, undefined, prevHandle);
    flushMergesInto(step.id);

    if (decision && step.connectsTo.length > 0) {
      // Yes = the connection labeled "Yes", falling back to the first target
      // for a doc that predates labels. No = the connection labeled "No",
      // falling back to the second target.
      const yesId: string | undefined =
        step.connectsTo.find((id) => connectionLabel(step, id) === "Yes") ?? step.connectsTo[0];
      const noId: string | undefined =
        step.connectsTo.find((id) => connectionLabel(step, id) === "No") ??
        step.connectsTo.find((id) => id !== yesId);
      const yesChild = yesId ? byId.get(yesId) : undefined;
      const noChild = noId ? byId.get(noId) : undefined;

      if (yesChild) {
        y += STEP_H + V_GAP;
        // The Yes box's own node/type is pushed by the loop's next iteration
        // (via `current`), so a Yes target that is ITSELF a decision gets its
        // own branches drawn instead of being flattened into a plain item.
        link(step.id, yesChild.id, "Yes", "s-bottom", "t-top");
      }

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
        placed.add(noChild.id);
        link(step.id, noChild.id, "No", "s-right", "t-top");
        if (terminal) {
          // Dead-end: no outgoing edge.
        } else if (skip && yesChild) {
          // Bypass the Yes step — merge forward into the next spine step.
          pendingMerges.push(noChild.id);
        } else if (yesChild) {
          // Recoverable exception: resolve, then rejoin at the Yes box.
          link(noChild.id, yesChild.id, undefined, "s-bottom", "t-right");
        }
      }

      if (yesChild) {
        // The Yes edge is already drawn above (with its label), so the loop
        // top's generic `if (prevId) link(...)` must stay silent for this
        // node — hence prevId is cleared rather than pointed at step.id.
        prevId = null;
        current = yesChild;
        continue;
      }
      current = undefined;
    } else {
      y += STEP_H + V_GAP;
      prevId = step.id;
      prevHandle = "s-bottom";
      current = step.connectsTo.length > 0 ? byId.get(step.connectsTo[0]) : undefined;
    }
  }

  return { nodes, edges };
}

const TL_W = 200;
const TL_H = 72;
const TL_GAP = 56;

export function buildTimelineLayout(items: Item[], isDark: boolean): FlowLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeColor = isDark ? "#cfae60" : "#426f62";
  const ordered = [...items].sort((a, b) => a.order - b.order);

  ordered.forEach((m, i) => {
    const x = i * (TL_W + TL_GAP);
    nodes.push({
      id: m.id,
      type: "milestoneNode",
      position: { x, y: 0 },
      data: { label: m.label, note: m.dateNote },
      draggable: false,
      selectable: false,
      width: TL_W,
      height: TL_H,
      style: { width: TL_W, height: TL_H, zIndex: 1 },
    });
    if (i > 0) {
      const prev = ordered[i - 1];
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
