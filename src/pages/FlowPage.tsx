import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Input, Modal, Segmented, Spin, Typography } from "antd";
import {
  AppstoreOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  FileTextOutlined,
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { reducer, emptyDoc } from "@/components/smartflow/store";
import { BuildMode } from "@/components/smartflow/build/BuildMode";
import { ChartsPanel } from "@/components/smartflow/diagram/ChartsPanel";
import { DiagramView } from "@/components/smartflow/diagram/DiagramView";
import { SchemaMapView } from "@/components/smartflow/schemamap/SchemaMapView";
import { OutlineBuilder } from "@/components/smartflow/OutlineBuilder";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import { flowsRepo } from "@/db/flowsRepo";
import type { Flow } from "@/db/types";
import { setActiveFlowId } from "@/lib/activeFlow";
import { isBridgeMode } from "@/lib/bridgeInstance";
import { useFlows } from "@/layout/FlowsContext";
import { flowExportFileName, serializeFlowExport, triggerDownload } from "@/lib/flowExport";

const { Text } = Typography;
type SwimMode = "build" | "diagram" | "charts" | "map";

// Free against local IndexedDB; a request to a parent that writes to a real
// database on every keystroke is not. Bumped when bridged — see
// docs/SMARTFLOW_STORAGE_PLAN.md §8.3.
const AUTOSAVE_DEBOUNCE_STANDALONE_MS = 300;
const AUTOSAVE_DEBOUNCE_BRIDGED_MS = 1500;

/**
 * One saved flow's workspace, loaded by route id. Rename/duplicate/delete
 * live here (next to the name they act on) rather than in a separate
 * library page — the sidebar (layout/FlowSidebar) is where you switch
 * between flows; this is where you act on the one you're looking at.
 */
export default function FlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh: refreshFlows } = useFlows();
  // undefined = loading this id, null = id doesn't resolve to a saved flow.
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined);
  const [doc, dispatch] = useReducer(reducer, emptyDoc);
  const [outlineText, setOutlineText] = useState("");
  const [swimMode, setSwimMode] = useState<SwimMode>("build");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  // Guards autosave from firing on the previous flow's leftover state while
  // the new id's row is still loading.
  const loadedIdRef = useRef<string | null>(null);
  // Mirrors the latest doc/outlineText/flow so the unmount-flush effect below
  // (which must run only once, on true unmount) can read current values
  // without depending on them and re-firing on every keystroke.
  const latestRef = useRef({ flow, doc, outlineText });
  latestRef.current = { flow, doc, outlineText };

  useEffect(() => {
    let cancelled = false;
    setFlow(undefined);
    if (!id) return;
    flowsRepo.get(id).then((f) => {
      if (cancelled) return;
      if (!f) {
        setFlow(null);
        return;
      }
      setFlow(f);
      loadedIdRef.current = f.id;
      if (f.type === "swimlane") {
        dispatch({ type: "REPLACE_DOC", doc: f.content as SmartFlowDoc });
      } else {
        setOutlineText(f.content as string);
      }
      setActiveFlowId(f.id);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Autosave, swimlane doc. Skipped until this flow's own row has loaded so
  // the reducer's initial emptyDoc can never clobber a real saved board
  // mid-navigation. Standard debounce: a superseded timer is cleared, not
  // fired early — the flush-on-unmount effect below covers the case where
  // the page leaves before the timer would have fired.
  useEffect(() => {
    if (!flow || flow.type !== "swimlane" || loadedIdRef.current !== flow.id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const debounceMs = isBridgeMode() ? AUTOSAVE_DEBOUNCE_BRIDGED_MS : AUTOSAVE_DEBOUNCE_STANDALONE_MS;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      flowsRepo.updateContent(flow.id, doc);
    }, debounceMs);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc, flow]);

  // Autosave, outline text — same shape, the other content type.
  useEffect(() => {
    if (!flow || flow.type === "swimlane" || loadedIdRef.current !== flow.id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const debounceMs = isBridgeMode() ? AUTOSAVE_DEBOUNCE_BRIDGED_MS : AUTOSAVE_DEBOUNCE_STANDALONE_MS;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      flowsRepo.updateContent(flow.id, outlineText);
    }, debounceMs);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [outlineText, flow]);

  // Flush whatever's pending when the flow being viewed changes (route
  // navigation to a different id) or the page truly unmounts, so a change
  // made just before leaving isn't lost to a debounce timer that never got
  // to fire. Reads latestRef rather than depending on doc/outlineText/flow
  // directly so this effect runs only on those two transitions, not on
  // every keystroke.
  useEffect(() => {
    return () => {
      if (!saveTimer.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      const { flow: f, doc: d, outlineText: t } = latestRef.current;
      if (!f || loadedIdRef.current !== f.id) return;
      flowsRepo.updateContent(f.id, f.type === "swimlane" ? d : t);
    };
  }, [id]);

  const openRename = () => {
    if (!flow) return;
    setRenameValue(flow.name);
    setRenaming(true);
  };

  const submitRename = async () => {
    if (!flow) return;
    await flowsRepo.rename(flow.id, renameValue);
    const trimmed = renameValue.trim();
    if (trimmed) setFlow({ ...flow, name: trimmed });
    setRenaming(false);
    refreshFlows();
  };

  const handleDuplicate = async () => {
    if (!flow) return;
    const copy = await flowsRepo.duplicate(flow.id);
    refreshFlows();
    if (copy) navigate(`/flow/${copy.id}`);
  };

  const handleExport = () => {
    if (!flow) return;
    const json = serializeFlowExport(flow);
    triggerDownload(new Blob([json], { type: "application/json" }), flowExportFileName(flow.name));
  };

  const handleDelete = () => {
    if (!flow) return;
    const target = flow;
    Modal.confirm({
      title: `Delete "${target.name}"?`,
      content: "This can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await flowsRepo.remove(target.id);
        refreshFlows();
        navigate("/");
      },
    });
  };

  if (flow === undefined) {
    return (
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Spin />
      </div>
    );
  }

  if (flow === null) {
    return (
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Text type="secondary">That flow doesn't exist anymore.</Text>
        <Button type="primary" size="large" onClick={() => navigate("/")}>
          Back to SmartFlow
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="sf-topbar">
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Text type="secondary" className="sf-topbar-which">
            {flow.name}
          </Text>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "rename", label: "Rename", icon: <EditOutlined /> },
                { key: "duplicate", label: "Duplicate", icon: <CopyOutlined /> },
                { key: "export", label: "Export", icon: <ExportOutlined /> },
                { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === "rename") openRename();
                if (key === "duplicate") handleDuplicate();
                if (key === "export") handleExport();
                if (key === "delete") handleDelete();
              },
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label={`Actions for ${flow.name}`} />
          </Dropdown>
        </span>
        {flow.type === "swimlane" && (
          <Segmented<SwimMode>
            value={swimMode}
            onChange={setSwimMode}
            options={[
              { label: "Build", value: "build", icon: <AppstoreOutlined /> },
              { label: "Summary", value: "diagram", icon: <FileTextOutlined /> },
              { label: "Charts", value: "charts", icon: <BarChartOutlined /> },
              { label: "Map", value: "map", icon: <ApartmentOutlined /> },
            ]}
          />
        )}
      </div>

      {flow.type === "swimlane" ? (
        swimMode === "build" ? (
          <BuildMode doc={doc} dispatch={dispatch} />
        ) : swimMode === "map" ? (
          <SchemaMapView doc={doc} dispatch={dispatch} />
        ) : swimMode === "charts" ? (
          <ChartsPanel doc={doc} />
        ) : (
          <DiagramView doc={doc} dispatch={dispatch} />
        )
      ) : (
        <OutlineBuilder type={flow.type} text={outlineText} onChange={setOutlineText} />
      )}

      <Modal open={renaming} title="Rename flow" onCancel={() => setRenaming(false)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
