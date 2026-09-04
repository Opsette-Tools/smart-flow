import { Typography } from "antd";
import dayjs from "dayjs";
import type { Artifact, CaptureStep, DecisionRule, DiscoveryDoc, ExceptionCase, GlossaryTerm, OpenQuestion, VolumeRow } from "../types";
import { listLabel } from "../lists";

// SessionHeader.date is stored as "YYYY-MM-DD" (see SessionHeaderForm's
// DATE_FORMAT) — reformat for display so the printed/on-screen date matches
// what the picker itself shows (month first), not the storage string.
function formatHeaderDate(date: string): string {
  const parsed = dayjs(date, "YYYY-MM-DD");
  return parsed.isValid() ? parsed.format("MM/DD/YYYY") : date;
}

const { Text } = Typography;

/** Which side-table sections a render/export includes. Keyed by the same
 *  name as the DiscoveryDoc field so a caller can build this straight off
 *  `doc` (e.g. `Object.fromEntries(SIDE_SECTIONS.map(k => [k, true]))`). */
export interface SideSectionSelection {
  artifacts: boolean;
  decisionRules: boolean;
  glossary: boolean;
  exceptions: boolean;
  volume: boolean;
  openQuestions: boolean;
}

/** What DiscoverySummary should include. Undefined (the default) means
 *  "everything" — the Summary tab's always-on preview wants the full
 *  document with no picking, only the export modal ever narrows this. */
export interface DiscoverySelection {
  header: boolean;
  steps: boolean;
  /** Which individual steps print, by id — only consulted when `steps` is
   *  true. Undefined means "all of them" (the common case: turning Steps on
   *  shouldn't require also visiting every row). */
  stepIds?: Set<string>;
  sideSections: SideSectionSelection;
}

export function allSelected(): DiscoverySelection {
  return {
    header: true,
    steps: true,
    sideSections: {
      artifacts: true,
      decisionRules: true,
      glossary: true,
      exceptions: true,
      volume: true,
      openQuestions: true,
    },
  };
}

interface Props {
  doc: DiscoveryDoc;
  selection?: DiscoverySelection;
}

/**
 * Read-only, one-flowing-document render of a discovery session — the whole
 * capture sheet (header, steps, five side tables) laid out for reading rather
 * than editing. Mirrors GapsPanel's role on the SmartFlow side: a dedicated
 * render kept separate from the Build-mode forms, because those forms are
 * drag handles, drawers, and blur-to-commit inputs, none of which belong on a
 * page meant to be read or printed. This same render backs both the Summary
 * tab and the PDF export (see printDiscovery.ts) — one source, two outlets.
 *
 * `selection` narrows what's included — the export modal's a la carte
 * checkboxes drive it. Omitted, everything renders (the Summary tab's case).
 */
export function DiscoverySummary({ doc, selection }: Props) {
  const sel = selection ?? allSelected();
  const steps = [...doc.steps]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !sel.stepIds || sel.stepIds.has(s.id));
  const hasHeader =
    sel.header &&
    !!(doc.header.division || doc.header.processName || doc.header.date || doc.header.attendees || doc.header.recordingStart || doc.header.scope);

  return (
    <div className="sf-discovery-summary">
      {hasHeader && (
        <section className="sf-summary-section sf-summary-section-header">
          <h1 className="sf-summary-heading">{doc.header.processName || "Discovery session"}</h1>
          {doc.header.scope && <p className="sf-summary-scope">{doc.header.scope}</p>}
          <div className="sf-summary-header-facts">
            {doc.header.division && <Fact label="Division" value={doc.header.division} />}
            {doc.header.date && <Fact label="Date" value={formatHeaderDate(doc.header.date)} />}
            {doc.header.recordingStart && <Fact label="Recording start" value={doc.header.recordingStart} />}
            {doc.header.attendees && (
              <div className="sf-summary-fact-row">
                <span className="sf-summary-fact-label">Attendees</span>
                <span className="sf-summary-fact-value sf-summary-attendees">{doc.header.attendees}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {sel.steps && (
        <section className="sf-summary-section">
          <h2 className="sf-section-title">Steps</h2>
          {steps.length === 0 ? (
            <Text type="secondary" className="sf-summary-empty">
              No steps captured yet.
            </Text>
          ) : (
            <div className="sf-summary-steps">
              {steps.map((step) => (
                <StepEntry key={step.id} step={step} roles={doc.roles} systemsList={doc.systemsList} />
              ))}
            </div>
          )}
        </section>
      )}

      {sel.sideSections.artifacts && (
        <SideSection title="Artifacts" rows={doc.artifacts} render={renderArtifact} empty="No artifacts logged." />
      )}
      {sel.sideSections.decisionRules && (
        <SideSection title="Decision rules" rows={doc.decisionRules} render={renderDecisionRule} empty="No decision rules logged." />
      )}
      {sel.sideSections.glossary && (
        <SideSection title="Glossary" rows={doc.glossary} render={renderGlossaryTerm} empty="No terms logged." />
      )}
      {sel.sideSections.exceptions && (
        <SideSection title="Exceptions" rows={doc.exceptions} render={renderException} empty="No exceptions logged." />
      )}
      {sel.sideSections.volume && (
        <SideSection title="Volume" rows={doc.volume} render={renderVolume} empty="No volume data logged." />
      )}
      {sel.sideSections.openQuestions && (
        <SideSection
          title="Open questions"
          rows={doc.openQuestions}
          render={renderOpenQuestion}
          empty="No open questions logged."
        />
      )}
    </div>
  );
}

function StepEntry({
  step,
  roles,
  systemsList,
}: {
  step: CaptureStep;
  roles: DiscoveryDoc["roles"];
  systemsList: DiscoveryDoc["systemsList"];
}) {
  const roleName = listLabel(roles, step.role);
  const systemNames = step.systems.map((s) => listLabel(systemsList, s)).filter(Boolean);
  const branches = step.branches.filter((b) => b.nextStepLabel.trim());
  const hasBackfill = !!(step.trigger || step.input || step.output || step.notification || step.waitTime || step.confidence);

  return (
    <div className="sf-summary-step">
      <div className="sf-summary-step-head">
        <span className="sf-summary-step-label">{step.stepLabel}</span>
      </div>

      <Fact label="Description" value={step.whatHappens} placeholder="Not filled in." />
      {roleName && <Fact label="Role" value={roleName} />}
      {systemNames.length > 0 && <Fact label={systemNames.length > 1 ? "Systems" : "System"} value={systemNames.join(", ")} />}
      <Fact
        label="Next"
        value={
          branches.length === 0
            ? ""
            : branches
                .map((b) => (b.condition.trim() ? `${b.condition.trim()} → ${b.nextStepLabel.trim()}` : b.nextStepLabel.trim()))
                .join("; ")
        }
        placeholder="Not set."
      />
      {step.painFlag && (
        <div className="sf-summary-fact-row">
          <span className="sf-summary-fact-label">Pain point</span>
          <span className="sf-summary-pain-tag">{step.painFlag.note || "Flagged"}</span>
        </div>
      )}

      {hasBackfill && (
        <div className="sf-summary-backfill">
          {step.trigger && <Fact label="Trigger" value={step.trigger} />}
          {step.input && <Fact label="Input" value={step.input} />}
          {step.output && <Fact label="Output" value={step.output} />}
          {step.notification && <Fact label="Notification" value={step.notification} />}
          {step.waitTime && <Fact label="Wait time" value={step.waitTime} />}
          {step.confidence && <Fact label="Confidence" value={step.confidence === "confirmed" ? "Confirmed" : "Assumed"} />}
        </div>
      )}
    </div>
  );
}

/** One labeled field, inline ("Label: value") — the shared row shape for
 *  every step fact and every side-table field. Label and value are separate
 *  block-ish spans (not `dt::after` punctuation) so a long value that wraps
 *  never runs back under the label on the line above it. */
function Fact({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <div className="sf-summary-fact-row">
      <span className="sf-summary-fact-label">{label}</span>
      <span className="sf-summary-fact-value">{value || (placeholder ? <em>{placeholder}</em> : null)}</span>
    </div>
  );
}

function SideSection<Row extends { id: string }>({
  title,
  rows,
  render,
  empty,
}: {
  title: string;
  rows: Row[];
  render: (row: Row) => { primary: string; fields: { label: string; value: string }[] };
  empty: string;
}) {
  return (
    <section className="sf-summary-section">
      <h2 className="sf-section-title">{title}</h2>
      {rows.length === 0 ? (
        <Text type="secondary" className="sf-summary-empty">
          {empty}
        </Text>
      ) : (
        <div className="sf-summary-side-rows">
          {rows.map((row) => {
            const { primary, fields } = render(row);
            return (
              <div key={row.id} className="sf-summary-side-row">
                <div className="sf-summary-side-primary">{primary || <em>Untitled</em>}</div>
                {fields.filter((f) => f.value).map((f) => (
                  <Fact key={f.label} label={f.label} value={f.value} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function renderArtifact(row: Artifact) {
  return {
    primary: row.name,
    fields: [
      { label: "Type", value: row.type },
      { label: "Owner", value: row.owner },
      { label: "Where it lives", value: row.location },
      { label: "Requested", value: row.requested ? "Yes" : "" },
      { label: "Received", value: row.received ? "Yes" : "" },
    ],
  };
}

function renderDecisionRule(row: DecisionRule) {
  return {
    primary: row.rule,
    fields: [
      { label: "Applied by", value: row.appliedBy },
      { label: "Trigger", value: row.trigger },
    ],
  };
}

function renderGlossaryTerm(row: GlossaryTerm) {
  return {
    primary: row.term,
    fields: [
      { label: "Definition", value: row.definition },
      { label: "Where used", value: row.whereUsed },
    ],
  };
}

function renderException(row: ExceptionCase) {
  return {
    primary: row.whatHappensInstead,
    fields: [
      { label: "Step", value: row.stepLabel },
      { label: "Condition", value: row.condition },
      { label: "How often", value: row.frequency },
    ],
  };
}

function renderVolume(row: VolumeRow) {
  return {
    primary: row.process,
    fields: [
      { label: "Frequency", value: row.frequency },
      { label: "Count per period", value: row.countPerPeriod },
      { label: "Peak periods", value: row.peakPeriods },
    ],
  };
}

function renderOpenQuestion(row: OpenQuestion) {
  return { primary: row.question, fields: [] };
}
