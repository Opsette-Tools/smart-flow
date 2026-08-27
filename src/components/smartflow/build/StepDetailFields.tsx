import { type Dispatch } from "react";
import { Input } from "antd";
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
        <h4 className="sf-field-title">This step hands off to</h4>
        <ConnectionEditor item={item} allItems={allItems} lanes={lanes} dispatch={dispatch} />
      </section>

      <section className="sf-field-group">
        <h4 className="sf-field-title">System of record</h4>
        <Input
          // Uncontrolled + commit on blur so a live typist isn't dispatching
          // per keystroke. Keyed so template loads reseed it.
          key={`sor-${item.id}-${item.systemOfRecord ?? ""}`}
          className={item.systemOfRecord ? undefined : "sf-field-unfilled"}
          placeholder="QuickBooks, Airtable, shared drive, nowhere"
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
        <h4 className="sf-field-title">Open question</h4>
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
