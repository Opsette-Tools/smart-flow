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
  /** Every diagram type stores the same doc shape — lanes are simply empty
   *  for the four outline types. */
  content: SmartFlowDoc;
}

export const DB_NAME = "smart-flow";
export const DB_VERSION = 1;
export const FLOWS_STORE = "flows";

/**
 * What one row sends over the Opsette bridge. Every type now stores the same
 * doc shape, but `content` alone still can't say which diagram type it is or
 * what to call it — `type` and `name` ride along so a hydrated row renders
 * with the right layout function under the right name. See
 * docs/SMARTFLOW_STORAGE_PLAN.md §5.
 */
export type BridgedFlowValue = Pick<Flow, "type" | "name" | "content">;
