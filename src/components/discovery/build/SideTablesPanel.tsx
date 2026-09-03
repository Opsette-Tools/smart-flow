import { type Dispatch } from "react";
import type { Action } from "../store";
import type { DiscoveryDoc } from "../types";
import { SideTable, type SideTableField } from "./SideTable";
import type { Artifact, DecisionRule, ExceptionCase, GlossaryTerm, VolumeRow } from "../types";

interface Props {
  doc: DiscoveryDoc;
  dispatch: Dispatch<Action>;
}

const ARTIFACT_FIELDS: SideTableField<Artifact>[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "owner", label: "Owner" },
  { key: "location", label: "Where it lives", placeholder: "Where it lives" },
  { key: "requested", label: "Requested", kind: "checkbox", width: "auto" },
  { key: "received", label: "Received", kind: "checkbox", width: "auto" },
];

const DECISION_RULE_FIELDS: SideTableField<DecisionRule>[] = [
  { key: "rule", label: "Rule as stated" },
  { key: "appliedBy", label: "Who applies it" },
  { key: "trigger", label: "What triggers it" },
];

const GLOSSARY_FIELDS: SideTableField<GlossaryTerm>[] = [
  { key: "term", label: "Term" },
  { key: "definition", label: "Definition" },
  { key: "whereUsed", label: "Where it shows up" },
];

const EXCEPTION_FIELDS: SideTableField<ExceptionCase>[] = [
  { key: "stepLabel", label: "Step id", placeholder: "e.g. S3", width: 100 },
  { key: "condition", label: "Condition" },
  { key: "whatHappensInstead", label: "What happens instead" },
  { key: "frequency", label: "How often", width: 140 },
];

const VOLUME_FIELDS: SideTableField<VolumeRow>[] = [
  { key: "process", label: "Process" },
  { key: "frequency", label: "Frequency", width: 140 },
  { key: "countPerPeriod", label: "Count per period", width: 160 },
  { key: "peakPeriods", label: "Peak periods", width: 160 },
];

/** The five side captures that hang off a discovery session, each rendered
 *  through the shared SideTable renderer. */
export function SideTablesPanel({ doc, dispatch }: Props) {
  return (
    <div className="sf-stack">
      <SideTable
        title="Artifacts"
        emptyLabel="No artifacts logged yet"
        addLabel="Artifact"
        rows={doc.artifacts}
        fields={ARTIFACT_FIELDS}
        onAdd={() => dispatch({ type: "ADD_ARTIFACT" })}
        onChange={(id, patch) => dispatch({ type: "SET_ARTIFACT", id, patch })}
        onDelete={(id) => dispatch({ type: "DELETE_ARTIFACT", id })}
      />

      <SideTable
        title="Decision rules"
        emptyLabel="No decision rules logged yet"
        addLabel="Rule"
        rows={doc.decisionRules}
        fields={DECISION_RULE_FIELDS}
        onAdd={() => dispatch({ type: "ADD_DECISION_RULE" })}
        onChange={(id, patch) => dispatch({ type: "SET_DECISION_RULE", id, patch })}
        onDelete={(id) => dispatch({ type: "DELETE_DECISION_RULE", id })}
      />

      <SideTable
        title="Glossary"
        emptyLabel="No terms logged yet"
        addLabel="Term"
        rows={doc.glossary}
        fields={GLOSSARY_FIELDS}
        onAdd={() => dispatch({ type: "ADD_GLOSSARY_TERM" })}
        onChange={(id, patch) => dispatch({ type: "SET_GLOSSARY_TERM", id, patch })}
        onDelete={(id) => dispatch({ type: "DELETE_GLOSSARY_TERM", id })}
      />

      <SideTable
        title="Exceptions"
        emptyLabel="No exceptions logged yet"
        addLabel="Exception"
        rows={doc.exceptions}
        fields={EXCEPTION_FIELDS}
        onAdd={() => dispatch({ type: "ADD_EXCEPTION" })}
        onChange={(id, patch) => dispatch({ type: "SET_EXCEPTION", id, patch })}
        onDelete={(id) => dispatch({ type: "DELETE_EXCEPTION", id })}
      />

      <SideTable
        title="Volume"
        emptyLabel="No volume data logged yet"
        addLabel="Row"
        rows={doc.volume}
        fields={VOLUME_FIELDS}
        onAdd={() => dispatch({ type: "ADD_VOLUME_ROW" })}
        onChange={(id, patch) => dispatch({ type: "SET_VOLUME_ROW", id, patch })}
        onDelete={(id) => dispatch({ type: "DELETE_VOLUME_ROW", id })}
      />
    </div>
  );
}
