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

  // Side offset for a "No" exception box: sits to the right of the spine.
  const SIDE_X = centerX + STEP_W + BRANCH_GAP;

  for (const step of roots) {
    const decision = isDecision(step.label);
    pushNode(step, centerX, decision ? "decisionNode" : "itemNode");
    if (prevId) link(prevId, step.id, undefined, prevHandle);

    if (decision && step.children.length > 0) {
      // Spine pattern: the FIRST child (the "Yes"/main path) continues straight
      // down the center spine and the flow keeps going from it. The SECOND child
      // (the "No"/exception) peels off to the right, then loops back to the
      // decision so it reads as "handle the exception, then carry on" — no
      // duplicated boxes, no dead ends.
      const yesChild = step.children[0];
      const noChild = step.children[1];

      // "Yes" — next box on the spine, directly below the decision.
      y += STEP_H + V_GAP;
      pushNode(yesChild, centerX, "itemNode");
      link(step.id, yesChild.id, "Yes", "s-bottom", "t-top");

      // "No" — exception box to the right, level with the decision's Yes child.
      if (noChild) {
        nodes.push({
          id: noChild.id,
          type: "itemNode",
          position: { x: SIDE_X, y },
          data: { label: noChild.label },
          draggable: false,
          selectable: false,
          width: STEP_W,
          style: { width: STEP_W, minHeight: STEP_H, zIndex: 1 },
        });
        // Decision → No (out the right). The exception is handled, then rejoins
        // the main path at the Yes box (forward, not a re-test loop) — reads as
        // "resolve this, then carry on."
        link(step.id, noChild.id, "No", "s-right", "t-top");
        link(noChild.id, yesChild.id, undefined, "s-bottom", "t-right");
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
