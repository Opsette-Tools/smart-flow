import { useEffect, useRef, useState } from "react";
import { Button, Input, Tooltip, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { nodeTypes } from "./nodes";
import { exportDiagramPng } from "./exportImage";

interface Props {
  nodes: Node[];
  edges: Edge[];
  /** Default file name for the exported PNG (no extension). The user can
   *  override it in the toolbar field — the override is remembered per diagram. */
  exportName: string;
  /** Optional empty-state element shown when there are no nodes. */
  empty?: React.ReactNode;
  /** Extra controls rendered to the left of the Export button. */
  toolbarLeft?: React.ReactNode;
}

// Strip characters that don't belong in a file name; keep it tidy.
function cleanFileName(s: string): string {
  return s.trim().replace(/[^\w \-().]/g, "").replace(/\s+/g, "-").slice(0, 80);
}

/**
 * Shared render-only React Flow canvas used by every diagram type. Owns the
 * frame, the fit-to-view, and the clean PNG export (no minimap/controls/grid in
 * the image). Each diagram type just hands it nodes + edges.
 */
export function DiagramCanvas({ nodes, edges, exportName, empty, toolbarLeft }: Props) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const wrapRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const [exporting, setExporting] = useState(false);

  // The file name the export saves under. Defaults to the per-type name but the
  // user can set their own (e.g. their company / client name) so a deliverable
  // doesn't carry the app's name. Remembered in localStorage.
  const fileKey = `smart-flow-filename:${exportName}`;
  const [fileName, setFileName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(fileKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(fileKey, fileName);
    } catch {
      /* non-fatal */
    }
  }, [fileKey, fileName]);

  const hasContent = nodes.length > 0;

  // Re-fit the view whenever the diagram content changes (e.g. the user types
  // another step), so the whole diagram stays in frame instead of getting
  // clipped at the edges. A short delay lets the new nodes measure first.
  useEffect(() => {
    if (!rfRef.current || nodes.length === 0) return;
    const t = window.setTimeout(() => {
      rfRef.current?.fitView({ padding: 0.2, duration: 200 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [nodes, edges]);

  const handleExport = async () => {
    if (!wrapRef.current || !hasContent) return;
    setExporting(true);
    try {
      const base = cleanFileName(fileName) || exportName;
      await exportDiagramPng(wrapRef.current, nodes, `${base}.png`, isDark);
      haptic("success");
      message.success("Diagram exported");
    } catch {
      message.error("Couldn't export the image. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="sf-diagram-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {toolbarLeft}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Tooltip title="The exported file saves under this name. Leave blank for a default.">
            <Input
              size="middle"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="File name (e.g. your name)"
              addonAfter=".png"
              style={{ width: 240, maxWidth: "60vw" }}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!hasContent}
            onClick={handleExport}
          >
            Export PNG
          </Button>
        </div>
      </div>

      <div className="sf-diagram-frame" ref={wrapRef}>
        {hasContent ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(inst) => {
              rfRef.current = inst;
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
          <div className="sf-empty-diagram">{empty}</div>
        )}
      </div>
    </div>
  );
}
