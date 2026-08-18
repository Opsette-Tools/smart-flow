/**
 * SmartFlow template library — the single source of truth for every starter
 * process a user can load with one click.
 *
 * A brand-new user shouldn't face a blank box. Each template declares which
 * diagram type it loads and carries its content in the exact shape that type
 * already consumes:
 *   - outline types (flowchart / decision-tree / org-tree / timeline) store the
 *     same indented plain text a user would type, so the existing parseOutline +
 *     layoutFor pipeline renders them with zero new code.
 *   - swimlane templates store a full SmartFlowDoc, built by buildSwimDoc so ids,
 *     order, and cross-lane connections come out correct without hand-numbering.
 *
 * Domain accuracy note (contract manufacturing): the supplement/cosmetic flows
 * were checked against FDA / cGMP / MoCRA guidance. In particular, an NDI
 * (new dietary ingredient) notification is CONDITIONAL — it applies only to an
 * ingredient not marketed in the US before Oct 15, 1994, and must be filed at
 * least 75 days before marketing. So it lives as a yes/no branch, never as a
 * step everyone takes. Don't flatten that into a linear step.
 */

import type { DiagramType } from "./diagramTypes";
import type { Item, Lane, SmartFlowDoc } from "./types";
import { uuid } from "@/lib/uuid";

export type TemplateCategory =
  | "Contract manufacturing"
  | "Starting a business"
  | "Sales & clients"
  | "Content & marketing"
  | "Operations";

/** Category display order in the gallery. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "Contract manufacturing",
  "Starting a business",
  "Sales & clients",
  "Content & marketing",
  "Operations",
];

export interface Template {
  /** Stable slug. */
  id: string;
  /** Card title. */
  name: string;
  category: TemplateCategory;
  /** Which diagram type this loads. */
  type: DiagramType;
  /** One plain line for the gallery card. */
  blurb: string;
  /** Indented outline text — set for every type EXCEPT swimlane. */
  outline?: string;
  /** Doc factory — set only for swimlane templates. Called on each load so
   *  every load gets fresh ids (loading the same template twice never collides). */
  makeDoc?: () => SmartFlowDoc;
}

// ---------------------------------------------------------------------------
// Swimlane builder
// ---------------------------------------------------------------------------

/** A step in a swimlane spec: which lane it sits in and which step keys it
 *  hands off to. Keys are local to the spec, not real ids. */
interface SwimStep {
  key: string;
  label: string;
  lane: string;
  /** Local keys of the steps this one connects to. */
  to?: string[];
  /** Discovery seed: where this step's data lives. Omit to leave it blank —
   *  a discovery template is supposed to arrive with holes in it. */
  systemOfRecord?: string;
  /** Discovery seed: a question the template plants for you to ask. */
  openQuestion?: string;
}

/** Optional doc-level settings for a swimlane spec. */
interface SwimOptions {
  /** Open the doc straight into discovery mode. */
  discovery?: boolean;
}

/**
 * Build a real SmartFlowDoc from a lane list + a flat step list. Lanes get
 * dense left-to-right order; steps get dense top-to-bottom order within their
 * lane; `to` keys are resolved to fresh uuids. Fresh ids every call so loading
 * a template twice never collides.
 */
export function buildSwimDoc(
  laneNames: string[],
  steps: SwimStep[],
  options: SwimOptions = {},
): SmartFlowDoc {
  const laneId = new Map<string, string>();
  const lanes: Lane[] = laneNames.map((name, order) => {
    const id = uuid();
    laneId.set(name, id);
    return { id, name, order };
  });

  // Assign each step a fresh id up front so connections can reference them.
  const stepId = new Map<string, string>();
  for (const s of steps) stepId.set(s.key, uuid());

  // Dense order within each lane, in the order the steps are declared.
  const orderInLane = new Map<string, number>();
  const items: Item[] = steps.map((s) => {
    const next = orderInLane.get(s.lane) ?? 0;
    orderInLane.set(s.lane, next + 1);
    return {
      id: stepId.get(s.key)!,
      label: s.label,
      laneId: laneId.get(s.lane) ?? null,
      order: next,
      connectsTo: (s.to ?? []).map((k) => stepId.get(k)!).filter(Boolean),
      systemOfRecord: s.systemOfRecord,
      openQuestion: s.openQuestion,
    };
  });

  return options.discovery ? { lanes, items, discovery: true } : { lanes, items };
}

// ---------------------------------------------------------------------------
// Swimlane template docs (functions so each load gets fresh ids)
// ---------------------------------------------------------------------------

/** Lead-to-client pipeline. This is also the app's first-run seed example. */
export function leadToClientDoc(): SmartFlowDoc {
  return buildSwimDoc(
    ["Sales", "Delivery", "Finance"],
    [
      { key: "intake", label: "Lead intake", lane: "Sales", to: ["qualify"] },
      { key: "qualify", label: "Qualify the lead", lane: "Sales", to: ["proposal"] },
      { key: "proposal", label: "Send proposal", lane: "Sales", to: ["won"] },
      { key: "won", label: "Deal won", lane: "Sales", to: ["kickoff", "invoice"] },
      { key: "kickoff", label: "Kickoff & scope", lane: "Delivery", to: ["work"] },
      { key: "work", label: "Do the work", lane: "Delivery", to: ["handoff"] },
      { key: "handoff", label: "Deliver & hand off", lane: "Delivery", to: ["final"] },
      { key: "invoice", label: "Send deposit invoice", lane: "Finance", to: ["final"] },
      { key: "final", label: "Final invoice & close", lane: "Finance" },
    ],
  );
}

/** Content production pipeline. */
export function contentPipelineDoc(): SmartFlowDoc {
  return buildSwimDoc(
    ["Idea", "Draft", "Review", "Publish"],
    [
      { key: "brief", label: "Brief & keyword", lane: "Idea", to: ["outline"] },
      { key: "outline", label: "Outline", lane: "Idea", to: ["write"] },
      { key: "write", label: "Write draft", lane: "Draft", to: ["edit"] },
      { key: "edit", label: "Self-edit pass", lane: "Draft", to: ["review"] },
      { key: "review", label: "Editor review", lane: "Review", to: ["seo"] },
      { key: "seo", label: "SEO & links check", lane: "Review", to: ["schedule"] },
      { key: "schedule", label: "Schedule post", lane: "Publish", to: ["promote"] },
      { key: "promote", label: "Publish & promote", lane: "Publish" },
    ],
  );
}

/**
 * Contract manufacturer — department discovery.
 *
 * This one is deliberately INCOMPLETE, and that is the design. A template that
 * arrives already correct teaches the wrong thing: the point is to fill it in
 * with the client, and to find that some of these lanes do not exist there and
 * others are one overloaded person.
 *
 * Domain notes carried from the plan, do not "tidy" these away:
 *  - Quality is seeded as TWO lanes. QA owns the system and the documentation;
 *    QC runs the tests. They are frequently different people with different
 *    handoffs, and merging them bakes in an error before the interview starts.
 *  - Regulatory gets its own lane even though it is often missing from the org
 *    chart — at most contract manufacturers it is somebody's second job.
 *    Finding out whose is one of the highest-value moments in the meeting.
 *  - Only a couple of steps carry a system of record, and no handoff carries a
 *    mechanism. Those blanks are the interview.
 */
export function cmDiscoveryDoc(): SmartFlowDoc {
  return buildSwimDoc(
    [
      "Sales",
      "Product Development",
      "Regulatory",
      "Procurement",
      "Production Planning",
      "Manufacturing",
      "QA",
      "QC",
      "Warehouse & Shipping",
      "Finance",
    ],
    [
      // Sales
      {
        key: "inquiry",
        label: "Customer inquiry / RFP",
        lane: "Sales",
        to: ["feasibility"],
        openQuestion: "Where do inquiries actually land — one inbox, or whoever gets the call?",
      },
      {
        key: "quote",
        label: "Quote & pricing",
        lane: "Sales",
        to: ["po"],
        openQuestion: "Who signs off on price, and what happens when the customer negotiates?",
      },
      { key: "po", label: "Customer PO received", lane: "Sales", to: ["schedule", "invoice"] },

      // Product Development
      {
        key: "feasibility",
        label: "Feasibility review",
        lane: "Product Development",
        to: ["formula", "regreview"],
      },
      { key: "formula", label: "Formula / spec development", lane: "Product Development", to: ["sample"] },
      {
        key: "sample",
        label: "Sample or pilot batch",
        lane: "Product Development",
        to: ["quote"],
        openQuestion: "Does the customer pay for samples, and who tracks how many we have sent?",
      },

      // Regulatory — the lane most often missing from the org chart.
      {
        key: "regreview",
        label: "Regulatory review",
        lane: "Regulatory",
        openQuestion: "Whose actual job is this? Is it anyone's full-time role?",
      },
      {
        key: "labelreview",
        label: "Label & claims review",
        lane: "Regulatory",
        openQuestion: "Who has final say on a claim — us or the customer?",
      },

      // Procurement
      {
        key: "sourcing",
        label: "Source raw materials",
        lane: "Procurement",
        to: ["receive"],
        openQuestion: "How do you know what to order — a system, or someone checking shelves?",
      },
      { key: "receive", label: "Receive & log materials", lane: "Procurement", to: ["incoming"] },

      // Production Planning
      { key: "schedule", label: "Schedule the run", lane: "Production Planning", to: ["sourcing", "produce"] },
      {
        key: "capacity",
        label: "Capacity check",
        lane: "Production Planning",
        openQuestion: "Is this a real step or does scheduling just absorb it?",
      },

      // Manufacturing
      { key: "produce", label: "Production run", lane: "Manufacturing", to: ["inprocess"] },
      { key: "package", label: "Packaging & labeling", lane: "Manufacturing", to: ["finished"] },

      // QA — owns the system and the paperwork.
      {
        key: "batchrec",
        label: "Batch record review",
        lane: "QA",
        to: ["release"],
        openQuestion: "Paper batch records or electronic? Who reviews, and how long does it sit?",
      },
      { key: "release", label: "Release decision", lane: "QA", to: ["ship"] },
      {
        key: "deviation",
        label: "Deviation / CAPA",
        lane: "QA",
        openQuestion: "What actually triggers a deviation, and where does it get written down?",
      },

      // QC — runs the tests. Separate people, separate handoffs.
      { key: "incoming", label: "Incoming material testing", lane: "QC", to: ["produce"] },
      { key: "inprocess", label: "In-process testing", lane: "QC", to: ["package"] },
      { key: "finished", label: "Finished product testing", lane: "QC", to: ["batchrec"] },

      // Warehouse & Shipping
      { key: "ship", label: "Pick, pack & ship", lane: "Warehouse & Shipping", to: ["invoice"] },
      {
        key: "inventory",
        label: "Inventory counts",
        lane: "Warehouse & Shipping",
        openQuestion: "Cycle counts or an annual scramble? What is the count reconciled against?",
      },

      // Finance
      { key: "invoice", label: "Invoice the customer", lane: "Finance", to: ["payment"] },
      { key: "payment", label: "Payment received & applied", lane: "Finance" },
    ],
    { discovery: true },
  );
}

// ---------------------------------------------------------------------------
// Outline template text (each is exactly what a user could type)
// ---------------------------------------------------------------------------

// Contract manufacturing --------------------------------------------------

// These follow a real contract-manufacturer QUOTING pipeline: the flow runs
// from RFP through award, not through the production run. Actual manufacturing
// starts after the win (NPI). Regulatory checks live where they belong — in
// feasibility and formula — not as a trailing step.

const CM_SUPPLEMENT_INTAKE = `Opportunity intake (RFP received)
Feasibility review: capability, capacity, regulatory
Feasible to make?
  Formula development & samples
  Decline (No-Go) & close the opportunity
New dietary ingredient?
  Flag NDI notification, file at least 75 days before selling
  Ingredient already on the market, no NDI
Build the Bill of Materials (BOM)
Source materials: suppliers, MOQ, lead times
Define the testing matrix: potency, heavy metals, microbial, stability
Cost it out: materials, packaging, labor, overhead
Internal approval against margin & capacity
Send the quote
Won the bid?
  Award & open NPI: production trials & launch schedule
  Log the loss & close`;

const CM_COSMETIC_INTAKE = `Opportunity intake (RFP received)
Feasibility review: capability, capacity, regulatory
Feasible to make?
  Formula development & samples
  Decline (No-Go) & close the opportunity
Build safety substantiation dossier
  Toxicological risk assessment
  Preservative efficacy (PET) test
  Stability & packaging compatibility
Confirm MoCRA facility registration & product listing
Build the Bill of Materials (BOM)
Source materials & develop packaging specs
Define the testing matrix: safety, in-process, finished, stability
Cost it out: materials, packaging, labor, overhead
Internal approval against margin & capacity
Send the quote
Won the bid?
  Award & open NPI: production trials & launch schedule
  Log the loss & close`;

const CM_BRAND_SOURCING = `Define the product & target market
Shortlist contract manufacturers
Vet capabilities, certifications & MOQ
Sign an NDA
Request samples & quotes
Compare and select a manufacturer
Sign contract & approve the spec
First production run
Receive goods & run incoming QC
Reorder or adjust the formula`;

// Starting a business -----------------------------------------------------

const FORM_LLC = `Choose a business name
Name available in your state?
  Continue with this name
  Pick another name
Register the LLC with the state
Get an EIN from the IRS
Apply for licenses & permits
Open a business bank account
Hiring employees?
  Set up payroll & state tax accounts
  Skip payroll for now`;

const LAUNCH_WEBSITE = `Pick a domain name
Choose a platform or host
Design & build the site
Add your content & pages
Test on mobile & desktop
Go live
Set up analytics & basic SEO`;

const HIRE_FIRST_EMPLOYEE = `Decide the role & budget
Write the job description
Post the opening
Screen applicants
Interview shortlist
Strong fit?
  Make an offer
  Keep looking
Run background & references
Onboard: payroll, paperwork, first-day plan`;

// Sales & clients ---------------------------------------------------------

const CLIENT_ONBOARDING = `Send welcome email & agreement
Collect deposit
Gather intake info & assets
Kickoff call
Set up project & tools
Confirm scope & timeline
Start the work`;

const SUPPORT_TRIAGE = `Is it urgent (service down)?
  Escalate to on-call now
  Is it a billing question?
    Route to Finance
    Is it a how-to question?
      Send help doc & follow up
      Log as a bug or feature request`;

// Content & marketing -----------------------------------------------------

const SOCIAL_APPROVAL = `Draft the post
On-brand and accurate?
  Contains a claim or offer?
    Send for legal/owner sign-off
    Schedule it
  Revise the draft`;

const LAUNCH_TIMELINE = `Plan & positioning
  Month 1
Build assets & landing page
  Month 2
Warm-up & teasers
  Week before
Launch day
  Launch
Follow-up & recap
  Week after`;

// Operations --------------------------------------------------------------

const ORDER_FULFILLMENT = `Receive order
Payment cleared?
  In stock?
    Pick, pack & ship
    Backorder & notify customer
  Hold order & request payment
Send tracking & confirmation`;

const RETURNS_REFUND = `Return requested within the window?
  Item unused & resellable?
    Approve refund
    Offer partial refund or store credit
  Deny & explain the policy`;

const SIMPLE_ORG_CHART = `Owner
  Operations Manager
    Fulfillment Lead
    Support
  Sales Manager
    Account Rep
  Marketing Lead`;

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const TEMPLATES: Template[] = [
  // Contract manufacturing
  {
    id: "cm-department-discovery",
    name: "Contract manufacturer — department discovery",
    category: "Contract manufacturing",
    type: "swimlane",
    blurb:
      "An interview scaffold for a first process-discovery meeting. Ships deliberately incomplete — the blanks are the agenda.",
    makeDoc: cmDiscoveryDoc,
  },

  {
    id: "cm-supplement-intake",
    name: "Supplement maker — RFP to award",
    category: "Contract manufacturing",
    type: "flowchart",
    blurb: "A supplement contract manufacturer's quoting pipeline from RFP through feasibility, BOM, costing, and the award, with the NDI check built in.",
    outline: CM_SUPPLEMENT_INTAKE,
  },
  {
    id: "cm-cosmetic-intake",
    name: "Cosmetic maker — RFP to award",
    category: "Contract manufacturing",
    type: "flowchart",
    blurb: "A cosmetic contract manufacturer's quoting pipeline from RFP through the safety dossier, MoCRA, BOM, and costing to the award.",
    outline: CM_COSMETIC_INTAKE,
  },
  {
    id: "cm-brand-sourcing",
    name: "Hiring a contract manufacturer",
    category: "Contract manufacturing",
    type: "flowchart",
    blurb: "The brand-side path to finding, vetting, and contracting a manufacturer, from first shortlist to your first production run.",
    outline: CM_BRAND_SOURCING,
  },

  // Starting a business
  {
    id: "form-llc",
    name: "Form an LLC",
    category: "Starting a business",
    type: "flowchart",
    blurb: "Name your business, register the LLC, get an EIN, and open a bank account, with a branch for whether you're hiring.",
    outline: FORM_LLC,
  },
  {
    id: "launch-website",
    name: "Launch a website",
    category: "Starting a business",
    type: "flowchart",
    blurb: "From picking a domain to going live and setting up analytics.",
    outline: LAUNCH_WEBSITE,
  },
  {
    id: "hire-first-employee",
    name: "Hire your first employee",
    category: "Starting a business",
    type: "flowchart",
    blurb: "Write the role, run the search, and onboard, with a yes/no on whether a candidate is the right fit.",
    outline: HIRE_FIRST_EMPLOYEE,
  },

  // Sales & clients
  {
    id: "lead-to-client",
    name: "Lead to paying client",
    category: "Sales & clients",
    type: "swimlane",
    blurb: "The whole pipeline sorted across Sales, Delivery, and Finance so you can see who owns each handoff.",
    makeDoc: leadToClientDoc,
  },
  {
    id: "client-onboarding",
    name: "New client onboarding",
    category: "Sales & clients",
    type: "flowchart",
    blurb: "The steps between a signed deal and starting the work, so nothing falls through the cracks.",
    outline: CLIENT_ONBOARDING,
  },
  {
    id: "support-triage",
    name: "Customer support triage",
    category: "Sales & clients",
    type: "decision-tree",
    blurb: "Route an incoming request to the right place based on how urgent and what kind it is.",
    outline: SUPPORT_TRIAGE,
  },

  // Content & marketing
  {
    id: "content-pipeline",
    name: "Content production pipeline",
    category: "Content & marketing",
    type: "swimlane",
    blurb: "A post's journey from idea to published, laid out by stage: Idea, Draft, Review, Publish.",
    makeDoc: contentPipelineDoc,
  },
  {
    id: "social-approval",
    name: "Social post approval",
    category: "Content & marketing",
    type: "decision-tree",
    blurb: "Decide whether a post ships or needs sign-off, based on whether it makes a claim.",
    outline: SOCIAL_APPROVAL,
  },
  {
    id: "launch-timeline",
    name: "Product launch timeline",
    category: "Content & marketing",
    type: "timeline",
    blurb: "A simple launch schedule from planning through the follow-up recap.",
    outline: LAUNCH_TIMELINE,
  },

  // Operations
  {
    id: "order-fulfillment",
    name: "Order fulfillment",
    category: "Operations",
    type: "flowchart",
    blurb: "From order received to tracking sent, with checks for payment and stock.",
    outline: ORDER_FULFILLMENT,
  },
  {
    id: "returns-refund",
    name: "Returns & refunds",
    category: "Operations",
    type: "decision-tree",
    blurb: "Work out whether a return gets a full refund, a partial, or a decline.",
    outline: RETURNS_REFUND,
  },
  {
    id: "simple-org-chart",
    name: "Small-business org chart",
    category: "Operations",
    type: "org-tree",
    blurb: "A starting structure showing who reports to whom on a small team.",
    outline: SIMPLE_ORG_CHART,
  },
];

/** Group templates by category, preserving CATEGORY_ORDER and declaration order. */
export function templatesByCategory(): { category: TemplateCategory; items: Template[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: TEMPLATES.filter((t) => t.category === category),
  })).filter((g) => g.items.length > 0);
}
