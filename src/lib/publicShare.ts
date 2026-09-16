/**
 * Fetches a public share record from Opsette's public API. Used only by the
 * `?share_token=` boot path (main.tsx) — a visitor with no Opsette session,
 * loaded by `app/share/[token]/page.tsx` in an iframe pointed at
 * `{app_url}?share_token={token}`. See
 * C:\opsette\opsette-v2\docs\MARKETPLACE_PUBLIC_SHARE_LINKS_PLAN.md.
 *
 * This is a plain fetch to Opsette's own API, NOT the postMessage bridge —
 * there is no parent/child handshake in this mode (no session to authenticate
 * it with), so the tool resolves its own content independently.
 */

// Mirrors the bridge's own trusted-origin list (opsette-bridge/bridge.ts) —
// same reasoning: this tool's static assets can be served by tools.opsette.io
// in prod or a local dev port, but the API that owns share tokens always
// lives on the apex, dev or prod.
const OPSETTE_API_BASE = import.meta.env.DEV ? "http://localhost:8081" : "https://opsette.io";

/** Same untagged-is-a-flow / `kind: "discovery"` convention as db/types.ts
 *  BridgedValue — the public route returns the same `value` shape verbatim. */
export interface PublicShareValue {
  kind?: "discovery";
  type?: string;
  name: string;
  content: unknown;
}

export interface PublicShareRecord {
  app_url: string;
  value: PublicShareValue;
}

export type PublicShareResult =
  | { status: "ok"; record: PublicShareRecord }
  | { status: "not_found" }
  | { status: "error" };

export function getShareTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("share_token");
}

export async function fetchPublicShareRecord(token: string): Promise<PublicShareResult> {
  try {
    const res = await fetch(`${OPSETTE_API_BASE}/api/iframe-app-data/public?token=${encodeURIComponent(token)}`);
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as PublicShareRecord;
    if (!data || typeof data !== "object" || !data.value || typeof data.value !== "object") {
      return { status: "error" };
    }
    return { status: "ok", record: data };
  } catch {
    return { status: "error" };
  }
}
