/**
 * Flow — one saved diagram, of any DiagramType. Multiple flows can exist per
 * type; each is independent and never overwritten by picking a template or
 * starting a new one. `id` doubles as the future Opsette bridge data_id —
 * see docs/SMARTFLOW_STORAGE_PLAN.md §3.
 */

import type { DiagramType } from "@/components/smartflow/diagramTypes";
import type { SmartFlowDoc } from "@/components/smartflow/types";

export interface Flow {
  id: string;
  type: DiagramType;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Swimlane carries the rich doc; every outline type carries its pasted text. */
  content: SmartFlowDoc | string;
}

export const DB_NAME = "smart-flow";
export const DB_VERSION = 1;
export const FLOWS_STORE = "flows";

/**
 * What one row sends over the Opsette bridge. `content` alone isn't
 * self-describing — every outline type (flowchart, decision-tree, org-tree,
 * timeline) stores a plain string, indistinguishable from each other by
 * shape — so `type` and `name` ride along too, or a hydrated row can't be
 * rendered correctly. See docs/SMARTFLOW_STORAGE_PLAN.md §5.
 */
export type BridgedFlowValue = Pick<Flow, "type" | "name" | "content">;
