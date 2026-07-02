import { useReducer, useEffect, useRef, useState } from "react";
import { Button, Segmented, Typography, Modal } from "antd";
import { AppstoreOutlined, PartitionOutlined, SwapOutlined } from "@ant-design/icons";
import { ThemeProvider } from "@/lib/theme";
import Shell from "@/components/Shell";
import { reducer, initDoc, saveDoc } from "./store";
import { BuildMode } from "./build/BuildMode";
import { DiagramView } from "./diagram/DiagramView";
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
type SwimMode = "build" | "diagram";
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

  return (
    <main className="sf-main">
      {/* Top bar: which diagram you're on + a way to switch types. */}
      {activeType && (
        <div className="sf-topbar">
          <div className="sf-topbar-which">
            <Text type="secondary" style={{ fontSize: 13 }}>
              You're building a
            </Text>
            <Text strong style={{ fontSize: 15 }}>
              {info!.name}
            </Text>
          </div>
          <div className="sf-topbar-controls">
            {activeType === "swimlane" && (
              <Segmented<SwimMode>
                value={swimMode}
                onChange={setSwimMode}
                options={[
                  { label: "Build", value: "build", icon: <AppstoreOutlined /> },
                  { label: "Diagram", value: "diagram", icon: <PartitionOutlined /> },
                ]}
              />
            )}
            <Button icon={<SwapOutlined />} onClick={() => setChooserOpen(true)}>
              Change diagram
            </Button>
          </div>
        </div>
      )}

      {/* Active diagram body. */}
      {activeType === "swimlane" ? (
        swimMode === "build" ? (
          <BuildMode doc={doc} dispatch={dispatch} onViewDiagram={() => setSwimMode("diagram")} />
        ) : (
          <DiagramView doc={doc} onBackToBuild={() => setSwimMode("build")} />
        )
      ) : activeType ? (
        <OutlineBuilder
          type={activeType}
          text={outlineTexts[activeType as OutlineType] ?? ""}
          onChange={(t) => setOutlineText(activeType as OutlineType, t)}
        />
      ) : (
        // No type chosen yet and chooser dismissed somehow — offer to open it.
        <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
          <Text type="secondary">Pick a diagram to get started.</Text>
          <Button type="primary" onClick={() => setChooserOpen(true)}>
            Choose a diagram
          </Button>
        </div>
      )}

      <ChooserModal
        open={chooserOpen}
        onPick={handlePick}
        onPickTemplate={handlePickTemplate}
        onClose={() => setChooserOpen(false)}
        dismissible={activeType !== null}
      />
    </main>
  );
}

export function SmartFlowApp() {
  return (
    <ThemeProvider>
      <Shell>
        <SmartFlow />
      </Shell>
    </ThemeProvider>
  );
}
