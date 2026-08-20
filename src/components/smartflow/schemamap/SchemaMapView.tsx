/**
 * The schema map.
 *
 * A pan/zoom canvas of draggable lane cards with curved connection lines
 * between the individual steps inside them. Built from scratch on plain divs +
 * one SVG — no graph library — because the whole value here is being able to
 * grab a card and pull the board apart until the arrows say something.
 *
 * The interaction model, in full:
 *   - drag a card by its HEADER      -> moves that card
 *   - drag the BACKGROUND            -> pans the canvas
 *   - wheel                          -> zooms
 *   - click a card (without moving)  -> focus it and its connections
 *   - Escape / background click      -> clear focus
 *
 * Dragging is presentation only. It writes `lanePositions` and nothing else —
 * a step's lane and order are set on the Build page and are never inferred
 * from where a card happens to sit.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Button, Empty, Modal, Segmented, Tooltip, Typography, message } from "antd";
import {
  AimOutlined,
  DownloadOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import type { SmartFlowDoc } from "../types";
import type { Action } from "../store";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { useIsNarrow } from "@/lib/useIsNarrow";
import { buildMap, CARD_HEADER_H, CARD_WIDTH, ROW_H, ROW_NOTE_H, type LaneCard } from "./model";
import { anchors, boundsOf, relPath, selfPath } from "./paths";
import { exportMapPng } from "./exportMap";

const { Text } = Typography;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
/** Movement past this many pixels turns a click into a drag. */
const DRAG_THRESHOLD = 3;

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
}

interface DragState {
  kind: "pan" | "card";
  laneId?: string;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  startCardX: number;
  startCardY: number;
  moved: boolean;
}

export function SchemaMapView({ doc, dispatch }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const isNarrow = useIsNarrow();

  const { cards, edges } = useMemo(() => buildMap(doc), [doc]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [focused, setFocused] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Live drag offsets, kept out of the doc so a drag doesn't dispatch 60x/sec.
   *  Committed to the store on pointer-up. */
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  /** A card's live position: mid-drag offset, else the saved one, else its
   *  computed grid slot. One function, so the SVG and the divs can never
   *  disagree about where a card is. */
  const posOf = useCallback(
    (card: LaneCard): { x: number; y: number } =>
      dragPos[card.laneId] ??
      doc.lanePositions?.[card.laneId] ?? { x: card.defaultX, y: card.defaultY },
    [dragPos, doc.lanePositions],
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.laneId, c] as const)), [cards]);

  // Which lanes the focused lane talks to — they stay lit alongside it.
  const connectedLanes = useMemo(() => {
    if (!focused) return new Set<string>();
    const set = new Set<string>();
    for (const e of edges) {
      if (e.fromLaneId === focused) set.add(e.toLaneId);
      if (e.toLaneId === focused) set.add(e.fromLaneId);
    }
    return set;
  }, [focused, edges]);

  // ── Fit to view ──────────────────────────────────────────────────
  const fitView = useCallback(() => {
    const frame = frameRef.current;
    if (!frame || cards.length === 0) return;
    const boxes = cards.map((c) => ({ ...posOf(c), height: c.height }));
    const b = boundsOf(boxes);
    if (b.width === 0 || b.height === 0) return;
    const pad = 48;
    const scale = Math.min(
      (frame.clientWidth - pad * 2) / b.width,
      (frame.clientHeight - pad * 2) / b.height,
      1.2,
    );
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    setZoom(z);
    setPan({
      x: (frame.clientWidth - b.width * z) / 2 - b.x * z,
      y: (frame.clientHeight - b.height * z) / 2 - b.y * z,
    });
  }, [cards, posOf]);

  // Fit once when the board first has content, not on every doc edit — a
  // re-fit mid-session would yank the canvas out from under a hand-placed
  // layout, which is exactly what this page exists to preserve.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || cards.length === 0) return;
    fittedRef.current = true;
    // One frame, so the frame element has its real measured size.
    requestAnimationFrame(() => fitView());
  }, [cards.length, fitView]);

  // ── Escape clears focus ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocused(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Wheel zoom ───────────────────────────────────────────────────
  // Non-passive listener via ref: React's onWheel is passive, so
  // preventDefault() there is ignored and the page scrolls behind the canvas.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setZoom((z) => {
        const next = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, z * (e.deltaY > 0 ? 0.92 : 1.08)),
        );
        // Zoom toward the cursor: keep the point under the pointer fixed.
        setPan((p) => ({
          x: px - ((px - p.x) / z) * next,
          y: py - ((py - p.y) / z) * next,
        }));
        return next;
      });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pointer: pan + card drag ─────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const header = target.closest("[data-card-header]") as HTMLElement | null;

      if (header) {
        const laneId = header.getAttribute("data-card-header")!;
        const card = cardById.get(laneId);
        if (!card) return;
        const p = posOf(card);
        dragRef.current = {
          kind: "card",
          laneId,
          startX: e.clientX,
          startY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          startCardX: p.x,
          startCardY: p.y,
          moved: false,
        };
      } else if (!target.closest("[data-card]")) {
        dragRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          startCardX: 0,
          startCardY: 0,
          moved: false,
        };
      } else {
        // Pointer landed on a card's body — not a drag handle, not the
        // background. Nothing to start.
        return;
      }
      frameRef.current?.setPointerCapture(e.pointerId);
    },
    [cardById, pan, posOf],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        d.moved = true;
      }
      if (!d.moved) return;

      if (d.kind === "pan") {
        setPan({ x: d.startPanX + dx, y: d.startPanY + dy });
      } else if (d.laneId) {
        // Divide by zoom so the card tracks the cursor 1:1 on screen at any
        // zoom level — the offsets are in canvas units, not screen pixels.
        setDragPos((prev) => ({
          ...prev,
          [d.laneId!]: { x: d.startCardX + dx / zoom, y: d.startCardY + dy / zoom },
        }));
      }
    },
    [zoom],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (frameRef.current?.hasPointerCapture(e.pointerId)) {
        frameRef.current.releasePointerCapture(e.pointerId);
      }

      if (d.kind === "card" && d.laneId) {
        if (d.moved) {
          // Commit the drag to the doc, then drop the local offset so there's
          // one source of truth again.
          const landed = dragPos[d.laneId];
          if (landed) {
            dispatch({ type: "SET_LANE_POSITION", laneId: d.laneId, x: landed.x, y: landed.y });
            setDragPos((prev) => {
              const { [d.laneId!]: _done, ...rest } = prev;
              return rest;
            });
          }
        } else {
          setFocused((prev) => (prev === d.laneId ? null : d.laneId!));
        }
      } else if (d.kind === "pan" && !d.moved) {
        setFocused(null);
      }
    },
    [dispatch, dragPos],
  );

  // ── Export ───────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!stageRef.current || cards.length === 0 || exporting) return;
    setExporting(true);
    try {
      const boxes = cards.map((c) => ({ ...posOf(c), height: c.height }));
      await exportMapPng(stageRef.current, boundsOf(boxes), isDark);
      haptic("success");
      message.success("Map exported");
    } catch {
      message.error("Couldn't export the image. Try again.");
    } finally {
      setExporting(false);
    }
  };

  // Destructive and previously un-guarded: one stray click threw away a layout
  // that took real time to arrange, with no undo behind it.
  const handleReset = () => {
    Modal.confirm({
      title: "Reset layout?",
      content: "Every card goes back to its starting spot. Your steps stay as they are.",
      okText: "Reset",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        dispatch({ type: "RESET_LANE_POSITIONS" });
        setDragPos({});
        // Re-fit after the doc settles back to the computed grid.
        requestAnimationFrame(() => requestAnimationFrame(() => fitView()));
      },
    });
  };

  const hasContent = cards.length > 0;
  // Nothing to reset until a card has actually been moved — a disabled button
  // says "you have no custom layout" more honestly than a no-op click.
  const hasCustomLayout =
    Object.keys(doc.lanePositions ?? {}).length > 0 || Object.keys(dragPos).length > 0;

  return (
    <section className="sf-map-page">
      <div className="sf-map-toolbar">
        <div className="sf-map-toolbar-left">
          {focused && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              Showing {cardById.get(focused)?.name} and what it connects to · Esc to clear
            </Text>
          )}
        </div>
        <div className="sf-map-toolbar-right">
          <Segmented
            size="small"
            value="z"
            options={[
              { value: "out", icon: <ZoomOutOutlined />, label: "" },
              { value: "z", label: `${Math.round(zoom * 100)}%` },
              { value: "in", icon: <ZoomInOutlined />, label: "" },
            ]}
            onChange={(v) => {
              if (v === "out") setZoom((z) => Math.max(MIN_ZOOM, z - 0.1));
              if (v === "in") setZoom((z) => Math.min(MAX_ZOOM, z + 0.1));
            }}
          />
          <Tooltip title="Fit on screen">
            <Button icon={<AimOutlined />} onClick={fitView} disabled={!hasContent} />
          </Tooltip>
          <Tooltip title="Reset layout">
            <Button
              icon={<UndoOutlined />}
              onClick={handleReset}
              disabled={!hasContent || !hasCustomLayout}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!hasContent}
            onClick={handleExport}
          >
            Export PNG
          </Button>
        </div>
      </div>

      <div
        className="sf-map-frame"
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {hasContent ? (
          <div
            className="sf-map-stage"
            ref={stageRef}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <MapLines
              cards={cards}
              edges={edges}
              posOf={posOf}
              focused={focused}
            />
            {cards.map((card) => {
              const p = posOf(card);
              const isFocused = focused === card.laneId;
              const isConnected = connectedLanes.has(card.laneId);
              const isDimmed = focused !== null && !isFocused && !isConnected;
              return (
                <LaneCardView
                  key={card.laneId}
                  card={card}
                  x={p.x}
                  y={p.y}
                  focused={isFocused}
                  connected={isConnected}
                  dimmed={isDimmed}
                />
              );
            })}
          </div>
        ) : (
          <div className="sf-map-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                doc.lanes.length === 0
                  ? "Add lanes and steps in Build mode, then spread them out here."
                  : "Assign some steps to lanes in Build mode — placed steps show up here."
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ── Lines ─────────────────────────────────────────────────────────

interface LinesProps {
  cards: LaneCard[];
  edges: ReturnType<typeof buildMap>["edges"];
  posOf: (card: LaneCard) => { x: number; y: number };
  focused: string | null;
}

/**
 * One SVG behind every card. It is `overflow: visible` with no width/height of
 * its own, so a card dragged to a negative coordinate still has its lines
 * drawn — a sized SVG would clip them at its own edge.
 */
function MapLines({ cards, edges, posOf, focused }: LinesProps) {
  const cardById = useMemo(() => new Map(cards.map((c) => [c.laneId, c] as const)), [cards]);

  // One marker per color in play. SVG markers can't inherit their parent path's
  // stroke, so an arrowhead has to be defined in the color it will be drawn in
  // — otherwise every line ends in a grey head that contradicts its own body.
  const arrowColors = useMemo(
    () => Array.from(new Set(edges.map((e) => e.color))),
    [edges],
  );
  const markerId = (color: string) => `sf-arrow-${color.replace("#", "")}`;

  return (
    <svg className="sf-map-lines" aria-hidden="true">
      <defs>
        {arrowColors.map((color) => (
          <marker
            key={color}
            id={markerId(color)}
            markerWidth="9"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 9 3.5, 0 7" fill={color} />
          </marker>
        ))}
      </defs>

      {edges.map((edge) => {
        const fromCard = cardById.get(edge.fromLaneId);
        const toCard = cardById.get(edge.toLaneId);
        if (!fromCard || !toCard) return null;

        const fromRow = fromCard.rows.find((r) => r.id === edge.fromStepId);
        const toRow = toCard.rows.find((r) => r.id === edge.toStepId);
        if (!fromRow || !toRow) return null;

        const fromPos = posOf(fromCard);
        const toPos = posOf(toCard);

        const active = focused === edge.fromLaneId || focused === edge.toLaneId;
        const faded = focused !== null && !active;

        // Colored by the lane the handoff LEAVES, matching that card's stripe.
        // On a wide board a line's origin is often off-screen or buried under
        // another card, and the color is the only thing that says where it
        // came from.
        const color = edge.color;

        let d: string;
        if (edge.sameLane) {
          // Both ends on one card: loop out the right side so the line is
          // visible instead of hiding flat behind the card.
          d = selfPath(
            fromPos.x + CARD_WIDTH,
            fromPos.y + fromRow.anchorY,
            toPos.y + toRow.anchorY,
          );
        } else {
          const { start, end } = anchors(
            { ...fromPos, height: fromCard.height },
            fromRow.anchorY,
            { ...toPos, height: toCard.height },
            toRow.anchorY,
          );
          d = relPath(start.x, start.y, end.x, end.y);
        }

        return (
          <path
            key={edge.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={active ? 2.6 : 1.8}
            // A handoff nobody has been asked about stays a little lighter, so
            // "not asked yet" still reads as provisional without losing the
            // lane color that says where it came from.
            opacity={faded ? 0.08 : active ? 1 : edge.unasked ? 0.55 : 0.85}
            markerEnd={`url(#${markerId(color)})`}
            style={{ transition: "opacity .18s, stroke-width .18s" }}
          />
        );
      })}
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────

interface CardProps {
  card: LaneCard;
  x: number;
  y: number;
  focused: boolean;
  connected: boolean;
  dimmed: boolean;
}

function LaneCardView({ card, x, y, focused, connected, dimmed }: CardProps) {
  return (
    <div
      data-card={card.laneId}
      className={`sf-map-card${focused ? " is-focused" : ""}${connected ? " is-connected" : ""}`}
      style={{
        left: x,
        top: y,
        width: CARD_WIDTH,
        height: card.height,
        opacity: dimmed ? 0.22 : 1,
        // A focused card rises above its neighbours so its lines read clearly.
        zIndex: focused ? 3 : connected ? 2 : 1,
      }}
    >
      <div
        data-card-header={card.laneId}
        className="sf-map-card-head"
        style={{ height: CARD_HEADER_H, borderLeftColor: card.color }}
      >
        <span className="sf-map-card-name">{card.name}</span>
        <span className="sf-map-card-count">{card.rows.length}</span>
      </div>

      {card.rows.length === 0 ? (
        <div className="sf-map-row sf-map-row-empty" style={{ height: ROW_H }}>
          No steps yet
        </div>
      ) : (
        card.rows.map((row) => (
          <div key={row.id} className="sf-map-row" style={{ height: row.height }}>
            <div className="sf-map-step" style={{ height: ROW_H }}>
              <span className="sf-map-step-label">{row.label}</span>
              {row.openQuestion && <span className="sf-map-flag" aria-hidden="true" />}
            </div>

            {/* The handoff text nests right under its step — no invented icon,
                nothing compressed away. Several handoffs stack as several
                lines, which is what makes the card taller and the rows
                further apart, which is what keeps the arrows readable. */}
            {row.notes.map((note, i) => (
              <div
                key={i}
                className={`sf-map-note${note.manual ? " is-manual" : ""}`}
                style={{ height: ROW_NOTE_H }}
              >
                <span className="sf-map-note-target">→ {note.target}</span>
                {note.method && <span className="sf-map-note-method">{note.method}</span>}
              </div>
            ))}

            {row.systemOfRecord && (
              <div className="sf-map-note is-system" style={{ height: ROW_NOTE_H }}>
                <span className="sf-map-note-method">{row.systemOfRecord}</span>
              </div>
            )}

            {row.openQuestion && (
              <div className="sf-map-note is-question" style={{ height: ROW_NOTE_H }}>
                <span className="sf-map-note-method">{row.openQuestion}</span>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
