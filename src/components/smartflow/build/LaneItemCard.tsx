import { useState, type Dispatch } from "react";
import { Button, Input, Tooltip } from "antd";
import {
  HolderOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowRightOutlined,
  DownOutlined,
  RightOutlined,
  QuestionCircleFilled,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Action } from "../store";
import type { Item, Lane } from "../types";
import { haptic } from "@/lib/haptics";
import { ConnectionEditor } from "./ConnectionEditor";

interface Props {
  item: Item;
  allItems: Item[];
  lanes: Lane[];
  dispatch: Dispatch<Action>;
  /** Discovery mode: mechanism rows + the details fields, expanded by default. */
  discovery?: boolean;
}

export function LaneItemCard({ item, allItems, lanes, dispatch, discovery = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  // Open by default in discovery mode — you're there to fill these in. Outside
  // discovery the card must not get heavier for someone drawing a plain lane.
  const [detailsOpen, setDetailsOpen] = useState(discovery);

  const commit = () => {
    const label = draft.trim();
    if (label && label !== item.label) dispatch({ type: "RENAME_ITEM", id: item.id, label });
    setEditing(false);
  };

  // Names of the steps this one leads to, for the read-at-a-glance summary line.
  const targets = item.connectsTo
    .map((id) => allItems.find((i) => i.id === id)?.label)
    .filter((l): l is string => Boolean(l));

  return (
    <div ref={setNodeRef} style={style} className={`sf-card${isDragging ? " is-dragging" : ""}`}>
      <div className="sf-card-top">
        <span className="sf-card-grip" {...attributes} {...listeners} aria-label="Drag to reorder">
          <HolderOutlined />
        </span>

        {editing ? (
          <Input
            size="small"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={commit}
            onBlur={commit}
            style={{ flex: 1 }}
          />
        ) : (
          <span className="sf-card-label">{item.label}</span>
        )}

        {item.openQuestion && !editing && (
          <Tooltip title={item.openQuestion}>
            <QuestionCircleFilled className="sf-card-flag" aria-label="Has an open question" />
          </Tooltip>
        )}

        <span className="sf-card-actions">
          <Tooltip title="Rename">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setDraft(item.label);
                setEditing(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                haptic("warning");
                dispatch({ type: "DELETE_ITEM", id: item.id });
              }}
            />
          </Tooltip>
        </span>
      </div>

      {/* Outside discovery this is the only place the handoffs are summarized.
          In discovery the mechanism rows list the same targets with their
          mechanism attached, so showing both says one thing three times. */}
      {targets.length > 0 && !discovery && (
        <div className="sf-conn-row">
          <ArrowRightOutlined className="sf-conn-arrow" />
          {targets.map((t, i) => (
            <span key={i} className="sf-conn-arrow" style={{ color: "inherit" }}>
              {t}
              {i < targets.length - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}

      <div className="sf-card-connect">
        <ConnectionEditor
          item={item}
          allItems={allItems}
          lanes={lanes}
          dispatch={dispatch}
          discovery={discovery}
        />
      </div>

      {discovery && (
        <div className="sf-card-details">
          <button
            type="button"
            className="sf-details-toggle"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <DownOutlined /> : <RightOutlined />}
            <span>Details</span>
            {!detailsOpen && (item.systemOfRecord || item.openQuestion) && (
              <span className="sf-details-dot" aria-label="Has details" />
            )}
          </button>

          {detailsOpen && (
            <div className="sf-details-fields">
              <label className="sf-details-field">
                <span className="sf-details-label">Storage system</span>
                <Input
                  // Uncontrolled + commit-on-blur so a live typist isn't
                  // dispatching per keystroke; keyed so template loads reseed it.
                  key={item.systemOfRecord ?? ""}
                  size="small"
                  // Amber while empty, so an unfilled step is visible on the
                  // build board instead of only in the panel.
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
              </label>

              <label className="sf-details-field">
                <span className="sf-details-label">Open question</span>
                <Input
                  key={item.openQuestion ?? ""}
                  size="small"
                  placeholder="What's unresolved on this step"
                  defaultValue={item.openQuestion ?? ""}
                  onBlur={(e) =>
                    dispatch({
                      type: "SET_OPEN_QUESTION",
                      id: item.id,
                      openQuestion: e.target.value,
                    })
                  }
                  onPressEnter={(e) =>
                    dispatch({
                      type: "SET_OPEN_QUESTION",
                      id: item.id,
                      openQuestion: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
