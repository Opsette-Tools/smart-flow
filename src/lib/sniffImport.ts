/**
 * One import entry point for both file pickers (the sidebar's "Import flow"
 * and Discovery's "Import"). Reads the file once, sniffs the envelope's
 * `type` tag to tell a flow export from a discovery-session export, and
 * routes to the matching repo — so a session dropped on the flow picker (or
 * a flow dropped on the discovery picker) still lands in the right place
 * instead of failing with a "wrong file" error.
 *
 * Delegates the actual shape/version parsing to flowExport.ts and
 * discoveryExport.ts — this only decides which of the two to hand the text
 * to. The legacy bare-swimlane-doc shape (no envelope at all) has no `type`
 * tag to sniff, so it's tried as a flow last, same as parseFlowImport did on
 * its own.
 */

import { parseFlowImport, type ParsedFlowImport } from "@/lib/flowExport";
import { parseDiscoveryImport, type ParsedDiscoveryImport } from "@/lib/discoveryExport";

export type SniffedImport =
  | { kind: "flow"; data: ParsedFlowImport }
  | { kind: "discovery"; data: ParsedDiscoveryImport }
  | { kind: "unrecognized" };

const DISCOVERY_EXPORT_TYPE = "opsette-smartflow-discovery";

export function sniffImport(text: string): SniffedImport {
  let envelopeType: unknown;
  try {
    const raw = JSON.parse(text);
    if (typeof raw === "object" && raw !== null) envelopeType = (raw as Record<string, unknown>).type;
  } catch {
    return { kind: "unrecognized" };
  }

  if (envelopeType === DISCOVERY_EXPORT_TYPE) {
    const data = parseDiscoveryImport(text);
    return data ? { kind: "discovery", data } : { kind: "unrecognized" };
  }

  // Real flow exports carry their own `type` tag; the legacy bare/wrapped
  // swimlane doc carries none at all. Either way, try it as a flow.
  const flowData = parseFlowImport(text);
  if (flowData) return { kind: "flow", data: flowData };

  return { kind: "unrecognized" };
}
