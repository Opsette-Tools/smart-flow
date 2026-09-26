/**
 * Connect line math — orthogonal (right-angle) routing, the same visual
 * language as the Schema Designer's relationship lines and for the same
 * reason (docs/SCHEMA-DESIGNER-PLAN.md §6): a structural link between two
 * containers should read as a technical drawing, not as the soft curve a
 * swimlane handoff uses.
 *
 * Forked from ../../schema/canvas/paths.ts rather than shared: these
 * functions are keyed to this card's CARD_WIDTH, and the two widths differ.
 * The bodies are near-identical today, which is the point — a shared module
 * parameterized on width would couple two card geometries that are free to
 * drift apart.
 *
 * Same side-selection rule as the schema map: whichever card is further left
 * leaves from its right edge and enters the other's left edge, recomputed on
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

/** Orthogonal elbow: out horizontally, one vertical jog at the midpoint,
 *  then horizontally into the target. */
export function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

/** A Connect pointing at its own board — both ends on one card. Loops out to
 *  the right so the link is visible instead of collapsing to a flat line
 *  hidden behind the card. Monday allows this (a board connecting to itself,
 *  e.g. parent/child items), so it has to draw as something. */
export function selfPath(x: number, y: number, height: number): string {
  const out = x + 56;
  const top = y - 14;
  const bottom = y + 14;
  return `M ${x} ${top} L ${out} ${top} L ${out} ${bottom} L ${x} ${bottom}`;
}

/** Where a Connect edge leaves one card and enters another. `toAnchorY` is
 *  the TARGET CARD's vertical centre rather than a row: a Connect points at
 *  a whole board, not at one of its columns — unlike a SQL foreign key,
 *  which names a specific column on the far side. */
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
