import { useMemo } from "react";
import { Input, Typography, Card, Button, Modal } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import type { Edge, Node } from "reactflow";
import { parseOutline, flattenOutline, type OutlineNode } from "./outline";
import { diagramInfo, type DiagramType } from "./diagramTypes";
import { buildTreeLayout } from "./diagram/treeLayout";
import { buildFlowchartLayout, buildTimelineLayout } from "./diagram/flowLayout";
import { DiagramCanvas } from "./diagram/DiagramCanvas";
import { useThemeMode } from "@/lib/theme";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Props {
  type: DiagramType; // one of flowchart | decision-tree | org-tree | timeline
  text: string;
  onChange: (text: string) => void;
}

// Per-type placeholder text that teaches the input by example.
const PLACEHOLDERS: Record<string, string> = {
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

const HELP: Record<string, string> = {
  flowchart:
    "One step per line. End a line with a question mark to make it a yes/no point, then indent the two answers under it.",
  "decision-tree":
    "Start with a yes/no question. Indent what happens next under it. Indent again to keep branching.",
  "org-tree": "One name per line. Indent a name to place it under the one above it.",
  timeline: "One milestone per line, in order. Optionally indent a date under each.",
};

/** Build the right nodes/edges for an outline-based diagram type. */
function layoutFor(
  type: DiagramType,
  roots: OutlineNode[],
  isDark: boolean,
): { nodes: Node[]; edges: Edge[] } {
  switch (type) {
    case "flowchart":
      return buildFlowchartLayout(roots, isDark);
    case "timeline":
      return buildTimelineLayout(roots, isDark);
    case "decision-tree": {
      // Label the first two children of any question node Yes / No.
      const edgeLabels = new Map<string, string>();
      for (const n of flattenOutline(roots)) {
        if (n.label.trim().endsWith("?")) {
          n.children.slice(0, 2).forEach((c, i) => edgeLabels.set(c.id, i === 0 ? "Yes" : "No"));
        }
      }
      return buildTreeLayout(roots, isDark, { edgeLabels });
    }
    case "org-tree":
    default:
      return buildTreeLayout(roots, isDark);
  }
}

export function OutlineBuilder({ type, text, onChange }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const info = diagramInfo(type);

  const { nodes, edges } = useMemo(() => {
    const roots = parseOutline(text);
    return layoutFor(type, roots, isDark);
  }, [type, text, isDark]);

  const handleClear = () => {
    if (!text.trim()) return;
    Modal.confirm({
      title: `Clear this ${info.name.toLowerCase()}?`,
      content: "This empties the box and the diagram so you can start fresh. It can't be undone.",
      okText: "Clear",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => onChange(""),
    });
  };

  return (
    <div className="sf-stack">
      <Card variant="outlined" styles={{ body: { padding: 16 } }}>
        <div className="sf-section-head" style={{ marginBottom: 8 }}>
          <h2 className="sf-section-title">Your {info.name.toLowerCase()}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Text className="sf-section-hint">{HELP[type]}</Text>
            <Button
              type="text"
              size="small"
              danger
              icon={<ClearOutlined />}
              onClick={handleClear}
              disabled={!text.trim()}
            >
              Clear
            </Button>
          </div>
        </div>
        <TextArea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={PLACEHOLDERS[type]}
          autoSize={{ minRows: 6, maxRows: 16 }}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 14 }}
        />
      </Card>

      <DiagramCanvas
        nodes={nodes}
        edges={edges}
        exportName={`smartflow-${type}`}
        empty={
          <Paragraph type="secondary" style={{ maxWidth: 320 }}>
            Type or paste above to see your {info.name.toLowerCase()} appear here.
          </Paragraph>
        }
      />
    </div>
  );
}
