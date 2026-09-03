import { Select } from "antd";
import type { ListOption } from "../types";

interface Props {
  roles: ListOption[];
  value: string | undefined;
  onChange: (raw: string) => void;
  placeholder?: string;
}

/** Single-select "tags" picker against the session's own role vocabulary —
 *  same mode="tags" pattern as smartflow's mechanism Select, but the option
 *  list is per-session (see lists.ts) since role names are per-client, not a
 *  global enum. Typing a new name adds it to the session's list so retyping
 *  it later becomes a pick instead of free text drifting ("AP clerk" vs
 *  "accounts payable"). */
export function RolePicker({ roles, value, onChange, placeholder }: Props) {
  return (
    <Select
      mode="tags"
      maxCount={1}
      allowClear
      placeholder={placeholder ?? "Whose job is this"}
      value={value ? [value] : []}
      options={roles}
      optionFilterProp="label"
      onChange={(next) => onChange(next[next.length - 1] ?? "")}
      style={{ width: "100%" }}
    />
  );
}
