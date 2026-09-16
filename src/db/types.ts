/**
 * Flow — one saved diagram, of any DiagramType. Multiple flows can exist per
 * type; each is independent and never overwritten by picking a template or
 * starting a new one. `id` doubles as the future Opsette bridge data_id —
 * see docs/SMARTFLOW_STORAGE_PLAN.md §3.
 */

import type { DiagramType } from "@/components/smartflow/diagramTypes";
import type { SchemaDoc } from "@/components/smartflow/schema/types";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import type { DiscoveryDoc } from "@/components/discovery/types";
import type { DiscoverySession } from "./discoveryTypes";

export interface Flow {
  id: string;
  type: DiagramType;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** The five process-diagram types share SmartFlowDoc (lanes empty for the
   *  four outline types). "schema" carries a structurally unrelated SchemaDoc
   *  instead — a real discriminated union on `type`, not a lossy stand-in for
   *  one shape by the other. See docs/SCHEMA-DESIGNER-PLAN.md §2. */
  content: SmartFlowDoc | SchemaDoc;
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
 *
 * `kind` is omitted here (rather than set to a literal "flow") because every
 * row already bridged before discovery sessions existed has no `kind` field
 * at all — see BridgedValue below for how hydration tells the two apart.
 */
export type BridgedFlowValue = Pick<Flow, "type" | "name" | "content">;

/**
 * Discovery's equivalent of BridgedFlowValue. Tagged `kind: "discovery"` so a
 * hydrating client can tell a discovery row apart from a flow row sharing the
 * same bridge init.items array — flows carry no `kind` (see above), so the
 * tag only needs to positively identify discovery rows, not both sides.
 */
export type BridgedDiscoveryValue = Pick<DiscoverySession, "name" | "content"> & {
  kind: "discovery";
  content: DiscoveryDoc;
};

/**
 * One bridge instance, one data_id space: flows and discovery sessions both
 * mint ids via uuid() (see lib/uuid.ts), so collisions aren't a real risk,
 * and Opsette's InitPayload<T>.items is already a flat data_id-keyed array
 * generic over T — no parent-side change needed to carry either shape.
 */
export type BridgedValue = BridgedFlowValue | BridgedDiscoveryValue;
