import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { getBridgeInstance } from "@/lib/bridgeInstance";
import "./share.css";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The saved record's stable id (Flow.id / DiscoverySession.id) — the
   *  bridge's data_id. */
  dataId: string;
  /** Record name, shown in the modal head. */
  recordName: string;
};

type MintState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; url: string }
  | { status: "error"; message: string };

/**
 * Share ONE record as a public, read-only, live link — distinct from
 * ShareAppModal (which shares the whole app's static marketing URL). Minting
 * goes through the Opsette bridge's `requestShareLink`, not a config
 * constant: Opsette owns and mints the token, this tool only ever displays
 * the URL handed back. See
 * C:\opsette\opsette-v2\docs\MARKETPLACE_PUBLIC_SHARE_LINKS_PLAN.md.
 *
 * Reuses ShareAppModal's CSS (share.css) for the chrome — same toggle-free
 * copy/QR layout — but not its component or data flow, since minting is a
 * real async round trip (can fail, can be slow), not a static string.
 */
const RecordShareModal: React.FC<Props> = ({ open, onClose, dataId, recordName }) => {
  const [state, setState] = useState<MintState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) {
      setState({ status: "idle" });
      setCopied(false);
      return;
    }
    const bridge = getBridgeInstance();
    if (!bridge) {
      setState({ status: "error", message: "Share links only work when this tool is open inside Opsette." });
      return;
    }
    setState({ status: "loading" });
    bridge
      .requestShareLink(dataId)
      .then((result) => setState({ status: "ok", url: result.url }))
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : "Couldn't create a link" }));
  }, [open, dataId]);

  useEffect(() => {
    if (state.status !== "ok" || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, state.url, {
      width: 220,
      margin: 1,
      color: { dark: "#2f4f46", light: "#ffffff" },
    }).catch(() => {});
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const url = state.status === "ok" ? state.url : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — fall back to selecting the input
    }
  };

  const handleShare = async () => {
    if (!url) return;
    if (canNativeShare) {
      try {
        await navigator.share({ title: recordName, url });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="ops-share-overlay" role="dialog" aria-modal="true" aria-label={`Share ${recordName}`} onClick={onClose}>
      <div className="ops-share-modal" onClick={(e) => e.stopPropagation()}>
        <button className="ops-share-close" aria-label="Close" onClick={onClose}>×</button>

        <div className="ops-share-head">
          <div className="ops-share-eyebrow">Share this record</div>
          <h2 className="ops-share-title">{recordName}</h2>
          <p className="ops-share-tagline">
            Anyone with this link can view a live, read-only version — no login required.
          </p>
        </div>

        {state.status === "loading" || state.status === "idle" ? (
          <p className="ops-share-note" style={{ padding: "24px 0" }}>
            Creating your link…
          </p>
        ) : state.status === "error" ? (
          <p className="ops-share-note" style={{ padding: "24px 0", color: "#c0392b" }}>
            {state.message}
          </p>
        ) : (
          <>
            <div className="ops-share-qr-wrap">
              <canvas ref={canvasRef} className="ops-share-qr" />
            </div>

            <div className="ops-share-url-row">
              <input className="ops-share-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <button className="ops-share-btn ops-share-btn-secondary" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <button className="ops-share-btn ops-share-btn-primary" onClick={handleShare}>
              {canNativeShare ? "Share…" : "Copy link"}
            </button>
          </>
        )}

        <p className="ops-share-note">This link stays live — it always shows your latest version.</p>
      </div>
    </div>,
    document.body,
  );
};

export default RecordShareModal;
