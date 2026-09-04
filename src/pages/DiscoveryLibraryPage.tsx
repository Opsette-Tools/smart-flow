import { useRef, useState } from "react";
import { Button, Dropdown, Empty, Input, List, Modal, Typography, message } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined, ImportOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import { flowsRepo } from "@/db/flowsRepo";
import type { DiscoverySession } from "@/db/discoveryTypes";
import { useCreateDiscoverySession } from "@/lib/useCreateDiscoverySession";
import { useDiscoverySessions } from "@/layout/DiscoveryContext";
import { useFlows } from "@/layout/FlowsContext";
import { discoveryExportFileName, serializeDiscoveryExport } from "@/lib/discoveryExport";
import { triggerDownload } from "@/lib/flowExport";
import { sniffImport } from "@/lib/sniffImport";

const { Text } = Typography;

function formatUpdated(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Every saved discovery session. Mirrors LibraryPage.tsx's shape exactly. */
export default function DiscoveryLibraryPage() {
  const { sessions, refresh } = useDiscoverySessions();
  const { refresh: refreshFlows } = useFlows();
  const [renaming, setRenaming] = useState<DiscoverySession | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { openSession, createSession } = useCreateDiscoverySession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    await createSession();
    refresh();
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file name later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const sniffed = sniffImport(reader.result as string);

      if (sniffed.kind === "flow") {
        const flow = await flowsRepo.create(sniffed.data);
        refreshFlows();
        message.success(`"${flow.name}" is a flow — imported into the Library instead`);
        return;
      }

      if (sniffed.kind === "unrecognized") {
        message.error("That isn't a SmartFlow export file.");
        return;
      }

      const session = await discoverySessionsRepo.create(sniffed.data);
      refresh();
      message.success(`Imported "${session.name}"`);
    };
    reader.readAsText(file);
  };

  const handleExport = (session: DiscoverySession) => {
    const json = serializeDiscoveryExport(session);
    triggerDownload(new Blob([json], { type: "application/json" }), discoveryExportFileName(session.name));
  };

  const handleDuplicate = async (session: DiscoverySession) => {
    await discoverySessionsRepo.duplicate(session.id);
    message.success(`Duplicated "${session.name}"`);
    refresh();
  };

  const handleDelete = (session: DiscoverySession) => {
    Modal.confirm({
      title: `Delete "${session.name}"?`,
      content: "This can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await discoverySessionsRepo.remove(session.id);
        refresh();
      },
    });
  };

  const openRename = (session: DiscoverySession) => {
    setRenaming(session);
    setRenameValue(session.name);
  };

  const submitRename = async () => {
    if (!renaming) return;
    await discoverySessionsRepo.rename(renaming.id, renameValue);
    setRenaming(null);
    refresh();
  };

  return (
    <>
      <div className="sf-library-head">
        <Text type="secondary" className="sf-topbar-which">
          Discovery sessions
        </Text>
        <span style={{ display: "flex", gap: 8 }}>
          <Button icon={<ImportOutlined />} onClick={handleImportClick}>
            Import
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            New session
          </Button>
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      {sessions.length === 0 ? (
        <Empty description="Nothing here yet — use New session above to start one" style={{ marginTop: 64 }} />
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={sessions}
          renderItem={(session) => (
            <List.Item
              key={session.id}
              onClick={() => openSession(session.id)}
              style={{ cursor: "pointer" }}
              actions={[
                <Dropdown
                  key="more"
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "rename", label: "Rename", icon: <EditOutlined /> },
                      { key: "duplicate", label: "Duplicate", icon: <CopyOutlined /> },
                      { key: "export", label: "Export", icon: <ExportOutlined /> },
                      { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === "rename") openRename(session);
                      if (key === "duplicate") handleDuplicate(session);
                      if (key === "export") handleExport(session);
                      if (key === "delete") handleDelete(session);
                    },
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Actions for ${session.name}`}
                  />
                </Dropdown>,
              ]}
            >
              <List.Item.Meta
                title={session.name}
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Updated {formatUpdated(session.updatedAt)}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal open={!!renaming} title="Rename session" onCancel={() => setRenaming(null)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
