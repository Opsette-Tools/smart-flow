/**
 * Single-flow JSON export/import — a portability/backup layer on top of the
 * IndexedDB flow library, not a replacement for it. Same typed-envelope
 * convention as Brand Board's project file (components/board/projectFile.ts
 * in the brand-board repo): a `type` tag + version, so a bad or foreign file
 * fails with a plain message instead of silently importing garbage.
 *
 * Deliberately carries no `id`/timestamps — importing always mints a fresh
 * flow. The recipient's library is a different IndexedDB store; there is
 * nothing meaningful to preserve identity against.
 */

import type { DiagramType } from "@/components/smartflow/diagramTypes";
import type { SchemaDoc } from "@/components/smartflow/schema/types";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import type { Flow } from "@/db/types";

const EXPORT_TYPE = "opsette-smartflow-flow";

interface SmartFlowExportFile {
  type: typeof EXPORT_TYPE;
  v: 1;
  exportedAt: string;
  flow: {
    type: DiagramType;
    name: string;
    content: SmartFlowDoc | SchemaDoc;
  };
}

export function serializeFlowExport(flow: Flow): string {
  const file: SmartFlowExportFile = {
    type: EXPORT_TYPE,
    v: 1,
    exportedAt: new Date().toISOString(),
    flow: { type: flow.type, name: flow.name, content: flow.content },
  };
  return JSON.stringify(file, null, 2);
}

export function flowExportFileName(name: string): string {
  const safe = (name || "flow").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  return `${safe}.smartflow.json`;
}

export interface ParsedFlowImport {
  type: DiagramType;
  name: string;
  content: SmartFlowDoc | SchemaDoc;
}

const VALID_OUTLINE_TYPES: DiagramType[] = ["flowchart", "swimlane", "decision-tree", "org-tree", "timeline"];

/** True for a plain swimlane doc — the shape `db/migrateLegacy.ts` already
 *  trusts, and what the raw `localStorage.getItem('smart-flow-doc')` backup
 *  snippet downloads verbatim (no wrapper, no `type` tag). Importing one of
 *  those files is exactly as valid as importing a real Export — same data,
 *  just captured a different way — so the importer has to recognize both. */
function isLikelySmartFlowDoc(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return Array.isArray(d.lanes) && Array.isArray(d.items);
}

/** True for a SchemaDoc — checked by the shape only `schema`-type flows
 *  ever write (`tables`/`relationships` arrays), same spirit as
 *  isLikelySmartFlowDoc's `lanes`/`items` check above. */
function isLikelySchemaDoc(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return Array.isArray(d.tables) && Array.isArray(d.relationships);
}

/** Parse an imported file's text. Accepts either shape:
 *   1. A real Export from this app's own "Export" action:
 *      { type: "opsette-smartflow-flow", v: 1, flow: { type, name, content } }
 *      `content` is a SmartFlowDoc for the five process-diagram types, or a
 *      SchemaDoc for "schema" — checked by shape, not trusted from `type`
 *      alone, so a hand-edited or mismatched file fails cleanly instead of
 *      importing the wrong doc shape into the wrong reducer.
 *   2. The raw legacy swimlane doc, wrapped or bare:
 *      { v: 1 | 2, doc: { lanes, items, ... } }  — or just { lanes, items, ... }
 *      This is what the manual backup snippet (localStorage.getItem
 *      ('smart-flow-doc')) downloads directly, with no envelope at all.
 *      Always a swimlane doc — this format predates every other type.
 *  Null if it's neither. */
export function parseFlowImport(text: string): ParsedFlowImport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // Shape 1 — a real Export.
  if (r.type === EXPORT_TYPE) {
    if (typeof r.flow !== "object" || r.flow === null) return null;
    const f = r.flow as Record<string, unknown>;
    if (typeof f.name !== "string") return null;
    if (f.type === "schema") {
      if (!isLikelySchemaDoc(f.content)) return null;
      return { type: "schema", name: f.name, content: f.content as unknown as SchemaDoc };
    }
    if (typeof f.type !== "string" || !VALID_OUTLINE_TYPES.includes(f.type as DiagramType)) return null;
    if (!isLikelySmartFlowDoc(f.content)) return null;
    return { type: f.type as DiagramType, name: f.name, content: f.content as unknown as SmartFlowDoc };
  }

  // Shape 2 — the raw legacy backup: { v, doc } or a bare doc. Always a
  // swimlane doc — this format predates every other type storing SmartFlowDoc.
  const doc = isLikelySmartFlowDoc(r.doc) ? r.doc : isLikelySmartFlowDoc(r) ? r : null;
  if (doc) {
    return { type: "swimlane", name: "Imported swimlane", content: doc as unknown as SmartFlowDoc };
  }

  return null;
}

/** Downloads a Blob as a named file — shared by export helpers. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
