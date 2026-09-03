import { Select } from "antd";
import type { ListOption } from "../types";

interface Props {
  systemsList: ListOption[];
  value: string[];
  onChange: (raw: string[]) => void;
}

/** Multi-select "tags" picker against the session's own systems vocabulary —
 *  same reasoning as RolePicker, but multi-select since a step can touch more
 *  than one system. */
export function SystemsPicker({ systemsList, value, onChange }: Props) {
  return (
    <Select
      mode="tags"
      allowClear
      placeholder="QuickBooks, spreadsheet, email…"
      value={value}
      options={systemsList}
      optionFilterProp="label"
      onChange={onChange}
      style={{ width: "100%" }}
    />
  );
}
