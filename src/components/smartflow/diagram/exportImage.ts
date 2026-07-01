/**
 * PNG export of the diagram with NO app chrome in the image — no minimap, no
 * controls, no background grid. The captured area is the React Flow viewport,
 * which holds only the lane + item nodes and the edges.
 *
 * Technique (the React Flow-recommended one): compute the bounding box of all
 * nodes, derive a transform that frames them at a fixed export size with
 * padding, capture `.react-flow__viewport` at that transform with html-to-image,
 * then download. We snapshot and restore the live viewport transform so the
 * on-screen diagram isn't disturbed.
 */

import { toPng } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "reactflow";

const PADDING = 48;
const BG_LIGHT = "#fafafa";
const BG_DARK = "#0e0e0e";

export async function exportDiagramPng(
  flowEl: HTMLElement,
  nodes: Node[],
  fileName: string,
  isDark: boolean,
): Promise<void> {
  const viewport = flowEl.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const exportW = Math.ceil(bounds.width + PADDING * 2);
  const exportH = Math.ceil(bounds.height + PADDING * 2);

  // Frame the nodes centered in the export canvas at 1:1 zoom.
  const { x, y, zoom } = getViewportForBounds(bounds, exportW, exportH, 1, 1, PADDING);

  const prevTransform = viewport.style.transform;
  viewport.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;

  try {
    const dataUrl = await toPng(viewport, {
      backgroundColor: isDark ? BG_DARK : BG_LIGHT,
      width: exportW,
      height: exportH,
      pixelRatio: 2,
      // Skip React Flow's own UI chrome if any of it lives inside the viewport.
      filter: (node) => {
        const cls = (node as HTMLElement).classList;
        if (!cls) return true;
        return !(
          cls.contains("react-flow__minimap") ||
          cls.contains("react-flow__controls") ||
          cls.contains("react-flow__background") ||
          cls.contains("react-flow__attribution")
        );
      },
    });

    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  } finally {
    viewport.style.transform = prevTransform;
  }
}
