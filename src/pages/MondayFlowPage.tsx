import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Dropdown, Input, Modal, Typography } from "antd";
import {
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { mondayReducer, emptyMondayDoc } from "@/components/smartflow/monday/store";
import { MondayCanvas } from "@/components/smartflow/monday/canvas/MondayCanvas";
import { flowsRepo } from "@/db/flowsRepo";
import type { Flow } from "@/db/types";
import type { MondayDoc } from "@/components/smartflow/monday/types";
import { setActiveFlowId } from "@/lib/activeFlow";
import { isBridgeMode } from "@/lib/bridgeInstance";
import { useFlows } from "@/layout/FlowsContext";
import { flowExportFileName, serializeFlowExport, triggerDownload } from "@/lib/flowExport";

const { Text } = Typography;

const AUTOSAVE_DEBOUNCE_STANDALONE_MS = 300;
const AUTOSAVE_DEBOUNCE_BRIDGED_MS = 1500;

/**
 * A monday-type flow's own page, split out from FlowPage for exactly the
 * reason SchemaFlowPage was: `content` here is a MondayDoc, which shares no
 * fields with a SmartFlowDoc, so a second useReducer inside FlowPage would
 * mean a load could dispatch the wrong doc shape into the wrong reducer if
 * the two paths ever brushed against each other. A separate component makes
 * that impossible instead of merely unlikely.
 *
 * Mirrors SchemaFlowPage's chrome exactly (rename/duplicate/export/delete,
 * autosave with flush-on-unmount) against MondayDoc. No ViewMode tabs —
 * Build/Summary/Charts/Map are process-diagram concepts with no board-
 * designer equivalent; this page is the canvas, full width.
 */
export function MondayFlowPage({ id, flow: initial }: { id: string; flow: Flow }) {
  const navigate = useNavigate();
  const { refresh: refreshFlows } = useFlows();
  const [flow, setFlow] = useState<Flow>(initial);
  const [doc, dispatch] = useReducer(mondayReducer, (initial.content as MondayDoc) ?? emptyMondayDoc);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const latestRef = useRef({ flow, doc });
  latestRef.current = { flow, doc };

  // Autosave — same debounce convention as FlowPage and SchemaFlowPage.
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const debounceMs = isBridgeMode() ? AUTOSAVE_DEBOUNCE_BRIDGED_MS : AUTOSAVE_DEBOUNCE_STANDALONE_MS;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      flowsRepo.updateContent(flow.id, doc);
    }, debounceMs);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc, flow.id]);

  // Flush on unmount/id change, same as the other two pages.
  useEffect(() => {
    setActiveFlowId(id);
    return () => {
      if (!saveTimer.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      const { flow: f, doc: d } = latestRef.current;
      flowsRepo.updateContent(f.id, d);
    };
  }, [id]);

  const openRename = () => {
    setRenameValue(flow.name);
    setRenaming(true);
  };

  const submitRename = async () => {
    await flowsRepo.rename(flow.id, renameValue);
    const trimmed = renameValue.trim();
    if (trimmed) setFlow({ ...flow, name: trimmed });
    setRenaming(false);
    refreshFlows();
  };

  const handleDuplicate = async () => {
    const copy = await flowsRepo.duplicate(flow.id);
    refreshFlows();
    if (copy) navigate(`/flow/${copy.id}`);
  };

  const handleExport = () => {
    // Serialize the CURRENT doc, not `flow.content` — `flow` (React state)
    // only updates on load/rename, so exporting from it would silently drop
    // every board added since the page loaded. This was a real bug on the
    // schema page; see SchemaFlowPage.handleExport.
    const json = serializeFlowExport({ ...flow, content: doc });
    triggerDownload(new Blob([json], { type: "application/json" }), flowExportFileName(flow.name));
  };

  const handleDelete = () => {
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
      </div>

      <MondayCanvas doc={doc} dispatch={dispatch} />

      <Modal open={renaming} title="Rename flow" onCancel={() => setRenaming(false)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
