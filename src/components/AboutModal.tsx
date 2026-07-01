import { Modal, Typography } from "antd";
import { OpsetteFooterLogo } from "@/components/opsette-share";

const { Paragraph, Title } = Typography;

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="About SmartFlow">
      <Title level={5} style={{ marginTop: 0 }}>A business tool from Opsette</Title>
      <Paragraph>
        SmartFlow turns a flat list of process steps into a clean swimlane
        diagram. You set up the lanes, drop each step where it belongs, order
        them, and draw the handoffs between lanes by hand. Nothing is guessed for
        you — every placement is your call.
      </Paragraph>
      <Paragraph>
        When the diagram looks right, export it as a PNG with no app chrome in the
        image, ready to drop into a doc or send to a client. Your work autosaves in
        this browser, so you can close the tab and pick up where you left off.
      </Paragraph>
      <OpsetteFooterLogo />
    </Modal>
  );
}
