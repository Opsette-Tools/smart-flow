import { useState } from "react";
import { Button, Dropdown, Empty, Input, List, Modal, Tag, Typography, message } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { diagramInfo } from "@/components/smartflow/diagramTypes";
import { flowsRepo } from "@/db/flowsRepo";
import type { Flow } from "@/db/types";
import { useCreateFlow } from "@/lib/useCreateFlow";
import { useFlows } from "@/layout/FlowsContext";
import { ChooserModal } from "@/components/smartflow/ChooserModal";

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

/**
 * "Library" — every saved diagram, across all five types, with the actions
 * that operate on the library itself (new / rename / duplicate / delete).
 * The sidebar (layout/FlowSidebar) is for quick switching and has no
 * buttons of its own; this page is where the actual management happens.
 */
export default function LibraryPage() {
  const { flows, refresh } = useFlows();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [renaming, setRenaming] = useState<Flow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { openFlow, createFromType, createFromTemplate } = useCreateFlow();

  const handlePickType = async (type: Parameters<typeof createFromType>[0]) => {
    setChooserOpen(false);
    await createFromType(type);
    refresh();
  };

  const handlePickTemplate = async (template: Parameters<typeof createFromTemplate>[0]) => {
    setChooserOpen(false);
    await createFromTemplate(template);
    refresh();
  };

  const handleDuplicate = async (flow: Flow) => {
    await flowsRepo.duplicate(flow.id);
    message.success(`Duplicated "${flow.name}"`);
    refresh();
  };

  const handleDelete = (flow: Flow) => {
    Modal.confirm({
      title: `Delete "${flow.name}"?`,
      content: "This can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await flowsRepo.remove(flow.id);
        refresh();
      },
    });
  };

  const openRename = (flow: Flow) => {
    setRenaming(flow);
    setRenameValue(flow.name);
  };

  const submitRename = async () => {
    if (!renaming) return;
    await flowsRepo.rename(renaming.id, renameValue);
    setRenaming(null);
    refresh();
  };

  return (
    <>
      <div className="sf-library-head">
        <Text type="secondary" className="sf-topbar-which">
          Library
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setChooserOpen(true)}>
          New flow
        </Button>
      </div>

      {flows.length === 0 ? (
        <Empty description="Nothing here yet — use New flow above to start one" style={{ marginTop: 64 }} />
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={flows}
          renderItem={(flow) => (
            <List.Item
              key={flow.id}
              onClick={() => openFlow(flow.id)}
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
                      if (key === "rename") openRename(flow);
                      if (key === "duplicate") handleDuplicate(flow);
                      if (key === "delete") handleDelete(flow);
                    },
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Actions for ${flow.name}`}
                  />
                </Dropdown>,
              ]}
            >
              <List.Item.Meta
                title={flow.name}
                description={
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag>{diagramInfo(flow.type).name}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Updated {formatUpdated(flow.updatedAt)}
                    </Text>
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}

      <ChooserModal open={chooserOpen} onPick={handlePickType} onPickTemplate={handlePickTemplate} onClose={() => setChooserOpen(false)} />

      <Modal open={!!renaming} title="Rename flow" onCancel={() => setRenaming(null)} onOk={submitRename} okText="Save">
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={submitRename} autoFocus maxLength={80} />
      </Modal>
    </>
  );
}
