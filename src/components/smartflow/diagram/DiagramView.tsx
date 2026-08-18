import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Button, Dropdown, Empty, Typography, message } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, DownOutlined } from "@ant-design/icons";
import ReactFlow, { Background, Controls, type ReactFlowInstance } from "reactflow";
import type { SmartFlowDoc } from "../types";
import type { Action } from "../store";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { buildLayout } from "./laneLayout";
import { nodeTypes } from "./nodes";
import { exportDiagramPng } from "./exportImage";
import { GapsPanel } from "./GapsPanel";

const { Text } = Typography;

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
  onBackToBuild: () => void;
}

export function DiagramView({ doc, dispatch, onBackToBuild }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const wrapRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const [exporting, setExporting] = useState(false);

  const discovery = doc.discovery === true;

  // What the screen shows: annotated whenever the doc is in discovery mode.
  // `exportAnnotated` briefly overrides this during a clean export — see below.
  const [exportAnnotated, setExportAnnotated] = useState<boolean | null>(null);
  const annotate = exportAnnotated ?? discovery;

  const { nodes, edges } = useMemo(
    () => buildLayout(doc, isDark, annotate),
    [doc, isDark, annotate],
  );

  const placedCount = useMemo(
    () => doc.items.filter((i) => i.laneId !== null).length,
    [doc.items],
  );
  const inboxCount = doc.items.length - placedCount;
  const hasDiagram = nodes.length > 0 && placedCount > 0;

  // Capture runs in an effect rather than inline in the click handler: when the
  // export mode differs from what's on screen, we set the override, let React
  // paint that version, and only then snapshot. Capturing inside the handler
  // would grab the pre-render DOM and silently export the wrong variant.
  const pending = useRef<{ annotated: boolean } | null>(null);
  // Latest layout, read at capture time — keeps `nodes` out of the effect deps
  // so an unrelated re-render can't retrigger or cancel a capture in flight.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    if (exportAnnotated === null || !pending.current) return;
    const job = pending.current;
    pending.current = null;

    const run = async () => {
      // Two frames: one for React to commit the swapped layout, one for React
      // Flow to lay out the new edge labels before html-to-image reads the DOM.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!wrapRef.current) return;
      try {
        await exportDiagramPng(
          wrapRef.current,
          nodesRef.current,
          job.annotated ? "smartflow-discovery.png" : "smartflow-diagram.png",
          isDark,
        );
        haptic("success");
        message.success("Diagram exported");
      } catch {
        message.error("Couldn't export the image. Try again.");
      } finally {
        setExporting(false);
        setExportAnnotated(null);
      }
    };
    void run();
  }, [exportAnnotated, isDark]);

  const handleExport = (annotated: boolean) => {
    if (!wrapRef.current || !hasDiagram || exporting) return;
    setExporting(true);
    pending.current = { annotated };
    setExportAnnotated(annotated);
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
          {discovery ? (
            // In discovery mode the export is a real choice: the plain diagram,
            // or the same diagram carrying its handoff labels and colors.
            <Dropdown
              disabled={!hasDiagram || exporting}
              menu={{
                items: [
                  { key: "clean", label: "Diagram only" },
                  { key: "annotated", label: "Diagram with handoff labels" },
                ],
                onClick: ({ key }) => handleExport(key === "annotated"),
              }}
            >
              <Button type="primary" icon={<DownloadOutlined />} loading={exporting}>
                Export PNG <DownOutlined />
              </Button>
            </Dropdown>
          ) : (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={!hasDiagram}
              onClick={() => handleExport(false)}
            >
              Export PNG
            </Button>
          )}
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

      {discovery && <GapsPanel doc={doc} dispatch={dispatch} />}
    </section>
  );
}
