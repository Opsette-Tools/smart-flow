import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Input, Modal, Segmented, Spin, Typography } from "antd";
import {
  FileTextOutlined,
  OrderedListOutlined,
  TableOutlined,
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { reducer, emptyDoc } from "@/components/discovery/store";
import { SessionHeaderForm } from "@/components/discovery/build/SessionHeaderForm";
import { StepListPanel } from "@/components/discovery/build/StepListPanel";
import { SideTablesPanel } from "@/components/discovery/build/SideTablesPanel";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import type { DiscoverySession } from "@/db/discoveryTypes";
import { setActiveDiscoverySessionId } from "@/lib/activeDiscoverySession";
import { useDiscoverySessions } from "@/layout/DiscoveryContext";

const { Text } = Typography;
type ViewMode = "header" | "steps" | "tables";

// Free against local IndexedDB — same debounce as the flow autosave.
const AUTOSAVE_DEBOUNCE_MS = 300;

/**
 * One discovery session's workspace, loaded by route id. Mirrors FlowPage.tsx's
 * load/autosave/rename/duplicate/delete shape, minus the Opsette-bridge and
 * schema-doc forks that don't apply here (see discoveryTypes.ts).
 */
export default function DiscoverySessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh: refreshSessions } = useDiscoverySessions();
  const [session, setSession] = useState<DiscoverySession | null | undefined>(undefined);
  const [doc, dispatch] = useReducer(reducer, emptyDoc);
  const [viewMode, setViewMode] = useState<ViewMode>("steps");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const loadedIdRef = useRef<string | null>(null);
  const latestRef = useRef({ session, doc });
  latestRef.current = { session, doc };

  useEffect(() => {
    let cancelled = false;
    setSession(undefined);
    if (!id) return;
    discoverySessionsRepo.get(id).then((s) => {
      if (cancelled) return;
      if (!s) {
        setSession(null);
        return;
      }
      setSession(s);
      loadedIdRef.current = s.id;
      dispatch({ type: "REPLACE_DOC", doc: s.content });
      setActiveDiscoverySessionId(s.id);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!session || loadedIdRef.current !== session.id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      discoverySessionsRepo.updateContent(session.id, doc);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc, session]);

  useEffect(() => {
    return () => {
      if (!saveTimer.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      const { session: s, doc: d } = latestRef.current;
      if (!s || loadedIdRef.current !== s.id) return;
      discoverySessionsRepo.updateContent(s.id, d);
    };
  }, [id]);

  const openRename = () => {
    if (!session) return;
    setRenameValue(session.name);
    setRenaming(true);
  };

  const submitRename = async () => {
    if (!session) return;
    await discoverySessionsRepo.rename(session.id, renameValue);
    const trimmed = renameValue.trim();
    if (trimmed) setSession({ ...session, name: trimmed });
    setRenaming(false);
    refreshSessions();
  };

  const handleDuplicate = async () => {
    if (!session) return;
    const copy = await discoverySessionsRepo.duplicate(session.id);
    refreshSessions();
    if (copy) navigate(`/discovery/${copy.id}`);
  };

  const handleDelete = () => {
    if (!session) return;
    const target = session;
    Modal.confirm({
      title: `Delete "${target.name}"?`,
      content: "This can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await discoverySessionsRepo.remove(target.id);
        refreshSessions();
        navigate("/discovery");
      },
    });
  };

  if (session === undefined) {
    return (
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Spin />
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Text type="secondary">That session doesn't exist anymore.</Text>
        <Button type="primary" size="large" onClick={() => navigate("/discovery")}>
          Back to sessions
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="sf-topbar">
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Text type="secondary" className="sf-topbar-which">
            {session.name}
          </Text>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "rename", label: "Rename", icon: <EditOutlined /> },
                { key: "duplicate", label: "Duplicate", icon: <CopyOutlined /> },
                { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === "rename") openRename();
                if (key === "duplicate") handleDuplicate();
                if (key === "delete") handleDelete();
              },
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label={`Actions for ${session.name}`} />
          </Dropdown>
        </span>
        <Segmented<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: "Header", value: "header", icon: <FileTextOutlined /> },
            { label: "Steps", value: "steps", icon: <OrderedListOutlined /> },
            { label: "Tables", value: "tables", icon: <TableOutlined /> },
          ]}
        />
      </div>

      {viewMode === "header" ? (
        <SessionHeaderForm header={doc.header} dispatch={dispatch} />
      ) : viewMode === "steps" ? (
        <StepListPanel doc={doc} dispatch={dispatch} />
      ) : (
        <SideTablesPanel doc={doc} dispatch={dispatch} />
      )}

      <Modal open={renaming} title="Rename session" onCancel={() => setRenaming(false)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
