import { useState, type Dispatch, type KeyboardEvent } from "react";
import { Button, Input, Modal, Tooltip, Typography } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { Lane } from "../types";
import { haptic } from "@/lib/haptics";

const { Text } = Typography;

interface Props {
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

function LaneChip({
  lane,
  index,
  dispatch,
}: {
  lane: Lane;
  index: number;
  dispatch: Dispatch<Action>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lane.id,
  });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(lane.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const commitRename = () => {
    const name = draft.trim();
    if (name && name !== lane.name) dispatch({ type: "RENAME_LANE", id: lane.id, name });
    setRenaming(false);
  };

  const confirmDelete = () => {
    Modal.confirm({
      title: `Delete "${lane.name}"?`,
      content: "Any steps in this lane move back to the inbox — they're not deleted.",
      okText: "Delete lane",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        haptic("warning");
        dispatch({ type: "DELETE_LANE", id: lane.id });
      },
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sf-lane-chip${isDragging ? " is-dragging" : ""}`}
    >
      <span className="sf-lane-chip-grip" {...attributes} {...listeners} aria-label="Drag to reorder lane">
        <HolderOutlined />
      </span>
      <span className="sf-lane-chip-order">{index + 1}</span>

      {renaming ? (
        <Input
          size="small"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={commitRename}
          onBlur={commitRename}
          style={{ width: 130 }}
        />
      ) : (
        <span>{lane.name}</span>
      )}

      <Tooltip title="Rename">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setDraft(lane.name);
            setRenaming(true);
          }}
        />
      </Tooltip>
      <Tooltip title="Delete">
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={confirmDelete} />
      </Tooltip>
    </div>
  );
}

export function LaneManager({ lanes, dispatch }: Props) {
  const [newName, setNewName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // "Sales, Product, Ops" or one name + Enter — comma-split so a paste adds many.
  const addLanes = () => {
    const names = newName.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    for (const name of names) dispatch({ type: "ADD_LANE", name });
    haptic("tap");
    setNewName("");
  };

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addLanes();
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = lanes.map((l) => l.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, String(active.id));
    dispatch({ type: "REORDER_LANES", orderedIds: next });
    haptic("tap");
  };

  return (
    // One row: heading, add field, then the chips flowing after it. The old
    // layout spent three stacked rows (heading + hint, input, chips) on this.
    <section className="sf-lanes-bar">
      <h2 className="sf-section-title sf-lanes-bar-title">Lanes</h2>

      <div className="sf-lanes-bar-add">
        <Input
          size="small"
          placeholder="Add a lane — comma-separate for several"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={onAddKey}
          allowClear
        />
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addLanes}>
          Add
        </Button>
      </div>

      {lanes.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lanes.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
            <div className="sf-lane-chips">
              {lanes.map((lane, idx) => (
                <LaneChip key={lane.id} lane={lane} index={idx} dispatch={dispatch} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <Text className="sf-section-hint">Columns in your diagram, left to right</Text>
      )}
    </section>
  );
}
