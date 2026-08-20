import { useReducer, useEffect, useRef, useState } from "react";
import { Button, Segmented, Tooltip, Typography, Modal } from "antd";
import { AppstoreOutlined, ApartmentOutlined, FileTextOutlined, SwapOutlined } from "@ant-design/icons";
import { ThemeProvider } from "@/lib/theme";
import Shell from "@/components/Shell";
import { reducer, initDoc, saveDoc } from "./store";
import { BuildMode } from "./build/BuildMode";
import { DiagramView } from "./diagram/DiagramView";
import { SchemaMapView } from "./schemamap/SchemaMapView";
import { OutlineBuilder } from "./OutlineBuilder";
import { ChooserModal } from "./ChooserModal";
import { diagramInfo, type DiagramType } from "./diagramTypes";
import type { Template } from "./templates";
import {
  loadActiveType,
  saveActiveType,
  loadOutlineTexts,
  saveOutlineTexts,
} from "./appState";
import "./smartflow.css";

const { Text } = Typography;
type SwimMode = "build" | "diagram" | "map";
type OutlineType = Exclude<DiagramType, "swimlane">;

function SmartFlow() {
  // Which diagram type is active. null until the user has chosen one.
  const [activeType, setActiveType] = useState<DiagramType | null>(() => loadActiveType());
  const [chooserOpen, setChooserOpen] = useState<boolean>(() => loadActiveType() === null);

  // --- Swimlane state (its own rich doc store) ---
  const [doc, dispatch] = useReducer(reducer, undefined, initDoc);
  const [swimMode, setSwimMode] = useState<SwimMode>("build");
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDoc(doc), 300);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc]);

  // --- Outline state (flowchart / decision-tree / org-tree / timeline) ---
  const [outlineTexts, setOutlineTexts] = useState<Partial<Record<OutlineType, string>>>(
    () => loadOutlineTexts(),
  );
  useEffect(() => {
    saveOutlineTexts(outlineTexts);
  }, [outlineTexts]);

  const handlePick = (type: DiagramType) => {
    setActiveType(type);
    saveActiveType(type);
    setChooserOpen(false);
  };

  const setOutlineText = (type: OutlineType, text: string) =>
    setOutlineTexts((prev) => ({ ...prev, [type]: text }));

  /** Does the diagram type a template targets already hold user content? */
  const typeHasContent = (type: DiagramType): boolean =>
    type === "swimlane"
      ? doc.items.length > 0 || doc.lanes.length > 0
      : !!outlineTexts[type as OutlineType]?.trim();

  /** Apply a template: set it active and fill its content in the right store. */
  const applyTemplate = (template: Template) => {
    if (template.type === "swimlane" && template.makeDoc) {
      dispatch({ type: "REPLACE_DOC", doc: template.makeDoc() });
      setSwimMode("build");
    } else if (template.outline !== undefined) {
      setOutlineText(template.type as OutlineType, template.outline);
    }
    setActiveType(template.type);
    saveActiveType(template.type);
    setChooserOpen(false);
  };

  const handlePickTemplate = (template: Template) => {
    if (typeHasContent(template.type)) {
      Modal.confirm({
        title: `Load "${template.name}"?`,
        content: `This replaces your current ${diagramInfo(template.type).name.toLowerCase()}. It can't be undone.`,
        okText: "Load template",
        cancelText: "Cancel",
        onOk: () => applyTemplate(template),
      });
    } else {
      applyTemplate(template);
    }
  };

  const info = activeType ? diagramInfo(activeType) : null;

  // "Change diagram" is app chrome, not a workspace control, so it belongs in
  // the shared header rather than taking a row of the page.
  const headerActions = activeType ? (
    <Tooltip title="Change diagram">
      <Button
        size="small"
        icon={<SwapOutlined />}
        onClick={() => setChooserOpen(true)}
        aria-label="Change diagram"
      />
    </Tooltip>
  ) : undefined;

  return (
    <Shell headerActions={headerActions}>
      <main className="sf-main">
        {/* One slim row: which diagram you're on, and the mode switch. The
            switcher stays on the page because it moves you between workspaces
            — the header holds chrome only. */}
        {activeType && (
          <div className="sf-topbar">
            <Text type="secondary" className="sf-topbar-which">
              {info!.name}
            </Text>
            {activeType === "swimlane" && (
              <Segmented<SwimMode>
                value={swimMode}
                onChange={setSwimMode}
                options={[
                  { label: "Build", value: "build", icon: <AppstoreOutlined /> },
                  { label: "Summary", value: "diagram", icon: <FileTextOutlined /> },
                  { label: "Map", value: "map", icon: <ApartmentOutlined /> },
                ]}
              />
            )}
          </div>
        )}

        {/* Active diagram body. */}
        {activeType === "swimlane" ? (
          swimMode === "build" ? (
            <BuildMode doc={doc} dispatch={dispatch} onViewDiagram={() => setSwimMode("diagram")} />
          ) : swimMode === "map" ? (
            <SchemaMapView doc={doc} dispatch={dispatch} />
          ) : (
            <DiagramView doc={doc} dispatch={dispatch} />
          )
        ) : activeType ? (
          <OutlineBuilder
            type={activeType}
            text={outlineTexts[activeType as OutlineType] ?? ""}
            onChange={(t) => setOutlineText(activeType as OutlineType, t)}
          />
        ) : (
          // Chooser dismissed without picking. A real landing state, not a dead
          // end — the header above it is reachable, so theme/share still work.
          <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
            <Text type="secondary">
              Nothing on the board yet. Pick the kind of diagram you need and we'll set it up.
            </Text>
            <Button type="primary" size="large" onClick={() => setChooserOpen(true)}>
              Choose a diagram
            </Button>
          </div>
        )}

        <ChooserModal
          open={chooserOpen}
          onPick={handlePick}
          onPickTemplate={handlePickTemplate}
          onClose={() => setChooserOpen(false)}
        />
      </main>
    </Shell>
  );
}

export function SmartFlowApp() {
  return (
    <ThemeProvider>
      <SmartFlow />
    </ThemeProvider>
  );
}
