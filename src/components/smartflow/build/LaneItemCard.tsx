import { useState, type Dispatch } from "react";
import { Button, Input, Tooltip } from "antd";
import { HolderOutlined, EditOutlined, DeleteOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";
import { ConnectionEditor } from "./ConnectionEditor";

interface Props {
  item: Item;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

export function LaneItemCard({ item, allItems, lanes, dispatch }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);

  const commit = () => {
    const label = draft.trim();
    if (label && label !== item.label) dispatch({ type: "RENAME_ITEM", id: item.id, label });
    setEditing(false);
  };

  // Names of the steps this one leads to, for the read-at-a-glance summary line.
  const targets = item.connectsTo
    .map((id) => allItems.find((i) => i.id === id)?.label)
    .filter((l): l is string => Boolean(l));

  return (
    <div ref={setNodeRef} style={style} className={`sf-card${isDragging ? " is-dragging" : ""}`}>
      <div className="sf-card-top">
        <span className="sf-card-grip" {...attributes} {...listeners} aria-label="Drag to reorder">
          <HolderOutlined />
        </span>

        {editing ? (
          <Input
            size="small"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={commit}
            onBlur={commit}
            style={{ flex: 1 }}
          />
        ) : (
          <span className="sf-card-label">{item.label}</span>
        )}

        <span className="sf-card-actions">
          <Tooltip title="Rename">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setDraft(item.label);
                setEditing(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                haptic("warning");
                dispatch({ type: "DELETE_ITEM", id: item.id });
              }}
            />
          </Tooltip>
        </span>
      </div>

      {targets.length > 0 && (
        <div className="sf-conn-row">
          <ArrowRightOutlined className="sf-conn-arrow" />
          {targets.map((t, i) => (
            <span key={i} className="sf-conn-arrow" style={{ color: "inherit" }}>
              {t}
              {i < targets.length - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}

      <div className="sf-card-connect">
        <ConnectionEditor item={item} allItems={allItems} lanes={lanes} dispatch={dispatch} />
      </div>
    </div>
  );
}
