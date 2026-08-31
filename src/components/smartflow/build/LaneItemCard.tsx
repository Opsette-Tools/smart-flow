import { useState, type Dispatch, type KeyboardEvent } from "react";
import { Dropdown, Input, Tooltip } from "antd";
import {
  HolderOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  WarningFilled,
  UserOutlined,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { connectionMechanisms } from "../types";
import { haptic } from "@/lib/haptics";

interface Props {
  item: Item;
  /** 1-based position in its lane. The sequence anchor the board was missing. */
  index: number;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
  selected?: boolean;
  onSelect: () => void;
}

/**
 * The board face of a step: a number, a name, a handoff count. Handoff method,
 * storage system, and open question all live in the inspector. A lane column is
 * about 280px wide, which is not enough room to type "QuickBooks, Airtable,
 * shared drive, nowhere" into.
 */
export function LaneItemCard({
  item,
  index,
  allItems,
  lanes,
  dispatch,
  selected = false,
  onSelect,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.label);

  const commit = () => {
    const label = draft.trim();
    if (label && label !== item.label) dispatch({ type: "RENAME_ITEM", id: item.id, label });
    setRenaming(false);
  };

  // Only count handoffs that still resolve to a live step. A deleted target
  // shouldn't inflate the number on the card face.
  const handoffCount = item.connectsTo.filter((id) => allItems.some((i) => i.id === id)).length;

  // A step is "open" until it names a system of record and a method on every
  // handoff. That's what the dot tracks.
  const needsDetail =
    !item.systemOfRecord ||
    item.connectsTo.some(
      (toId) => connectionMechanisms(item.connections?.find((c) => c.toId === toId)).length === 0,
    );

  const menuItems = [
    { key: "rename", icon: <EditOutlined />, label: "Rename" },
    {
      key: "move",
      icon: <SwapOutlined />,
      label: "Move to lane",
      children: lanes
        .filter((l) => l.id !== item.laneId)
        .map((l) => ({ key: `move:${l.id}`, label: l.name }))
        .concat([{ key: "move:inbox", label: "Inbox (unsorted)" }]),
    },
    { type: "divider" as const },
    { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true },
  ];

  const onMenu = ({ key }: { key: string }) => {
    if (key === "rename") {
      setDraft(item.label);
      setRenaming(true);
      return;
    }
    if (key === "delete") {
      haptic("warning");
      dispatch({ type: "DELETE_ITEM", id: item.id });
      return;
    }
    if (key.startsWith("move:")) {
      const target = key.slice(5);
      dispatch({ type: "ASSIGN_ITEM", id: item.id, laneId: target === "inbox" ? null : target });
      haptic("success");
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sf-step${isDragging ? " is-dragging" : ""}${selected ? " is-selected" : ""}`}
      onClick={renaming ? undefined : onSelect}
      onKeyDown={renaming ? undefined : onKey}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <span className="sf-step-grip" {...attributes} {...listeners} aria-label="Drag to reorder">
        <HolderOutlined />
      </span>

      <span className="sf-step-seq" aria-hidden="true">
        {index}
      </span>

      {renaming ? (
        <Input
          size="small"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={commit}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1 }}
        />
      ) : (
        <span className="sf-step-label">{item.label}</span>
      )}

      {/* No tooltips on the card face. They fire on hover exactly where the
          drawer opens, and the count and dot already read on their own. */}
      {!renaming && handoffCount > 0 && (
        <span
          className="sf-step-handoffs"
          aria-label={`Hands off to ${handoffCount} step${handoffCount === 1 ? "" : "s"}`}
        >
          <ArrowRightOutlined />
          {handoffCount}
        </span>
      )}

      {!renaming && item.owner && (
        <Tooltip title={`Owner: ${item.owner}`}>
          <span className="sf-step-owner" aria-label={`Owner: ${item.owner}`}>
            <UserOutlined />
          </span>
        </Tooltip>
      )}

      {!renaming && item.validated && (
        <span className="sf-step-validated" aria-label="Validated">
          <CheckCircleOutlined />
        </span>
      )}

      {!renaming && item.breakPoint && (
        <Tooltip title={item.breakPoint.note}>
          <span className="sf-step-break" aria-label={`Break point: ${item.breakPoint.note}`}>
            <WarningFilled />
          </span>
        </Tooltip>
      )}

      {!renaming && needsDetail && (
        <span className="sf-step-dot" aria-label="Missing detail" />
      )}

      <span className="sf-step-menu" onClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{ items: menuItems, onClick: onMenu }}
        >
          <button type="button" className="sf-icon-btn" aria-label={`Actions for ${item.label}`}>
            <MoreOutlined />
          </button>
        </Dropdown>
      </span>
    </div>
  );
}
