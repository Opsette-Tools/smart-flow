/**
 * DiscoverySession — one live-meeting capture sheet. Separate entity from
 * Flow: this is raw discovery input, upstream of any saved diagram. Same flat
 * { id, name, createdAt, updatedAt, content } shape as Flow, and bridged to
 * Opsette the same way — see BridgedDiscoveryValue in types.ts.
 */

import type { DiscoveryDoc } from "@/components/discovery/types";

export interface DiscoverySession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  content: DiscoveryDoc;
}

export const DISCOVERY_DB_NAME = "smart-flow-discovery";
export const DISCOVERY_DB_VERSION = 1;
export const DISCOVERY_STORE = "sessions";
