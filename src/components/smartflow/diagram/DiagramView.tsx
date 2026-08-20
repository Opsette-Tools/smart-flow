import { useRef, type Dispatch } from "react";
import { Button, Empty } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import type { SmartFlowDoc } from "../types";
import type { Action } from "../store";
import { GapsPanel } from "./GapsPanel";
import { printFindings } from "./printFindings";

interface Props {
  doc: SmartFlowDoc;
  dispatch: Dispatch<Action>;
}

/**
 * The findings page — everything the board turned up, in writing.
 *
 * This used to render a swimlane picture with the findings beneath it. The
 * picture is gone: the Map page draws the process far better than a fixed
 * layout ever did, so keeping a second, worse rendering here only split
 * attention between them. What's left is the half that was always the real
 * deliverable — the read-out and the written summary.
 *
 * No PNG export either, for the same reason: there is no image on this page to
 * export. The output here is a document, so it prints as one.
 */
export function DiagramView({ doc, dispatch }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const placedCount = doc.items.filter((i) => i.laneId !== null).length;
  const hasContent = placedCount > 0;

  return (
    <section className="sf-findings-page">
      <div className="sf-findings-toolbar">
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          disabled={!hasContent}
          onClick={() => printFindings(printRef.current)}
        >
          Save as PDF
        </Button>
      </div>

      {hasContent ? (
        <div ref={printRef} className="sf-findings-body">
          <GapsPanel doc={doc} dispatch={dispatch} />
        </div>
      ) : (
        <div className="sf-empty-diagram">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              doc.lanes.length === 0
                ? "Add lanes and steps in Build mode — findings show up here."
                : "Assign some steps to lanes in Build mode — findings show up here."
            }
          />
        </div>
      )}
    </section>
  );
}
