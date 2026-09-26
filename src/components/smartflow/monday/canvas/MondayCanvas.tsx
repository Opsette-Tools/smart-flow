/**
 * The Monday board designer canvas.
 *
 * Forked from ../../schema/canvas/SchemaCanvas.tsx: the pan/zoom/drag
 * pointer math below is a direct port of that file's proven engine, which is
 * itself a port of the schema map's. What is NEW is everything about what a
 * card shows and what a link means — see
 * docs/MONDAY-BOARD-DESIGNER-PLAN.md §6:
 *
 *   - a board card carries a GROUP CHIP ROW in its header (groups are
 *     structure, but they are not columns and must not read as columns)
 *   - it carries up to TWO column bands, and the subitem band is visually
 *     distinct — tinted and inset under a labelled divider. A board's
 *     subitem column set being a SEPARATE schema is the single most
 *     misunderstood thing about Monday, so the card says so at a glance.
 *   - a Connect column draws the edge, anchored at its own ROW, and points
 *     at a whole BOARD (not at a column on the far side — a Connect is not
 *     a foreign key)
 *   - a Mirror is NESTED under the Connect it rides — moved up to sit
 *     directly beneath it and indented, so the dependency is permanent and
 *     needs no hover. Its badge still opens the full detail (which board,
 *     which column) plus the capability note. An earlier pass drew this as
 *     a hairline between the two rows and was removed: by the time they
 *     render the rows are adjacent, so the line had no distance to cross.
 *
 * The Mirror editor ENFORCES rather than warns (§4): with no Connect column
 * on the board the option is unavailable with a plain sentence saying why,
 * and the source picker only ever offers columns from the board that Connect
 * actually reaches. Authoring a Mirror Monday could not hold is structurally
 * impossible, not merely discouraged.
 *
 * Card dragging is presentation only — it writes `position` and nothing
 * else. Which boards, groups and columns exist is only ever changed by an
 * explicit add/edit/delete action.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Button, Dropdown, Empty, Input, Popover, Select, Tooltip, Typography } from "antd";
import {
  AimOutlined,
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import type { ColumnType } from "../../schema/types";
import type { MondayBoard, MondayColumn, MondayDoc } from "../types";
import { MIRROR_NOTE, MONDAY_COLUMN_TYPES, MONDAY_GROUP_COLORS } from "../types";
import type { Action, ColumnSet } from "../store";
import { columnsIn, connectColumnsIn, mirrorTargetBoard } from "../store";
import { useThemeMode } from "@/lib/theme";
import {
  buildCanvasModel,
  orderedColumns,
  BAND_LABEL_H,
  CARD_HEADER_H,
  CARD_WIDTH,
  ADD_ROW_H,
  GROUP_ROW_H,
  ROW_H,
  findRow,
  rowAccentColor,
  type BoardCard,
} from "./model";
import { anchors, boundsOf, elbowPath, selfPath } from "./paths";

const { Text } = Typography;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const DRAG_THRESHOLD = 3;

interface Props {
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
}

interface DragState {
  kind: "pan" | "card";
  boardId?: string;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  startCardX: number;
  startCardY: number;
  moved: boolean;
}

export function MondayCanvas({ doc, dispatch }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  const { cards, edges } = useMemo(() => buildCanvasModel(doc), [doc]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [editingColumn, setEditingColumn] = useState<{ boardId: string; set: ColumnSet; columnId: string } | null>(
    null,
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const posOf = useCallback(
    (card: BoardCard): { x: number; y: number } =>
      dragPos[card.boardId] ??
      doc.boards.find((b) => b.id === card.boardId)?.position ?? { x: card.defaultX, y: card.defaultY },
    [dragPos, doc.boards],
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.boardId, c] as const)), [cards]);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // React's synthetic events bubble along the REACT tree, not the DOM
      // tree — a portaled antd overlay (Dropdown/Popover/Select) is still a
      // React descendant of this frame, so its clicks reach this handler
      // even though target.closest() finds none of this frame's markers.
      // Without this guard, clicking a portaled menu item falls through to
      // the pan branch, which captures the pointer and steals the click the
      // menu item needed. This was a real, already-fixed bug on the schema
      // canvas — see SchemaCanvas.onPointerDown.
      if (!frameRef.current?.contains(target)) return;
      const header = target.closest("[data-card-header]") as HTMLElement | null;

      // Anything interactive inside the header (kebab, delete) must receive
      // its own native click uninterrupted — capturing the pointer here
      // would steal the mouseup that follows.
      if (target.closest("[data-no-drag]")) return;

      if (header) {
        const boardId = header.getAttribute("data-card-header")!;
        const card = cardById.get(boardId);
        if (!card) return;
        const p = posOf(card);
        dragRef.current = {
          kind: "card",
          boardId,
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
      } else if (d.boardId) {
        setDragPos((prev) => ({
          ...prev,
          [d.boardId!]: { x: d.startCardX + dx / zoom, y: d.startCardY + dy / zoom },
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

      if (d.kind === "card" && d.boardId && d.moved) {
        const landed = dragPos[d.boardId];
        if (landed) {
          dispatch({ type: "SET_BOARD_POSITION", id: d.boardId, x: landed.x, y: landed.y });
          setDragPos((prev) => {
            const { [d.boardId!]: _done, ...rest } = prev;
            return rest;
          });
        }
      }
    },
    [dispatch, dragPos],
  );

  const hasContent = cards.length > 0;

  return (
    <section className="sf-monday-page">
      <div className="sf-schema-toolbar">
        <div className="sf-schema-toolbar-left">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => dispatch({ type: "ADD_BOARD", name: `Board ${cards.length + 1}` })}
          >
            Add board
          </Button>
          <span className="sf-schema-building-for">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Workspace
            </Text>
            <Input
              size="small"
              style={{ width: 180 }}
              placeholder="Name it (optional)"
              value={doc.workspaceName ?? ""}
              onChange={(e) => dispatch({ type: "SET_WORKSPACE_NAME", name: e.target.value })}
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
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <CanvasLines cards={cards} edges={edges} posOf={posOf} />
            {cards.map((card) => {
              const board = doc.boards.find((b) => b.id === card.boardId);
              if (!board) return null;
              const p = posOf(card);
              return (
                <BoardCardView
                  key={card.boardId}
                  card={card}
                  board={board}
                  doc={doc}
                  x={p.x}
                  y={p.y}
                  dispatch={dispatch}
                  editingColumn={editingColumn}
                  setEditingColumn={setEditingColumn}
                />
              );
            })}
          </div>
        ) : (
          <div className="sf-schema-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Add a board to get started." />
          </div>
        )}
      </div>
    </section>
  );
}

// ── Connect edges and mirror hairlines ───────────────────────────────

function CanvasLines({
  cards,
  edges,
  posOf,
}: {
  cards: BoardCard[];
  edges: ReturnType<typeof buildCanvasModel>["edges"];
  posOf: (card: BoardCard) => { x: number; y: number };
}) {
  const cardById = useMemo(() => new Map(cards.map((c) => [c.boardId, c] as const)), [cards]);

  return (
    <svg className="sf-schema-lines" aria-hidden="true">
      {edges.map((edge) => {
        const fromCard = cardById.get(edge.fromBoardId);
        const toCard = cardById.get(edge.toBoardId);
        if (!fromCard || !toCard) return null;
        const fromRow = findRow(fromCard, edge.fromColumnId);
        if (!fromRow) return null;
        const fromPos = posOf(fromCard);
        const toPos = posOf(toCard);

        if (edge.selfLink) {
          return (
            <path
              key={edge.id}
              d={selfPath(fromPos.x + CARD_WIDTH, fromPos.y + fromRow.anchorY, fromCard.height)}
              fill="none"
              stroke={edge.color}
              strokeWidth={1.75}
              opacity={0.85}
            />
          );
        }

        // A Connect points at a whole board, so the far end anchors at the
        // TARGET CARD's vertical centre rather than at a row — there is no
        // column on the other side for it to name (§2).
        const { start, end } = anchors(
          { ...fromPos, height: fromCard.height },
          fromRow.anchorY,
          { ...toPos, height: toCard.height },
          toCard.height / 2,
        );
        return (
          <g key={edge.id}>
            <path
              d={elbowPath(start.x, start.y, end.x, end.y)}
              fill="none"
              stroke={edge.color}
              strokeWidth={1.75}
              opacity={0.85}
            />
            <circle cx={end.x} cy={end.y} r={3.5} fill={edge.color} />
          </g>
        );
      })}

    </svg>
  );
}

// ── One board card ───────────────────────────────────────────────────

function BoardCardView({
  card,
  board,
  doc,
  x,
  y,
  dispatch,
  editingColumn,
  setEditingColumn,
}: {
  card: BoardCard;
  board: MondayBoard;
  doc: MondayDoc;
  x: number;
  y: number;
  dispatch: Dispatch<Action>;
  editingColumn: { boardId: string; set: ColumnSet; columnId: string } | null;
  setEditingColumn: (v: { boardId: string; set: ColumnSet; columnId: string } | null) => void;
}) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [nameDraft, setNameDraft] = useState(board.name);

  const submitGroup = () => {
    const name = groupDraft.trim();
    if (name) dispatch({ type: "ADD_GROUP", boardId: board.id, name });
    setGroupDraft("");
    setAddingGroup(false);
  };

  const submitRename = () => {
    const name = nameDraft.trim();
    if (name && name !== board.name) dispatch({ type: "RENAME_BOARD", id: board.id, name });
    setRenamingBoard(false);
  };

  return (
    <div
      className="sf-schema-card"
      data-card={board.id}
      style={{ left: x, top: y, width: CARD_WIDTH, height: card.height }}
    >
      <div
        className="sf-schema-card-head"
        data-card-header={board.id}
        style={{ background: card.color, height: CARD_HEADER_H }}
      >
        {renamingBoard ? (
          <Input
            size="small"
            autoFocus
            data-no-drag
            className="sf-monday-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onPressEnter={submitRename}
            onBlur={submitRename}
            maxLength={60}
          />
        ) : (
          <span
            className="sf-schema-card-name"
            onDoubleClick={() => {
              setNameDraft(board.name);
              setRenamingBoard(true);
            }}
            title="Double-click to rename"
          >
            {board.name}
          </span>
        )}
        {/* Adding a group or a subitem set now has its own affordance on the
            card, so the kebab carries only what has nowhere else to live:
            renaming, removing the subitem set, and deleting the board. */}
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "rename", label: "Rename board", icon: <EditOutlined /> },
              ...(board.subitemColumns
                ? [{ key: "nosub", label: "Remove subitem columns", icon: <DeleteOutlined /> }]
                : []),
              { type: "divider" as const },
              { key: "delete", label: "Delete board", icon: <DeleteOutlined />, danger: true },
            ],
            onClick: ({ key }) => {
              if (key === "rename") setRenamingBoard(true);
              if (key === "nosub") dispatch({ type: "REMOVE_SUBITEMS", boardId: board.id });
              if (key === "delete") dispatch({ type: "DELETE_BOARD", id: board.id });
            },
          }}
        >
          <button
            type="button"
            className="sf-schema-card-menu"
            data-no-drag
            aria-label={`Actions for ${board.name}`}
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>

      {/* Groups render as a chip row, never as rows: they are structure, but
          they are not columns and must not read as columns (§6).
          ALWAYS rendered, even with no groups yet — a Group is one of the
          four structural nouns this designer exists to model (§2), and
          hiding it behind the kebab until one exists made a new board look
          like a plain table with no way to discover the feature. The empty
          state is a quiet "+ Group" affordance, not a blank row. */}
      <div className="sf-monday-band-label" style={{ height: BAND_LABEL_H }}>
        Groups
      </div>
      <div className="sf-monday-groups" style={{ minHeight: GROUP_ROW_H }}>
        {board.groups.map((group) => (
          <GroupChip key={group.id} boardId={board.id} group={group} dispatch={dispatch} />
        ))}
        {addingGroup ? (
          <Input
            size="small"
            autoFocus
            className="sf-monday-group-input"
            value={groupDraft}
            placeholder="Group name"
            onChange={(e) => setGroupDraft(e.target.value)}
            onPressEnter={submitGroup}
            onBlur={submitGroup}
          />
        ) : (
          <button
            type="button"
            className="sf-monday-group-add"
            data-no-drag
            onClick={() => setAddingGroup(true)}
          >
            <PlusOutlined /> Group
          </button>
        )}
      </div>

      <ColumnBand
        label="Item columns"
        set="item"
        board={board}
        doc={doc}
        columns={board.columns}
        dispatch={dispatch}
        editingColumn={editingColumn}
        setEditingColumn={setEditingColumn}
      />

      {/* Sits AFTER the item band, in the slot the subitem band itself will
          occupy — a subitem set is a second schema BELOW the item one, and a
          control that offers it has to appear where the thing it creates
          will land. (It rendered above ITEM COLUMNS at first, which read as
          though subitems came before items.) */}
      {!board.subitemColumns && (
        <button
          type="button"
          className="sf-monday-add-subitems"
          data-no-drag
          style={{ height: ADD_ROW_H }}
          onClick={() => dispatch({ type: "ADD_SUBITEMS", boardId: board.id })}
        >
          <PlusOutlined style={{ fontSize: 11 }} /> Add subitem columns
        </button>
      )}

      {board.subitemColumns && (
        <div className="sf-monday-subitem-band">
          {/* No guidance note here yet — deliberately. §5.5 specified a
              standing warning that subitems "link and report across boards
              poorly," but that claim comes from prior research, not from
              hands-on testing, and §5.6 requires verifying it before it goes
              in front of a client. Ruthnie pushed on what "poorly" actually
              MEANS and there was no answer worth shipping, so the note is
              cut rather than reworded around the gap. The `note` prop on
              ColumnBand stays wired for when §5.6's verification produces a
              claim specific enough to be worth stating. */}
          <ColumnBand
            label="Subitem columns"
            set="subitem"
            board={board}
            doc={doc}
            columns={board.subitemColumns}
            dispatch={dispatch}
            editingColumn={editingColumn}
            setEditingColumn={setEditingColumn}
          />
        </div>
      )}
    </div>
  );
}

function GroupChip({
  boardId,
  group,
  dispatch,
}: {
  boardId: string;
  group: { id: string; name: string; order: number; color?: string };
  dispatch: Dispatch<Action>;
}) {
  return (
    <Dropdown
      trigger={["contextMenu"]}
      menu={{
        items: [
          ...MONDAY_GROUP_COLORS.map((c) => ({ key: c, label: <ColorSwatch color={c} /> })),
          { type: "divider" as const },
          { key: "delete", label: "Delete group", icon: <DeleteOutlined />, danger: true },
        ],
        onClick: ({ key }) => {
          if (key === "delete") dispatch({ type: "DELETE_GROUP", boardId, groupId: group.id });
          else dispatch({ type: "SET_GROUP_COLOR", boardId, groupId: group.id, color: key });
        },
      }}
    >
      <span className="sf-monday-group-chip" data-no-drag title="Right-click for options">
        <span className="sf-monday-group-bar" style={{ background: group.color ?? "#888" }} />
        {/* The order number is shown because a board's groups are a flat
            ORDERED list and the order is the only hierarchy Monday gives
            them — on a pipeline board the group order IS the stage order.
            Monday has no nested groups; the one nesting level is
            item -> subitem. */}
        <span className="sf-monday-group-order">{group.order + 1}</span>
        {group.name}
      </span>
    </Dropdown>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />
      <span style={{ fontSize: 12 }}>Recolor</span>
    </span>
  );
}

// ── One column band (item or subitem) ────────────────────────────────

function ColumnBand({
  label,
  note,
  set,
  board,
  doc,
  columns,
  dispatch,
  editingColumn,
  setEditingColumn,
}: {
  label: string;
  /** Guidance attached to this band, shown on the heading rather than on the
   *  card. The subitem band uses it for the §5.5 note. */
  note?: string;
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  columns: MondayColumn[];
  dispatch: Dispatch<Action>;
  editingColumn: { boardId: string; set: ColumnSet; columnId: string } | null;
  setEditingColumn: (v: { boardId: string; set: ColumnSet; columnId: string } | null) => void;
}) {
  return (
    <>
      <div className="sf-monday-band-label" style={{ height: BAND_LABEL_H }}>
        {label}
        {note && (
          <Tooltip title={note} overlayStyle={{ maxWidth: 380 }}>
            <span className="sf-monday-band-info" data-no-drag>
              <InfoCircleOutlined />
            </span>
          </Tooltip>
        )}
      </div>
      {orderedColumns(columns).map(({ column, depth }) => (
        <ColumnRowView
          key={column.id}
          column={column}
          depth={depth}
          set={set}
          board={board}
          doc={doc}
          dispatch={dispatch}
          isEditing={
            editingColumn?.boardId === board.id &&
            editingColumn.set === set &&
            editingColumn.columnId === column.id
          }
          setEditingColumn={setEditingColumn}
        />
      ))}
      <AddColumnControl
        set={set}
        board={board}
        doc={doc}
        dispatch={dispatch}
        setEditingColumn={setEditingColumn}
      />
    </>
  );
}

function ColumnRowView({
  column,
  depth,
  set,
  board,
  doc,
  dispatch,
  isEditing,
  setEditingColumn,
}: {
  column: MondayColumn;
  /** 1 for a Mirror shown under the Connect it rides — see orderedColumns(). */
  depth: number;
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
  isEditing: boolean;
  setEditingColumn: (v: { boardId: string; set: ColumnSet; columnId: string } | null) => void;
}) {
  const [draft, setDraft] = useState(column.name);

  useEffect(() => {
    if (isEditing) setDraft(column.name);
  }, [isEditing, column.name]);

  const submit = () => {
    const name = draft.trim();
    if (name && name !== column.name) {
      dispatch({ type: "RENAME_COLUMN", boardId: board.id, set, columnId: column.id, name });
    }
    setEditingColumn(null);
  };

  return (
    <div
      className={depth > 0 ? "sf-schema-row sf-monday-row is-nested" : "sf-schema-row sf-monday-row"}
      style={{ height: ROW_H }}
    >
      {/* The elbow marks this row as riding the Connect above it. A glyph
          rather than a drawn line: the two rows are always adjacent by the
          time they render, so there is no distance for a line to cross. */}
      {depth > 0 && <span className="sf-monday-row-nest" aria-hidden="true">⤷</span>}
      <span className="sf-monday-row-accent" style={{ background: rowAccentColor(column) }} />
      {isEditing ? (
        <Input
          size="small"
          autoFocus
          className="sf-schema-row-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={submit}
          onBlur={submit}
        />
      ) : (
        <span
          className="sf-schema-row-name"
          onDoubleClick={() => setEditingColumn({ boardId: board.id, set, columnId: column.id })}
          title="Double-click to rename"
        >
          {column.name}
        </span>
      )}
      <ColumnKindBadge column={column} set={set} board={board} doc={doc} dispatch={dispatch} />
      <button
        className="sf-schema-row-delete"
        data-no-drag
        aria-label={`Delete ${column.name}`}
        onClick={() => dispatch({ type: "DELETE_COLUMN", boardId: board.id, set, columnId: column.id })}
      >
        <DeleteOutlined />
      </button>
    </div>
  );
}

/** The right-hand side of a row: what KIND of column this is. A plain column
 *  shows its type and can be retyped in place; a Connect shows the board it
 *  reaches; a Mirror shows what it reads and carries the capability note. */
function ColumnKindBadge({
  column,
  set,
  board,
  doc,
  dispatch,
}: {
  column: MondayColumn;
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
}) {
  if (column.spec.kind === "connect") {
    return (
      <ConnectBadge
        columnId={column.id}
        targetBoardId={column.spec.targetBoardId}
        set={set}
        board={board}
        doc={doc}
        dispatch={dispatch}
      />
    );
  }
  if (column.spec.kind === "mirror") {
    return (
      <MirrorBadge
        viaConnectColumnId={column.spec.viaConnectColumnId}
        sourceColumnId={column.spec.sourceColumnId}
        set={set}
        board={board}
        doc={doc}
      />
    );
  }
  const type = column.spec.type;
  return (
    <span data-no-drag>
      <Select<ColumnType>
        size="small"
        variant="borderless"
        className="sf-monday-type-select"
        value={type}
        popupMatchSelectWidth={false}
        onChange={(v) =>
          dispatch({ type: "SET_COLUMN_TYPE", boardId: board.id, set, columnId: column.id, columnType: v })
        }
        options={MONDAY_COLUMN_TYPES.map((t) => ({ value: t.type, label: t.label }))}
      />
    </span>
  );
}

/** Takes the Connect's already-narrowed fields rather than the column, so
 *  neither this component nor MirrorBadge below has to re-narrow the union
 *  its caller has already discriminated on. */
function ConnectBadge({
  columnId,
  targetBoardId,
  set,
  board,
  doc,
  dispatch,
}: {
  columnId: string;
  targetBoardId: string;
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
}) {
  return (
    <span data-no-drag>
      <Select<string>
        size="small"
        variant="borderless"
        className="sf-monday-type-select sf-monday-connect-select"
        value={targetBoardId}
        popupMatchSelectWidth={false}
        onChange={(v) =>
          dispatch({ type: "SET_CONNECT_TARGET", boardId: board.id, set, columnId, targetBoardId: v })
        }
        options={doc.boards.map((b) => ({
          value: b.id,
          label: (
            <span className="sf-monday-connect-option">
              <ApiOutlined /> {b.name}
            </span>
          ),
        }))}
      />
    </span>
  );
}

function MirrorBadge({
  viaConnectColumnId,
  sourceColumnId,
  set,
  board,
  doc,
}: {
  viaConnectColumnId: string;
  sourceColumnId: string;
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
}) {
  const viaColumn = columnsIn(board, set).find((c) => c.id === viaConnectColumnId);
  const targetBoard = mirrorTargetBoard(doc, board.id, set, viaConnectColumnId);
  const sourceColumn = targetBoard?.columns.find((c) => c.id === sourceColumnId);

  return (
    <span data-no-drag>
      <Popover
        trigger="click"
        title="Mirror"
        content={
          <div style={{ maxWidth: 280 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12.5 }}>
              Reads <strong>{sourceColumn?.name ?? "—"}</strong> from{" "}
              <strong>{targetBoard?.name ?? "—"}</strong>, down the{" "}
              <strong>{viaColumn?.name ?? "—"}</strong> connect column.
            </p>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{MIRROR_NOTE}</p>
          </div>
        }
      >
        <span className="sf-monday-mirror-badge">
          <EyeOutlined /> {sourceColumn?.name ?? "Mirror"}
        </span>
      </Popover>
    </span>
  );
}

// ── Add column, including the enforced Connect/Mirror editors ────────

function AddColumnControl({
  set,
  board,
  doc,
  dispatch,
  setEditingColumn,
}: {
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
  setEditingColumn: (v: { boardId: string; set: ColumnSet; columnId: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);

  // The button is a DIRECT child of the card, exactly as the schema card's
  // add-column is: .sf-schema-add-column is width:100%, so wrapping it in an
  // inline span collapses it to its text width. data-no-drag goes on the
  // button itself (the schema card's kebab does the same) rather than on a
  // wrapper element that would break the layout to carry it.
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={
        <AddColumnForm set={set} board={board} doc={doc} dispatch={dispatch} onDone={() => setOpen(false)} />
      }
    >
      <button type="button" className="sf-schema-add-column" data-no-drag style={{ height: ROW_H }}>
        <PlusOutlined style={{ fontSize: 11 }} /> Add column
      </button>
    </Popover>
  );
}

type NewColumnKind = "plain" | "connect" | "mirror";

function AddColumnForm({
  set,
  board,
  doc,
  dispatch,
  onDone,
}: {
  set: ColumnSet;
  board: MondayBoard;
  doc: MondayDoc;
  dispatch: Dispatch<Action>;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<NewColumnKind>("plain");
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [targetBoardId, setTargetBoardId] = useState<string | undefined>();
  const [viaConnectId, setViaConnectId] = useState<string | undefined>();
  const [sourceColumnId, setSourceColumnId] = useState<string | undefined>();

  // §4's enforcement, step 1: a Mirror rides a Connect, so with no Connect
  // column on this board the option is UNAVAILABLE — not offered-then-
  // rejected. The sentence below says why, so the dead end is explained
  // rather than merely hit.
  const connects = connectColumnsIn(board, set);
  const canMirror = connects.length > 0;

  // §4's enforcement, step 2: the source picker offers ONLY columns from the
  // board the chosen Connect actually reaches. A Mirror travels exactly one
  // hop, so nothing two boards away can appear here — making the two-hop
  // mistake structurally impossible rather than merely warned about.
  const reachedBoard = viaConnectId ? mirrorTargetBoard(doc, board.id, set, viaConnectId) : undefined;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (kind === "plain") {
      dispatch({ type: "ADD_COLUMN", boardId: board.id, set, name: trimmed, columnType: type });
    } else if (kind === "connect") {
      if (!targetBoardId) return;
      dispatch({ type: "ADD_CONNECT_COLUMN", boardId: board.id, set, name: trimmed, targetBoardId });
    } else {
      if (!viaConnectId || !sourceColumnId) return;
      dispatch({
        type: "ADD_MIRROR_COLUMN",
        boardId: board.id,
        set,
        name: trimmed,
        viaConnectColumnId: viaConnectId,
        sourceColumnId,
      });
    }
    onDone();
  };

  return (
    <div className="sf-monday-addcol" style={{ width: 280 }}>
      <Select<NewColumnKind>
        size="small"
        style={{ width: "100%" }}
        value={kind}
        onChange={setKind}
        options={[
          { value: "plain", label: "Column" },
          { value: "connect", label: "Connect boards" },
          { value: "mirror", label: "Mirror", disabled: !canMirror },
        ]}
      />

      {kind === "mirror" && !canMirror && (
        <p className="sf-monday-addcol-note">
          A mirror reads a value down a connect column, so this board needs a connect column first.
        </p>
      )}

      <Input
        size="small"
        autoFocus
        placeholder="Column name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={submit}
      />

      {kind === "plain" && (
        <Select<ColumnType>
          size="small"
          style={{ width: "100%" }}
          value={type}
          onChange={setType}
          options={MONDAY_COLUMN_TYPES.map((t) => ({ value: t.type, label: t.label }))}
        />
      )}

      {kind === "connect" && (
        <Select<string>
          size="small"
          style={{ width: "100%" }}
          placeholder="Which board?"
          value={targetBoardId}
          onChange={setTargetBoardId}
          options={doc.boards.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}

      {kind === "mirror" && canMirror && (
        <>
          <Select<string>
            size="small"
            style={{ width: "100%" }}
            placeholder="Down which connect column?"
            value={viaConnectId}
            onChange={(v) => {
              setViaConnectId(v);
              // The source belongs to the OLD connect's board — clearing it
              // keeps the form from carrying a selection that the new
              // connect's board knows nothing about.
              setSourceColumnId(undefined);
            }}
            options={connects.map((c) => ({ value: c.id, label: c.name }))}
          />
          {viaConnectId && (
            <Select<string>
              size="small"
              style={{ width: "100%" }}
              placeholder={reachedBoard ? `Which column on ${reachedBoard.name}?` : "Which column?"}
              value={sourceColumnId}
              onChange={setSourceColumnId}
              options={(reachedBoard?.columns ?? []).map((c) => ({ value: c.id, label: c.name }))}
              notFoundContent={`${reachedBoard?.name ?? "That board"} has no columns yet.`}
            />
          )}
          <p className="sf-monday-addcol-note">{MIRROR_NOTE}</p>
        </>
      )}

      <Button size="small" type="primary" block onClick={submit}>
        Add
      </Button>
    </div>
  );
}
