import { Typography, Empty, Tag } from "antd";
import {
  ApartmentOutlined,
  BranchesOutlined,
  ClusterOutlined,
  FieldTimeOutlined,
  PartitionOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { DIAGRAM_TYPES, diagramInfo, type DiagramType } from "@/components/smartflow/diagramTypes";
import { useCreateFlow } from "@/lib/useCreateFlow";
import { useFlows } from "@/layout/FlowsContext";

const { Title, Paragraph, Text } = Typography;

const TYPE_ICONS: Record<DiagramType, React.ReactNode> = {
  flowchart: <PartitionOutlined />,
  swimlane: <BranchesOutlined />,
  "decision-tree": <ClusterOutlined />,
  "org-tree": <ApartmentOutlined />,
  timeline: <FieldTimeOutlined />,
  schema: <TableOutlined />,
};

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
 * "/" — the real front door. Always the same page, regardless of what you
 * had open last (that auto-resume lived in the old StartPage and made "Home"
 * feel like it didn't work). A grid of the five diagram types to start a new
 * one, plus the five most recently touched library items so getting back to
 * something isn't a Library trip away.
 */
export default function HomePage() {
  const { flows } = useFlows();
  const { openFlow, createFromType } = useCreateFlow();
  const recent = flows.slice(0, 5);

  return (
    <>
      <div className="sf-home-head">
        <Title level={3} style={{ marginBottom: 4 }}>
          What are you trying to show?
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 0 }}>
          Pick a diagram to start one — you don't need to know the names.
        </Paragraph>
      </div>

      <div className="sf-home-grid">
        {DIAGRAM_TYPES.map((d) => (
          <button
            key={d.type}
            type="button"
            className="sf-home-card"
            onClick={() => createFromType(d.type)}
          >
            <span className="sf-home-card-icon">{TYPE_ICONS[d.type]}</span>
            <span className="sf-home-card-name">{d.name}</span>
            <span className="sf-home-card-blurb">{d.blurb}</span>
          </button>
        ))}
      </div>

      <div className="sf-home-recent">
        <Text type="secondary" className="sf-topbar-which">
          Recent
        </Text>

        {recent.length === 0 ? (
          <Empty description="Nothing saved yet — pick a diagram above to start one" style={{ marginTop: 16 }} />
        ) : (
          <div className="sf-home-recent-list">
            {recent.map((flow) => (
              <button
                key={flow.id}
                type="button"
                className="sf-home-recent-item"
                onClick={() => openFlow(flow.id)}
              >
                <span className="sf-home-recent-icon">{TYPE_ICONS[flow.type]}</span>
                <span className="sf-home-recent-meta">
                  <span className="sf-home-recent-name">{flow.name}</span>
                  <span className="sf-home-recent-sub">
                    <Tag>{diagramInfo(flow.type).name}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Updated {formatUpdated(flow.updatedAt)}
                    </Text>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
