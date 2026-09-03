/**
 * Relationship line math — orthogonal (right-angle) routing, not the bezier
 * curves ../../schemamap/paths.ts uses. A deliberate visual split: a schema
 * relationship is a structural constraint, a swimlane handoff is a process
 * event, and per docs/SCHEMA-DESIGNER-PLAN.md §6 they should not read as the
 * same kind of line.
 *
 * Same side-selection rule as the schema map: whichever card is further left
 * leaves from its right edge, enters the other's left edge, recomputed on
 * every render so dragging a card re-routes its lines live.
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

/** Orthogonal elbow path: out horizontally, one vertical jog at the
 *  midpoint, then horizontally into the target. Reads as a clean technical
 *  drawing rather than a soft, organic curve. */
export function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

/** A same-table relationship: both ends on one card. Loops out to the right
 *  so the connection is visible instead of collapsing to a flat line hidden
 *  behind the card. */
export function selfPath(x: number, y1: number, y2: number): string {
  const out = x + 52;
  return `M ${x} ${y1} L ${out} ${y1} L ${out} ${y2} L ${x} ${y2}`;
}

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

/** Midpoint of an elbow path — where the "1"/"n" badges sit, one on each
 *  half of the line near its own end, not stacked on top of each other. */
export function badgePoints(start: Point, end: Point): { near: Point; far: Point } {
  const midX = (start.x + end.x) / 2;
  const nearOffset = (midX - start.x) * 0.35;
  const farOffset = (midX - end.x) * 0.35;
  return {
    near: { x: start.x + nearOffset, y: start.y },
    far: { x: end.x + farOffset, y: end.y },
  };
}

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
