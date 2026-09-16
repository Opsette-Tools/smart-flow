import { useEffect, useMemo, useState } from "react";
import { Result, Spin } from "antd";
import { SchemaCanvas } from "@/components/smartflow/schema/canvas/SchemaCanvas";
import { emptySchemaDoc, type SchemaDoc } from "@/components/smartflow/schema/types";
import { SchemaMapView } from "@/components/smartflow/schemamap/SchemaMapView";
import { DiagramCanvas } from "@/components/smartflow/diagram/DiagramCanvas";
import { buildFlowchartLayout, buildTimelineLayout } from "@/components/smartflow/diagram/flowLayout";
import { buildTreeLayout } from "@/components/smartflow/diagram/treeLayout";
import { emptyDoc, type Action } from "@/components/smartflow/store";
import type { SmartFlowDoc } from "@/components/smartflow/types";
import type { DiagramType } from "@/components/smartflow/diagramTypes";
import { useThemeMode } from "@/lib/theme";
import { fetchPublicShareRecord, type PublicShareValue } from "@/lib/publicShare";

const noopDispatch: React.Dispatch<Action> = () => {};

function isSchemaDoc(content: unknown): content is SchemaDoc {
  return (
    !!content &&
    typeof content === "object" &&
    Array.isArray((content as SchemaDoc).tables) &&
    Array.isArray((content as SchemaDoc).relationships)
  );
}

function isSmartFlowDoc(content: unknown): content is SmartFlowDoc {
  return !!content && typeof content === "object" && Array.isArray((content as SmartFlowDoc).lanes) && Array.isArray((content as SmartFlowDoc).items);
}

const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>{children}</div>
);

/**
 * Public/read-only viewer — the `?share_token=` boot path (see main.tsx).
 * Mounted standalone, wrapped only in ThemeProvider: no FlowsProvider/
 * DiscoveryProvider (both touch IndexedDB on mount), no AppLayout chrome
 * (sidebar/header act on the visitor's OWN local library, which doesn't
 * exist here), no router. This page IS the whole app for this visitor.
 *
 * Per docs/MARKETPLACE_PUBLIC_SHARE_LINKS_PLAN.md, only the real diagram
 * ARTIFACT renders — not the full editing page each type normally lives in:
 *   - schema      -> SchemaCanvas (readOnly)      — the table/relationship canvas
 *   - swimlane    -> SchemaMapView (readOnly)      — the lane map, not BuildMode
 *   - flowchart/decision-tree/org-tree/timeline
 *                 -> DiagramCanvas                 — already render-only by
 *                    construction (no dispatch prop at all), same layout
 *                    functions OutlineBuilder.tsx uses
 * Discovery sessions are out of scope for v1 (doc's explicit "leaning toward
 * maybe not, default to leaving out").
 */
export function PublicSharePage({ token }: { token: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "not_found" } | { status: "error" } | { status: "ok"; value: PublicShareValue }
  >({ status: "loading" });
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  useEffect(() => {
    let cancelled = false;
    fetchPublicShareRecord(token).then((result) => {
      if (cancelled) return;
      if (result.status === "ok") setState({ status: "ok", value: result.record.value });
      else setState({ status: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const diagramType = state.status === "ok" ? (state.value.type as DiagramType | undefined) : undefined;
  const smartFlowDoc: SmartFlowDoc | undefined =
    state.status === "ok" && diagramType && diagramType !== "schema"
      ? isSmartFlowDoc(state.value.content)
        ? state.value.content
        : emptyDoc
      : undefined;

  // Only computed for outline types — cheap, but no reason to run it for
  // schema/swimlane/discovery/loading/error states.
  const outlineLayout = useMemo(() => {
    if (!smartFlowDoc || !diagramType || diagramType === "swimlane" || diagramType === "schema") return null;
    switch (diagramType) {
      case "flowchart":
        return buildFlowchartLayout(smartFlowDoc.items, isDark);
      case "timeline":
        return buildTimelineLayout(smartFlowDoc.items, isDark);
      case "decision-tree":
        return buildTreeLayout(smartFlowDoc.items, isDark, { edgeLabels: true });
      case "org-tree":
        return buildTreeLayout(smartFlowDoc.items, isDark);
      default:
        return null;
    }
  }, [smartFlowDoc, diagramType, isDark]);

  if (state.status === "loading") {
    return (
      <CenteredMessage>
        <Spin size="large" />
      </CenteredMessage>
    );
  }

  if (state.status === "not_found") {
    return (
      <CenteredMessage>
        <Result status="404" title="Link not found" subTitle="This share link is invalid or no longer active." />
      </CenteredMessage>
    );
  }

  if (state.status === "error") {
    return (
      <CenteredMessage>
        <Result status="error" title="Couldn't load this link" subTitle="Try refreshing, or ask for a new link." />
      </CenteredMessage>
    );
  }

  const { value } = state;

  if (value.type === "schema") {
    const doc = isSchemaDoc(value.content) ? value.content : emptySchemaDoc;
    return (
      <div className="sf-main">
        <SchemaCanvas doc={doc} dispatch={() => {}} readOnly />
      </div>
    );
  }

  if (value.type === "swimlane" && smartFlowDoc) {
    return (
      <div className="sf-main">
        <SchemaMapView doc={smartFlowDoc} dispatch={noopDispatch} readOnly />
      </div>
    );
  }

  if (outlineLayout) {
    return (
      <div className="sf-main">
        <DiagramCanvas nodes={outlineLayout.nodes} edges={outlineLayout.edges} exportName={value.name || "diagram"} />
      </div>
    );
  }

  return (
    <CenteredMessage>
      <Result status="info" title={value.name || "Shared record"} subTitle="A read-only view for this record type isn't available yet." />
    </CenteredMessage>
  );
}
