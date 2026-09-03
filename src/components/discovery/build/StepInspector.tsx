import { type Dispatch } from "react";
import { Button, Empty } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { Action } from "../store";
import type { CaptureStep, ListOption } from "../types";
import { haptic } from "@/lib/haptics";
import { StepDetailFields } from "./StepDetailFields";

interface Props {
  step: CaptureStep | null;
  roles: ListOption[];
  systemsList: ListOption[];
  dispatch: Dispatch<Action>;
  onClose: () => void;
}

/** Mirrors smartflow/build/StepInspector.tsx: plain flow content so the
 *  drawer's own toolbar/scroll/resize handle stay in control. */
export function StepInspector({ step, roles, systemsList, dispatch, onClose }: Props) {
  if (!step) {
    return (
      <div className="sf-panel-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="sf-inspector-empty-text">Pick a step to edit it.</span>}
        />
      </div>
    );
  }

  return (
    <div className="sf-panel">
      <div className="sf-panel-fields">
        <StepDetailFields step={step} roles={roles} systemsList={systemsList} dispatch={dispatch} />
      </div>

      <div className="sf-panel-foot">
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => {
            haptic("warning");
            dispatch({ type: "DELETE_STEP", id: step.id });
            onClose();
          }}
        >
          Delete step
        </Button>
      </div>
    </div>
  );
}
