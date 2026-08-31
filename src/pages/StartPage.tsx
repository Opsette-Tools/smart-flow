import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Spin, Typography } from "antd";
import { ChooserModal } from "@/components/smartflow/ChooserModal";
import { flowsRepo } from "@/db/flowsRepo";
import { getActiveFlowId } from "@/lib/activeFlow";
import { useCreateFlow } from "@/lib/useCreateFlow";

const { Text } = Typography;

/**
 * "/" — reopens the flow you had open last. When there's nothing to reopen
 * (first-ever visit, or that flow was deleted), it's the same empty landing
 * SmartFlow always showed, chooser open on top. "New flow" in the sidebar
 * does the same thing — this is just the version reachable without it.
 */
export default function StartPage() {
  const [status, setStatus] = useState<"loading" | "empty" | "resume">("loading");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const { createFromType, createFromTemplate } = useCreateFlow();

  useEffect(() => {
    let cancelled = false;
    const id = getActiveFlowId();
    if (!id) {
      setStatus("empty");
      setChooserOpen(true);
      return;
    }
    flowsRepo.get(id).then((flow) => {
      if (cancelled) return;
      if (flow) {
        setResumeId(flow.id);
        setStatus("resume");
      } else {
        setStatus("empty");
        setChooserOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "resume" && resumeId) return <Navigate to={`/flow/${resumeId}`} replace />;

  if (status === "loading") {
    return (
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Spin />
      </div>
    );
  }

  return (
    <>
      <div className="sf-empty-diagram" style={{ minHeight: "40vh" }}>
        <Text type="secondary">
          Nothing on the board yet. Pick the kind of diagram you need and we'll set it up.
        </Text>
        <Button type="primary" size="large" onClick={() => setChooserOpen(true)}>
          Choose a diagram
        </Button>
      </div>

      <ChooserModal
        open={chooserOpen}
        onPick={createFromType}
        onPickTemplate={createFromTemplate}
        onClose={() => setChooserOpen(false)}
      />
    </>
  );
}
