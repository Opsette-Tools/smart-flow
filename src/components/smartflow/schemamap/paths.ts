/**
 * The line math.
 *
 * This is the whole reason the schema map reads clearly and the old diagram
 * did not. Two rules, both borrowed straight from the reference:
 *
 * 1. SIDE IS CHOSEN FROM LIVE GEOMETRY. Whichever card is further left leaves
 *    from its right edge and enters the other's left edge. Recomputed on every
 *    render, so dragging a card re-routes its lines instead of leaving them
 *    attached to a side that no longer faces the target. The old layout picked
 *    a fixed handle from grid position and could never adapt — that is the root
 *    cause of the arrows that appeared to come from the wrong card.
 *
 * 2. CURVES, NOT RIGHT ANGLES. A cubic bezier with horizontal control points
 *    leaves each card perpendicular to its edge and separates from its
 *    neighbours on its own. Orthogonal "smoothstep" paths run along shared
 *    axes, overlap exactly, and read as one continuous line — which is why
 *    distinct handoffs looked merged. No offset hack is needed here; the curve
 *    does the work.
 */

import { CARD_WIDTH } from "./model";

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  height: number;
}

/** A cubic bezier between two points, flattening out horizontally at each end. */
export function relPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

/**
 * A same-lane handoff: both ends are on one card, so a straight bezier would
 * collapse to a flat line hidden behind the card. Loop out to the right side
 * instead, so the connection is visible and obviously internal.
 */
export function selfPath(x: number, y1: number, y2: number): string {
  const out = x + 46;
  return `M ${x} ${y1} C ${out} ${y1}, ${out} ${y2}, ${x} ${y2}`;
}

/** Where a line should leave/enter, given the two cards' live positions. */
export function anchors(
  from: Box,
  fromAnchorY: number,
  to: Box,
  toAnchorY: number,
): { start: Point; end: Point } {
  const fromCenterX = from.x + CARD_WIDTH / 2;
  const toCenterX = to.x + CARD_WIDTH / 2;
  const leftToRight = fromCenterX < toCenterX;

  return {
    start: {
      x: leftToRight ? from.x + CARD_WIDTH : from.x,
      y: from.y + fromAnchorY,
    },
    end: {
      x: leftToRight ? to.x : to.x + CARD_WIDTH,
      y: to.y + toAnchorY,
    },
  };
}

/** Bounding box of every card, used to frame the export and the fit-to-view. */
export function boundsOf(
  boxes: { x: number; y: number; height: number }[],
): { x: number; y: number; width: number; height: number } {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + CARD_WIDTH);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
