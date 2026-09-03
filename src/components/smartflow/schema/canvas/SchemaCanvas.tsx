/**
 * The schema designer canvas.
 *
 * Forked from ../../schemamap/SchemaMapView.tsx: the pan/zoom/drag pointer
 * math below is a direct port of that file's proven engine (see
 * docs/SCHEMA-DESIGNER-PLAN.md §3 for why forking the plumbing and replacing
 * the visual layer is the right split, instead of sharing one component or
 * reaching for React Flow). Everything about how a card LOOKS and what a
 * connection MEANS is new: a table card is an editable column list, not a
 * read-only step list, and dragging from one column to another draws a
 * relationship with a kind (1:1 / 1:many / many:many), not a handoff.
 *
 * The interaction model:
 *   - drag a card by its HEADER          -> moves that card
 *   - drag the BACKGROUND                -> pans the canvas
 *   - wheel                              -> zooms
 *   - drag from one column's connector   -> draws a relationship to the
 *     dot to another column's dot           column dropped on
 *   - click "+ Add column"               -> adds a column, opens it for
 *                                            rename immediately
 *   - click a column's type badge        -> opens the type picker
 *
 * Card dragging is presentation only — it writes `position` and nothing
 * else. Columns and relationships are only ever changed by an explicit
 * add/edit/delete action, never inferred from where a card is dragged.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Button, Dropdown, Empty, Input, Popover, Select, Tooltip, Typography } from "antd";
import {
  AimOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  KeyOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import type { SchemaDoc, ColumnType, SchemaColumn, BuildTarget, Relationship, RollupSource } from "../types";
import { COLUMN_TYPES, columnTypeLabel, capabilityNote, targetLabel } from "../types";
import { uuid } from "@/lib/uuid";
import type { Action } from "../store";
import { useThemeMode } from "@/lib/theme";
import { buildCanvasModel, CARD_HEADER_H, CARD_WIDTH, ROW_H, tableColor, typeAccentColor, type TableCard } from "./model";
import { anchors, badgePoints, boundsOf, elbowPath, selfPath } from "./paths";

const { Text } = Typography;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const DRAG_THRESHOLD = 3;

interface Props {
  doc: SchemaDoc;
  dispatch: Dispatch<Action>;
}

interface DragState {
  kind: "pan" | "card";
  tableId?: string;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  startCardX: number;
  startCardY: number;
  moved: boolean;
}

/** In-progress relationship draw: from one column's connector dot, tracking
 *  the live cursor until it's dropped on another column's dot. */
interface ConnectDraft {
  fromTableId: string;
  fromColumnId: string;
  x: number;
  y: number;
}

export function SchemaCanvas({ doc, dispatch }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  const { cards, edges } = useMemo(() => buildCanvasModel(doc), [doc]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);
  const [editingColumn, setEditingColumn] = useState<{ tableId: string; columnId: string } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const posOf = useCallback(
    (card: TableCard): { x: number; y: number } =>
      dragPos[card.tableId] ??
      doc.tables.find((t) => t.id === card.tableId)?.position ?? { x: card.defaultX, y: card.defaultY },
    [dragPos, doc.tables],
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.tableId, c] as const)), [cards]);

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

  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || cards.length === 0) return;
    fittedRef.current = true;
    requestAnimationFrame(() => fitView());
  }, [cards.length, fitView]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY > 0 ? 0.92 : 1.08)));
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

  const stagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = frameRef.current!.getBoundingClientRect();
      return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // React's synthetic events bubble along the REACT tree, not the DOM
      // tree — a portaled overlay (antd Dropdown/Tooltip/Modal render into
      // document.body) is still a React "descendant" of this frame and its
      // clicks still reach this handler, even though target.closest() below
      // operates on the real DOM and finds none of this frame's own
      // data-* markers. Without this guard, a click on a portaled menu item
      // fell through to the "background" pan branch, which calls
      // setPointerCapture and steals the pointerup/click the menu item
      // needed to register its own selection — the type dropdown could
      // open and looked clickable, but no item selection ever landed.
      if (!frameRef.current?.contains(target)) return;
      const dot = target.closest("[data-connector]") as HTMLElement | null;
      const header = target.closest("[data-card-header]") as HTMLElement | null;

      if (dot) {
        const tableId = dot.getAttribute("data-connector-table")!;
        const columnId = dot.getAttribute("data-connector")!;
        const p = stagePoint(e.clientX, e.clientY);
        setConnectDraft({ fromTableId: tableId, fromColumnId: columnId, x: p.x, y: p.y });
        frameRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Any interactive control living inside the header (the kebab menu,
      // the delete button) needs to receive its own native click
      // uninterrupted — capturing the pointer here, as the drag-start below
      // does, steals the mouseup/click that follows. Dragging the card by
      // any OTHER part of the header still works, including the name text.
      if (target.closest("[data-no-drag]")) return;

      if (header) {
        const tableId = header.getAttribute("data-card-header")!;
        const card = cardById.get(tableId);
        if (!card) return;
        const p = posOf(card);
        dragRef.current = {
          kind: "card",
          tableId,
          startX: e.clientX,
          startY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          startCardX: p.x,
          startCardY: p.y,
          moved: false,
        };
        frameRef.current?.setPointerCapture(e.pointerId);
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
        frameRef.current?.setPointerCapture(e.pointerId);
      }
    },
    [cardById, pan, posOf, stagePoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (connectDraft) {
        const p = stagePoint(e.clientX, e.clientY);
        setConnectDraft((prev) => (prev ? { ...prev, x: p.x, y: p.y } : prev));
        return;
      }
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
      } else if (d.tableId) {
        setDragPos((prev) => ({
          ...prev,
          [d.tableId!]: { x: d.startCardX + dx / zoom, y: d.startCardY + dy / zoom },
        }));
      }
    },
    [connectDraft, stagePoint, zoom],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (connectDraft) {
        const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const dot = target?.closest("[data-connector]") as HTMLElement | null;
        if (dot) {
          const toTableId = dot.getAttribute("data-connector-table")!;
          const toColumnId = dot.getAttribute("data-connector")!;
          if (toColumnId !== connectDraft.fromColumnId || toTableId !== connectDraft.fromTableId) {
            dispatch({
              type: "ADD_RELATIONSHIP",
              fromTableId: connectDraft.fromTableId,
              fromColumnId: connectDraft.fromColumnId,
              toTableId,
              toColumnId,
              kind: "one-to-many",
            });
          }
        }
        setConnectDraft(null);
        if (frameRef.current?.hasPointerCapture(e.pointerId)) {
          frameRef.current.releasePointerCapture(e.pointerId);
        }
        return;
      }

      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (frameRef.current?.hasPointerCapture(e.pointerId)) {
        frameRef.current.releasePointerCapture(e.pointerId);
      }

      if (d.kind === "card" && d.tableId && d.moved) {
        const landed = dragPos[d.tableId];
        if (landed) {
          dispatch({ type: "SET_TABLE_POSITION", id: d.tableId, x: landed.x, y: landed.y });
          setDragPos((prev) => {
            const { [d.tableId!]: _done, ...rest } = prev;
            return rest;
          });
        }
      }
    },
    [connectDraft, dispatch, dragPos],
  );

  const handleAddTable = () => {
    dispatch({ type: "ADD_TABLE", name: `Table ${cards.length + 1}` });
  };

  const hasContent = cards.length > 0;

  return (
    <section className="sf-schema-page">
      <div className="sf-schema-toolbar">
        <div className="sf-schema-toolbar-left">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTable}>
            Add table
          </Button>
          <span className="sf-schema-building-for">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Building for
            </Text>
            <Select<BuildTarget | "undecided">
              size="small"
              value={doc.buildingFor ?? "undecided"}
              style={{ width: 110 }}
              onChange={(v) =>
                dispatch({ type: "SET_BUILDING_FOR", target: v === "undecided" ? undefined : v })
              }
              options={[
                { value: "undecided", label: "Undecided" },
                { value: "monday", label: "Monday" },
                { value: "airtable", label: "Airtable" },
                { value: "sql", label: "SQL" },
              ]}
            />
          </span>
        </div>
        <div className="sf-schema-toolbar-right">
          <Tooltip title="Zoom out">
            <Button icon={<ZoomOutOutlined />} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))} />
          </Tooltip>
          <Text type="secondary" style={{ fontSize: 13, minWidth: 40, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Text>
          <Tooltip title="Zoom in">
            <Button icon={<ZoomInOutlined />} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))} />
          </Tooltip>
          <Tooltip title="Fit on screen">
            <Button icon={<AimOutlined />} onClick={fitView} disabled={!hasContent} />
          </Tooltip>
        </div>
      </div>

      <div
        className="sf-schema-frame"
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {hasContent ? (
          <div
            className="sf-schema-stage"
            ref={stageRef}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <CanvasLines cards={cards} edges={edges} posOf={posOf} dispatch={dispatch} />
            {connectDraft && (
              <DraftLine cards={cards} posOf={posOf} draft={connectDraft} isDark={isDark} />
            )}
            {cards.map((card) => {
              const p = posOf(card);
              return (
                <TableCardView
                  key={card.tableId}
                  card={card}
                  x={p.x}
                  y={p.y}
                  dispatch={dispatch}
                  editingColumn={editingColumn}
                  setEditingColumn={setEditingColumn}
                  buildingFor={doc.buildingFor}
                  tables={doc.tables}
                  relationships={doc.relationships}
                />
              );
            })}
          </div>
        ) : (
          <div className="sf-schema-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Add a table to get started."
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ── Draft connection line, following the cursor ─────────────────────

function DraftLine({
  cards,
  posOf,
  draft,
  isDark,
}: {
  cards: TableCard[];
  posOf: (card: TableCard) => { x: number; y: number };
  draft: ConnectDraft;
  isDark: boolean;
}) {
  const fromCard = cards.find((c) => c.tableId === draft.fromTableId);
  const fromRow = fromCard?.rows.find((r) => r.id === draft.fromColumnId);
  if (!fromCard || !fromRow) return null;
  const fromPos = posOf(fromCard);
  const startX = fromPos.x + CARD_WIDTH;
  const startY = fromPos.y + fromRow.anchorY;

  return (
    <svg className="sf-schema-lines" aria-hidden="true">
      <path
        d={`M ${startX} ${startY} L ${draft.x} ${draft.y}`}
        fill="none"
        stroke={isDark ? "#8fb3d9" : "#3b6ea5"}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    </svg>
  );
}

// ── Relationship lines ───────────────────────────────────────────────

function CanvasLines({
  cards,
  edges,
  posOf,
  dispatch,
}: {
  cards: TableCard[];
  edges: ReturnType<typeof buildCanvasModel>["edges"];
  posOf: (card: TableCard) => { x: number; y: number };
  dispatch: Dispatch<Action>;
}) {
  const cardById = useMemo(() => new Map(cards.map((c) => [c.tableId, c] as const)), [cards]);

  return (
    <svg className="sf-schema-lines" aria-hidden="true">
      {edges.map((edge) => {
        const fromCard = cardById.get(edge.fromTableId);
        const toCard = cardById.get(edge.toTableId);
        if (!fromCard || !toCard) return null;
        const fromRow = fromCard.rows.find((r) => r.id === edge.fromColumnId);
        const toRow = toCard.rows.find((r) => r.id === edge.toColumnId);
        if (!fromRow || !toRow) return null;

        const fromPos = posOf(fromCard);
        const toPos = posOf(toCard);

        let d: string;
        let start: { x: number; y: number };
        let end: { x: number; y: number };
        if (edge.sameTable) {
          start = { x: fromPos.x + CARD_WIDTH, y: fromPos.y + fromRow.anchorY };
          end = { x: toPos.x + CARD_WIDTH, y: toPos.y + toRow.anchorY };
          d = selfPath(fromPos.x + CARD_WIDTH, fromPos.y + fromRow.anchorY, toPos.y + toRow.anchorY);
        } else {
          const a = anchors(
            { ...fromPos, height: fromCard.height },
            fromRow.anchorY,
            { ...toPos, height: toCard.height },
            toRow.anchorY,
          );
          start = a.start;
          end = a.end;
          d = elbowPath(a.start.x, a.start.y, a.end.x, a.end.y);
        }

        const { near, far } = badgePoints(start, end);
        const fromMark = edge.relationship.kind === "many-to-many" ? "n" : "1";
        const toMark = edge.relationship.kind === "one-to-one" ? "1" : "n";

        return (
          <g key={edge.id}>
            <path d={d} fill="none" stroke={edge.color} strokeWidth={1.8} opacity={0.85} />
            <RelBadge point={near} label={fromMark} color={edge.color} />
            <RelBadge point={far} label={toMark} color={edge.color} />
            <foreignObject x={(start.x + end.x) / 2 - 10} y={(start.y + end.y) / 2 - 18} width={20} height={20}>
              <button
                type="button"
                className="sf-schema-rel-delete"
                onClick={() => dispatch({ type: "DELETE_RELATIONSHIP", id: edge.id })}
                aria-label="Delete relationship"
                title="Delete relationship"
              >
                <DeleteOutlined style={{ fontSize: 11 }} />
              </button>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function RelBadge({ point, label, color }: { point: { x: number; y: number }; label: string; color: string }) {
  return (
    <g>
      <circle cx={point.x} cy={point.y} r={8} fill={color} />
      <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#fff" fontWeight={700}>
        {label}
      </text>
    </g>
  );
}

// ── Table card ────────────────────────────────────────────────────────

function TableCardView({
  card,
  x,
  y,
  dispatch,
  editingColumn,
  setEditingColumn,
  buildingFor,
  tables,
  relationships,
}: {
  card: TableCard;
  x: number;
  y: number;
  dispatch: Dispatch<Action>;
  editingColumn: { tableId: string; columnId: string } | null;
  setEditingColumn: (v: { tableId: string; columnId: string } | null) => void;
  buildingFor: BuildTarget | undefined;
  tables: SchemaDoc["tables"];
  relationships: SchemaDoc["relationships"];
}) {
  const [nameDraft, setNameDraft] = useState(card.name);
  const [renamingTable, setRenamingTable] = useState(false);

  return (
    <div
      data-card={card.tableId}
      className="sf-schema-card"
      style={{ left: x, top: y, width: CARD_WIDTH, height: card.height }}
    >
      <div
        data-card-header={card.tableId}
        className="sf-schema-card-head"
        style={{ height: CARD_HEADER_H, background: card.color }}
      >
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [{ key: "rename", label: "Rename", icon: <EditOutlined /> }],
            onClick: ({ key }) => {
              if (key === "rename") {
                setNameDraft(card.name);
                setRenamingTable(true);
              }
            },
          }}
        >
          <button
            type="button"
            className="sf-schema-card-menu"
            data-no-drag
            aria-label={`${card.name} options`}
            title="Table options"
          >
            <MoreOutlined style={{ fontSize: 13 }} />
          </button>
        </Dropdown>
        {renamingTable ? (
          <Input
            size="small"
            autoFocus
            data-no-drag
            onFocus={(e) => e.currentTarget.select()}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onPressEnter={() => {
              dispatch({ type: "RENAME_TABLE", id: card.tableId, name: nameDraft });
              setRenamingTable(false);
            }}
            onBlur={() => {
              dispatch({ type: "RENAME_TABLE", id: card.tableId, name: nameDraft });
              setRenamingTable(false);
            }}
          />
        ) : (
          // Rename lives in the kebab menu now (Ruthnie's request,
          // 2026-09-03) — double-click was dropped because exempting this
          // span from pointer-capture (data-card-name, in onPointerDown
          // below) also broke dragging the card by clicking near its name,
          // which reads as "the header doesn't grab here" more often than
          // it reads as a rename affordance. The kebab is the only path now.
          <span className="sf-schema-card-name">{card.name}</span>
        )}
        <button
          type="button"
          className="sf-schema-card-delete"
          data-no-drag
          onClick={() => dispatch({ type: "DELETE_TABLE", id: card.tableId })}
          aria-label={`Delete ${card.name}`}
          title="Delete table"
        >
          <DeleteOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

      {card.rows.map((row) => (
        <ColumnRowView
          key={row.id}
          tableId={card.tableId}
          column={row.column}
          isEditing={editingColumn?.tableId === card.tableId && editingColumn?.columnId === row.id}
          onStartEdit={() => setEditingColumn({ tableId: card.tableId, columnId: row.id })}
          onStopEdit={() => setEditingColumn(null)}
          dispatch={dispatch}
          buildingFor={buildingFor}
          tables={tables}
          relationships={relationships}
        />
      ))}

      <button
        type="button"
        className="sf-schema-add-column"
        style={{ height: ROW_H }}
        onClick={() => dispatch({ type: "ADD_COLUMN", tableId: card.tableId, name: "New column" })}
      >
        <PlusOutlined style={{ fontSize: 11 }} /> Add column
      </button>
    </div>
  );
}

function ColumnRowView({
  tableId,
  column,
  isEditing,
  onStartEdit,
  onStopEdit,
  dispatch,
  buildingFor,
  tables,
  relationships,
}: {
  tableId: string;
  column: SchemaColumn;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  dispatch: Dispatch<Action>;
  buildingFor: BuildTarget | undefined;
  tables: SchemaDoc["tables"];
  relationships: SchemaDoc["relationships"];
}) {
  const [nameDraft, setNameDraft] = useState(column.name);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);

  const commitName = () => {
    dispatch({ type: "RENAME_COLUMN", tableId, columnId: column.id, name: nameDraft });
    onStopEdit();
  };

  // Every type menu item shows its neutral label plus, once a target is set,
  // that target's own name and — when one exists — a capability warning.
  // Surfaced HERE, at the moment of picking, never backloaded to an export
  // report — see docs/SCHEMA-DESIGNER-PLAN.md §4.0.
  const typeMenuItems = COLUMN_TYPES.map((t) => {
    const targetName = buildingFor ? targetLabel(t.type, buildingFor) : undefined;
    const note = buildingFor ? capabilityNote(t.type, buildingFor) : undefined;
    return {
      key: t.type,
      label: (
        <span className="sf-schema-type-menu-item">
          <span>{t.label}</span>
          {targetName && targetName !== t.label && (
            <span className="sf-schema-type-menu-target">→ {targetName}</span>
          )}
          {note && <ExclamationCircleOutlined className="sf-schema-type-menu-warn" title={note} />}
        </span>
      ),
    };
  });

  const activeNote = buildingFor ? capabilityNote(column.type, buildingFor) : undefined;
  const activeTargetName = buildingFor ? targetLabel(column.type, buildingFor) : undefined;
  const showOptionsEditor = column.type === "select" || column.type === "multi-select";
  const showSourceEditor = column.type === "rollup" || column.type === "lookup";
  const showRelationEditor = column.type === "relation";

  return (
    <div className="sf-schema-row" style={{ height: ROW_H }}>
      <span
        className="sf-schema-row-dot"
        data-connector={column.id}
        data-connector-table={tableId}
        title="Drag to another column to connect"
      />
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            {
              key: "primaryKey",
              label: "Primary key",
              icon: column.primaryKey ? <CheckOutlined /> : undefined,
            },
            {
              key: "required",
              label: "Required",
              icon: column.required ? <CheckOutlined /> : undefined,
            },
            {
              key: "unique",
              label: "Unique",
              icon: column.unique ? <CheckOutlined /> : undefined,
            },
          ],
          // Each click toggles just that one flag — a checkable menu, not a
          // radio group, since a column can be any combination of the three.
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            if (key === "primaryKey") {
              dispatch({ type: "SET_COLUMN_FLAGS", tableId, columnId: column.id, primaryKey: !column.primaryKey });
            } else if (key === "required") {
              dispatch({ type: "SET_COLUMN_FLAGS", tableId, columnId: column.id, required: !column.required });
            } else if (key === "unique") {
              dispatch({ type: "SET_COLUMN_FLAGS", tableId, columnId: column.id, unique: !column.unique });
            }
          },
        }}
      >
        <button
          type="button"
          className="sf-schema-row-flags-btn"
          data-no-drag
          title="Primary key / required / unique"
          aria-label={`Flags for ${column.name}`}
        >
          <KeyOutlined
            className={column.primaryKey ? "sf-schema-row-key is-set" : "sf-schema-row-key"}
          />
        </button>
      </Dropdown>

      {isEditing ? (
        <Input
          size="small"
          autoFocus
          // Select-all on mount, not just focus: a double-click-to-rename
          // convention means the first keystroke should REPLACE the old
          // name, not insert into it at wherever the cursor happened to
          // land — antd's autoFocus alone focuses but doesn't select.
          onFocus={(e) => e.currentTarget.select()}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onPressEnter={commitName}
          onBlur={commitName}
          className="sf-schema-row-name-input"
        />
      ) : (
        <span className="sf-schema-row-name" onDoubleClick={onStartEdit} title="Double-click to rename">
          {column.name}
        </span>
      )}

      {showOptionsEditor && (
        <Popover
          trigger="click"
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          placement="right"
          // A plain absolutely-positioned div, tried first, gets clipped by
          // .sf-schema-card's own `overflow: hidden` (needed to keep the
          // "Add column" row and the card's rounded corners contained) — the
          // popover rendered in the DOM but was invisible. antd's Popover
          // portals to document.body like its Dropdown already does
          // elsewhere in this file, which escapes the clip entirely.
          content={
            <ColumnOptionsEditor
              tableId={tableId}
              column={column}
              dispatch={dispatch}
              onClose={() => setOptionsOpen(false)}
            />
          }
        >
          <button
            type="button"
            className="sf-schema-row-options-btn"
            data-no-drag
            title="Edit options"
            aria-label={`Edit options for ${column.name}`}
          >
            <EditOutlined style={{ fontSize: 10 }} />
          </button>
        </Popover>
      )}

      {showSourceEditor && (
        <Popover
          trigger="click"
          open={sourceOpen}
          onOpenChange={setSourceOpen}
          placement="right"
          content={
            <RollupSourceEditor
              tableId={tableId}
              column={column}
              tables={tables}
              relationships={relationships}
              dispatch={dispatch}
              onClose={() => setSourceOpen(false)}
            />
          }
        >
          <button
            type="button"
            className="sf-schema-row-options-btn"
            data-no-drag
            title={column.rollupSource ? "Change source" : "Set source"}
            aria-label={`Set source for ${column.name}`}
          >
            <LinkOutlined style={{ fontSize: 10 }} />
          </button>
        </Popover>
      )}

      {showRelationEditor && (
        <Popover
          trigger="click"
          open={relationOpen}
          onOpenChange={setRelationOpen}
          placement="right"
          content={
            <RelationTargetEditor
              tableId={tableId}
              column={column}
              tables={tables}
              relationships={relationships}
              dispatch={dispatch}
              onClose={() => setRelationOpen(false)}
            />
          }
        >
          <button
            type="button"
            className="sf-schema-row-options-btn"
            data-no-drag
            title="Relates to..."
            aria-label={`Set what ${column.name} relates to`}
          >
            <LinkOutlined style={{ fontSize: 10 }} />
          </button>
        </Popover>
      )}

      {activeNote && (
        <Tooltip title={activeNote}>
          <ExclamationCircleOutlined className="sf-schema-row-warn" data-no-drag />
        </Tooltip>
      )}

      <Dropdown
        menu={{
          items: typeMenuItems,
          onClick: ({ key }) =>
            dispatch({ type: "SET_COLUMN_TYPE", tableId, columnId: column.id, columnType: key as ColumnType }),
        }}
        trigger={["click"]}
      >
        <button
          type="button"
          className="sf-schema-row-type"
          data-no-drag
          style={{ color: typeAccentColor(column) }}
          // Once a target is set, its own name for this type IS the badge —
          // not a tooltip on top of the neutral label. Ruthnie's correction,
          // 2026-09-03: "it shouldn't just have a tooltip... it should
          // change to linked record." The neutral label still surfaces in
          // the type picker's menu (where the mapping itself is being
          // shown), just not as the persistent on-canvas text once a
          // target is chosen.
          title={activeTargetName && activeTargetName !== columnTypeLabel(column.type) ? columnTypeLabel(column.type) : undefined}
        >
          {activeTargetName ?? columnTypeLabel(column.type)}
        </button>
      </Dropdown>

      <button
        type="button"
        className="sf-schema-row-delete"
        data-no-drag
        onClick={() => dispatch({ type: "DELETE_COLUMN", tableId, columnId: column.id })}
        aria-label={`Delete ${column.name}`}
      >
        <DeleteOutlined style={{ fontSize: 10 }} />
      </button>
    </div>
  );
}

// ── Select/multi-select options editor ──────────────────────────────

function ColumnOptionsEditor({
  tableId,
  column,
  dispatch,
  onClose,
}: {
  tableId: string;
  column: SchemaColumn;
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(column.options ?? []);
  const [newLabel, setNewLabel] = useState("");

  const commit = (next: typeof draft) => {
    setDraft(next);
    dispatch({ type: "SET_COLUMN_OPTIONS", tableId, columnId: column.id, options: next });
  };

  const addOption = () => {
    const label = newLabel.trim();
    if (!label) return;
    commit([...draft, { id: uuid(), label }]);
    setNewLabel("");
  };

  return (
    <div className="sf-schema-options-content" data-no-drag data-card>
      <div className="sf-schema-options-head">
        <Text strong style={{ fontSize: 12 }}>
          Options for {column.name}
        </Text>
        <button type="button" className="sf-schema-options-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="sf-schema-options-list">
        {draft.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            No options yet.
          </Text>
        )}
        {draft.map((opt) => (
          <div key={opt.id} className="sf-schema-option-row">
            <Input
              size="small"
              value={opt.label}
              onChange={(e) =>
                commit(draft.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)))
              }
            />
            <button
              type="button"
              className="sf-schema-row-delete"
              onClick={() => commit(draft.filter((o) => o.id !== opt.id))}
              aria-label={`Remove ${opt.label}`}
            >
              <DeleteOutlined style={{ fontSize: 10 }} />
            </button>
          </div>
        ))}
      </div>
      <div className="sf-schema-option-add">
        <Input
          size="small"
          placeholder="Add option"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onPressEnter={addOption}
        />
        <Button size="small" onClick={addOption}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ── Rollup/lookup source picker ─────────────────────────────────────

const AGGREGATE_OPTIONS: { value: NonNullable<RollupSource["aggregate"]>; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "count", label: "Count" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

/**
 * Picks which relationship a Rollup/Lookup column reads through, then which
 * column on the far side of that relationship, then (Rollup only) which
 * aggregate to apply. Only offers relationships this table is actually a
 * party to — a rollup/lookup on a table that isn't connected to anything
 * yet has nothing to pick from, which the empty state below says plainly
 * rather than showing a picker with nothing in it.
 */
function RollupSourceEditor({
  tableId,
  column,
  tables,
  relationships,
  dispatch,
  onClose,
}: {
  tableId: string;
  column: SchemaColumn;
  tables: SchemaDoc["tables"];
  relationships: SchemaDoc["relationships"];
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t] as const)), [tables]);

  // A relationship this table is on EITHER end of — "the far side" is
  // whichever end isn't this table (or the other column, for a same-table
  // relationship, since fromTableId === toTableId is a real, allowed case).
  const relevantRelationships = useMemo(
    () => relationships.filter((r) => r.fromTableId === tableId || r.toTableId === tableId),
    [relationships, tableId],
  );

  const farSide = (r: Relationship): { tableId: string; columnId: string } =>
    r.fromTableId === tableId && r.fromColumnId !== column.id
      ? { tableId: r.toTableId, columnId: r.toColumnId }
      : { tableId: r.fromTableId, columnId: r.fromColumnId };

  const selectedRelationship = relationships.find((r) => r.id === column.rollupSource?.relationshipId);
  const selectedFarTable = selectedRelationship ? tableById.get(farSide(selectedRelationship).tableId) : undefined;

  const setRelationship = (relationshipId: string) => {
    const r = relationships.find((rel) => rel.id === relationshipId);
    if (!r) return;
    dispatch({
      type: "SET_COLUMN_ROLLUP_SOURCE",
      tableId,
      columnId: column.id,
      rollupSource: { relationshipId, sourceColumnId: farSide(r).columnId },
    });
  };

  const setSourceColumn = (sourceColumnId: string) => {
    if (!column.rollupSource) return;
    dispatch({
      type: "SET_COLUMN_ROLLUP_SOURCE",
      tableId,
      columnId: column.id,
      rollupSource: { ...column.rollupSource, sourceColumnId },
    });
  };

  const setAggregate = (aggregate: RollupSource["aggregate"]) => {
    if (!column.rollupSource) return;
    dispatch({
      type: "SET_COLUMN_ROLLUP_SOURCE",
      tableId,
      columnId: column.id,
      rollupSource: { ...column.rollupSource, aggregate },
    });
  };

  return (
    <div className="sf-schema-options-content" data-no-drag data-card>
      <div className="sf-schema-options-head">
        <Text strong style={{ fontSize: 12 }}>
          Source for {column.name}
        </Text>
        <button type="button" className="sf-schema-options-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {relevantRelationships.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          This table has no relationships yet. Drag from a column's connector
          dot to another table's column to create one first.
        </Text>
      ) : (
        <>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Through relationship
          </Text>
          <Select
            size="small"
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Pick a relationship"
            value={column.rollupSource?.relationshipId}
            onChange={setRelationship}
            options={relevantRelationships.map((r) => {
              const far = tableById.get(farSide(r).tableId);
              return { value: r.id, label: far ? far.name : "Unknown table" };
            })}
          />

          {selectedRelationship && selectedFarTable && (
            <>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Field on {selectedFarTable.name}
              </Text>
              <Select
                size="small"
                style={{ width: "100%", marginBottom: column.type === "rollup" ? 8 : 0 }}
                placeholder="Pick a column"
                value={column.rollupSource?.sourceColumnId}
                onChange={setSourceColumn}
                options={selectedFarTable.columns.map((c) => ({ value: c.id, label: c.name }))}
              />
            </>
          )}

          {column.type === "rollup" && selectedRelationship && (
            <>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Aggregate
              </Text>
              <Select
                size="small"
                style={{ width: "100%" }}
                placeholder="Pick an aggregate"
                value={column.rollupSource?.aggregate}
                onChange={setAggregate}
                options={AGGREGATE_OPTIONS}
                allowClear
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Relation column target picker ───────────────────────────────────

/**
 * Explicit table+column picker for a Relation column — an alternative to
 * the drag-a-connector-dot gesture, for when you already know exactly what
 * you want to point at and dragging across a crowded canvas is more
 * friction than it's worth. Ruthnie's request, 2026-09-03: "we can't really
 * say relation to what table on what field."
 *
 * If this column already has a relationship (from either dragging or a
 * prior use of this picker), editing the target here updates that SAME
 * relationship rather than creating a second one — a relation column has
 * at most one relationship of its own, so "change the target" should never
 * silently accumulate duplicates.
 */
function RelationTargetEditor({
  tableId,
  column,
  tables,
  relationships,
  dispatch,
  onClose,
}: {
  tableId: string;
  column: SchemaColumn;
  tables: SchemaDoc["tables"];
  relationships: SchemaDoc["relationships"];
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const existing = relationships.find(
    (r) => (r.fromTableId === tableId && r.fromColumnId === column.id) ||
      (r.toTableId === tableId && r.toColumnId === column.id),
  );
  const isFromSide = existing ? existing.fromTableId === tableId && existing.fromColumnId === column.id : true;
  const currentTargetTableId = existing ? (isFromSide ? existing.toTableId : existing.fromTableId) : undefined;
  const currentTargetColumnId = existing ? (isFromSide ? existing.toColumnId : existing.fromColumnId) : undefined;

  const [targetTableId, setTargetTableId] = useState<string | undefined>(currentTargetTableId);

  // Every table, including this one — a same-table relationship is a real,
  // allowed case (see CanvasEdge.sameTable in canvas/model.ts).
  const targetTable = tables.find((t) => t.id === targetTableId);

  const applyTarget = (toTableId: string, toColumnId: string) => {
    if (existing) {
      dispatch({ type: "DELETE_RELATIONSHIP", id: existing.id });
    }
    dispatch({
      type: "ADD_RELATIONSHIP",
      fromTableId: tableId,
      fromColumnId: column.id,
      toTableId,
      toColumnId,
      kind: existing?.kind ?? "one-to-many",
    });
  };

  return (
    <div className="sf-schema-options-content" data-no-drag data-card>
      <div className="sf-schema-options-head">
        <Text strong style={{ fontSize: 12 }}>
          {column.name} relates to
        </Text>
        <button type="button" className="sf-schema-options-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <Text type="secondary" style={{ fontSize: 11 }}>
        Table
      </Text>
      <Select
        size="small"
        style={{ width: "100%", marginBottom: 8 }}
        placeholder="Pick a table"
        value={targetTableId}
        onChange={(v) => setTargetTableId(v)}
        options={tables.map((t) => ({ value: t.id, label: t.name }))}
      />

      {targetTable && (
        <>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Column on {targetTable.name}
          </Text>
          <Select
            size="small"
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Pick a column"
            value={targetTableId === currentTargetTableId ? currentTargetColumnId : undefined}
            onChange={(columnId) => applyTarget(targetTable.id, columnId)}
            options={targetTable.columns
              .filter((c) => c.id !== column.id)
              .map((c) => ({ value: c.id, label: c.name }))}
          />
        </>
      )}

      {existing && (
        <>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Relationship kind
          </Text>
          <Select
            size="small"
            style={{ width: "100%" }}
            value={existing.kind}
            onChange={(kind) => dispatch({ type: "SET_RELATIONSHIP_KIND", id: existing.id, kind })}
            options={[
              { value: "one-to-one", label: "One to one" },
              { value: "one-to-many", label: "One to many" },
              { value: "many-to-many", label: "Many to many" },
            ]}
          />
        </>
      )}
    </div>
  );
}
