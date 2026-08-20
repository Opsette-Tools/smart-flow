/**
 * PNG export of the schema map.
 *
 * The React Flow exporter can't be reused — this page has no React Flow. The
 * approach is the same idea though: temporarily set the stage's transform so
 * the content sits at 1:1 inside a canvas sized to its own bounding box,
 * snapshot it, then restore the on-screen transform.
 *
 * Because the bounds are computed from the SAME live positions the canvas
 * renders from, the export captures where cards were DRAGGED — not where they
 * started.
 */

import { toPng } from "html-to-image";

const PADDING = 56;
const BG_LIGHT = "#fafafa";
const BG_DARK = "#0e0e0e";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function exportMapPng(
  stage: HTMLElement,
  bounds: Bounds,
  isDark: boolean,
  fileName = "smartflow-map.png",
): Promise<void> {
  if (bounds.width === 0 || bounds.height === 0) return;

  const width = Math.ceil(bounds.width + PADDING * 2);
  const height = Math.ceil(bounds.height + PADDING * 2);

  const prev = stage.style.transform;
  // Shift the content so its top-left bound lands at the padding offset, at
  // 1:1 scale. Everything then sits inside the canvas we're about to size.
  stage.style.transform = `translate(${PADDING - bounds.x}px, ${PADDING - bounds.y}px) scale(1)`;

  try {
    const dataUrl = await toPng(stage, {
      backgroundColor: isDark ? BG_DARK : BG_LIGHT,
      width,
      height,
      pixelRatio: 2,
      // The stage is transformed; html-to-image needs the untransformed size
      // for its own clone, so pin the canvas explicitly.
      style: { transformOrigin: "0 0" },
    });

    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  } finally {
    stage.style.transform = prev;
  }
}
