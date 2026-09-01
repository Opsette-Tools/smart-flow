import type { Bridge } from "@/components/opsette-bridge";
import type { BridgedFlowValue } from "@/db/types";

// Module-level singleton so non-React code (flowsRepo) can check bridge mode
// without threading React context through every call site. Set once during
// the main.tsx bootstrap.

let instance: Bridge<BridgedFlowValue> | null = null;

// Ids the parent has acknowledged (either in init.items or via a successful
// save ack). Local-only flows are never auto-uploaded (SMARTFLOW_STORAGE_PLAN
// §8.2), so a delete only reaches the parent when it already knows the id.
const parentKnownIds = new Set<string>();

export function setBridgeInstance(b: Bridge<BridgedFlowValue> | null): void {
  instance = b;
}

export function getBridgeInstance(): Bridge<BridgedFlowValue> | null {
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
