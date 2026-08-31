import { useNavigate } from "react-router-dom";
import { flowsRepo } from "@/db/flowsRepo";
import type { DiagramType } from "@/components/smartflow/diagramTypes";
import type { Template } from "@/components/smartflow/templates";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import { setActiveFlowId } from "@/lib/activeFlow";
import { useFlows } from "@/layout/FlowsContext";

/** Shared "create a flow, make it active, open it" flow — used by every
 *  entry point that can create one (StartPage, the library, the header's
 *  "Change diagram") so they can't drift apart, and so the sidebar's list
 *  always picks up a flow created from any of them. */
export function useCreateFlow() {
  const navigate = useNavigate();
  const { refresh } = useFlows();

  const openFlow = (id: string) => {
    setActiveFlowId(id);
    navigate(`/flow/${id}`);
  };

  const createFromType = async (type: DiagramType) => {
    const flow = await flowsRepo.create({ type });
    refresh();
    openFlow(flow.id);
  };

  const createFromTemplate = async (template: Template) => {
    const content: SmartFlowDoc | string =
      template.type === "swimlane" && template.makeDoc ? template.makeDoc() : template.outline ?? "";
    const flow = await flowsRepo.create({ type: template.type, name: template.name, content });
    refresh();
    openFlow(flow.id);
  };

  return { openFlow, createFromType, createFromTemplate };
}
