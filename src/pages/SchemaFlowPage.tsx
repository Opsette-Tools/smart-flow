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
import { schemaReducer, emptySchemaDoc } from "@/components/smartflow/schema/store";
import { SchemaCanvas } from "@/components/smartflow/schema/canvas/SchemaCanvas";
import { flowsRepo } from "@/db/flowsRepo";
import type { Flow } from "@/db/types";
import type { SchemaDoc } from "@/components/smartflow/schema/types";
import { setActiveFlowId } from "@/lib/activeFlow";
import { isBridgeMode } from "@/lib/bridgeInstance";
import { useFlows } from "@/layout/FlowsContext";
import { flowExportFileName, serializeFlowExport, triggerDownload } from "@/lib/flowExport";

const { Text } = Typography;

const AUTOSAVE_DEBOUNCE_STANDALONE_MS = 300;
const AUTOSAVE_DEBOUNCE_BRIDGED_MS = 1500;

/**
 * A schema-type flow's own page, split out from FlowPage rather than
 * threaded through it as a fifth branch. `content` for this flow type is a
 * SchemaDoc, not a SmartFlowDoc — a second useReducer inside FlowPage would
 * mean loading a schema flow could dispatch REPLACE_DOC with the wrong shape
 * into the wrong reducer if the two code paths ever brushed against each
 * other. A separate component makes that impossible instead of merely
 * unlikely. Mirrors FlowPage's chrome (rename/duplicate/export/delete,
 * autosave-with-flush-on-unmount) exactly, against SchemaDoc instead of
 * SmartFlowDoc. No ViewMode tabs — Build/Summary/Charts/Map are process-
 * diagram concepts with no schema equivalent yet; this page is the canvas,
 * full width, the same way Map is swimlane's only surface.
 */
export function SchemaFlowPage({ id, flow: initial }: { id: string; flow: Flow }) {
  const navigate = useNavigate();
  const { refresh: refreshFlows } = useFlows();
  const [flow, setFlow] = useState<Flow>(initial);
  const [doc, dispatch] = useReducer(schemaReducer, (initial.content as SchemaDoc) ?? emptySchemaDoc);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const latestRef = useRef({ flow, doc });
  latestRef.current = { flow, doc };

  // Autosave — same debounce convention as FlowPage.
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

  // Flush on unmount/id change, same as FlowPage.
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
    // `flow` (React state) only updates on load/rename — the live doc lives
    // in `doc` (the schemaReducer's own state) and is written to IndexedDB
    // by the autosave effect above, but never copied back into `flow`. This
    // was a real bug: exporting used to serialize `flow.content`, which
    // stayed frozen at whatever the doc looked like on page load, silently
    // dropping every table/column added since. Serialize the CURRENT doc.
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

      <SchemaCanvas doc={doc} dispatch={dispatch} />

      <Modal open={renaming} title="Rename flow" onCancel={() => setRenaming(false)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
