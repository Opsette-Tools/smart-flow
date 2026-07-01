/**
 * App-level persistence: which diagram type is active, and the pasted text for
 * each outline-based type. The swimlane keeps its own richer doc store
 * (./store.ts); this only handles the lightweight chooser + outline state.
 */

import type { DiagramType } from "./diagramTypes";

const TYPE_KEY = "smart-flow-active-type";
const TEXT_KEY = "smart-flow-outline-texts";

type OutlineType = Exclude<DiagramType, "swimlane">;

export function loadActiveType(): DiagramType | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TYPE_KEY);
    if (!raw) return null;
    const valid: DiagramType[] = ["flowchart", "swimlane", "decision-tree", "org-tree", "timeline"];
    return valid.includes(raw as DiagramType) ? (raw as DiagramType) : null;
  } catch {
    return null;
  }
}

export function saveActiveType(type: DiagramType): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TYPE_KEY, type);
  } catch {
    /* non-fatal */
  }
}

export function loadOutlineTexts(): Partial<Record<OutlineType, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TEXT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<OutlineType, string>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOutlineTexts(texts: Partial<Record<OutlineType, string>>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEXT_KEY, JSON.stringify(texts));
  } catch {
    /* non-fatal */
  }
}
