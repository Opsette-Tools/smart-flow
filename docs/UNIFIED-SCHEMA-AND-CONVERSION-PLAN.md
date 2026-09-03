# Unified schema + cross-diagram conversion — planning doc

Status: **Phase 1 done and verified (2026-09-03).** Flowchart (and, on the
same pass, decision tree, org chart, timeline) now share the real
`SmartFlowDoc` schema swimlane always had. Phase 2 (conversion) not started.
See the progress entry at the bottom for the full account.

## The correction this doc makes

`smartflow-feature-plan.md` scoped its whole plan to swimlane and stated the
other four types "just carry raw text" as a fact about the app, not a gap to
close. That was a scoping accident, not a decision — attention was on
swimlane, so swimlane got the schema. It doesn't reflect actual intent: every
diagram type should carry the same caliber of structure, and where conversion
between types makes sense, it should be lossless in both directions, not a
one-way cheap export. This doc supersedes that framing for the four outline
types.

## Where things stand today

One flow's content is `SmartFlowDoc | string` ([db/types.ts](../src/db/types.ts)).
Swimlane gets the real object: `Lane[]`, `Item[]` with `laneId`, `order`,
`connectsTo`, `connections[]` (mechanism, mechanisms, systemName),
`systemOfRecord`, `openQuestion`, `owner`, `breakPoint`, `validated`.

Flowchart, decision tree, org chart, and timeline get a plain pasted string,
re-parsed on every render by [outline.ts](../src/components/smartflow/outline.ts)
into a throwaway `OutlineNode` tree (`id, label, depth, parentId, children`)
keyed off indentation alone. Nothing else attaches to a line — no id that
survives a re-paste, no owner, no mechanism, no system of record, no
open question, no validated flag. [FlowPage.tsx](../src/pages/FlowPage.tsx)
forks on `flow.type === "swimlane"` at load, autosave, and render — the two
content shapes are handled as genuinely different things end to end, not as
one schema with an optional lane concept.

That fork is the actual thing to remove. Once all five types are backed by
the same doc shape (lanes optional, everything else common), the "different
content type" branching in FlowPage, flowsRepo, and the outline parser
collapses into one path, and conversion between diagram types becomes "reuse
the same items with a different layout function" instead of "parse a string
into a tree and hope."

## Target: one schema, lanes optional

Extend `SmartFlowDoc` (or design its successor) so every diagram type is an
`Item[]` (+ optional `Lane[]`) at its core, differing only in how items relate
to each other and how that's laid out:

| Type | What connects items | Lanes? | Current layout fn |
|---|---|---|---|
| Swimlane | `connectsTo` (graph) | yes, `laneId` | `SchemaMapView` (custom canvas, not outline-based) |
| Flowchart | `connectsTo` (graph, branches on decision) | no | `buildFlowchartLayout` |
| Decision tree | `connectsTo`, always branching | no | `buildTreeLayout` (with Yes/No edge labels) |
| Org chart | `parentId` (strict tree) | no | `buildTreeLayout` |
| Timeline | ordered sequence, `order` only | no | `buildTimelineLayout` |

Concretely, per type:

- **Flowchart** is already graph-shaped (`connectsTo`, decision branching via
  `?`-suffixed labels and indentation for Yes/No). It maps almost directly
  onto `Item` today — `label`, `connectsTo`, `order`. The gap is just that it
  currently lives as a string instead of `Item[]`, so give it real `Item`
  records with `id, label, order, connectsTo` (no `laneId`), and let it carry
  `owner`, `systemOfRecord`, `openQuestion`, `breakPoint`, `validated`, and
  `connections[]` on the handoffs exactly like swimlane items already do. This
  is the type most ready for real discovery-grade structure, and it's the one
  you said has gotten the least attention despite being the most similar
  shape to swimlane under the hood.
- **Decision tree** is a constrained flowchart (every node is a question,
  every edge is Yes/No). Same `Item` shape, `connectsTo` always length ≤2 with
  a Yes/No label per edge (reuse `Connection` for that label instead of a
  separate `edgeLabels` map computed at render time as today).
- **Org chart** is a strict tree — `parentId`, not `connectsTo`, since a
  person has exactly one manager. Give items an `owner`-adjacent field (a
  title or role) and consider whether `systemOfRecord`/`breakPoint` are
  meaningful here at all (a break point on an org node reads oddly — "this
  role is where things break down" actually does make sense for a discovery
  tool, so keep it) — worth a quick gut check with you before committing.
- **Timeline** is the odd one out — pure sequence, no branching, no lanes,
  arguably no owner/mechanism (a milestone doesn't hand off to anyone). Give
  it `Item[]` with `order` and a `date`/`dateNote` field (replacing today's
  "indented child becomes a note string"), but skip forcing
  `connections`/`mechanism` onto it unless a real discovery use turns up for
  a milestone changing hands.

Each type keeps its own required/meaningful field subset — the point isn't to
force `mechanism` onto a timeline milestone, it's that every type stores its
items as real records with stable ids, not a string re-parsed from scratch
every render.

## Conversion — which pairs actually make sense

Once every type is `Item[]`-backed, ask per pair "does the source structure
contain what the target structure needs," not "is it technically possible to
produce output":

- **Swimlane lane → Flowchart.** Makes real sense. A lane's items, connected
  by `connectsTo` in `order`, already read as a flowchart. Same `Item` shape
  on both ends once flowchart is upgraded — this becomes a same-schema
  reshape (drop `laneId`, keep everything else), not a lossy export. Full
  round-trip: a flowchart with no lane data converts back into a swimlane by
  prompting for a lane assignment per item (or dropping them all in one new
  lane to start) — the only thing that was ever genuinely lane-specific is
  `laneId` itself.
- **Flowchart → Decision tree.** Makes sense in the direction where every
  flowchart node happens to be a Yes/No question already — then it's the same
  graph, stricter edge semantics. Doesn't make sense as a blind conversion
  when the flowchart has plain sequential steps with no branch; those steps
  just wouldn't map onto a tree that requires a question at every fork. Worth
  offering, but the button should say what it does (decision points become
  branches; steps with no branch move to the top as-is or get flagged) not
  silently reshape the diagram.
- **Org chart ↔ Flowchart/Decision tree.** Doesn't make sense structurally —
  an org chart's edges mean "reports to," not "hands off to" or "leads to."
  Converting one into the other would produce a diagram that's topologically
  valid but semantically wrong (a manager isn't a "step after" their report).
  Leave this pair unconverted; if a genuine use shows up later it's a
  candidate to revisit, not a default to build now.
- **Timeline ↔ anything.** Timeline has no branching and (for now) no
  owner/mechanism, so converting it into a flowchart or swimlane means
  inventing structure that was never captured (who owns each milestone? what
  connects to what, beyond "next in time"?). Leave timeline conversion out of
  scope until/unless it grows real per-item fields worth carrying over.
- **Swimlane (whole doc, all lanes) → single Flowchart.** Possible — chain
  every lane's items end to end or interleave by cross-lane `connectsTo` —
  but it's a bigger, fuzzier operation than the one-lane case and easy to get
  wrong (what's the reading order across lanes?). Scope this only after the
  one-lane case is built and used a few times; don't build it speculatively.

So the real convertibility map is: **Swimlane lane ⇄ Flowchart** (build first,
it's genuinely lossless both ways once flowchart has the schema), **Flowchart
→ Decision tree** (build second, one-directional, with a visible "how this
mapped" confirmation), everything else stays separate for now.

## Two-phase build order

**Phase 1 — give every outline type real structure.**
1. Extend the doc model so `Item` (or a shared base type) backs flowchart,
   decision tree, org chart, and timeline the same way it backs swimlane
   items today — stable `id`, `label`, `order`, plus whichever of
   `connectsTo`/`parentId`, `owner`, `systemOfRecord`, `openQuestion`,
   `breakPoint`, `validated`, `connections[]` are meaningful for that type
   (see table above).
2. Replace `outline.ts`'s parse-on-every-render `OutlineNode` tree with a real
   editor that writes directly into the structured doc — the pasted-text
   entry point can stay as an *import* path (paste text once, parse it into
   real `Item[]` with generated ids, done — not re-parsed on every keystroke
   after that), but the doc itself needs to be the source of truth the way
   swimlane's `doc` + `reducer` already is.
3. Collapse `FlowPage.tsx`'s `flow.type === "swimlane"` branching (load,
   autosave, render) down to one path now that content is uniformly
   doc-shaped; `Lane[]` is simply empty/absent for non-lane types.
4. Update `flowLayout.ts`/`treeLayout.ts` to read from `Item[]` instead of
   `OutlineNode[]` (the layout math itself barely changes — it's the input
   shape that changes).

**Phase 2 — build the conversions that make sense.**
5. Swimlane lane → Flowchart, and its reverse (assign-lane prompt).
6. Flowchart → Decision tree, one-directional, with a mapping confirmation
   step so nothing silently vanishes.
7. Revisit org chart and timeline conversion only if a real discovery need
   for them turns up — not built speculatively.

## Open question for you, not a blocker to starting Phase 1

Org chart's `breakPoint`/`systemOfRecord` fields — keep them on the type or
trim them? Both readings are defensible ("this role is where handoffs break
down" is a real finding; "system of record" is odd for a person-node). Doesn't
block starting the schema work, just needs a call before that type's fields
are finalized.

## Relationship to the capture sheet (next, separate doc)

The capture sheet is upstream of all of this — it's the front door discovery
data enters through, before it becomes a swimlane, flowchart, or anything
else. This plan's job was to make sure that once the capture sheet hands off
structured data, every diagram type has somewhere real to put it (not just
swimlane). The capture sheet's own structure, and its compatibility with
swimlane specifically, is scoped in a follow-up doc once you send over what
you're picturing.

## Progress — 2026-09-03 build session

**Phase 1 shipped, all four steps from the build order, plus the structured
editor and findings work that came after it.** Everything below was verified
live in the running app (Playwright + manual), not just typechecked.

**Schema (steps 1–4 of the original build order):**
- `Flow.content` is `SmartFlowDoc` everywhere now — the `SmartFlowDoc | string`
  union is gone from `db/types.ts`, `flowsRepo.ts`, `flowExport.ts`,
  `useCreateFlow.ts`, `migrateLegacy.ts`. Flowchart, decision tree, org chart,
  and timeline all got this in one pass, not just flowchart — they shared the
  identical `string`-content problem and the identical `outline.ts` pipeline,
  so splitting the migration per type would have meant re-forking the same
  import/export layer four times for no benefit.
- `Connection.label` added (Yes/No branch label) and `Item.dateNote` added
  (timeline's date sub-line) — both were anticipated in this doc, both landed
  as planned.
- New `outlineImport.ts`: `outlineTextToDoc()` (paste → real `Item[]` with
  generated ids, called once per paste, not on every render) and
  `docToOutlineText()` (the reverse, so a reopened flow's paste box shows real
  content instead of looking wiped).
- `flowLayout.ts` and `treeLayout.ts` rewritten to read `Item[]` directly
  instead of the old throwaway `OutlineNode[]`. `FlowPage.tsx`'s
  `flow.type === "swimlane"` fork is gone from load/autosave/render — one path
  for every type now.
- New `itemGraph.ts`: shared `findGraphRoots`, `walkReadingOrder`,
  `isDecisionStep`, `connectionLabel` — used by the layouts, the paste
  import/export, and the new Build-tab list so none of them can disagree
  about where the graph starts or what counts as a decision.
- Two real bugs caught only by browser verification, not typecheck: (1) the
  first cut of `outlineTextToDoc` never linked top-level outline lines to each
  other at all (only nested decision branches got wired); (2) a Yes-branch
  target that was itself a decision got flattened into a plain box instead of
  getting its own Yes/No split. Both fixed and re-verified against the
  contract-manufacturing flowchart templates.

**Structured Build-tab editor (was step 3, "give Flowchart the same board
swimlane has"):**
- Flowchart's Build tab is no longer just a textarea. It's a step list in
  reading order (branch-aware — Yes/No prefix per row), each row opens the
  same `StepInspector`/`StepDetailFields` drawer swimlane uses. Owner,
  validated, break point, system of record, open question, and handoff detail
  all now work identically across every diagram type.
- The old textarea survives as a collapsible "Paste / bulk edit" box — kept
  discoverable as a persistent button after user testing showed it silently
  disappearing once a flow had any content (first cut buried it in a kebab
  menu with no visible affordance).
- **Branch labels got a real, separate control.** First cut reused swimlane's
  handoff-mechanism editor for everything, which meant there was no way to set
  Yes/No at all. Added `SET_CONNECTION_LABEL` to the reducer and a new
  `BranchLabelEditor` component: when a step's own label reads as a question
  (ends in `?`) AND it has outgoing connections, the drawer shows "Branch
  label" (a Yes/No dropdown per connection) instead of "Handoff method." A
  plain (non-decision) step still shows handoff mechanism, on both flowchart
  and swimlane — **confirmed with the user this is correct, not a gap**: she's
  running flowchart-first departmental interviews that get converted into
  swimlane lanes later, and the handoff mechanism answer needs to survive that
  conversion, so it has to be captured at flowchart time too. Initial
  instinct to treat mechanism as swimlane-only was wrong; corrected in
  conversation, do not re-relitigate this without a new reason.
- Fixed `ConnectionEditor`'s "hands off to" picker showing a fake "Inbox"
  group heading for lane-less docs (now a flat list), and `StepInspector`
  showing "INBOX" as a lane label when there are no lanes at all (now hidden).
- Fixed step-list rows stretching full page width (reused swimlane's
  `.sf-step` CSS verbatim, sized for a ~280px lane column) — capped via new
  `.sf-outline-list` rule (640px).

**Summary + Charts tabs (step 4):**
- Root cause found: `computeGaps`, `DiagramView`, and `ChartsPanel` each
  independently filtered on `item.laneId !== null` to decide what counts as
  "placed" — correct for swimlane (inbox vs. assigned), but for a lane-less
  doc every item has `laneId === null`, so all three silently reported zero
  findings forever, regardless of how built-out the flowchart was. Fixed at
  the source (`computeGaps`) and at the two places that had duplicated the
  same check inline instead of calling it — this is the kind of bug that
  would have looked like "Summary just doesn't work for flowchart" without
  ever surfacing as an error.
  Also fixed every lane-specific sentence that would have read wrong
  ("Deal won in Inbox," "assign to lanes" empty-state copy) and dropped the
  "Where lanes connect" section entirely for lane-less docs, since it always
  computes zero and showing an always-empty section reads as broken.
- `FlowPage.tsx`'s tab bar now shows for every type, not just swimlane —
  Build · Summary · Charts for the four outline types (Map excluded; see
  below), Build · Summary · Charts · Map for swimlane.

**Verified together, live:** loaded the "Order fulfillment" flowchart
template, set a real handoff mechanism, confirmed it shows up correctly in
both Summary (as a sentence, no lane noise) and Charts (real bar chart, real
stat counts) after a fresh page reload.

**Not done — still open, in priority order the user gave verbally:**
1. **Build-side UX is not good enough and needs a real redesign, separate
   session.** User's words: "the implementation of the build side is shit...
   there's no concept of construction... this doesn't have any of that. It's
   just like text." The click-a-row-open-a-drawer-hunt-for-a-field model
   works but nobody who thinks of a flowchart as boxes-and-arrows will find it
   intuitive — there's no drag-and-drop, no drawing a connection, no visual
   branch construction. This is the top-priority follow-up, ahead of anything
   else in this doc. Likely means reconsidering whether the read-only React
   Flow canvas becomes the actual editable surface instead of a separate
   preview — a real architecture question, not a styling pass.
2. Step 5 (Map tab for lane-less docs — one synthetic card, not one per lane)
   — not started. Map tab is simply absent from the tab bar for outline types
   right now, not broken; nothing to fix, just not built yet.
3. Step 6 (Swimlane lane ⇄ Flowchart conversion, and Flowchart → Decision
   tree) — not started. Confirmed with the user this is still wanted: she
   plans to run flowchart-first department interviews in client meetings,
   then convert each into a lane of one larger swimlane afterward. This is
   now higher-priority than it reads in the original build order below, since
   it's tied to a real near-term meeting/workflow, not a someday nice-to-have.
4. Orientation toggle (vertical/horizontal layout) — not started, no update.
5. Sidebar styling (the app's persistent nav sidebar reads too wide) —
   flagged by the user, explicitly deferred to its own separate styling
   session, not part of this doc's scope.

**One correction to this doc's own earlier framing:** the "Concretely, per
type" section above assumed handoff mechanism might not belong on flowchart's
non-decision steps. Resolved in conversation — it belongs, for the conversion
reason above. Nothing to change in the schema; this is a note so a future
reader doesn't rediscover the same false lead.
