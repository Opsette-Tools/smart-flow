import { Handle, Position, type NodeProps } from "reactflow";

/**
 * Custom React Flow nodes for SmartFlow's outline diagrams (flowchart,
 * decision tree, org chart, timeline). All are render-only — these diagrams are
 * generated from pasted text, so handles exist purely as edge anchor points and
 * are hidden. The swimlane no longer renders here; it has its own canvas in
 * ../schemamap.
 *
 * Every node exposes target anchors on left+top and source anchors on
 * right+bottom; each layout picks the handle pair that routes cleanly.
 */

const hiddenHandle: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
};

function Anchors() {
  return (
    <>
      <Handle id="t-left" type="target" position={Position.Left} style={hiddenHandle} isConnectable={false} />
      <Handle id="t-top" type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle id="t-right" type="target" position={Position.Right} style={hiddenHandle} isConnectable={false} />
      <Handle id="s-right" type="source" position={Position.Right} style={hiddenHandle} isConnectable={false} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} style={hiddenHandle} isConnectable={false} />
    </>
  );
}

const ellipsis: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
};

const wrapLabel: React.CSSProperties = {
  width: "100%",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  lineHeight: 1.25,
};

export function ItemNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="sf-rf-item">
      <Anchors />
      <span style={wrapLabel}>{data.label}</span>
    </div>
  );
}

/** A decision step (a yes/no question). Gold-tinted so it reads as a fork. */
export function DecisionNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="sf-rf-item sf-rf-decision">
      <Anchors />
      <span style={{ ...wrapLabel, textAlign: "center" }}>{data.label}</span>
    </div>
  );
}

/** A terminal endpoint — the path ends here (a decline, a loss, a stop). Muted
 *  so it reads as an off-ramp rather than a step the flow continues from. */
export function EndpointNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="sf-rf-item sf-rf-endpoint">
      <Anchors />
      <span style={{ ...wrapLabel, textAlign: "center" }}>{data.label}</span>
    </div>
  );
}

/** A timeline milestone — bigger, with an optional sub-note line. */
export function MilestoneNode({ data }: NodeProps<{ label: string; note?: string }>) {
  return (
    <div className="sf-rf-item sf-rf-milestone">
      <Anchors />
      <div style={{ width: "100%" }}>
        <div style={{ ...ellipsis, fontWeight: 600 }}>{data.label}</div>
        {data.note ? (
          <div style={{ ...ellipsis, fontSize: 11, opacity: 0.7, marginTop: 2 }}>{data.note}</div>
        ) : null}
      </div>
    </div>
  );
}

export const nodeTypes = {
  itemNode: ItemNode,
  decisionNode: DecisionNode,
  endpointNode: EndpointNode,
  milestoneNode: MilestoneNode,
};
