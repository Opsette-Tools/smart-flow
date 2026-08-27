import { useState, type Dispatch } from "react";
import { Button, Dropdown, Input, Modal } from "antd";
import {
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
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
  /** Position among lanes, left to right. Drives the head number and Move l/r. */
  index: number;
  laneCount: number;
  items: Item[];
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Open the whole lane, every step expanded, in the review drawer. */
  onReview: () => void;
}

/**
 * A lane column. Its head is the only heavy surface on the board, so a step
 * reads as sitting inside a lane without needing a label to say so. The head
 * also owns rename, reorder, and delete, which used to live in a duplicate chip
 * bar above the board.
 */
export function LaneColumn({
  lane,
  index,
  laneCount,
  items,
  allItems,
  lanes,
  dispatch,
  selectedId,
  onSelect,
  onReview,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: laneScopeId(lane.id) });
  const [paste, setPaste] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(lane.name);

  const addPasted = () => {
    const labels = paste.split("\n").map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) return;
    dispatch({ type: "ADD_ITEMS", labels, laneId: lane.id });
    haptic("tap");
    setPaste("");
    setPasteOpen(false);
  };

  const commitRename = () => {
    const name = draft.trim();
    if (name && name !== lane.name) dispatch({ type: "RENAME_LANE", id: lane.id, name });
    setRenaming(false);
  };

  /** Swap this lane with its neighbour. REORDER_LANES takes the full order. */
  const move = (delta: -1 | 1) => {
    const ids = lanes.map((l) => l.id);
    const from = ids.indexOf(lane.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, lane.id);
    dispatch({ type: "REORDER_LANES", orderedIds: next });
    haptic("tap");
  };

  const confirmDelete = () => {
    Modal.confirm({
      title: `Delete "${lane.name}"?`,
      content: "Any steps in this lane move back to the inbox. They're not deleted.",
      okText: "Delete lane",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        haptic("warning");
        dispatch({ type: "DELETE_LANE", id: lane.id });
      },
    });
  };

  const onMenu = ({ key }: { key: string }) => {
    if (key === "rename") {
      setDraft(lane.name);
      setRenaming(true);
    } else if (key === "left") move(-1);
    else if (key === "right") move(1);
    else if (key === "delete") confirmDelete();
  };

  return (
    <div className={`sf-lane-col${isOver ? " is-over" : ""}`}>
      <div className="sf-lane-col-head">
        {renaming ? (
          <>
            <span className="sf-lane-col-order" aria-hidden="true">
              {index + 1}
            </span>
            <Input
              size="small"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPressEnter={commitRename}
              onBlur={commitRename}
              style={{ flex: 1 }}
            />
          </>
        ) : (
          // The number and name open the lane review. Burying that in a kebab
          // made the most useful thing on the head the hardest to reach.
          <button
            type="button"
            className="sf-lane-col-open"
            onClick={onReview}
            title={`Review ${lane.name}`}
          >
            <span className="sf-lane-col-order">{index + 1}</span>
            <h3 className="sf-lane-col-name">{lane.name}</h3>
          </button>
        )}

        <span className="sf-lane-col-count">{items.length}</span>

        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{
            items: [
              { key: "rename", icon: <EditOutlined />, label: "Rename lane" },
              {
                key: "left",
                icon: <ArrowLeftOutlined />,
                label: "Move left",
                disabled: index === 0,
              },
              {
                key: "right",
                icon: <ArrowRightOutlined />,
                label: "Move right",
                disabled: index === laneCount - 1,
              },
              { type: "divider" as const },
              { key: "delete", icon: <DeleteOutlined />, label: "Delete lane", danger: true },
            ],
            onClick: onMenu,
          }}
        >
          <button
            type="button"
            className="sf-icon-btn is-on-band"
            aria-label={`Actions for ${lane.name}`}
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>

      <div ref={setNodeRef} className="sf-lane-col-body">
        {items.length > 0 ? (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item, i) => (
              <LaneItemCard
                key={item.id}
                item={item}
                index={i + 1}
                allItems={allItems}
                lanes={lanes}
                dispatch={dispatch}
                    selected={selectedId === item.id}
                onSelect={() => onSelect(item.id)}
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
