import { useState } from "react";
import { Alert, Button, Space } from "antd";
import { CloudOutlined, ExportOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { isBridgeMode } from "@/lib/bridgeInstance";

const DISMISSED_KEY = "smart-flow-standalone-notice-dismissed";

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

/**
 * Standalone-only, shaped after Content Flow's DataLossBanner. Not rendered
 * inside the Opsette iframe, where flows already persist to Supabase via the
 * bridge. Dismissal is sticky across reloads.
 */
export default function StandaloneNotice() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => isDismissed());

  if (isBridgeMode() || dismissed) return null;

  const handleDismiss = () => {
    dismiss();
    setDismissed(true);
  };

  return (
    <Alert
      type="info"
      showIcon
      closable
      onClose={handleDismiss}
      style={{ margin: "12px 24px 0" }}
      message="Your flows live in this browser"
      description={
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <span>
            SmartFlow saves everything locally. Clearing your browser data or
            switching devices means starting over.
          </span>
          <Space size={8} wrap>
            <Button size="small" icon={<ExportOutlined />} onClick={() => navigate("/library")}>
              Export a backup
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CloudOutlined />}
              href="https://opsette.io"
              target="_blank"
              rel="noreferrer"
            >
              Sync with Opsette
            </Button>
          </Space>
        </Space>
      }
    />
  );
}
