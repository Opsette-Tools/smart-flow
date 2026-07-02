import { useState } from "react";
import { Modal, Typography, Radio, Space, Button, Tag, Tabs } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { DIAGRAM_TYPES, diagramInfo, type DiagramType } from "./diagramTypes";
import { templatesByCategory, type Template } from "./templates";

const { Title, Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  onPick: (type: DiagramType) => void;
  onPickTemplate: (template: Template) => void;
  onClose: () => void;
  /** Hide the close affordance on the very first run (no diagram yet). */
  dismissible?: boolean;
}

/**
 * The "get started" model. Two ways in, as tabs:
 *   1. Diagram type — the plain-language "what are you trying to show?" chooser.
 *   2. Start from a template — a browsable gallery of ready-made processes that
 *      load the right diagram type, pre-filled and editable.
 */
export function ChooserModal({ open, onPick, onPickTemplate, onClose, dismissible = true }: Props) {
  return (
    <Modal
      open={open}
      onCancel={dismissible ? onClose : undefined}
      closable={dismissible}
      maskClosable={dismissible}
      keyboard={dismissible}
      footer={null}
      width={640}
      title={null}
    >
      <Tabs
        defaultActiveKey="type"
        items={[
          {
            key: "type",
            label: "Pick a diagram",
            children: <TypeChooser onPick={onPick} />,
          },
          {
            key: "template",
            label: "Start from a template",
            children: <TemplateGallery onPick={onPickTemplate} />,
          },
        ]}
      />
    </Modal>
  );
}

/** Tab 1: choose a diagram type by what you're trying to show. */
function TypeChooser({ onPick }: { onPick: (type: DiagramType) => void }) {
  const [selected, setSelected] = useState<DiagramType>("flowchart");
  const chosen = DIAGRAM_TYPES.find((d) => d.type === selected)!;

  return (
    <>
      <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
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
    </>
  );
}

/** Tab 2: browse ready-made processes and load one. */
function TemplateGallery({ onPick }: { onPick: (template: Template) => void }) {
  const groups = templatesByCategory();

  return (
    <>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Start with a real process you can edit. We'll load it as the right kind of
        diagram — change anything you like once it's in.
      </Paragraph>

      <div className="sf-tpl-scroll">
        {groups.map((group) => (
          <section key={group.category} className="sf-tpl-group">
            <h4 className="sf-tpl-cat">{group.category}</h4>
            <div className="sf-tpl-grid">
              {group.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="sf-tpl-card"
                  onClick={() => onPick(t)}
                >
                  <span className="sf-tpl-card-top">
                    <span className="sf-tpl-card-name">{t.name}</span>
                    <Tag className="sf-tpl-card-tag">{diagramInfo(t.type).name}</Tag>
                  </span>
                  <span className="sf-tpl-card-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
