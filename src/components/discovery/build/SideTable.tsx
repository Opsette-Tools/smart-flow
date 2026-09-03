import { Button, Checkbox, Empty, Input } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { haptic } from "@/lib/haptics";

export interface SideTableField<Row> {
  key: keyof Row;
  label: string;
  placeholder?: string;
  /** Defaults to a text Input. "checkbox" renders a Checkbox instead — used
   *  by Artifacts' requested/received columns. */
  kind?: "text" | "checkbox";
  width?: number | string;
}

interface Props<Row extends { id: string }> {
  title: string;
  emptyLabel: string;
  addLabel: string;
  rows: Row[];
  fields: SideTableField<Row>[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<Omit<Row, "id">>) => void;
  onDelete: (id: string) => void;
}

/**
 * One shared renderer for all five discovery side tables (Artifacts, Decision
 * rules, Glossary, Exceptions, Volume). Each row's fields are flat strings (or
 * a couple of booleans) — no nested detail worth a drawer round-trip — so this
 * renders each row as a compact card of inline fields, committing on blur like
 * every other text field in this app. Configuring one component per table via
 * `fields` avoids five near-identical files for what is structurally the same
 * "list of flat rows" shape.
 */
export function SideTable<Row extends { id: string }>({
  title,
  emptyLabel,
  addLabel,
  rows,
  fields,
  onAdd,
  onChange,
  onDelete,
}: Props<Row>) {
  return (
    <div className="sf-side-table">
      <div className="sf-side-table-head">
        <h3 className="sf-section-title">{title}</h3>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            onAdd();
            haptic("tap");
          }}
        >
          {addLabel}
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyLabel} style={{ padding: "16px 0" }} />
      ) : (
        <div className="sf-side-table-rows">
          {rows.map((row) => (
            <div key={row.id} className="sf-side-table-row">
              {fields.map((field) => {
                const value = row[field.key];
                if (field.kind === "checkbox") {
                  return (
                    <label key={String(field.key)} className="sf-side-table-check">
                      <Checkbox
                        checked={!!value}
                        onChange={(e) => onChange(row.id, { [field.key]: e.target.checked } as Partial<Omit<Row, "id">>)}
                      />
                      {field.label}
                    </label>
                  );
                }
                return (
                  <Input
                    key={String(field.key)}
                    placeholder={field.placeholder ?? field.label}
                    defaultValue={typeof value === "string" ? value : ""}
                    style={{ width: field.width ?? "100%" }}
                    onBlur={(e) => onChange(row.id, { [field.key]: e.target.value } as Partial<Omit<Row, "id">>)}
                  />
                );
              })}
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label="Delete row"
                onClick={() => {
                  haptic("warning");
                  onDelete(row.id);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
