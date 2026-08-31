/**
 * Which flow was open last — a pointer only, never the data itself. Lets a
 * reload (or "/") reopen where you left off instead of landing on the
 * library every time.
 */

const ACTIVE_FLOW_KEY = "smart-flow-active-flow-id";

export function getActiveFlowId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_FLOW_KEY);
  } catch {
    return null;
  }
}

export function setActiveFlowId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_FLOW_KEY, id);
    else window.localStorage.removeItem(ACTIVE_FLOW_KEY);
  } catch {
    /* non-fatal */
  }
}
