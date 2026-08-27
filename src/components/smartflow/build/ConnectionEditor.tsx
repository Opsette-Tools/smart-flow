import { type Dispatch } from "react";
import { Input, Select } from "antd";
import type { Action } from "../store";
import {
  MECHANISMS,
  connectionMechanisms,
  mechanismListLabel,
  isCustomMechanism,
  mechanismToValue,
  parseMechanism,
  type Connection,
  type HandoffMechanism,
  type Item,
  type Lane,
} from "../types";
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
 *
 * Each selected connection also gets a handoff method beneath the select. The
 * arrow alone only says a handoff exists. The method says what carries it: an
 * email, a spreadsheet, someone walking over.
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

      {item.connectsTo.length > 0 && (
        <div className="sf-mech-list">
          <h4 className="sf-field-title">Handoff method</h4>
          {item.connectsTo.map((toId) => {
            const detail = detailFor(toId);
            const picked = connectionMechanisms(detail);
            return (
              <div key={toId} className="sf-mech-row">
                {/* Reads as a sentence, the way the summary does. Naming both
                    ends matters: "→ Process Engineering" alone is a fragment,
                    and you'd have to remember which step you were standing in
                    to make sense of it. */}
                <p className="sf-mech-sentence">
                  <strong>{item.label}</strong> hands off to{" "}
                  <strong>{labelFor(toId)}</strong>
                  {picked.length > 0 ? (
                    <>
                      {" "}
                      via <strong>{mechanismListLabel(picked)}</strong>
                      {picked.some((m) => m === "system") && detail?.systemName
                        ? ` (${detail.systemName})`
                        : ""}
                      .
                    </>
                  ) : (
                    <span className="sf-mech-unset"> via …</span>
                  )}
                </p>
                <div className="sf-mech-controls">
                  <Select<string[]>
                    allowClear
                    className={`sf-mech-select${picked.length ? "" : " sf-field-unfilled"}`}
                    placeholder="Email, spreadsheet, phone call…"
                    value={picked.map((m) => mechanismToValue(m) as string)}
                    // Multiple, because a real handoff is often compound: a
                    // spreadsheet SENT BY email is two rungs, and making someone
                    // pick one loses half the answer. Tag mode keeps the eight
                    // rungs as suggestions rather than a cage.
                    mode="tags"
                    options={MECHANISMS}
                    optionFilterProp="label"
                    onChange={(next) => {
                      const list = (next ?? [])
                        .map((raw) => parseMechanism(raw))
                        .filter((m): m is HandoffMechanism => m !== undefined);
                      dispatch({ type: "SET_MECHANISMS", id: item.id, toId, mechanisms: list });
                      haptic("tap");
                    }}
                  />
                  {picked.some((m) => m === "system") && (
                    <Input
                      // Uncontrolled (commits on blur/Enter so typing isn't a
                      // dispatch per keystroke). Keyed to the doc value so a
                      // template load or Start over doesn't leave stale text.
                      key={detail?.systemName ?? ""}
                      className="sf-mech-system"
                      placeholder="Name the system"
                      defaultValue={detail?.systemName ?? ""}
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
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
