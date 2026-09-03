import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Button, Dropdown, Empty, Input, Modal, Tooltip, Typography } from "antd";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CodeOutlined,
  MoreOutlined,
  PlusOutlined,
  UserOutlined,
  WarningFilled,
} from "@ant-design/icons";
import type { Edge, Node } from "reactflow";
import { docToOutlineText, outlineTextToDoc } from "./outlineImport";
import { diagramInfo, type DiagramType } from "./diagramTypes";
import { buildTreeLayout } from "./diagram/treeLayout";
import { buildFlowchartLayout, buildTimelineLayout } from "./diagram/flowLayout";
import { DiagramCanvas } from "./diagram/DiagramCanvas";
import { walkReadingOrder } from "./diagram/itemGraph";
import type { Action } from "./store";
import { connectionMechanisms, type Item, type SmartFlowDoc } from "./types";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { ResizableDrawer } from "@/components/common/ResizableDrawer";
import { StepInspector } from "./build/StepInspector";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type OutlineType = Exclude<DiagramType, "swimlane" | "schema">;

interface Props {
  type: OutlineType;
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
}

// Per-type placeholder text that teaches the input by example.
const PLACEHOLDERS: Record<OutlineType, string> = {
  flowchart: `Receive order
Check stock
In stock?
  Pack and ship
  Backorder the item
Send confirmation`,
  "decision-tree": `Is the deal above our margin?
  Send to quote
  Is capacity open?
    Negotiate terms
    Decline politely`,
  "org-tree": `Owner
  Operations Manager
    Warehouse Lead
    Logistics
  Sales Manager
    Account Rep`,
  timeline: `Kickoff
  Jan
Discovery
  Feb
Build
  Mar - Apr
Launch
  May`,
};

const HELP: Record<OutlineType, string> = {
  flowchart:
    "One step per line. End a line with a question mark to make it a yes/no point, then indent the two answers under it.",
  "decision-tree":
    "Start with a yes/no question. Indent what happens next under it. Indent again to keep branching.",
  "org-tree": "One name per line. Indent a name to place it under the one above it.",
  timeline: "One milestone per line, in order. Optionally indent a date under each.",
};

/** Build the right nodes/edges for an outline-based diagram type. */
function layoutFor(type: OutlineType, items: Item[], isDark: boolean): { nodes: Node[]; edges: Edge[] } {
  switch (type) {
    case "flowchart":
      return buildFlowchartLayout(items, isDark);
    case "timeline":
      return buildTimelineLayout(items, isDark);
    case "decision-tree":
      return buildTreeLayout(items, isDark, { edgeLabels: true });
    case "org-tree":
    default:
      return buildTreeLayout(items, isDark);
  }
}

/** One row on the step list. Not draggable — order comes from the connectsTo
 *  graph (edited via the inspector's handoff picker), not a free-floating
 *  drag state that could desync from the data. */
function OutlineStepRow({
  item,
  allItems,
  selected,
  onSelect,
  branchLabel,
}: {
  item: Item;
  allItems: Item[];
  selected: boolean;
  onSelect: () => void;
  /** "Yes" / "No" when this row is reached via a labeled branch — shown as a
   *  small prefix so the flat list still reads like the diagram does. */
  branchLabel?: string;
}) {
  const handoffCount = item.connectsTo.filter((id) => allItems.some((i) => i.id === id)).length;
  const needsDetail =
    !item.systemOfRecord ||
    item.connectsTo.some(
      (toId) => connectionMechanisms(item.connections?.find((c) => c.toId === toId)).length === 0,
    );

  return (
    <div
      className={`sf-step${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      style={{ paddingLeft: 10 }}
    >
      {branchLabel && <span className="sf-step-seq">{branchLabel}</span>}
      <span className="sf-step-label">{item.label}</span>
      {item.dateNote && <span className="sf-step-handoffs">{item.dateNote}</span>}
      {handoffCount > 0 && (
        <span
          className="sf-step-handoffs"
          aria-label={`Hands off to ${handoffCount} step${handoffCount === 1 ? "" : "s"}`}
        >
          <ArrowRightOutlined />
          {handoffCount}
        </span>
      )}
      {item.owner && (
        <Tooltip title={`Owner: ${item.owner}`}>
          <span className="sf-step-owner" aria-label={`Owner: ${item.owner}`}>
            <UserOutlined />
          </span>
        </Tooltip>
      )}
      {item.validated && (
        <span className="sf-step-validated" aria-label="Validated">
          <CheckCircleOutlined />
        </span>
      )}
      {item.breakPoint && (
        <Tooltip title={item.breakPoint.note}>
          <span className="sf-step-break" aria-label={`Break point: ${item.breakPoint.note}`}>
            <WarningFilled />
          </span>
        </Tooltip>
      )}
      {needsDetail && <span className="sf-step-dot" aria-label="Missing detail" />}
    </div>
  );
}

/**
 * The outline types' Build tab. The doc (Item[]) is the source of truth, the
 * same as swimlane's board. Steps show as a plain list in reading order (a
 * root, then its connectsTo children depth-first) rather than a lane board —
 * a branching spine has no "which column" axis to place cards into the way a
 * lane does. Clicking a row opens the same StepInspector drawer swimlane
 * uses, so owner/system-of-record/open-question/mechanism work identically
 * for every diagram type.
 *
 * The original paste box survives as a collapsible bulk-edit path: typing
 * there re-imports the whole text through outlineTextToDoc() and replaces the
 * doc. Reopening a saved flow (or editing a single step in the drawer) keeps
 * the box in sync via docToOutlineText() so it never looks stale.
 */
export function OutlineBuilder({ type, doc, dispatch }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const info = diagramInfo(type);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(doc.items.length === 0);
  const [text, setText] = useState(() => docToOutlineText(type, doc));
  // outlineTextToDoc mints fresh ids on every call, so the doc's own item ids
  // change on every keystroke too — they can't be used to detect "did this
  // change come from outside." Instead, track whether OUR OWN dispatch is the
  // thing that produced the doc currently in view; only resync the textarea
  // when it wasn't (a different flow loading, a drawer edit, an external
  // REPLACE_DOC from elsewhere).
  const lastDispatchedDoc = useRef<SmartFlowDoc | null>(null);
  useEffect(() => {
    if (lastDispatchedDoc.current === doc) return;
    setText(docToOutlineText(type, doc));
  }, [type, doc]);

  const itemsById = useMemo(() => new Map(doc.items.map((i) => [i.id, i])), [doc.items]);
  const ordered = useMemo(() => walkReadingOrder(doc.items), [doc.items]);
  const selectedItem = selectedId ? itemsById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !itemsById.has(selectedId)) setSelectedId(null);
  }, [selectedId, itemsById]);

  const { nodes, edges } = useMemo(() => layoutFor(type, doc.items, isDark), [type, doc.items, isDark]);

  const handleTextChange = (next: string) => {
    setText(next);
    const nextDoc = outlineTextToDoc(type, next);
    lastDispatchedDoc.current = nextDoc;
    dispatch({ type: "REPLACE_DOC", doc: nextDoc });
  };

  const handleClear = () => {
    if (doc.items.length === 0) return;
    Modal.confirm({
      title: `Clear this ${info.name.toLowerCase()}?`,
      content: "This empties every step so you can start fresh. It can't be undone.",
      okText: "Clear",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        haptic("warning");
        handleTextChange("");
        setTextOpen(true);
      },
    });
  };

  const handleAddSingle = () => {
    const label = type === "timeline" ? "New milestone" : "New step";
    dispatch({ type: "ADD_ITEM", label, laneId: null });
  };

  return (
    <div className="sf-stack">
      <div className="sf-build-actions">
        <Text className="sf-section-hint">{HELP[type]}</Text>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<CodeOutlined />}
            onClick={() => setTextOpen((o) => !o)}
          >
            {textOpen ? "Hide paste box" : "Paste / bulk edit"}
          </Button>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: "reset",
                  icon: <ClearOutlined />,
                  label: "Clear",
                  danger: true,
                  disabled: doc.items.length === 0,
                },
              ],
              onClick: () => handleClear(),
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Board actions" />
          </Dropdown>
        </div>
      </div>

      {textOpen && (
        <div className="sf-lane-col-foot" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <TextArea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={PLACEHOLDERS[type]}
            autoSize={{ minRows: 4, maxRows: 14 }}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 14 }}
          />
        </div>
      )}

      <section className="sf-board-section">
        <div className="sf-board-head">
          <h2 className="sf-section-title">Your {info.name.toLowerCase()}</h2>
        </div>

        {ordered.length > 0 ? (
          <div className="sf-outline-list">
            {ordered.map(({ item, branchLabel }) => (
              <OutlineStepRow
                key={item.id}
                item={item}
                allItems={doc.items}
                selected={selectedId === item.id}
                onSelect={() => setSelectedId(item.id)}
                branchLabel={branchLabel}
              />
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddSingle}>
              {type === "timeline" ? "Add milestone" : "Add step"}
            </Button>
            {(type === "flowchart" || type === "decision-tree") && (
              <Text type="secondary" className="sf-section-hint">
                End a step's name with a question mark to make it a yes/no branch point, then open it to label
                where Yes and No each go.
              </Text>
            )}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`Paste steps above to start your ${info.name.toLowerCase()}.`}
            style={{ padding: "32px 0" }}
          />
        )}
      </section>

      <DiagramCanvas
        nodes={nodes}
        edges={edges}
        exportName={`smartflow-${type}`}
        empty={
          <Paragraph type="secondary" style={{ maxWidth: 320 }}>
            Add steps above to see your {info.name.toLowerCase()} appear here.
          </Paragraph>
        }
      />

      <ResizableDrawer
        open={selectedItem !== null}
        onClose={() => setSelectedId(null)}
        title={selectedItem ? selectedItem.label : "Step"}
        onRename={
          selectedItem
            ? (label) => label.trim() && dispatch({ type: "RENAME_ITEM", id: selectedItem.id, label })
            : undefined
        }
        storageKey="smart-flow-drawer-w"
      >
        <StepInspector
          item={selectedItem}
          allItems={doc.items}
          lanes={[]}
          dispatch={dispatch}
          onClose={() => setSelectedId(null)}
          branching={type === "flowchart" || type === "decision-tree"}
        />
      </ResizableDrawer>
    </div>
  );
}
