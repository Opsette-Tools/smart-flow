import { useState } from "react";
import { Modal, Typography, Radio, Space, Button, Tag } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { DIAGRAM_TYPES, type DiagramType } from "./diagramTypes";

const { Title, Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  onPick: (type: DiagramType) => void;
  onClose: () => void;
  /** Hide the close affordance on the very first run (no diagram yet). */
  dismissible?: boolean;
}

/**
 * The guided "which diagram do I need?" model. It asks one plain-language
 * question — "What are you trying to show?" — with answers written in the
 * user's words, not diagram jargon. The matching answer recommends a type, but
 * the user is free to pick any of them. No flowchart knowledge required.
 */
export function ChooserModal({ open, onPick, onClose, dismissible = true }: Props) {
  const [selected, setSelected] = useState<DiagramType>("flowchart");
  const chosen = DIAGRAM_TYPES.find((d) => d.type === selected)!;

  return (
    <Modal
      open={open}
      onCancel={dismissible ? onClose : undefined}
      closable={dismissible}
      maskClosable={dismissible}
      keyboard={dismissible}
      footer={null}
      width={620}
      title={null}
    >
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        What are you trying to show?
      </Title>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Pick the one that sounds most like your situation. We'll set up the right
        diagram for you — you don't need to know the names.
      </Paragraph>

      <Radio.Group
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ width: "100%" }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          {DIAGRAM_TYPES.map((d) => {
            const isSel = d.type === selected;
            return (
              <label
                key={d.type}
                className={`sf-chooser-option${isSel ? " is-selected" : ""}`}
                htmlFor={`chooser-${d.type}`}
              >
                <Radio id={`chooser-${d.type}`} value={d.type} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text strong>{d.chooserAnswer}</Text>
                    {isSel && (
                      <Tag color="green" style={{ marginInlineEnd: 0 }}>
                        <CheckCircleFilled /> {d.name}
                      </Tag>
                    )}
                  </span>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {d.inputHint}
                  </Text>
                </span>
              </label>
            );
          })}
        </Space>
      </Radio.Group>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          We recommend <Text strong>{chosen.name}</Text> — {chosen.blurb}
        </Text>
        <Button type="primary" size="large" onClick={() => onPick(selected)}>
          Use {chosen.name}
        </Button>
      </div>
    </Modal>
  );
}
