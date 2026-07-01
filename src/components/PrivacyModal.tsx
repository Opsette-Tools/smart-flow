import { Modal, Typography } from "antd";
import { OpsetteFooterLogo } from "@/components/opsette-share";

const { Paragraph, Title } = Typography;

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Privacy">
      <Title level={5} style={{ marginTop: 0 }}>Your diagram stays on your device</Title>
      <Paragraph>
        SmartFlow runs entirely in your browser. Your lanes, steps, and
        connections are saved only in this browser's local storage so your work
        survives a refresh — they're never uploaded to a server.
      </Paragraph>
      <Paragraph>
        No cookies, no tracking, no analytics, no account required. The PNG you
        export is generated right here on your device.
      </Paragraph>
      <OpsetteFooterLogo />
    </Modal>
  );
}
