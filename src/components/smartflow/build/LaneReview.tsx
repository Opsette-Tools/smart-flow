import { type Dispatch } from "react";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { StepDetailFields } from "./StepDetailFields";

interface Props {
  items: Item[];
  /** Open one step's own drawer, layered over this one. */
  onOpenStep: (id: string) => void;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

/**
 * Every step in one lane, expanded, stacked, in order. Clicking through steps
 * one at a time hides the thing a lane review is for: reading a whole lane at
 * once and spotting the step nobody could answer for.
 *
 * Plain flow content, same as StepInspector. The drawer owns the chrome.
 */
export function LaneReview({ items, allItems, lanes, dispatch, onOpenStep }: Props) {
  if (items.length === 0) {
    return (
      <div className="sf-panel-empty">
        <span className="sf-inspector-empty-text">No steps in this lane yet.</span>
      </div>
    );
  }

  return (
    <div className="sf-panel">
      {items.map((item, i) => (
        <section key={item.id} className="sf-review-step">
          {/* No lane eyebrow here. The drawer's toolbar already names the lane,
              and repeating it on every step doubles it up and crowds the top.

              The heading opens the step's own drawer over this one. When the
              lane drawer covers the board, the card it belongs to is
              unreachable, so this is the only way in. */}
          <button
            type="button"
            className="sf-review-step-head"
            onClick={() => onOpenStep(item.id)}
            title={`Open ${item.label}`}
          >
            <span className="sf-step-seq">{i + 1}</span>
            <h4 className="sf-review-step-name">{item.label}</h4>
            <ArrowRightOutlined className="sf-review-step-go" />
          </button>
          <StepDetailFields
            item={item}
            allItems={allItems}
            lanes={lanes}
            dispatch={dispatch}
          />
        </section>
      ))}
    </div>
  );
}
