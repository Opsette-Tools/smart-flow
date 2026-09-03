import { useState, type Dispatch } from "react";
import { Divider, Input, Select, Switch } from "antd";
import {
  UserOutlined,
  DatabaseOutlined,
  WarningFilled,
  ShareAltOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { Action } from "../store";
import type { CaptureStep, Confidence, ListOption } from "../types";
import { RolePicker } from "./RolePicker";
import { SystemsPicker } from "./SystemsPicker";
import { BranchEditor } from "./BranchEditor";

const { TextArea } = Input;

interface Props {
  step: CaptureStep;
  roles: ListOption[];
  systemsList: ListOption[];
  dispatch: Dispatch<Action>;
}

const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "assumed", label: "Assumed" },
];

/**
 * One step's fields, for the drawer. Live-capture fields first — what you'd
 * actually fill in while someone is talking. Backfill fields (filled from the
 * transcript afterward) sit below a collapsed divider so they don't compete
 * for attention during the meeting itself, but stay one tap away when you're
 * back at your desk.
 */
export function StepDetailFields({ step, roles, systemsList, dispatch }: Props) {
  const [backfillOpen, setBackfillOpen] = useState(false);
  const hasBackfill = !!(step.trigger || step.input || step.output || step.notification || step.waitTime || step.confidence);

  return (
    <>
      <section className="sf-field-group">
        <h4 className="sf-field-title">Step id</h4>
        <Input
          key={`label-${step.id}-${step.stepLabel}`}
          defaultValue={step.stepLabel}
          onBlur={(e) => dispatch({ type: "SET_STEP_LABEL", id: step.id, stepLabel: e.target.value })}
          style={{ maxWidth: 120 }}
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">What happens</h4>
        <TextArea
          key={`wh-${step.id}-${step.whatHappens}`}
          placeholder='Verb phrase, short — e.g. "reviews invoice for match"'
          defaultValue={step.whatHappens}
          autoSize={{ minRows: 1, maxRows: 4 }}
          onBlur={(e) => dispatch({ type: "SET_WHAT_HAPPENS", id: step.id, whatHappens: e.target.value })}
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><UserOutlined /> Role</h4>
        <RolePicker roles={roles} value={step.role} onChange={(role) => dispatch({ type: "SET_ROLE", id: step.id, role })} />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><DatabaseOutlined /> System(s)</h4>
        <SystemsPicker
          systemsList={systemsList}
          value={step.systems}
          onChange={(systems) => dispatch({ type: "SET_SYSTEMS", id: step.id, systems })}
        />
      </section>

      <section className="sf-field-group">
        <div className="sf-field-toggle-row">
          <h4 className="sf-field-title"><WarningFilled /> Pain point</h4>
          <Switch
            checked={!!step.painFlag}
            onChange={(checked) => dispatch({ type: "SET_PAIN_FLAG", id: step.id, flagged: checked, note: step.painFlag?.note })}
          />
        </div>
        {step.painFlag && (
          <TextArea
            key={`pf-${step.id}-${step.painFlag?.note ?? ""}`}
            placeholder="What makes this a pain point"
            defaultValue={step.painFlag?.note ?? ""}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onBlur={(e) => dispatch({ type: "SET_PAIN_FLAG", id: step.id, flagged: true, note: e.target.value })}
          />
        )}
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><ShareAltOutlined /> Next step</h4>
        <BranchEditor step={step} dispatch={dispatch} />
      </section>

      <Divider style={{ margin: "12px 0" }} />

      <button
        type="button"
        className="sf-backfill-toggle"
        onClick={() => setBackfillOpen((v) => !v)}
        aria-expanded={backfillOpen}
      >
        {backfillOpen ? <DownOutlined /> : <RightOutlined />}
        Backfill from transcript
        {hasBackfill && !backfillOpen && <span className="sf-backfill-dot" aria-label="Has backfill detail" />}
      </button>

      {backfillOpen && (
        <>
          <section className="sf-field-group">
            <h4 className="sf-field-title">Trigger</h4>
            <Input
              key={`tr-${step.id}-${step.trigger ?? ""}`}
              placeholder="What starts this step"
              defaultValue={step.trigger ?? ""}
              onBlur={(e) => dispatch({ type: "SET_TRIGGER", id: step.id, trigger: e.target.value })}
            />
          </section>

          <section className="sf-field-group">
            <h4 className="sf-field-title">Input</h4>
            <Input
              key={`in-${step.id}-${step.input ?? ""}`}
              placeholder="What they receive, and in what form"
              defaultValue={step.input ?? ""}
              onBlur={(e) => dispatch({ type: "SET_INPUT", id: step.id, input: e.target.value })}
            />
          </section>

          <section className="sf-field-group">
            <h4 className="sf-field-title">Output</h4>
            <Input
              key={`out-${step.id}-${step.output ?? ""}`}
              placeholder="What they produce"
              defaultValue={step.output ?? ""}
              onBlur={(e) => dispatch({ type: "SET_OUTPUT", id: step.id, output: e.target.value })}
            />
          </section>

          <section className="sf-field-group">
            <h4 className="sf-field-title">Notification</h4>
            <Input
              key={`no-${step.id}-${step.notification ?? ""}`}
              placeholder="Email, someone walks over, or nothing"
              defaultValue={step.notification ?? ""}
              onBlur={(e) => dispatch({ type: "SET_NOTIFICATION", id: step.id, notification: e.target.value })}
            />
          </section>

          <section className="sf-field-group">
            <h4 className="sf-field-title">Wait time</h4>
            <Input
              key={`wt-${step.id}-${step.waitTime ?? ""}`}
              placeholder="How long it sits between steps"
              defaultValue={step.waitTime ?? ""}
              onBlur={(e) => dispatch({ type: "SET_WAIT_TIME", id: step.id, waitTime: e.target.value })}
            />
          </section>

          <section className="sf-field-group">
            <h4 className="sf-field-title">Confidence</h4>
            <Select
              allowClear
              placeholder="Confirmed vs. assumed"
              value={step.confidence}
              options={CONFIDENCE_OPTIONS}
              onChange={(v) => dispatch({ type: "SET_CONFIDENCE", id: step.id, confidence: v })}
              style={{ width: "100%" }}
            />
          </section>
        </>
      )}
    </>
  );
}
