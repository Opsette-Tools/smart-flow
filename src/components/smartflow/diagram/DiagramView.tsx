import { useMemo, useRef, useState } from "react";
import { Button, Empty, Typography, message } from "antd";
import { ArrowLeftOutlined, DownloadOutlined } from "@ant-design/icons";
import ReactFlow, { Background, Controls, type ReactFlowInstance } from "reactflow";
import type { SmartFlowDoc } from "../types";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { buildLayout } from "./laneLayout";
import { nodeTypes } from "./nodes";
import { exportDiagramPng } from "./exportImage";

const { Text } = Typography;

interface Props {
  doc: SmartFlowDoc;
  onBackToBuild: () => void;
}

export function DiagramView({ doc, onBackToBuild }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const wrapRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const [exporting, setExporting] = useState(false);

  const { nodes, edges } = useMemo(() => buildLayout(doc, isDark), [doc, isDark]);

  const placedCount = useMemo(
    () => doc.items.filter((i) => i.laneId !== null).length,
    [doc.items],
  );
  const inboxCount = doc.items.length - placedCount;
  const hasDiagram = nodes.length > 0 && placedCount > 0;

  const handleExport = async () => {
    if (!wrapRef.current || !hasDiagram) return;
    setExporting(true);
    try {
      // Frame on ALL nodes so the lane columns (the visual frame) are fully in
      // the crop, not just the item cards.
      await exportDiagramPng(wrapRef.current, nodes, "smartflow-diagram.png", isDark);
      haptic("success");
      message.success("Diagram exported");
    } catch {
      message.error("Couldn't export the image. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section>
      <div className="sf-diagram-toolbar">
        <Button icon={<ArrowLeftOutlined />} onClick={onBackToBuild}>
          Back to build
        </Button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {inboxCount > 0 && (
            <Text className="sf-section-hint">
              {inboxCount} step{inboxCount === 1 ? "" : "s"} still in the inbox
            </Text>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!hasDiagram}
            onClick={handleExport}
          >
            Export PNG
          </Button>
        </div>
      </div>

      <div className="sf-diagram-frame" ref={wrapRef}>
        {hasDiagram ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(inst) => {
              rfInstance.current = inst;
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={isDark ? "#2a2a2a" : "#e6e6e6"} gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="sf-empty-diagram">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                doc.lanes.length === 0
                  ? "Add lanes and steps in Build mode to see your diagram."
                  : "Assign some steps to lanes in Build mode — placed steps show up here."
              }
            />
            <Button type="primary" onClick={onBackToBuild}>
              Go to Build
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
