import { type Dispatch } from "react";
import { DatePicker, Input, TimePicker } from "antd";
import dayjs from "dayjs";
import type { Action } from "../store";
import type { SessionHeader } from "../types";

const { TextArea } = Input;

// Stored as plain strings (SessionHeader.date / .recordingStart) so the doc
// stays JSON-plain and doesn't carry a dayjs instance — these two converters
// are the only place that boundary is crossed, in either direction.
const DATE_FORMAT = "YYYY-MM-DD";
const TIME_FORMAT = "h:mm A";

interface Props {
  header: SessionHeader;
  dispatch: Dispatch<Action>;
}

/** Session header: fill before you walk in. Plain fields, blur-to-commit,
 *  same convention as every other field in this app. */
export function SessionHeaderForm({ header, dispatch }: Props) {
  const set = (patch: Partial<SessionHeader>) => dispatch({ type: "SET_HEADER", header: patch });

  return (
    <div className="sf-stack">
      <section className="sf-field-group">
        <h4 className="sf-field-title">Division</h4>
        <Input key={`div-${header.division}`} defaultValue={header.division} onBlur={(e) => set({ division: e.target.value })} />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">Process name</h4>
        <Input
          key={`proc-${header.processName}`}
          defaultValue={header.processName}
          onBlur={(e) => set({ processName: e.target.value })}
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">Date</h4>
        <DatePicker
          value={header.date ? dayjs(header.date, DATE_FORMAT) : null}
          onChange={(value) => set({ date: value ? value.format(DATE_FORMAT) : "" })}
          style={{ maxWidth: 200 }}
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">Recording start time</h4>
        <TimePicker
          value={header.recordingStart ? dayjs(header.recordingStart, TIME_FORMAT) : null}
          onChange={(value) => set({ recordingStart: value ? value.format(TIME_FORMAT) : "" })}
          format={TIME_FORMAT}
          minuteStep={5}
          style={{ maxWidth: 200 }}
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">Attendees</h4>
        <TextArea
          key={`att-${header.attendees}`}
          placeholder={"One per line — name and role title, e.g.\nJane Doe — AP Manager"}
          defaultValue={header.attendees}
          autoSize={{ minRows: 2, maxRows: 8 }}
          onBlur={(e) => set({ attendees: e.target.value })}
        />
      </section>
    </div>
  );
}
