import { type Dispatch } from "react";
import { Input, Switch } from "antd";
import {
  UserOutlined,
  CheckCircleOutlined,
  WarningFilled,
  DatabaseOutlined,
  ShareAltOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { ConnectionEditor } from "./ConnectionEditor";

const { TextArea } = Input;

interface Props {
  item: Item;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
}

/**
 * The editable fields for one step. Shared by the step drawer and the lane
 * review so the two can never drift apart.
 */
export function StepDetailFields({ item, allItems, lanes, dispatch }: Props) {
  return (
    <>
      <section className="sf-field-group">
        <h4 className="sf-field-title"><UserOutlined /> Owner</h4>
        <Input
          key={`owner-${item.id}-${item.owner ?? ""}`}
          className={item.owner ? undefined : "sf-field-unfilled"}
          placeholder="Whose job is this"
          defaultValue={item.owner ?? ""}
          onBlur={(e) =>
            dispatch({
              type: "SET_OWNER",
              id: item.id,
              owner: e.target.value,
            })
          }
          onPressEnter={(e) =>
            dispatch({
              type: "SET_OWNER",
              id: item.id,
              owner: (e.target as HTMLInputElement).value,
            })
          }
        />
      </section>

      <section className="sf-field-group">
        <div className="sf-field-toggle-row">
          <h4 className="sf-field-title"><CheckCircleOutlined /> Validated</h4>
          <Switch
            checked={item.validated ?? false}
            onChange={(checked) =>
              dispatch({ type: "SET_VALIDATED", id: item.id, validated: checked })
            }
          />
        </div>
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><WarningFilled /> Break point</h4>
        <TextArea
          key={`bp-${item.id}-${item.breakPoint?.note ?? ""}`}
          placeholder="Where they said it actually breaks — dropped, delayed, nobody trusts what happens next"
          defaultValue={item.breakPoint?.note ?? ""}
          autoSize={{ minRows: 2, maxRows: 6 }}
          onBlur={(e) =>
            dispatch({
              type: "SET_BREAK_POINT",
              id: item.id,
              breakPoint: { note: e.target.value },
            })
          }
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><DatabaseOutlined /> System of record</h4>
        <Input
          // Uncontrolled + commit on blur so a live typist isn't dispatching
          // per keystroke. Keyed so template loads reseed it.
          key={`sor-${item.id}-${item.systemOfRecord ?? ""}`}
          className={item.systemOfRecord ? undefined : "sf-field-unfilled"}
          placeholder="QuickBooks, Airtable, shared drive"
          defaultValue={item.systemOfRecord ?? ""}
          onBlur={(e) =>
            dispatch({
              type: "SET_SYSTEM_OF_RECORD",
              id: item.id,
              systemOfRecord: e.target.value,
            })
          }
          onPressEnter={(e) =>
            dispatch({
              type: "SET_SYSTEM_OF_RECORD",
              id: item.id,
              systemOfRecord: (e.target as HTMLInputElement).value,
            })
          }
        />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><ShareAltOutlined /> This step hands off to</h4>
        <ConnectionEditor item={item} allItems={allItems} lanes={lanes} dispatch={dispatch} />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title"><QuestionCircleOutlined /> Open question</h4>
        <TextArea
          key={`oq-${item.id}-${item.openQuestion ?? ""}`}
          placeholder="Who approves this when the manager is out?"
          defaultValue={item.openQuestion ?? ""}
          autoSize={{ minRows: 2, maxRows: 6 }}
          onBlur={(e) =>
            dispatch({
              type: "SET_OPEN_QUESTION",
              id: item.id,
              openQuestion: e.target.value,
            })
          }
        />
      </section>
    </>
  );
}
