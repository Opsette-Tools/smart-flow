import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import Shell from "@/components/Shell";

const { Title, Text } = Typography;

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Shell>
      <div className="sf-empty-diagram" style={{ minHeight: "50vh" }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          Page not found
        </Title>
        <Text type="secondary">That page doesn't exist.</Text>
        <Button type="primary" size="large" onClick={() => navigate("/")}>
          Back to SmartFlow
        </Button>
      </div>
    </Shell>
  );
}
