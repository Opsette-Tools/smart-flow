import { useMemo, useState, type Dispatch } from "react";
import { Button, Empty, Modal, Space, Typography } from "antd";
import { ArrowRightOutlined, ClearOutlined, BulbOutlined } from "@ant-design/icons";
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
import { clearDoc, seedDoc } from "../store";
import type { Item, SmartFlowDoc } from "../types";
import { haptic } from "@/lib/haptics";
import { parseScopeId } from "./dndScope";
import { LaneManager } from "./LaneManager";
import { InboxPanel } from "./InboxPanel";
import { LaneColumn } from "./LaneColumn";

const { Text } = Typography;

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
  onViewDiagram: () => void;
}

/**
 * BuildMode owns the single DndContext that spans the inbox and every lane, so
 * an item can be dragged within its scope or across scopes. Lane *column*
 * reordering uses its own context inside LaneManager (different data shape), so
 * this context only ever moves items.
 */
export function BuildMode({ doc, dispatch, onViewDiagram }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
        clearDoc();
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
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Space size={4}>
            <Button type="text" size="small" icon={<BulbOutlined />} onClick={handleLoadExample}>
              Load example
            </Button>
            <Button
              type="text"
              size="small"
              danger
              icon={<ClearOutlined />}
              onClick={handleStartOver}
              disabled={!hasAnything}
            >
              Start over
            </Button>
          </Space>
        </div>

        <LaneManager lanes={lanes} dispatch={dispatch} />

        <InboxPanel items={inboxItems} lanes={lanes} dispatch={dispatch} />

        <section>
          <div className="sf-section-head">
            <h2 className="sf-section-title">Steps by lane</h2>
            <Text className="sf-section-hint">
              {hasLanes ? "Drag steps to reorder or move them between lanes" : "Add a lane above to start"}
            </Text>
          </div>

          {hasLanes ? (
            <div className="sf-lanes-scroll">
              <div className="sf-lanes-row">
                {lanes.map((lane) => (
                  <LaneColumn
                    key={lane.id}
                    lane={lane}
                    items={itemsByLane.get(lane.id) ?? []}
                    allItems={doc.items}
                    lanes={lanes}
                    dispatch={dispatch}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No lanes yet — add your first lane above."
              style={{ padding: "32px 0" }}
            />
          )}
        </section>

        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            disabled={!hasAnyItem}
            onClick={onViewDiagram}
          >
            View diagram
          </Button>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="sf-card" style={{ width: 252, cursor: "grabbing" }}>
            <div className="sf-card-top">
              <span className="sf-card-grip">⋮⋮</span>
              <span className="sf-card-label">{activeItem.label}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
