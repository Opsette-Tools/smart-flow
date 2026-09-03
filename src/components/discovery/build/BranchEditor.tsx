import { type Dispatch } from "react";
import { Button, Input } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { Action } from "../store";
import type { CaptureStep } from "../types";

interface Props {
  step: CaptureStep;
  dispatch: Dispatch<Action>;
}

/**
 * next_step_id + branch_condition, as pairs. One row with a blank condition
 * is the plain linear case; more than one row is a real branch — the second
 * next_step_id row the spec calls for when a step's path depends on
 * something. Plain text fields on purpose (not a step picker): the target
 * step may not exist as a row yet mid-meeting.
 */
export function BranchEditor({ step, dispatch }: Props) {
  return (
    <div className="sf-branch-editor">
      {step.branches.map((branch) => (
        <div key={branch.id} className="sf-branch-row">
          <Input
            placeholder="Condition (blank if linear)"
            defaultValue={branch.condition}
            onBlur={(e) =>
              dispatch({ type: "SET_BRANCH", id: step.id, branchId: branch.id, patch: { condition: e.target.value } })
            }
            style={{ flex: 1 }}
          />
          <Input
            placeholder="Next step (e.g. S3)"
            defaultValue={branch.nextStepLabel}
            onBlur={(e) =>
              dispatch({
                type: "SET_BRANCH",
                id: step.id,
                branchId: branch.id,
                patch: { nextStepLabel: e.target.value },
              })
            }
            style={{ width: 130 }}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label="Remove branch"
            onClick={() => dispatch({ type: "DELETE_BRANCH", id: step.id, branchId: branch.id })}
          />
        </div>
      ))}
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        onClick={() => dispatch({ type: "ADD_BRANCH", id: step.id })}
      >
        {step.branches.length === 0 ? "Next step" : "Add branch"}
      </Button>
    </div>
  );
}
