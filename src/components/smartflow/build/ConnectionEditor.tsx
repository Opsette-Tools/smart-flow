import { type Dispatch } from "react";
import { Select } from "antd";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";

interface Props {
  item: Item;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

/**
 * "Leads to →" multi-select. Lists every *other* item, grouped by lane (and an
 * Inbox group for unplaced steps), so the user can draw handoffs by name. Self-
 * reference is impossible (the item is excluded from its own option list).
 */
export function ConnectionEditor({ item, allItems, lanes, dispatch }: Props) {
  const laneName = new Map(lanes.map((l) => [l.id, l.name] as const));

  // Build grouped options: one group per lane (in column order), then Inbox.
  const groups = lanes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((lane) => ({
      label: lane.name,
      options: allItems
        .filter((i) => i.laneId === lane.id && i.id !== item.id)
        .sort((a, b) => a.order - b.order)
        .map((i) => ({ value: i.id, label: i.label })),
    }))
    .filter((g) => g.options.length > 0);

  const inboxOptions = allItems
    .filter((i) => i.laneId === null && i.id !== item.id)
    .sort((a, b) => a.order - b.order)
    .map((i) => ({ value: i.id, label: i.label }));
  if (inboxOptions.length > 0) groups.push({ label: "Inbox", options: inboxOptions });

  // Selected labels show "Lane · Step" so duplicate step names stay distinguishable.
  const labelFor = (id: string): string => {
    const target = allItems.find((i) => i.id === id);
    if (!target) return id;
    const scope = target.laneId ? laneName.get(target.laneId) ?? "" : "Inbox";
    return scope ? `${scope} · ${target.label}` : target.label;
  };

  return (
    <Select
      mode="multiple"
      size="small"
      allowClear
      style={{ width: "100%" }}
      placeholder="Leads to…"
      value={item.connectsTo}
      options={groups}
      optionFilterProp="label"
      maxTagCount="responsive"
      tagRender={({ value, closable, onClose }) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(47,79,70,0.08)",
            color: "var(--ops-green)",
            borderRadius: 6,
            padding: "1px 6px",
            margin: 2,
            fontSize: 12,
            maxWidth: 180,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {labelFor(String(value))}
          </span>
          {closable && (
            <span style={{ cursor: "pointer" }} onClick={onClose} aria-label="Remove">
              ×
            </span>
          )}
        </span>
      )}
      onChange={(next: string[]) => {
        dispatch({ type: "SET_CONNECTIONS", id: item.id, connectsTo: next });
        haptic("tap");
      }}
    />
  );
}
