import { type Dispatch } from "react";
import { Select } from "antd";
import type { Action } from "../store";
import type { Connection, Item } from "../types";
import { haptic } from "@/lib/haptics";

interface Props {
  item: Item;
  allItems: Item[];
  dispatch: Dispatch<Action>;
}

const LABEL_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

/**
 * Branch labels for a decision step (flowchart, decision tree) — a Yes/No fork
 * answers "which path does the process take," which is a different question
 * from swimlane's handoff mechanism ("how does work physically move"). The two
 * concepts share the same connectsTo edge but need separate controls: this
 * replaces the mechanism editor for branching types instead of sitting
 * alongside it, since a Yes/No fork rarely also has a meaningful "email vs.
 * spreadsheet" answer — asking for both would be asking two unrelated
 * questions through one field.
 *
 * Only shown for a step whose label reads as a decision (ends in "?"); a
 * plain step's outgoing connections stay unlabeled, matching a flowchart
 * where only forks branch.
 */
export function BranchLabelEditor({ item, allItems, dispatch }: Props) {
  const labelFor = (id: string): string => allItems.find((i) => i.id === id)?.label ?? id;
  const detailFor = (toId: string): Connection | undefined =>
    item.connections?.find((c) => c.toId === toId);

  return (
    <div className="sf-mech-list">
      {item.connectsTo.map((toId) => {
        const current = detailFor(toId)?.label ?? "";
        return (
          <div key={toId} className="sf-mech-row">
            <p className="sf-mech-sentence">
              <strong>{item.label}</strong> →{" "}
              {current ? <strong>{current}</strong> : <span className="sf-mech-unset">label…</span>}
              {" → "}
              <strong>{labelFor(toId)}</strong>
            </p>
            <div className="sf-mech-controls">
              <Select
                allowClear
                className={`sf-mech-select${current ? "" : " sf-field-unfilled"}`}
                placeholder="Yes / No"
                value={current || undefined}
                options={LABEL_OPTIONS}
                onChange={(next) => {
                  dispatch({ type: "SET_CONNECTION_LABEL", id: item.id, toId, label: next ?? "" });
                  haptic("tap");
                }}
                onClear={() => {
                  dispatch({ type: "SET_CONNECTION_LABEL", id: item.id, toId, label: "" });
                  haptic("tap");
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
