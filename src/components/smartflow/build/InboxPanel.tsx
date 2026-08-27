import { useState, type Dispatch } from "react";
import { Button, Card, Input, Select, Typography } from "antd";
import { PlusOutlined, HolderOutlined, DeleteOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";
import { INBOX_SCOPE } from "./dndScope";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  items: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

function InboxItemRow({
  item,
  lanes,
  dispatch,
}: {
  item: Item;
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`sf-inbox-row${isDragging ? " is-dragging" : ""}`}>
      <span className="sf-step-grip" {...attributes} {...listeners} aria-label="Drag to a lane">
        <HolderOutlined />
      </span>
      <span className="sf-inbox-label">{item.label}</span>
      <Select<string>
        className="sf-inbox-assign"
        placeholder="Assign to lane"
        value={undefined}
        options={lanes.map((l) => ({ value: l.id, label: l.name }))}
        onChange={(laneId) => {
          dispatch({ type: "ASSIGN_ITEM", id: item.id, laneId });
          haptic("success");
        }}
      />
      <Button
        type="text"
        danger
        size="small"
        icon={<DeleteOutlined />}
        aria-label="Delete step"
        onClick={() => dispatch({ type: "DELETE_ITEM", id: item.id })}
      />
    </div>
  );
}

export function InboxPanel({ items, lanes, dispatch }: Props) {
  const [draft, setDraft] = useState("");
  // Collapsed while empty: an empty inbox was holding ~200px of the screen to
  // say nothing. It opens on click, and whenever it actually holds steps.
  const [open, setOpen] = useState(items.length > 0);
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_SCOPE });
  const expanded = open || items.length > 0;

  const addFromTextarea = () => {
    const labels = draft.split("\n").map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) return;
    dispatch({ type: "ADD_ITEMS", labels, laneId: null });
    haptic("tap");
    setDraft("");
  };

  return (
    <Card
      variant="outlined"
      styles={{ body: { padding: 16 } }}
      style={isOver ? { outline: "2px solid var(--ops-green-light)", outlineOffset: -1 } : undefined}
    >
      <div className="sf-section-head" style={{ marginBottom: expanded ? 8 : 0 }}>
        <button
          type="button"
          className="sf-inbox-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={expanded}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
          <h2 className="sf-section-title">Inbox</h2>
          <span className="sf-inbox-state">
            {items.length > 0 ? `${items.length} unsorted` : "empty"}
          </span>
        </button>
        {expanded && (
          <Text className="sf-section-hint">
            Paste your steps, one per line — assign each to a lane
          </Text>
        )}
      </div>

      {expanded && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: items.length ? 16 : 0 }}>
        <TextArea
          placeholder={"Lead intake\nQualify\nNegotiation\nScope & bid"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
        />
        <div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addFromTextarea}
            disabled={!draft.trim()}
          >
            Add to inbox
          </Button>
        </div>
      </div>
      )}

      {/* The droppable stays mounted even when collapsed, so an item can still
          be dragged back to the inbox without expanding it first. */}
      <div ref={setNodeRef}>
        {items.length > 0 ? (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="sf-inbox-list">
              {items.map((item) => (
                <InboxItemRow key={item.id} item={item} lanes={lanes} dispatch={dispatch} />
              ))}
            </div>
          </SortableContext>
        ) : expanded ? (
          <Text type="secondary" style={{ fontSize: "var(--ops-fs-fine)" }}>
            Unsorted steps land here. Empty inbox means everything is placed.
          </Text>
        ) : null}
      </div>
    </Card>
  );
}
