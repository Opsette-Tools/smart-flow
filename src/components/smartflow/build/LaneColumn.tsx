import { useState, type Dispatch } from "react";
import { Button, Input } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";
import { laneScopeId } from "./dndScope";
import { LaneItemCard } from "./LaneItemCard";

const { TextArea } = Input;

interface Props {
  lane: Lane;
  items: Item[];
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

export function LaneColumn({ lane, items, allItems, lanes, dispatch }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: laneScopeId(lane.id) });
  const [paste, setPaste] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  const addPasted = () => {
    const labels = paste.split("\n").map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) return;
    dispatch({ type: "ADD_ITEMS", labels, laneId: lane.id });
    haptic("tap");
    setPaste("");
    setPasteOpen(false);
  };

  return (
    <div className={`sf-lane-col${isOver ? " is-over" : ""}`}>
      <div className="sf-lane-col-head">
        <input
          className="sf-lane-col-name"
          value={lane.name}
          onChange={(e) => dispatch({ type: "RENAME_LANE", id: lane.id, name: e.target.value })}
          aria-label="Lane name"
        />
        <span className="sf-lane-col-count">{items.length}</span>
      </div>

      <div ref={setNodeRef} className="sf-lane-col-body">
        {items.length > 0 ? (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <LaneItemCard
                key={item.id}
                item={item}
                allItems={allItems}
                lanes={lanes}
                dispatch={dispatch}
              />
            ))}
          </SortableContext>
        ) : (
          <div className="sf-lane-empty">Drag steps here or add below</div>
        )}
      </div>

      <div className="sf-lane-col-foot">
        {pasteOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TextArea
              placeholder={"One step per line"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 6 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="primary" size="small" onClick={addPasted} disabled={!paste.trim()}>
                Add
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setPaste("");
                  setPasteOpen(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="dashed"
            size="small"
            block
            icon={<PlusOutlined />}
            onClick={() => setPasteOpen(true)}
          >
            Add steps
          </Button>
        )}
      </div>
    </div>
  );
}
