# SmartFlow — Discovery Swimlane

**Status:** Built 2026-08-18 — awaiting in-app verification (see Progress log)
**Scope:** An additive layer on the existing swimlane. No new diagram type, no rebuild.
**Origin:** Ruthnie is running a real client engagement — a contract manufacturer being set up on a Monday board. The first meeting is a process-discovery interview. SmartFlow can hold the shape of that conversation today, but not the findings.

This is the **planning doc**. When the build runs, append dated notes to the Progress log at the bottom.

---

## 1. The problem this solves

A finished swimlane and a discovery swimlane want opposite things.

A finished diagram is a **clean answer** — it hides mess on purpose. That's what SmartFlow builds today, and it's right for a client deliverable.

A discovery swimlane is a **working instrument**. Its job is to capture mess: the step nobody owns, the handoff that happens over text message, the question you couldn't answer in the room. Those are exactly the things a clean diagram is designed to drop.

Right now every one of those findings ends up somewhere other than the diagram — a notebook, a separate doc, memory. Then the diagram and the notes drift, and the notes lose by default.

**The gap:** SmartFlow can draw what a process *is*. It can't record what's *wrong with it*, and for consulting work the second is the product.

### Why this is not a value stream map

Considered and rejected on 2026-08-18. A VSM is a Lean manufacturing artifact with required parts SmartFlow has no model for — process data boxes (cycle time, changeover, uptime, operator count), inventory triangles between steps, a sawtooth timeline ladder separating value-add from wait time, and a lead-time vs. value-added-time summary.

Two reasons it's the wrong tool here, independent of build cost:

1. **It needs measured data.** Cycle times and queue depths come from walking the floor with a stopwatch, not from an interview. A VSM built on estimates is worse than no VSM in front of manufacturing people, who know the artifact and will spot invented numbers.
2. **Wrong altitude.** VSM maps material moving through production. This engagement is departmental workflow and data handoffs. A VSM of the production line wouldn't say what columns the sales team needs.

If a genuine VSM is ever needed, it should be its own diagram type with its own data model, not a swimlane with extra fields.

---

## 2. What gets added

Three optional fields on `Item`, plus one derived read-out. Nothing existing changes shape.

### 2.1 Handoff mechanism — how the work actually moves

Today a connector says *that* work passes from Sales to Production. It doesn't say *how*. In discovery, the how is the whole finding: a handoff that runs on a forwarded email is a Monday automation waiting to happen; one that runs on a shared spreadsheet is a board.

This attaches to the **connection**, not the item — it describes the arrow.

Suggested values, ordered roughly worst-to-best so the list itself reads as a maturity ladder:

- Verbal / hallway
- Email
- Text / chat
- Spreadsheet
- Paper form
- Shared drive / file
- Existing system (name it)
- Automated

Rendered as a small label on the edge, and colored: the manual end of the ladder reads warm (a finding), the automated end reads neutral (fine as-is). That single visual turns the diagram into a gap map — the warm arrows *are* the pitch.

### 2.2 System of record — where the step's data lives

One short free-text field per item: QuickBooks, a shared drive, a specific person's inbox, "nowhere."

This is the direct answer to *"I want to understand their current data model."* Collected across every step, it's an inventory of their systems and the seams between them. "Nowhere" and "someone's head" are the highest-value answers in the set.

### 2.3 Open question — what you couldn't answer in the room

One short free-text field per item, flagged visually.

You will leave the meeting with a dozen of these. They're the agenda for meeting two. Attaching each to the step it came from means they arrive with their context still on them, instead of as a decontextualized list.

### 2.4 Derived: the gaps read-out

No new data — a panel computed from what's already there. It surfaces:

- **Orphan steps** — no inbound and no outbound connector. Either a dead end or a missed handoff; both worth asking about.
- **Lane entry/exit points** — where each lane's work arrives and leaves. These become the board-to-board connections.
- **Manual handoffs** — every connection on the manual end of the ladder, counted. This is the improvement backlog, ranked.
- **Steps with no system of record** — undocumented process, and the strongest argument for the Monday build.
- **Open questions** — collected, grouped by lane, ready to become the follow-up agenda.

This panel is the deliverable. It's what makes SmartFlow a discovery tool rather than a drawing tool.

---

## 3. Data model changes

Additive and optional, so every existing saved doc stays valid.

```ts
/** How work physically moves across a handoff. Ordered worst → best. */
export type HandoffMechanism =
  | "verbal" | "email" | "chat" | "spreadsheet"
  | "paper" | "file" | "system" | "automated";

/** A connection, upgraded from a bare item-ID string. */
export interface Connection {
  toId: string;
  mechanism?: HandoffMechanism;
  /** Free text when mechanism is "system" — e.g. "QuickBooks". */
  systemName?: string;
}

export interface Item {
  id: string;
  label: string;
  laneId: string | null;
  order: number;
  connectsTo: string[];          // KEPT — v1 shape, still the source of truth for edges
  connections?: Connection[];    // NEW — per-connection detail, keyed by toId
  systemOfRecord?: string;       // NEW
  openQuestion?: string;         // NEW
}
```

**Migration note.** `connectsTo` stays as-is rather than being replaced by `connections`. Two reasons: every existing saved doc and all fifteen templates already write it, and the layout code in `laneLayout.ts` reads it directly. `connections` is a sidecar holding detail for arrows that have any — absence means "not asked yet," which is a meaningful state during discovery and different from "asked, and it's manual."

Bump the persisted wrapper to `{ v: 2, doc }`. The v1 → v2 migration is a no-op read (all new fields optional), but the version bump keeps the door open.

---

## 4. UI changes

Small, contained. No new modes and no new top-level navigation.

| Where | Change |
|---|---|
| `build/ConnectionEditor.tsx` | Each selected connection gets a mechanism `Select` beside it, plus a text input when "Existing system" is picked. Currently a bare multi-select. |
| `build/LaneItemCard.tsx` | Two optional fields behind a "Details" disclosure, collapsed by default — system of record, open question. Collapsed matters: the card must not get heavier for someone drawing a plain swimlane. |
| `diagram/laneLayout.ts` | Edge labels + per-mechanism edge color. Items carrying an open question get a corner marker. |
| `diagram/GapsPanel.tsx` **(new)** | The §2.4 read-out. Lives under the diagram, not in it — it's for Ruthnie, not the client-facing PNG. |
| `diagram/exportImage.ts` | A toggle: export clean (client deliverable) or annotated (working copy). Defaults to clean so today's behavior is unchanged. |

### Discovery mode

One switch that turns the annotation layer on. Off by default — a first-time user drawing a simple swimlane should never meet any of this. When on, the Details fields expand by default and the gaps panel appears.

Persist the flag per-document, not globally. A discovery doc stays a discovery doc.

### Mobile

The realistic capture device in a plant is a phone or a tablet, so this is not a retrofit:

- Mechanism select and the two detail fields are full-width stacked rows on narrow viewports — never a cramped inline cluster.
- The gaps panel is an accordion on mobile, sections collapsed, counts visible on the headers so it's scannable without expanding.
- Discovery mode's extra fields must not push the item card past comfortable thumb reach — if the card gets tall, the fields move to a drawer opened from the card.

---

## 5. Build order

1. **Model + migration** — `types.ts`, `store.ts` v2 wrapper, new reducer actions (`SET_MECHANISM`, `SET_SYSTEM_OF_RECORD`, `SET_OPEN_QUESTION`). Verify a v1 doc loads untouched.
2. **Discovery toggle** — the flag, persisted per-doc, gating everything below.
3. **Capture UI** — `ConnectionEditor` mechanism select, `LaneItemCard` details disclosure. This is the half that has to work in a live meeting; get it solid before anything renders.
4. **Gaps panel** — pure derivation from the doc, no new state.
5. **Diagram annotation** — edge labels, mechanism colors, question markers, the clean/annotated export toggle.
6. **Mobile pass** — verify at 375px with discovery mode on and a real ten-step doc loaded.
7. **A contract-manufacturing discovery template** — see §6.

`npx tsc -b` continuously (not `--noEmit` — the root tsconfig has `"files": []`, so `--noEmit` is a false green). Full `vite build` only at the verify-then-commit step.

---

## 6. A discovery-shaped template

The three existing contract-manufacturing templates are all flowcharts of a quoting pipeline. Useful, but not what an interview needs.

Add a **swimlane** template — "Contract manufacturer — department discovery" — seeded with the lanes a contract manufacturer usually runs, and deliberately incomplete. It should ship with real gaps in it, because a template that arrives already correct teaches the wrong thing: the point is to fill it in with the client, and to find that some lanes don't exist and others are one overloaded person.

Typical lanes, to confirm in the room rather than assume: Sales / Business Development · Product Development or R&D · Regulatory & Compliance · Procurement · Production Planning · Manufacturing · Quality (QA and QC are often separate) · Warehouse & Shipping · Finance.

Two notes worth carrying into the build:

- **Quality is usually two functions.** QA owns the system and documentation; QC runs the tests. They're frequently different people with different handoffs. Seeding them as one lane bakes in an error.
- **Regulatory is the lane most often missing from an org chart but present in the work** — it's someone's second job. Finding out *whose* is a high-value discovery moment.

---

## 7. Open / confirm-on-build

- **Mechanism list length.** Eight values may be too many for a live capture UI. Consider collapsing to five (Verbal · Email · Spreadsheet · System · Automated) and letting "System" carry the detail in free text. Decide by trying it at speed.
- **Where the gaps panel lives.** Under the diagram is the assumption. It might deserve to be the third mode alongside Build and Diagram once it has real content in it.
- **Time-per-step.** Deliberately excluded — it's the on-ramp to a half-VSM, which §1 rules out. If it ever comes back, it comes back as a real VSM type with a real data model.
- **Monday export.** The natural end of this road: gaps panel → a board structure spec (lanes = boards, handoffs = connect columns, manual handoffs = automation candidates). Out of scope here, worth its own doc if the engagement goes well.

---

## Progress log

### 2026-08-18 — All seven steps done. Awaiting verification in the app.

**Status:** Feature-complete against §5. Typecheck clean, lint clean (one pre-existing
`react-refresh` warning in `nodes.tsx`, untouched by this work). Not yet verified in
the running app, not yet committed.

**Two §7 questions resolved, both deliberately:**

- **Mechanism list: kept all eight, did not collapse to five.** The plan's own argument
  beats its hedge — the list is a maturity ladder and the discriminations *are* the
  findings. "Email" vs. "text/chat" separates an automatable handoff from one that
  isn't. "Paper form" is the loudest single finding on a manufacturing floor and
  folding it into "system" would erase it. Capture speed comes from worst-first
  ordering and a searchable select, not from a shorter list. Revisit only if it
  actually drags in a live meeting.
- **Gaps panel lives under the diagram, not as a third mode.** Promoting it to
  top-level navigation doubles the nav cost for something not yet proven in a real
  interview. Revisit after the first engagement.

**What shipped, by step:**

1. **Model + migration** — `types.ts` gained `HandoffMechanism`, the `MECHANISMS` list
   (single source for select, edge labels, and read-out), `isManualMechanism`,
   `Connection`, and the three optional `Item` fields. `SmartFlowDoc.discovery` is the
   per-doc flag. `store.ts` reads `v: 1 | 2` and writes `v: 2`; the v1→v2 read is a
   no-op as designed. Verified against a real v1 payload: lanes, items, labels, and
   `connectsTo` all load intact, `discovery` defaults off, no phantom sidecars, and
   unknown-version / corrupt payloads are rejected rather than crashing.
2. **Discovery toggle** — `SET_DISCOVERY`, a switch in BuildMode's action row,
   persisted with the doc. One deviation worth noting: **`RESET` now preserves the
   flag.** Wiping the board mid-interview shouldn't silently drop you out of discovery
   mode. Content clears; the mode does not.
3. **Capture UI** — `ConnectionEditor` renders a mechanism row per connection, with the
   free-text system-name input appearing only for "Existing system". `LaneItemCard`
   grew a Details disclosure (open by default in discovery, absent entirely outside
   it) holding system-of-record and open-question, plus a gold flag in the card header
   when a question is set. Both free-text inputs are uncontrolled and commit on
   blur/Enter — a live typist shouldn't dispatch per keystroke — and are keyed to their
   doc value so a template load reseeds them.
4. **Gaps panel** — split into `diagram/gaps.ts` (pure derivation, no React) and
   `diagram/GapsPanel.tsx` (presentation). The split is deliberate: the Monday-export
   idea in §7 can consume `computeGaps()` directly without touching UI. Seven sections;
   `unaskedHandoffs` was added beyond §2.4 because "drawn but never asked about" is the
   single most actionable thing to see *while the client is still in the room*.
5. **Diagram annotation** — `buildLayout(doc, isDark, annotate)`. Manual mechanisms
   render warm (`#b4653a` / `#d98c5f` dark), system and automated render muted sage;
   an unasked arrow keeps the default color, since "not asked yet" is not a finding.
   Edge labels show the system's *name* when one was given, not the generic word.
   Steps with an open question get a corner dot. Export became a dropdown in discovery
   mode — clean for the client, annotated for the working copy — and stays a plain
   button otherwise, so non-discovery behavior is byte-identical to before.
6. **Mobile** — mechanism rows and detail fields are full-width stacked at every width
   (not just narrow), the toggle row stacks under 575px, and the gaps panel is an
   accordion with counts on the collapsed headers. **Still needs a real 375px pass with
   a ten-step doc loaded — that's device work, not something confirmable from here.**
7. **Template** — `cmDiscoveryDoc()`, registered first in Contract manufacturing.
   Deliberately incomplete per §6: QA and QC are separate lanes, Regulatory is its own
   lane, several steps are intentional orphans, no handoff carries a mechanism, and no
   step carries a system of record. Nine open questions are planted as the starting
   agenda. `buildSwimDoc` gained optional per-step seeds and a `{ discovery: true }`
   option; all existing callers are unchanged.

**Verification run:** 27 reducer/derivation checks and 11 migration checks, all passing
— sidecar pruning when an arrow or its target step is deleted, system-name clearing
when the mechanism changes away from "system", empty sidecars collapsing to `undefined`
rather than `[]`, inbox items excluded from every finding, worst-first ranking, and
case-insensitive system inventory that displays the first spelling typed. Scratch test
files were removed after running.

**Left for Ruthnie:**

- Verify in the running app, especially the export dropdown (clean vs. annotated) — the
  capture waits two animation frames for React Flow to lay out edge labels before
  snapshotting, and that timing deserves a real look.
- The 375px pass from step 6.
- `npx tsc --noEmit` is the correct typecheck for this project — it has a single
  tsconfig with `include`, not the `"files": []` root that makes `--noEmit` a false
  green in the other Opsette tools. `tsc -b` is not needed here.

---

### 2026-08-18 (later) — Rework after first real use

Ruthnie ran the built version and pushed back hard on several things. Most of the
pushback was correct and exposed the same underlying mistake more than once: **the tool
was encoding assumptions the data did not support, and encoding one user's workflow into
a public tool.** Notes below so the reasoning survives.

**Bugs found and fixed**

- **Automated handoffs vanished.** `computeGaps` collected unasked and manual handoffs
  and silently dropped everything else, so marking a handoff "automated" or "existing
  system" made it disappear — indistinguishable from never asking. Now every answered
  handoff is kept (`answeredHandoffs`), with `manualHandoffs` as a view over it.
- **`undefined` chip.** `maxTagCount="responsive"` renders its "+N" overflow chip through
  the custom `tagRender`, with no value. We printed `String(undefined)`. Guarded.
- **Lane name repeated.** Connection labels read "Delivery · Process Engineering" while
  standing in Delivery. The lane prefix now only appears when the handoff crosses lanes.
- **Amber tint never applied to the select.** antd's `.ant-select-outlined
  .ant-select-selector` outranks a single class. Fixed with a matching-specificity rule.
- **Mechanism row was a fragment.** "→ Process Engineering" with a "How does it move?"
  box required remembering which step you were in. Both ends are named now.

**Assumptions removed (the recurring theme)**

- **Closed mechanism dropdown → free text.** A discovery tool exists to capture mess;
  a fixed list only captures mess we anticipated. Known values are suggestions now, and
  anything typed is stored verbatim as `{ custom: string }`.
- **Worst-first "manual handoffs" ranking → dropped as the organizing principle.** The
  panel was presenting our heuristic as a measurement. Section is now "Handoffs" and
  shows everything; the manual count survives as one line of context.
- **Blank field ≠ finding.** "Steps with no system of record" was counting empty form
  fields and reporting them as discoveries about the client's business. Split into
  `recordedNowhere` (client said nowhere — a finding) and `systemNotAsked` (blank — your
  to-do), rendered in two visually separate blocks.
- **Custom values still assume manual.** Known limitation: type "Zapier" and it counts as
  hand-carried. Word-matching would break on the next tool name, so this stands until
  there is a better answer. Ruthnie chose to work around it by using "automated".

**Copy pass (VOICE.md applied)**

The rule used throughout: name the real object, no pronouns, no generic nouns. Field
labels are now the source of truth and the panel quotes them back, so every section names
something findable on the build page:

| Field | Was | Now |
|---|---|---|
| mechanism | "How does it move?" | **Handoff method** |
| system | "Where does this live?" | **Storage system** |

Sections: Handoffs · Outstanding questions · Steps with no record · Systems in use ·
Steps with no connections · Where lanes connect · Not filled in yet (with **Handoffs with
no method** and **Steps with no storage system**).

Deleted, not replaced: the "this is yours, not the client-facing diagram" note, all
Monday/meeting/room/client/interview language, "the seam where work gets dropped", "the
strongest argument for building them a system". Export menu is now "Diagram only" /
"Diagram with handoff labels".

**Header condensed** — four stacked rows to two. Lanes went horizontal (heading, input,
chips on one line), the inbox collapses to a single row while empty (drop target stays
mounted), and Load example / Start over moved into a kebab.

**Written summary (new)** — `buildSummary()` in `gaps.ts` generates HTML grouped by lane,
rendered in a Tiptap editor (`SummaryEditor.tsx`). Generate fills it; once content exists
only an explicit Regenerate overwrites, so edits are never lost to a board change. Saves
to the doc as `summary`. Copy writes both `text/html` and `text/plain`. User input is
escaped on the way into the generated HTML.

**New dependency:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` — first added to
this tool. Markdown-in-a-textarea was tried first and rejected on sight.

**Still open**

- **"Steps with no connections"** sits with the findings, but a disconnected card mid-build
  is usually just unfinished. Probably belongs under "Not filled in yet".
- **"Change diagram" button** should move into the shared Opsette app header. Not done —
  that component is shared across all sixteen tools and deserves its own session.
- **Sticky Build/Diagram toggle** — would save real scrolling during a live session.
- The 375px pass still hasn't happened.
