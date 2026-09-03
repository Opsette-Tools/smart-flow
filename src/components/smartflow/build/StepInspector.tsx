import { type Dispatch } from "react";
import { Button, Empty } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";
import { StepDetailFields } from "./StepDetailFields";

interface Props {
  item: Item | null;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
  onClose: () => void;
  /** True for flowchart/decision-tree. See ConnectionEditor's own doc for why
   *  this changes what the handoff section shows. */
  branching?: boolean;
}

/**
 * One step's fields, for the drawer. Plain flow content on purpose: the drawer
 * owns the toolbar, the scrolling well, and the resize handle, so a panel that
 * set its own height and background would paint over the handle.
 */
export function StepInspector({ item, allItems, lanes, dispatch, onClose, branching }: Props) {
  if (!item) {
    return (
      <div className="sf-panel-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="sf-inspector-empty-text">Pick a step to edit it.</span>}
        />
      </div>
    );
  }

  // A doc with no lanes at all (every outline type) has nothing to name here
  // — "Inbox" would be a lane concept leaking into a diagram type that never
  // had lanes, so the head row is skipped entirely rather than shown as a
  // label that means nothing in this context.
  const laneName = lanes.length === 0 ? null : item.laneId
    ? lanes.find((l) => l.id === item.laneId)?.name ?? "Unknown lane"
    : "Inbox";

  return (
    <div className="sf-panel">
      {/* The drawer's toolbar already carries the step name, so this only adds
          the piece the toolbar can't: which lane the step sits in. */}
      {laneName && (
        <div className="sf-panel-head">
          <span className="sf-inspector-lane">{laneName}</span>
        </div>
      )}

      <div className="sf-panel-fields">
        <StepDetailFields
          item={item}
          allItems={allItems}
          lanes={lanes}
          dispatch={dispatch}
          branching={branching}
        />
      </div>

      <div className="sf-panel-foot">
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => {
            haptic("warning");
            dispatch({ type: "DELETE_ITEM", id: item.id });
            onClose();
          }}
        >
          Delete step
        </Button>
      </div>
    </div>
  );
}
