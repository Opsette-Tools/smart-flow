import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer, Tooltip } from "antd";
import { CloseOutlined } from "@ant-design/icons";

/**
 * ResizableDrawer — a maskless, drag-resizable right-side drawer.
 *
 * Built on the same structure as Brand Board's ToolEmbedDrawer, which has been
 * in use across several Opsette tools. The parts that matter, and why:
 *
 *   • MASKLESS. The page stays live beside the drawer, so you can click from
 *     one thing to the next without closing and reopening.
 *   • DRAG-RESIZABLE from the left edge, with the width remembered per
 *     `storageKey` so it reopens the size you left it.
 *   • A real toolbar with a close button, because a maskless drawer has no
 *     backdrop to click away.
 *   • A DRAG SHIELD covering the drawer while resizing. Without it, any iframe
 *     or embedded surface swallows mousemove/mouseup and the drag sticks on
 *     forever.
 *
 * The children must be ordinary flow content. Do NOT give a child
 * `height: 100%` plus its own background: the handle is absolutely positioned
 * against the drawer body, and a full-height opaque child paints over it.
 */

const MIN_WIDTH = 340;

/** Cap at most of the viewport so the page never fully disappears behind it. */
function maxWidth(): number {
  return typeof window === "undefined" ? 1200 : Math.round(window.innerWidth * 0.92);
}

export interface ResizableDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Shown at the left of the drawer's toolbar. */
  title: ReactNode;
  /** When given, the toolbar title becomes editable in place. */
  onRename?: (next: string) => void;
  /** Optional controls sitting to the left of the close button. */
  extra?: ReactNode;
  /** Starting width before this drawer has a remembered one. */
  defaultWidth?: number;
  /** localStorage key for the remembered width. Drawers sharing a key share
   *  a width, so switching between them doesn't resize the window under you. */
  storageKey: string;
  children: ReactNode;
}

export function ResizableDrawer({
  open,
  onClose,
  title,
  onRename,
  extra,
  defaultWidth = 460,
  storageKey,
  children,
}: ResizableDrawerProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const saved = Number(window.localStorage.getItem(storageKey));
    return saved >= MIN_WIDTH ? Math.min(saved, maxWidth()) : Math.min(defaultWidth, maxWidth());
  });

  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Latest width for the mouseup persist, without re-binding the drag listeners.
  const widthRef = useRef(width);
  widthRef.current = width;

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = widthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Global drag listeners live ONLY while resizing, and always tear down on end,
  // plus a hard stop on window blur and the pointer leaving the document, so a
  // lost mouseup (alt-tab, second monitor) can never leave the drag stuck on.
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      // Right-anchored: dragging LEFT (smaller clientX) widens the drawer.
      const delta = startXRef.current - e.clientX;
      const next = Math.min(Math.max(startWidthRef.current + delta, MIN_WIDTH), maxWidth());
      setWidth(next);
    };
    const stop = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(storageKey, String(Math.round(widthRef.current)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("mouseleave", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("mouseleave", stop);
    };
  }, [isResizing, storageKey]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      mask={false}
      width={width}
      closable={false}
      // No `title` prop, deliberately. AntD renders its own header whenever
      // title is truthy, which pushes a second title above the body and strands
      // the close button. The title belongs to our own toolbar below.
      styles={{ body: { padding: 0, position: "relative" }, header: { display: "none" } }}
      rootClassName="ops-resizable-drawer"
    >
      {/* Left-edge resize handle: a slim hit area with a visible grip. */}
      <div
        onMouseDown={onDragStart}
        title="Drag to resize"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 10,
          cursor: "col-resize",
          zIndex: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isResizing ? "rgba(47,79,70,0.12)" : "transparent",
        }}
      >
        <div
          style={{
            width: 3,
            height: 44,
            borderRadius: 2,
            background: isResizing ? "#2f4f46" : "rgba(0,0,0,0.22)",
          }}
        />
      </div>

      {/* Drag shield: only present while resizing. Covers the whole drawer so
          every mousemove/mouseup during a drag reaches THIS document. Also
          shows a live width readout. */}
      {isResizing && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, cursor: "col-resize" }}>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.82)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            {Math.round(width)}px
          </div>
        </div>
      )}

      <div className="ops-drawer-bar">
        {onRename ? (
          <input
            className="ops-drawer-title ops-drawer-title-input"
            value={typeof title === "string" ? title : ""}
            onChange={(e) => onRename(e.target.value)}
            aria-label="Rename"
          />
        ) : (
          <div className="ops-drawer-title">{title}</div>
        )}
        <div className="ops-drawer-bar-right">
          {extra}
          <Tooltip title="Close">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ops-drawer-close"
            >
              <CloseOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="ops-drawer-content">{children}</div>
    </Drawer>
  );
}
