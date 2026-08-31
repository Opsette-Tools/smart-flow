import { createRoot } from "react-dom/client";
import { App } from "./App";
import { migrateLegacyIfNeeded } from "./db/migrateLegacy";
import { setActiveFlowId } from "./lib/activeFlow";
import "reactflow/dist/style.css";
import "./styles/tokens.css";
import "./components/smartflow/smartflow.css";
import "./index.css";

// GitHub Pages SPA fallback (rafgraph pattern, paired with public/404.html):
// the 404 page encodes the real path into the query string and bounces here;
// decode it back into a real path BEFORE the router mounts, so a deep link
// or a refresh on /library or /flow/:id lands on the right route instead of
// silently dropping back to "/".
(function decodeSpaRedirect(l: Location) {
  if (l.search[1] === "/") {
    const decoded = l.search
      .slice(1)
      .split("&")
      .map((s) => s.replace(/~and~/g, "&"))
      .join("?");
    window.history.replaceState(null, "", l.pathname.slice(0, -1) + decoded + l.hash);
  }
})(window.location);

// PWA service worker registration with iframe / preview guard.
// In a preview iframe, service workers cause stale-content issues, so we
// unregister any existing SWs there. In production they activate normally.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (isPreviewHost || isInIframe) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Dynamic import so the vite-plugin-pwa virtual module never loads in preview.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* noop */
    });
}

// Bring forward any pre-library single-slot doc/text before the app ever
// renders, so the first paint already reflects the migrated flow library.
// Never let a migration failure (IndexedDB blocked, private browsing, quota)
// stop the app from rendering at all — the legacy localStorage key is never
// deleted by the migration either way, so the source data survives a failed
// attempt; only the render itself must not be allowed to block on it.
migrateLegacyIfNeeded()
  .catch((err) => {
    console.error("[smart-flow] migration failed, continuing without it:", err);
    return null;
  })
  .then((activeId) => {
    if (activeId) setActiveFlowId(activeId);
    createRoot(document.getElementById("root")!).render(<App />);
  });
