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
