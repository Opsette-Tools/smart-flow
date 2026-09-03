/**
 * Which discovery session was open last — a pointer only, mirrors
 * activeFlow.ts exactly.
 */

const ACTIVE_SESSION_KEY = "smart-flow-active-discovery-id";

export function getActiveDiscoverySessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveDiscoverySessionId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* non-fatal */
  }
}
