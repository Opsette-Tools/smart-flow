import type { Bridge } from "@/components/opsette-bridge";
import type { BridgedValue } from "@/db/types";

// Module-level singleton so non-React code (flowsRepo, discoverySessionsRepo)
// can check bridge mode without threading React context through every call
// site. Set once during the main.tsx bootstrap. One instance serves both
// flows and discovery sessions — see BridgedValue in db/types.ts.

let instance: Bridge<BridgedValue> | null = null;

// Ids the parent has acknowledged (either in init.items or via a successful
// save ack). Flat across flows and discovery sessions — both mint ids via
// uuid(), so a shared set can't collide, and a single "does the parent know
// this id" question doesn't care which namespace it came from. Local-only
// rows are never auto-uploaded (SMARTFLOW_STORAGE_PLAN §8.2), so a delete
// only reaches the parent when it already knows the id.
const parentKnownIds = new Set<string>();

export function setBridgeInstance(b: Bridge<BridgedValue> | null): void {
  instance = b;
}

export function getBridgeInstance(): Bridge<BridgedValue> | null {
  return instance;
}

export function isBridgeMode(): boolean {
  return instance !== null;
}

export function markParentKnown(id: string): void {
  parentKnownIds.add(id);
}

export function isParentKnown(id: string): boolean {
  return parentKnownIds.has(id);
}

export function resetParentKnown(ids: Iterable<string>): void {
  parentKnownIds.clear();
  for (const id of ids) parentKnownIds.add(id);
}

export function forgetParentKnown(id: string): void {
  parentKnownIds.delete(id);
}
