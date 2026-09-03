import { type Dispatch } from "react";
import { Dropdown, Tag } from "antd";
import { MoreOutlined, WarningFilled, ArrowRightOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { CaptureStep } from "../types";
import { listLabel } from "../lists";
import type { ListOption } from "../types";
import { haptic } from "@/lib/haptics";

interface Props {
  step: CaptureStep;
  roles: ListOption[];
  dispatch: Dispatch<Action>;
  selected?: boolean;
  onSelect: () => void;
}

/**
 * The board face of one capture-sheet row: step id, role, and what happens —
 * the three things worth confirming at a glance mid-meeting. Mirrors
 * LaneItemCard's shape (drag handle, tap-to-open-drawer, kebab menu) so the
 * capture sheet reuses the app's one established row idiom instead of
 * introducing a data-grid.
 */
export function StepCard({ step, roles, dispatch, selected = false, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const branchCount = step.branches.filter((b) => b.nextStepLabel.trim()).length;
  const roleName = listLabel(roles, step.role);

  const onMenu = ({ key }: { key: string }) => {
    if (key === "delete") {
      haptic("warning");
      dispatch({ type: "DELETE_STEP", id: step.id });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sf-step${isDragging ? " is-dragging" : ""}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="sf-step-grip" {...attributes} {...listeners} aria-label="Drag to reorder">
        <MoreOutlined rotate={90} />
      </span>

      <span className="sf-step-seq">{step.stepLabel}</span>

      <span className="sf-step-label">{step.whatHappens || <em>What happens…</em>}</span>

      {roleName && <Tag>{roleName}</Tag>}

      {branchCount > 0 && (
        <span className="sf-step-handoffs" aria-label={`${branchCount} branch${branchCount === 1 ? "" : "es"}`}>
          <ArrowRightOutlined />
          {branchCount}
        </span>
      )}

      {step.painFlag && (
        <span className="sf-step-break" aria-label="Pain point flagged">
          <WarningFilled />
        </span>
      )}

      <span className="sf-step-menu" onClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{ items: [{ key: "delete", label: "Delete", danger: true }], onClick: onMenu }}
        >
          <button type="button" className="sf-icon-btn" aria-label={`Actions for ${step.stepLabel}`}>
            <MoreOutlined />
          </button>
        </Dropdown>
      </span>
    </div>
  );
}
