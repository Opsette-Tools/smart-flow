/**
 * Discovery capture sheet store — one reducer owns the whole DiscoveryDoc,
 * same shape as smartflow/store.ts: a discriminated Action union, every case
 * returns a new doc via spread, empty string becomes undefined rather than
 * being stored (see SET_TRIGGER etc.) — "not answered yet" and "answered
 * blank" are the same state, and one representation keeps them that way.
 */

import { uuid } from "@/lib/uuid";
import { resolveListValue } from "./lists";
import {
  emptyDiscoveryDoc,
  newStep,
  type Artifact,
  type Confidence,
  type DecisionRule,
  type DiscoveryDoc,
  type ExceptionCase,
  type GlossaryTerm,
  type ListOption,
  type OpenQuestion,
  type SessionHeader,
  type StepBranch,
  type VolumeRow,
} from "./types";

export const emptyDoc: DiscoveryDoc = emptyDiscoveryDoc();

function nextStepLabel(steps: DiscoveryDoc["steps"]): string {
  return `S${steps.length + 1}`;
}

/** Ensure `raw` exists in the given list, adding it if it's new. Returns the
 *  resolved value plus the (possibly unchanged) list. */
function ensureListOption(options: ListOption[], raw: string): { value: string; options: ListOption[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", options };
  const { value, isNew } = resolveListValue(options, trimmed);
  if (!isNew) return { value, options };
  return { value, options: [...options, { value: trimmed, label: trimmed }] };
}

export type Action =
  | { type: "SET_HEADER"; header: Partial<SessionHeader> }
  // --- Steps ---
  | { type: "ADD_STEP" }
  | { type: "DELETE_STEP"; id: string }
  | { type: "REORDER_STEPS"; orderedIds: string[] }
  | { type: "SET_STEP_LABEL"; id: string; stepLabel: string }
  | { type: "SET_WHAT_HAPPENS"; id: string; whatHappens: string }
  | { type: "SET_ROLE"; id: string; role: string }
  | { type: "SET_SYSTEMS"; id: string; systems: string[] }
  | { type: "SET_PAIN_FLAG"; id: string; flagged: boolean; note?: string }
  | { type: "SET_TRIGGER"; id: string; trigger: string }
  | { type: "SET_INPUT"; id: string; input: string }
  | { type: "SET_OUTPUT"; id: string; output: string }
  | { type: "SET_NOTIFICATION"; id: string; notification: string }
  | { type: "SET_WAIT_TIME"; id: string; waitTime: string }
  | { type: "SET_CONFIDENCE"; id: string; confidence: Confidence | undefined }
  // Branches: a step's next-step + condition pairs.
  | { type: "ADD_BRANCH"; id: string }
  | { type: "SET_BRANCH"; id: string; branchId: string; patch: Partial<Omit<StepBranch, "id">> }
  | { type: "DELETE_BRANCH"; id: string; branchId: string }
  // --- Side tables ---
  | { type: "ADD_ARTIFACT" }
  | { type: "SET_ARTIFACT"; id: string; patch: Partial<Omit<Artifact, "id">> }
  | { type: "DELETE_ARTIFACT"; id: string }
  | { type: "ADD_DECISION_RULE" }
  | { type: "SET_DECISION_RULE"; id: string; patch: Partial<Omit<DecisionRule, "id">> }
  | { type: "DELETE_DECISION_RULE"; id: string }
  | { type: "ADD_GLOSSARY_TERM" }
  | { type: "SET_GLOSSARY_TERM"; id: string; patch: Partial<Omit<GlossaryTerm, "id">> }
  | { type: "DELETE_GLOSSARY_TERM"; id: string }
  | { type: "ADD_EXCEPTION" }
  | { type: "SET_EXCEPTION"; id: string; patch: Partial<Omit<ExceptionCase, "id">> }
  | { type: "DELETE_EXCEPTION"; id: string }
  | { type: "ADD_VOLUME_ROW" }
  | { type: "SET_VOLUME_ROW"; id: string; patch: Partial<Omit<VolumeRow, "id">> }
  | { type: "DELETE_VOLUME_ROW"; id: string }
  | { type: "ADD_OPEN_QUESTION" }
  | { type: "SET_OPEN_QUESTION"; id: string; patch: Partial<Omit<OpenQuestion, "id">> }
  | { type: "DELETE_OPEN_QUESTION"; id: string }
  | { type: "RESET" }
  | { type: "REPLACE_DOC"; doc: DiscoveryDoc };

function trimOrUndefined(s: string): string | undefined {
  const v = s.trim();
  return v || undefined;
}

export function reducer(doc: DiscoveryDoc, action: Action): DiscoveryDoc {
  switch (action.type) {
    case "SET_HEADER":
      return { ...doc, header: { ...doc.header, ...action.header } };

    case "ADD_STEP": {
      const step = newStep(doc.steps.length, nextStepLabel(doc.steps));
      return { ...doc, steps: [...doc.steps, step] };
    }

    case "DELETE_STEP": {
      const steps = doc.steps
        .filter((s) => s.id !== action.id)
        .map((s, idx) => ({ ...s, order: idx }));
      return { ...doc, steps };
    }

    case "REORDER_STEPS": {
      const orderById = new Map(action.orderedIds.map((id, idx) => [id, idx]));
      const steps = doc.steps
        .map((s) => ({ ...s, order: orderById.get(s.id) ?? s.order }))
        .sort((a, b) => a.order - b.order);
      return { ...doc, steps };
    }

    case "SET_STEP_LABEL": {
      const label = action.stepLabel.trim();
      if (!label) return doc;
      return { ...doc, steps: doc.steps.map((s) => (s.id === action.id ? { ...s, stepLabel: label } : s)) };
    }

    case "SET_WHAT_HAPPENS":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, whatHappens: action.whatHappens } : s)),
      };

    case "SET_ROLE": {
      const { value, options } = ensureListOption(doc.roles, action.role);
      return {
        ...doc,
        roles: options,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, role: value || undefined } : s)),
      };
    }

    case "SET_SYSTEMS": {
      let options = doc.systemsList;
      const values: string[] = [];
      for (const raw of action.systems) {
        const resolved = ensureListOption(options, raw);
        options = resolved.options;
        if (resolved.value) values.push(resolved.value);
      }
      return {
        ...doc,
        systemsList: options,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, systems: values } : s)),
      };
    }

    case "SET_PAIN_FLAG": {
      const note = trimOrUndefined(action.note ?? "");
      return {
        ...doc,
        steps: doc.steps.map((s) =>
          s.id === action.id ? { ...s, painFlag: action.flagged ? { note } : undefined } : s,
        ),
      };
    }

    case "SET_TRIGGER":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, trigger: trimOrUndefined(action.trigger) } : s)),
      };

    case "SET_INPUT":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, input: trimOrUndefined(action.input) } : s)),
      };

    case "SET_OUTPUT":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, output: trimOrUndefined(action.output) } : s)),
      };

    case "SET_NOTIFICATION":
      return {
        ...doc,
        steps: doc.steps.map((s) =>
          s.id === action.id ? { ...s, notification: trimOrUndefined(action.notification) } : s,
        ),
      };

    case "SET_WAIT_TIME":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, waitTime: trimOrUndefined(action.waitTime) } : s)),
      };

    case "SET_CONFIDENCE":
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, confidence: action.confidence } : s)),
      };

    case "ADD_BRANCH": {
      const branch: StepBranch = { id: uuid(), condition: "", nextStepLabel: "" };
      return {
        ...doc,
        steps: doc.steps.map((s) => (s.id === action.id ? { ...s, branches: [...s.branches, branch] } : s)),
      };
    }

    case "SET_BRANCH": {
      return {
        ...doc,
        steps: doc.steps.map((s) =>
          s.id === action.id
            ? { ...s, branches: s.branches.map((b) => (b.id === action.branchId ? { ...b, ...action.patch } : b)) }
            : s,
        ),
      };
    }

    case "DELETE_BRANCH": {
      return {
        ...doc,
        steps: doc.steps.map((s) =>
          s.id === action.id ? { ...s, branches: s.branches.filter((b) => b.id !== action.branchId) } : s,
        ),
      };
    }

    case "ADD_ARTIFACT": {
      const row: Artifact = { id: uuid(), name: "", type: "", owner: "", location: "", requested: false, received: false };
      return { ...doc, artifacts: [...doc.artifacts, row] };
    }

    case "SET_ARTIFACT":
      return {
        ...doc,
        artifacts: doc.artifacts.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
      };

    case "DELETE_ARTIFACT":
      return { ...doc, artifacts: doc.artifacts.filter((a) => a.id !== action.id) };

    case "ADD_DECISION_RULE": {
      const row: DecisionRule = { id: uuid(), rule: "", appliedBy: "", trigger: "" };
      return { ...doc, decisionRules: [...doc.decisionRules, row] };
    }

    case "SET_DECISION_RULE":
      return {
        ...doc,
        decisionRules: doc.decisionRules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      };

    case "DELETE_DECISION_RULE":
      return { ...doc, decisionRules: doc.decisionRules.filter((r) => r.id !== action.id) };

    case "ADD_GLOSSARY_TERM": {
      const row: GlossaryTerm = { id: uuid(), term: "", definition: "", whereUsed: "" };
      return { ...doc, glossary: [...doc.glossary, row] };
    }

    case "SET_GLOSSARY_TERM":
      return {
        ...doc,
        glossary: doc.glossary.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };

    case "DELETE_GLOSSARY_TERM":
      return { ...doc, glossary: doc.glossary.filter((g) => g.id !== action.id) };

    case "ADD_EXCEPTION": {
      const row: ExceptionCase = { id: uuid(), stepLabel: "", condition: "", whatHappensInstead: "", frequency: "" };
      return { ...doc, exceptions: [...doc.exceptions, row] };
    }

    case "SET_EXCEPTION":
      return {
        ...doc,
        exceptions: doc.exceptions.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };

    case "DELETE_EXCEPTION":
      return { ...doc, exceptions: doc.exceptions.filter((e) => e.id !== action.id) };

    case "ADD_VOLUME_ROW": {
      const row: VolumeRow = { id: uuid(), process: "", frequency: "", countPerPeriod: "", peakPeriods: "" };
      return { ...doc, volume: [...doc.volume, row] };
    }

    case "SET_VOLUME_ROW":
      return {
        ...doc,
        volume: doc.volume.map((v) => (v.id === action.id ? { ...v, ...action.patch } : v)),
      };

    case "DELETE_VOLUME_ROW":
      return { ...doc, volume: doc.volume.filter((v) => v.id !== action.id) };

    case "ADD_OPEN_QUESTION": {
      const row: OpenQuestion = { id: uuid(), question: "" };
      return { ...doc, openQuestions: [...doc.openQuestions, row] };
    }

    case "SET_OPEN_QUESTION":
      return {
        ...doc,
        openQuestions: doc.openQuestions.map((q) => (q.id === action.id ? { ...q, ...action.patch } : q)),
      };

    case "DELETE_OPEN_QUESTION":
      return { ...doc, openQuestions: doc.openQuestions.filter((q) => q.id !== action.id) };

    case "RESET":
      return emptyDiscoveryDoc();

    case "REPLACE_DOC":
      return action.doc;

    default:
      return doc;
  }
}
