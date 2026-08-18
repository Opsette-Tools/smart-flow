import { type Dispatch } from "react";
import { Input, Select } from "antd";
import type { Action } from "../store";
import {
  MECHANISMS,
  isCustomMechanism,
  mechanismToValue,
  parseMechanism,
  type Connection,
  type Item,
  type Lane,
} from "../types";
import { haptic } from "@/lib/haptics";

interface Props {
  item: Item;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
  /** Discovery mode: show a mechanism row per connection ("how does it move?"). */
  discovery?: boolean;
}

/**
 * "Leads to →" multi-select. Lists every *other* item, grouped by lane (and an
 * Inbox group for unplaced steps), so the user can draw handoffs by name. Self-
 * reference is impossible (the item is excluded from its own option list).
 *
 * In discovery mode each selected connection also gets a mechanism row beneath
 * the select — how the work physically moves across that arrow. That's the
 * finding; the arrow alone only says the handoff exists.
 */
export function ConnectionEditor({ item, allItems, lanes, dispatch, discovery = false }: Props) {
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

  // Name the lane only when the target is in a DIFFERENT lane. Prefixing
  // "Delivery ·" onto a step while you are standing in Delivery is noise; the
  // lane is only information when the handoff crosses one.
  const labelFor = (id: string): string => {
    const target = allItems.find((i) => i.id === id);
    if (!target) return id;
    if (target.laneId === item.laneId) return target.label;
    const scope = target.laneId ? laneName.get(target.laneId) ?? "" : "Inbox";
    return scope ? `${scope} · ${target.label}` : target.label;
  };

  const detailFor = (toId: string): Connection | undefined =>
    item.connections?.find((c) => c.toId === toId);

  return (
    <>
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
        tagRender={({ value, closable, onClose }) => {
          // antd renders the "+N" overflow chip through tagRender too, with no
          // value. Without this guard it printed the literal text "undefined".
          if (value === undefined || value === null) return <span />;
          return (
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
          );
        }}
        onChange={(next: string[]) => {
          dispatch({ type: "SET_CONNECTIONS", id: item.id, connectsTo: next });
          haptic("tap");
        }}
      />

      {discovery && item.connectsTo.length > 0 && (
        <div className="sf-mech-list">
          {item.connectsTo.map((toId) => {
            const detail = detailFor(toId);
            return (
              <div key={toId} className="sf-mech-row">
                {/* Name BOTH ends. "→ Process Engineering" alone is a fragment —
                    you have to remember which step you are standing in to read
                    it. The whole question belongs on the screen. */}
                <span className="sf-mech-target" title={`${item.label} → ${labelFor(toId)}`}>
                  <strong>{item.label}</strong> → <strong>{labelFor(toId)}</strong>
                </span>
                {/* The label has to survive selection — a placeholder alone
                    disappears the moment a value is picked, leaving a bare
                    dropdown with no name on it. */}
                <span className="sf-mech-label">Handoff method</span>
                <Select<string>
                  size="small"
                  allowClear
                  className={`sf-mech-select${detail?.mechanism ? "" : " sf-field-unfilled"}`}
                  placeholder="Email, spreadsheet, phone call…"
                  value={mechanismToValue(detail?.mechanism)}
                  // The eight rungs are suggestions, not a cage — this is a
                  // discovery tool, and the answer that doesn't fit the list is
                  // usually the most interesting one in the room.
                  mode="tags"
                  maxCount={1}
                  options={MECHANISMS}
                  optionFilterProp="label"
                  onChange={(next) => {
                    // Tag mode hands back an array; we only ever keep one.
                    const raw = Array.isArray(next) ? next[next.length - 1] : next;
                    dispatch({
                      type: "SET_MECHANISM",
                      id: item.id,
                      toId,
                      mechanism: raw ? parseMechanism(raw) : undefined,
                    });
                    haptic("tap");
                  }}
                />
                {detail?.mechanism === "system" && (
                  <Input
                    // Uncontrolled (commits on blur/Enter so typing isn't a
                    // dispatch per keystroke) — key it to the doc value so a
                    // template load or Start over doesn't leave stale text.
                    key={detail.systemName ?? ""}
                    size="small"
                    className="sf-mech-system"
                    placeholder="Name the system"
                    defaultValue={detail.systemName ?? ""}
                    onBlur={(e) =>
                      dispatch({
                        type: "SET_SYSTEM_NAME",
                        id: item.id,
                        toId,
                        systemName: e.target.value,
                      })
                    }
                    onPressEnter={(e) =>
                      dispatch({
                        type: "SET_SYSTEM_NAME",
                        id: item.id,
                        toId,
                        systemName: (e.target as HTMLInputElement).value,
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
