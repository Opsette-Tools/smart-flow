/**
 * One-time migration from SmartFlow's pre-library single-slot storage
 * (`smart-flow-doc` for the swimlane, `smart-flow-outline-texts` for the
 * four outline types) into the flow library. Runs once, guarded by a marker
 * key. Legacy keys are left in place afterward — cheap insurance, not
 * cleaned up as part of this change. See docs/SMARTFLOW_STORAGE_PLAN.md §3.
 */

import { diagramInfo, type DiagramType } from "@/components/smartflow/diagramTypes";
import type { CardPosition, PersistedDoc, SmartFlowDoc } from "@/components/smartflow/types";
import { flowsRepo } from "./flowsRepo";

const LEGACY_DOC_KEY = "smart-flow-doc";
const LEGACY_OUTLINE_KEY = "smart-flow-outline-texts";
const LEGACY_ACTIVE_TYPE_KEY = "smart-flow-active-type";
const MIGRATED_MARKER = "smart-flow-migrated-v1";

type OutlineType = Exclude<DiagramType, "swimlane">;

/** A NaN or non-numeric entry would strand a card at an unreachable
 *  coordinate, so bad entries are dropped rather than trusted. Ported from
 *  the pre-library store.ts. */
function readPositions(raw: unknown): Record<string, CardPosition> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, CardPosition> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[key] = { x, y };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readLegacySwimlaneDoc(): SmartFlowDoc | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_DOC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDoc>;
    if ((parsed?.v !== 1 && parsed?.v !== 2) || !parsed.doc) return null;
    const doc = parsed.doc;
    if (!Array.isArray(doc.lanes) || !Array.isArray(doc.items)) return null;
    if (doc.lanes.length === 0 && doc.items.length === 0) return null;
    return {
      lanes: doc.lanes,
      items: doc.items.map((i) => ({
        ...i,
        connectsTo: Array.isArray(i.connectsTo) ? i.connectsTo : [],
        connections: Array.isArray(i.connections) ? i.connections : undefined,
      })),
      summary: typeof doc.summary === "string" ? doc.summary : undefined,
      lanePositions: readPositions(doc.lanePositions),
    };
  } catch {
    return null;
  }
}

function readLegacyOutlineTexts(): Partial<Record<OutlineType, string>> {
  try {
    const raw = window.localStorage.getItem(LEGACY_OUTLINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<OutlineType, string>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readLegacyActiveType(): DiagramType | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_ACTIVE_TYPE_KEY);
    const valid: DiagramType[] = ["flowchart", "swimlane", "decision-tree", "org-tree", "timeline"];
    return raw && valid.includes(raw as DiagramType) ? (raw as DiagramType) : null;
  } catch {
    return null;
  }
}

/** Runs once. Returns the id of the flow that should become active (whichever
 *  type was open before migration), or null when there was nothing to bring
 *  forward. */
export async function migrateLegacyIfNeeded(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(MIGRATED_MARKER)) return null;
  } catch {
    return null;
  }

  const activeType = readLegacyActiveType();
  let activeFlowId: string | null = null;

  const swimDoc = readLegacySwimlaneDoc();
  if (swimDoc) {
    const flow = await flowsRepo.create({ type: "swimlane", name: diagramInfo("swimlane").name, content: swimDoc });
    if (activeType === "swimlane") activeFlowId = flow.id;
  }

  const outlineTexts = readLegacyOutlineTexts();
  for (const [type, text] of Object.entries(outlineTexts) as [OutlineType, string][]) {
    if (!text?.trim()) continue;
    const flow = await flowsRepo.create({ type, name: diagramInfo(type).name, content: text });
    if (activeType === type) activeFlowId = flow.id;
  }

  try {
    window.localStorage.setItem(MIGRATED_MARKER, "1");
  } catch {
    /* non-fatal */
  }

  return activeFlowId;
}
