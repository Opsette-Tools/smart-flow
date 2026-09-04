import { useMemo, useRef, useState } from "react";
import { Button, Checkbox, Collapse, Grid, Modal } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import type { DiscoveryDoc } from "../types";
import { DiscoverySummary, type DiscoverySelection, type SideSectionSelection } from "./DiscoverySummary";
import { printDiscovery } from "./printDiscovery";

interface Props {
  open: boolean;
  onClose: () => void;
  doc: DiscoveryDoc;
  sessionName: string;
}

const SIDE_SECTIONS: { key: keyof SideSectionSelection; label: string }[] = [
  { key: "artifacts", label: "Artifacts" },
  { key: "decisionRules", label: "Decision rules" },
  { key: "glossary", label: "Glossary" },
  { key: "exceptions", label: "Exceptions" },
  { key: "volume", label: "Volume" },
  { key: "openQuestions", label: "Open questions" },
];

/**
 * "Preview & save PDF" — same shape as Palette Studio's ExportPanel modal:
 * look at the exact thing before committing to the browser's save dialog,
 * rather than the print dialog opening the instant you click a button. On
 * top of that preview, a section picker makes the export a la carte — send
 * a team Steps + Artifacts without the Glossary, say.
 *
 * Unlike Palette Studio's fixed-1080px artboard, DiscoverySummary is a
 * flowing document that already reflows at any width, so there's no
 * ScaledPreview transform here — the preview pane just renders it at natural
 * width inside a scrollable box. A shrunk-to-fit document is harder to read
 * than a reflowed one; scaling only earns its keep for a fixed-size artboard.
 *
 * The pane's content is exactly what printDiscovery clones (same
 * DiscoverySummary render, same selection), so what you scroll through here
 * is what prints — never a separate "what you'll get" summary to keep in sync.
 *
 * Header has no checkbox: it's the document's identity (division, process
 * name, date, attendees), so a discovery PDF with no header would read as an
 * orphaned document. Steps get a section checkbox AND per-step checkboxes —
 * the five side tables are section-only, since nobody asked for row-level
 * control there and it would clutter the toolbar for a want that wasn't
 * stated.
 */
export function DiscoveryExportModal({ open, onClose, doc, sessionName }: Props) {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;
  const printRef = useRef<HTMLDivElement>(null);

  const [stepsOn, setStepsOn] = useState(true);
  const [stepIds, setStepIds] = useState<Set<string>>(() => new Set(doc.steps.map((s) => s.id)));
  const [sideSections, setSideSections] = useState<SideSectionSelection>({
    artifacts: true,
    decisionRules: true,
    glossary: true,
    exceptions: true,
    volume: true,
    openQuestions: true,
  });

  const orderedSteps = useMemo(() => [...doc.steps].sort((a, b) => a.order - b.order), [doc.steps]);
  const allStepsChecked = stepIds.size === orderedSteps.length;
  const someStepsChecked = stepIds.size > 0 && !allStepsChecked;

  const toggleStep = (id: string, checked: boolean) => {
    setStepIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllSteps = (checked: boolean) => {
    setStepIds(checked ? new Set(orderedSteps.map((s) => s.id)) : new Set());
  };

  const toggleSideSection = (key: keyof SideSectionSelection, checked: boolean) => {
    setSideSections((prev) => ({ ...prev, [key]: checked }));
  };

  const selection: DiscoverySelection = {
    header: true,
    steps: stepsOn,
    stepIds: stepsOn ? stepIds : new Set(),
    sideSections,
  };

  return (
    <Modal
      open={open}
      title="Preview & save PDF"
      onCancel={onClose}
      width={isNarrow ? "94vw" : 980}
      style={{ top: 24 }}
      footer={null}
      destroyOnClose
    >
      <div
        className="sf-discovery-export-body"
        style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "260px 1fr", gap: 20, alignItems: "start" }}
      >
        <div className="sf-discovery-export-picker">
          <div className="sf-discovery-export-picker-label">Include in export</div>

          <div className="sf-discovery-export-picker-item sf-discovery-export-picker-fixed">
            <Checkbox checked disabled>
              Header
            </Checkbox>
          </div>

          <Collapse
            ghost
            className="sf-discovery-export-steps-collapse"
            items={[
              {
                key: "steps",
                label: (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={stepsOn}
                      onChange={(e) => setStepsOn(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Steps
                    </Checkbox>
                  </span>
                ),
                children: (
                  <div className="sf-discovery-export-steps-list">
                    <Checkbox
                      checked={allStepsChecked}
                      indeterminate={someStepsChecked}
                      disabled={!stepsOn}
                      onChange={(e) => toggleAllSteps(e.target.checked)}
                    >
                      <em>All steps</em>
                    </Checkbox>
                    {orderedSteps.map((step) => (
                      <Checkbox
                        key={step.id}
                        checked={stepIds.has(step.id)}
                        disabled={!stepsOn}
                        onChange={(e) => toggleStep(step.id, e.target.checked)}
                      >
                        {step.stepLabel}
                        {step.whatHappens ? ` — ${step.whatHappens}` : ""}
                      </Checkbox>
                    ))}
                  </div>
                ),
              },
            ]}
            defaultActiveKey={[]}
          />

          {SIDE_SECTIONS.map(({ key, label }) => (
            <div key={key} className="sf-discovery-export-picker-item">
              <Checkbox checked={sideSections[key]} onChange={(e) => toggleSideSection(key, e.target.checked)}>
                {label}
              </Checkbox>
            </div>
          ))}
        </div>

        <div>
          <div className="sf-discovery-export-toolbar">
            <Button type="primary" icon={<FilePdfOutlined />} onClick={() => printDiscovery(printRef.current, sessionName)}>
              Save as PDF
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>

          <div className="sf-discovery-export-preview">
            <div ref={printRef}>
              <DiscoverySummary doc={doc} selection={selection} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
