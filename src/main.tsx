import { createRoot } from "react-dom/client";
import { SmartFlowApp } from "./components/smartflow/SmartFlowApp";
import "reactflow/dist/style.css";
import "./styles/tokens.css";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<SmartFlowApp />);
