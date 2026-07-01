/**
 * Tidy top-down tree layout for hierarchical diagrams (org chart, decision
 * tree). A compact version of the Reingold-Tilford idea: lay leaves out
 * left-to-right, then center each parent over its children. Good enough for the
 * small trees a small-business user will paste, with no extra dependency.
 */

import { MarkerType, type Edge, type Node } from "reactflow";
import type { OutlineNode } from "../outline";
import { flattenOutline } from "../outline";

const NODE_W = 200;
const NODE_H = 52;
const H_GAP = 32; // gap between sibling subtrees
const V_GAP = 76; // vertical gap between levels

export interface TreeLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

interface Positioned {
  node: OutlineNode;
  x: number;
  y: number;
}

export function buildTreeLayout(
  roots: OutlineNode[],
  isDark: boolean,
  opts: { nodeType?: string; edgeLabels?: Map<string, string> } = {},
): TreeLayoutResult {
  const positioned = new Map<string, Positioned>();
  let cursorX = 0;

  // Post-order placement: leaves get the next x slot; parents center on kids.
  const place = (n: OutlineNode, depth: number): number => {
    const y = depth * (NODE_H + V_GAP);
    if (n.children.length === 0) {
      const x = cursorX;
      cursorX += NODE_W + H_GAP;
      positioned.set(n.id, { node: n, x, y });
      return x;
    }
    const childXs = n.children.map((c) => place(c, depth + 1));
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    positioned.set(n.id, { node: n, x, y });
    return x;
  };

  // Place each root, separating multiple roots horizontally.
  for (const root of roots) {
    place(root, 0);
    cursorX += H_GAP; // breathing room between separate roots
  }

  const nodeType = opts.nodeType ?? "itemNode";
  const nodes: Node[] = [];
  for (const { node, x, y } of positioned.values()) {
    nodes.push({
      id: node.id,
      type: nodeType,
      position: { x, y },
      data: { label: node.label },
      draggable: false,
      selectable: false,
      width: NODE_W,
      style: { width: NODE_W, minHeight: NODE_H, zIndex: 1 },
    });
  }

  const edgeColor = isDark ? "#cfae60" : "#426f62";
  const edges: Edge[] = [];
  for (const node of flattenOutline(roots)) {
    if (!node.parentId) continue;
    const label = opts.edgeLabels?.get(node.id);
    edges.push({
      id: `e:${node.parentId}->${node.id}`,
      source: node.parentId,
      target: node.id,
      sourceHandle: "s-bottom",
      targetHandle: "t-top",
      type: "smoothstep",
      label,
      labelStyle: label ? { fontSize: 12, fontWeight: 600, fill: edgeColor } : undefined,
      labelBgStyle: label
        ? { fill: isDark ? "#0e0e0e" : "#fafafa", fillOpacity: 0.9 }
        : undefined,
      style: { stroke: edgeColor, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
    });
  }

  return { nodes, edges };
}
