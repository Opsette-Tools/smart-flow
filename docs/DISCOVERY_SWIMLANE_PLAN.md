# SmartFlow — Discovery Swimlane

**Status:** Planned, not built (2026-08-18)
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

_(Append dated entries here when the build runs.)_
