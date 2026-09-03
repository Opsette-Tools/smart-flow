import { useState } from "react";
import { Button, Dropdown, Empty, Input, List, Modal, Typography, message } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { discoverySessionsRepo } from "@/db/discoverySessionsRepo";
import type { DiscoverySession } from "@/db/discoveryTypes";
import { useCreateDiscoverySession } from "@/lib/useCreateDiscoverySession";
import { useDiscoverySessions } from "@/layout/DiscoveryContext";

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
  const [renaming, setRenaming] = useState<DiscoverySession | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { openSession, createSession } = useCreateDiscoverySession();

  const handleCreate = async () => {
    await createSession();
    refresh();
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
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          New session
        </Button>
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
                      { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === "rename") openRename(session);
                      if (key === "duplicate") handleDuplicate(session);
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
