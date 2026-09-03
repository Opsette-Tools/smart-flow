/**
 * DiscoverySession — one live-meeting capture sheet. Separate entity from
 * Flow: this is raw discovery input, upstream of any saved diagram. Local
 * IndexedDB only, no Opsette bridge sync — nothing in the capture-sheet spec
 * calls for cross-tool sync, and adding it later is additive to this shape,
 * not a rework.
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
