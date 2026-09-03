/**
 * Single-session JSON export/import for discovery sessions. Mirrors
 * flowExport.ts's exact pattern: a typed envelope with a version tag so a bad
 * or foreign file fails with a plain message instead of importing garbage,
 * and no `id`/timestamps carried across — importing always mints a fresh
 * session in the recipient's own IndexedDB store.
 */

import type { DiscoveryDoc } from "@/components/discovery/types";
import type { DiscoverySession } from "@/db/discoveryTypes";

const EXPORT_TYPE = "opsette-smartflow-discovery";

interface DiscoveryExportFile {
  type: typeof EXPORT_TYPE;
  v: 1;
  exportedAt: string;
  session: {
    name: string;
    content: DiscoveryDoc;
  };
}

export function serializeDiscoveryExport(session: DiscoverySession): string {
  const file: DiscoveryExportFile = {
    type: EXPORT_TYPE,
    v: 1,
    exportedAt: new Date().toISOString(),
    session: { name: session.name, content: session.content },
  };
  return JSON.stringify(file, null, 2);
}

export function discoveryExportFileName(name: string): string {
  const safe = (name || "discovery-session").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  return `${safe}.discovery.json`;
}

export interface ParsedDiscoveryImport {
  name: string;
  content: DiscoveryDoc;
}

/** True for a plain DiscoveryDoc shape — checked by the fields only this doc
 *  ever carries, same spirit as flowExport.ts's isLikelySmartFlowDoc. */
function isLikelyDiscoveryDoc(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.header === "object" &&
    d.header !== null &&
    Array.isArray(d.steps) &&
    Array.isArray(d.roles) &&
    Array.isArray(d.systemsList) &&
    Array.isArray(d.artifacts) &&
    Array.isArray(d.decisionRules) &&
    Array.isArray(d.glossary) &&
    Array.isArray(d.exceptions) &&
    Array.isArray(d.volume)
  );
}

/** Parse an imported file's text. Accepts only the real Export shape:
 *  { type: "opsette-smartflow-discovery", v: 1, session: { name, content } }
 *  `content` is checked by shape, not trusted from the envelope's `type`
 *  alone, so a hand-edited or mismatched file fails cleanly. Null if it
 *  doesn't match. */
export function parseDiscoveryImport(text: string): ParsedDiscoveryImport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (r.type !== EXPORT_TYPE) return null;
  if (typeof r.session !== "object" || r.session === null) return null;
  const s = r.session as Record<string, unknown>;
  if (typeof s.name !== "string") return null;
  if (!isLikelyDiscoveryDoc(s.content)) return null;
  return { name: s.name, content: s.content as unknown as DiscoveryDoc };
}
