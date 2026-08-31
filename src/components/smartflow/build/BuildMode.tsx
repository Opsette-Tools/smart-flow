import { useEffect, useMemo, useState, type Dispatch } from "react";
import { Button, Dropdown, Empty, Modal, Typography } from "antd";
import { ClearOutlined, BulbOutlined, MoreOutlined } from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Action } from "../store";
import { seedDoc } from "../store";
import type { Item, SmartFlowDoc } from "../types";
import { haptic } from "@/lib/haptics";
import { parseScopeId } from "./dndScope";
import { LaneAddBar } from "./LaneManager";
import { InboxPanel } from "./InboxPanel";
import { LaneColumn } from "./LaneColumn";
import { StepInspector } from "./StepInspector";
import { LaneReview } from "./LaneReview";
import { ResizableDrawer } from "@/components/common/ResizableDrawer";

const { Text } = Typography;

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
}

/**
 * BuildMode owns the single DndContext that spans the inbox and every lane, so
 * an item can be dragged within its scope or across scopes. It is now the only
 * drag context on the page. Lane order moved to the lane head's menu when the
 * duplicate chip bar came out.
 *
 * The page is a board plus drawers. The board keeps its full width. A step or a
 * whole lane opens in a WorkDrawer over it, unmasked, so you can click straight
 * from one to the next.
 */
export function BuildMode({ doc, dispatch }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which step the inspector is showing. The board is for reading; this is
  // where a step actually gets filled in.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which lane the review drawer is showing, if any.
  const [reviewLaneId, setReviewLaneId] = useState<string | null>(null);

  const sensors = useSensors(
    // A small distance/delay so a tap to edit a field isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemsById = useMemo(() => new Map(doc.items.map((i) => [i.id, i])), [doc.items]);
  const lanes = useMemo(() => [...doc.lanes].sort((a, b) => a.order - b.order), [doc.lanes]);
  const inboxItems = useMemo(
    () => doc.items.filter((i) => i.laneId === null).sort((a, b) => a.order - b.order),
    [doc.items],
  );
  const itemsByLane = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const lane of doc.lanes) map.set(lane.id, []);
    for (const item of doc.items) {
      if (item.laneId !== null && map.has(item.laneId)) map.get(item.laneId)!.push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [doc.items, doc.lanes]);

  const activeItem = activeId ? itemsById.get(activeId) ?? null : null;
  const selectedItem = selectedId ? itemsById.get(selectedId) ?? null : null;

  // A deleted step must not leave the inspector pointing at a ghost.
  useEffect(() => {
    if (selectedId && !itemsById.has(selectedId)) setSelectedId(null);
  }, [selectedId, itemsById]);

  const reviewLane = reviewLaneId ? lanes.find((l) => l.id === reviewLaneId) ?? null : null;
  // A deleted lane must not leave the review drawer open on nothing.
  useEffect(() => {
    if (reviewLaneId && !doc.lanes.some((l) => l.id === reviewLaneId)) setReviewLaneId(null);
  }, [reviewLaneId, doc.lanes]);

  /** Resolve which scope (lane id | null) a droppable/draggable id belongs to. */
  const scopeOf = (id: string): { laneId: string | null } | "unknown" => {
    const asScope = parseScopeId(id);
    if (asScope) return asScope;
    const item = itemsById.get(id);
    if (item) return { laneId: item.laneId };
    return "unknown";
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeItemId = String(active.id);
    const overId = String(over.id);

    const from = scopeOf(activeItemId);
    const to = scopeOf(overId);
    if (from === "unknown" || to === "unknown") return;

    const targetScope = to.laneId;
    const targetList =
      targetScope === null ? inboxItems : itemsByLane.get(targetScope) ?? [];

    // Where in the target list did it land? If dropped on an item, take that
    // item's index; if dropped on the column background, append to the end.
    const overItem = itemsById.get(overId);
    const targetIndex = overItem
      ? targetList.findIndex((i) => i.id === overId)
      : targetList.length;

    if (from.laneId === targetScope) {
      // Same scope → pure reorder.
      const ids = targetList.map((i) => i.id);
      const oldIndex = ids.indexOf(activeItemId);
      if (oldIndex === -1 || targetIndex === -1 || oldIndex === targetIndex) return;
      const next = [...ids];
      next.splice(oldIndex, 1);
      next.splice(targetIndex > oldIndex ? targetIndex - 1 : targetIndex, 0, activeItemId);
      dispatch({ type: "REORDER_ITEMS", laneId: targetScope, orderedIds: next });
      haptic("tap");
    } else {
      // Cross scope → assign into the target at the landing index.
      dispatch({
        type: "ASSIGN_ITEM",
        id: activeItemId,
        laneId: targetScope,
        index: targetIndex === -1 ? undefined : targetIndex,
      });
      haptic("success");
    }
  };

  const hasLanes = lanes.length > 0;
  const hasAnyItem = doc.items.length > 0;
  const hasAnything = hasLanes || hasAnyItem;

  const handleStartOver = () => {
    Modal.confirm({
      title: "Start over?",
      content: "This clears every lane and step so you can begin fresh. It can't be undone.",
      okText: "Start over",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        haptic("warning");
        dispatch({ type: "RESET" });
      },
    });
  };

  const handleLoadExample = () => {
    const apply = () => dispatch({ type: "REPLACE_DOC", doc: seedDoc() });
    if (hasAnything) {
      Modal.confirm({
        title: "Load the example?",
        content: "This replaces what's on the board with a sample process you can edit.",
        okText: "Load example",
        cancelText: "Cancel",
        onOk: apply,
      });
    } else {
      apply();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="sf-stack">
        {/* Add a lane on the left, board actions folded into one kebab. */}
        <div className="sf-build-actions">
          <LaneAddBar dispatch={dispatch} />
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                { key: "example", icon: <BulbOutlined />, label: "Load example" },
                {
                  key: "reset",
                  icon: <ClearOutlined />,
                  label: "Start over",
                  danger: true,
                  disabled: !hasAnything,
                },
              ],
              onClick: ({ key }) => (key === "example" ? handleLoadExample() : handleStartOver()),
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Board actions" />
          </Dropdown>
        </div>

        <InboxPanel items={inboxItems} lanes={lanes} dispatch={dispatch} />

        <section className="sf-board-section">
          <div className="sf-board-head">
            <h2 className="sf-section-title">Steps by lane</h2>
          </div>

          {hasLanes ? (
            <div className="sf-lanes-scroll">
              <div className="sf-lanes-row">
                {lanes.map((lane, i) => (
                  <LaneColumn
                    key={lane.id}
                    lane={lane}
                    index={i}
                    laneCount={lanes.length}
                    items={itemsByLane.get(lane.id) ?? []}
                    allItems={doc.items}
                    lanes={lanes}
                    dispatch={dispatch}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onReview={() => setReviewLaneId(lane.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No lanes yet. Add your first lane above."
              style={{ padding: "32px 0" }}
            />
          )}
        </section>

        <ResizableDrawer
          open={selectedItem !== null}
          onClose={() => setSelectedId(null)}
          title={selectedItem ? selectedItem.label : "Step"}
          onRename={
            selectedItem
              ? (label) =>
                  label.trim() &&
                  dispatch({ type: "RENAME_ITEM", id: selectedItem.id, label })
              : undefined
          }
          storageKey="smart-flow-drawer-w"
        >
          <StepInspector
            item={selectedItem}
            allItems={doc.items}
            lanes={lanes}
            dispatch={dispatch}
            onClose={() => setSelectedId(null)}
          />
        </ResizableDrawer>

        {/* A whole lane at once. Clicking step by step hides the thing a lane
            review is for: seeing which step nobody could answer for. */}
        <ResizableDrawer
          open={reviewLane !== null}
          onClose={() => setReviewLaneId(null)}
          title={reviewLane ? reviewLane.name : "Lane"}
          onRename={
            reviewLane
              ? (name) => name.trim() && dispatch({ type: "RENAME_LANE", id: reviewLane.id, name })
              : undefined
          }
          storageKey="smart-flow-drawer-w"
        >
          {reviewLane && (
            <LaneReview
              items={itemsByLane.get(reviewLane.id) ?? []}
              allItems={doc.items}
              lanes={lanes}
              dispatch={dispatch}
                onOpenStep={setSelectedId}
            />
          )}
        </ResizableDrawer>

      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="sf-step is-overlay" style={{ width: 252, cursor: "grabbing" }}>
            <span className="sf-step-label">{activeItem.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
