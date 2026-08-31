# SmartFlow feature plan — 25 candidates

**Status:** planning only. No code written against this doc.
**Constraint held throughout:** SmartFlow is a personal, single-user tool, not a product. A candidate earns BUILD NOW only if it changes what happens in a live discovery session or what gets handed to a build team afterward. "Nicer" is not a reason.

**Revision note (this pass):** reworked after review. Four changes from the first draft:
1. The share link (candidate 19) is pulled out of BUILD NOW entirely. The plan is to hand data-sharing to an iframe bridge to a parent app, which creates a public share page — a different architecture than the standalone `shareLink.ts` approach in `docs/SHARE_LINK_PLAN.md`, and one that does not exist yet anywhere in this repo (the `opsette-share` directory is an unrelated "share this app" QR-code modal, not a data bridge). See §4.4.
2. Every non-BUILD-NOW candidate now gets a real verdict of **hard no**, **downgrade**, or **redirect** instead of a flat kill — several candidates had real value once cut down to something honest.
3. Section 3 now walks through *how* each BUILD NOW candidate gets implemented, not just why it's worth building.
4. **New candidate added, outside the original 25: open questions become a list, not a single field.** `Item.openQuestion` today holds one string, so a step that raised three separate unresolved questions in the room can only record one of them (or all three jammed into one field, unquantifiable). This becomes `Item.openQuestions: OpenQuestion[]`, each with its own text and a resolved/answered state. This is the one candidate in this document that is a genuine breaking schema change, not an additive one — see §3.4 for why, and what that costs.

**Confirmed scope: swimlane only.** All engagement work so far, and everything in this plan, applies to the swimlane diagram type. The other four types (flowchart, decision-tree, org-tree, timeline) store a raw pasted-text string, not a `SmartFlowDoc` with lanes and items — there's no structured place on them for owner, break point, confirmed, or open questions to attach. None of this plan's fields will appear on those types as the app is built today; that isn't a gap to fix, it's just the actual shape of the data.

---

## 1. How the app is built today — the parts that matter for this plan

### 1.1 The data model

One doc per flow, `SmartFlowDoc` ([types.ts](../src/components/smartflow/types.ts)):

```ts
interface Lane { id: string; name: string; order: number }

interface Item {
  id: string;
  label: string;
  laneId: string | null;      // null = inbox, unplaced
  order: number;
  connectsTo: string[];       // source of truth for edges
  connections?: Connection[]; // sidecar: per-arrow detail
  systemOfRecord?: string;
  openQuestion?: string;
}

interface Connection {
  toId: string;
  mechanism?: HandoffMechanism;    // first of `mechanisms`, kept for old readers
  mechanisms?: HandoffMechanism[]; // compound answers, e.g. "spreadsheet + email"
  systemName?: string;
}

interface SmartFlowDoc {
  lanes: Lane[];
  items: Item[];
  lanePositions?: Record<string, CardPosition>; // Map view drag state only
  summary?: string;                              // generated, then freely edited
}
```

`Flow` ([db/types.ts](../src/db/types.ts)) wraps a doc for storage: `{ id, type, name, createdAt, updatedAt, content }`. `content` is `SmartFlowDoc | string` — swimlane carries the rich doc; the four outline types (flowchart, decision-tree, org-tree, timeline) carry raw pasted text and have no lanes or items array. That's why several candidates below only make sense for swimlane.

**Nothing is ever inferred — everything is written by an explicit user action.** `laneId`, `order`, and `connectsTo` only change when you do something specific; the app never guesses a relationship from where something is sitting on screen. This rule cost a real incident to learn (`docs/DISCOVERY_SWIMLANE_PLAN.md`, 2026-08-19): an earlier build attempt inferred lane membership from drag position and corrupted data, and it had to be caught and reverted by hand. Any candidate that would infer a relationship from layout or position instead of an explicit click is off the table for that reason alone.

### 1.2 State and saving

- [store.ts](../src/components/smartflow/store.ts) — one reducer owns every change to the doc.
- [flowsRepo.ts](../src/db/flowsRepo.ts) — IndexedDB, one row per flow. `duplicate()` already exists — a full copy with a new id, today.
- [FlowPage.tsx](../src/pages/FlowPage.tsx) — autosaves 300ms after you stop typing/dragging, with a guard so it can't fire before the current flow has finished loading.
- Adding a new optional field to `Item` needs **no migration** — every field added so far (`discovery`, `lanePositions`, `summary`) has been optional, and old saved flows keep loading untouched. This is why candidates 1, 6, and 7 below are all cheap in the same way. **The open-questions rework in §3.4 is the one exception** — it replaces an existing field's shape rather than adding a new one, so it needs an actual read-time migration, not just a new optional key.

### 1.3 The three-and-a-half views

- **Build** — lane columns, drag-and-drop, a drawer per step for editing its fields.
- **Summary** — `computeGaps(doc)` ([gaps.ts](../src/components/smartflow/diagram/gaps.ts)) is one function that already walks every step and every connection and derives: orphan steps, where each lane's work enters/exits, every handoff with its method, which handoffs are still manual, which steps have no system of record ("nowhere" is a client finding; blank is your own to-do — kept as two separate lists on purpose), a system-usage tally, and open questions grouped by lane. `buildSummary(doc)` turns those same findings into an editable HTML write-up.
- **Map** — one card per lane, one row per step inside it, curved lines for handoffs. Rebuilt twice before landing on this shape (documented at length in `DISCOVERY_SWIMLANE_PLAN.md`) — it is deliberately a *read and arrange* surface, not a second place to edit step data.
- **Charts** — two charts, both sourced from the same `computeGaps()` output.

**The one fact that matters most for planning:** `computeGaps()` is already the single place that reasons across the whole flow. A new *finding* (a new list, a new count, a new percentage) is usually a small addition there plus a render block in the Summary panel. A new *field* on a step is a small addition to `types.ts` plus one input in the step drawer. Those two shapes cover almost everything in the BUILD NOW list.

### 1.4 What already exists that changes the verdict on some candidates

- **Duplicate is already shipped** (`flowsRepo.duplicate()`), which covers most of "save a flow as a template."
- **A template library already exists** (`templates.ts` + the New Flow chooser), including a deliberately-unfinished discovery template.
- **Bulk paste-add already exists** (`ADD_ITEMS` action, per-lane paste).
- **Manual-handoff count, cross-lane handoff count, and systems-in-use inventory are already computed today** in `gaps.ts` — three of the 25 candidates are just describing what's already on the Summary tab.
- **There is no existing iframe/postMessage bridge in this repo.** The `opsette-share` component you'll see in the source is a "share this app" QR-code modal (share the *tool*, not its data) — unrelated to the data-sharing bridge described below. The parent-app bridge is new infrastructure that doesn't exist yet, in this repo or elsewhere that I can see from here.

---

## 2. Verdict table

| # | Candidate | Verdict |
|---|---|---|
| 1 | Owner field | **BUILD NOW** |
| 2 | Received from (separate inbound field) | Same feature as #17 — see §5 |
| 3 | Stage tag, independent of lane | Downgrade → later, small |
| 4 | Step type: action/decision/approval/wait | Downgrade → later, small |
| 5 | Cycle time and frequency | Downgrade → a client-stated cadence label, not measured time |
| 6 | Break point flag with a note | **BUILD NOW** |
| 7 | Confirmed flag | **BUILD NOW** |
| — | Open questions become a list, each resolvable with an answer (new, not in the original 25) | **BUILD NOW** — the one item here with a real migration |
| 8 | Group by owner/stage/system (lane axis becomes a view) | Downgrade → a read-only re-sorted list, not a second draggable axis |
| 9 | Flowchart mode + promote to master | Redirect → test whether the existing chooser already covers half of this |
| 10 | Filter to one owner, export slice | Later, small — trivial once #1 exists |
| 11 | Compare two flows side by side | Hard no |
| 12 | Completeness percentages | **BUILD NOW** |
| 13 | Manual handoff count/list | Already shipped |
| 14 | Cross-lane handoff count/list | Already shipped |
| 15 | Systems in use with count | Already shipped |
| 16 | Steps by owner count | Later, small — trivial once #1 exists |
| 17 | Contradiction check (A→B, B doesn't list A) | Later — build this instead of #2 |
| 18 | CSV/XLSX export of the register | **BUILD NOW** (CSV) |
| 19 | Read-only share link + confirm/comment | Redirect → iframe bridge to parent app (see §4.4) |
| 20 | Dated snapshots | Downgrade → covered well enough by Duplicate, revisit only if that proves insufficient |
| 21 | Duplicate as template + template library | Already shipped |
| 22 | Bulk add from pasted lines | Already shipped |
| 23 | Keyboard-only entry in the drawer | Later, medium |
| 24 | Inline edit on the map | Hard no |
| 25 | Autosave indicator | **BUILD NOW** — also becomes the trust signal for the iframe bridge |

---

## 3. BUILD NOW — what each one is, and how it gets built

### 3.1 Owner field

**What it is.** A plain text field on a step answering "whose job is this." Every discovery session already produces this answer out loud; right now nowhere on the step records it.

**How it's built.** Add `owner?: string` to `Item` in `types.ts`. Add a `SET_OWNER` action to the reducer in `store.ts` — this is a copy of the existing `SET_SYSTEM_OF_RECORD` action, same shape, new field name. Add an input to `StepDetailFields.tsx`, copying the existing `systemOfRecord` input pattern (plain text, commits when you click away or press Enter, not on every keystroke). Optionally show a small owner tag on the step card in `LaneItemCard.tsx`, the same way the "missing detail" dot already works. No migration, no new screen — old saved flows just don't have the field until you fill it in.

### 3.2 Break point flag

**What it is.** In a live interview, a department person will sometimes point at a step and say, in effect, "this is where it actually breaks" — where work gets dropped, delayed, or where nobody trusts what happens next. That's a direct, first-person finding, different from the things the tool already infers (a manual handoff, a step with no system of record). Right now there's no way to mark "they told me this one is the problem" as its own fact — you'd have to remember it or bury it in the open-question field, which is for a different kind of thing (a question you couldn't answer, not a problem they told you exists).

**How it's built.** Add `breakPoint?: { note: string }` to `Item` — presence of the object means "flagged," and the note holds what they said about it. A toggle switch in `StepDetailFields.tsx` (off by default), which reveals a short text field for the note when turned on — same interaction shape as the system-name field only appearing after you pick "existing system" as a handoff method. A small warning dot on the step card, parallel to the existing "missing detail" dot. In `gaps.ts`, add a `breakPoints` list to what `computeGaps()` returns, walking placed items the same way `recordedNowhere` already does. In `GapsPanel.tsx`, a new "Break points" section, same shape as the existing "Steps with no record" section — a sentence per flagged step, its lane, and the note.

### 3.3 Confirmed flag

**What it is.** A yes/no marker that a department has actually reviewed and agreed to its lane — as opposed to "this is my best read from the interview, not yet checked." With a 12-stage process spread across 6–8 departments and multiple meetings, "is this lane actually done" becomes a real question you'll otherwise be answering from memory.

**How it's built.** Add `confirmed?: boolean` to `Item`. A `SET_CONFIRMED` reducer action. A toggle in the step drawer (`StepDetailFields.tsx` or the lane-level `LaneReview.tsx`, whichever reads better once it's in front of you — worth deciding by trying it rather than guessing here) and a small checkmark badge on the card. This is the simplest of the three new fields — a boolean, nothing else.

### 3.4 Open questions become a list

**What it is, and why the current field is wrong for this.** Today `openQuestion?: string` is one field, one question, per step. In a real session a single step can raise several separate unresolved things — who approves this when the manager's out, whether the customer pays for samples, whether this is even a real step or scheduling just absorbs it (all three are real seed questions already sitting in `templates.ts`). Jammed into one string, there's no way to count them, no way to check one off once it's answered, and no way to tell "three questions, all still open" apart from "three questions, two now answered" — it's just text. This becomes a real list: `Item.openQuestions: OpenQuestion[]`, where each entry has its own text and can be marked resolved with an answer, independent of the others.

**The model change.**

```ts
export interface OpenQuestion {
  id: string;
  text: string;
  resolved?: boolean;
  answer?: string; // set when resolved, holds what you learned
}

export interface Item {
  // ...
  openQuestions?: OpenQuestion[]; // replaces the old single `openQuestion?: string`
}
```

**Why this is the one candidate in this document with a real migration.** Every other new field in this plan is additive — a field that didn't exist before, so an old saved flow just doesn't have it until you fill it in. This one *replaces* the shape of an existing field. An old flow has `item.openQuestion: "some string"`; the new code expects `item.openQuestions: OpenQuestion[]`. Without a migration, every old flow's questions — including the ones already seeded into `templates.ts` and any live in your current 12-stage engagement — silently vanish the moment this ships, because the new code doesn't know how to read the old shape.

The fix is a small, one-time read-time migration, not a database migration in the heavy sense: when a flow loads (in `flowsRepo.get` / wherever `REPLACE_DOC` is dispatched), if an item has the old `openQuestion` string and no `openQuestions` array yet, convert it — wrap the old string as a single unresolved `OpenQuestion` and drop the old field. Written once, it runs invisibly every time an old flow is opened, and after that the doc only ever writes the new shape when autosave fires. This is the same "read v1, migrate on load" pattern the doc's own `PersistedDoc { v: 1 | 2 }` wrapper in `types.ts` already describes as the intended approach, just not yet exercised for a real breaking change until now.

**Where it touches the app — every place `openQuestion` is read today, all cheap to update:**
- `store.ts` — `SET_OPEN_QUESTION` becomes `ADD_OPEN_QUESTION` / `SET_OPEN_QUESTION_TEXT` / `RESOLVE_OPEN_QUESTION` (add, edit text, toggle resolved + set answer). Same reducer shape as every other action here, just three instead of one.
- `StepDetailFields.tsx` — the single TextArea becomes a small list: each question as its own row with its text, a resolve toggle, and an answer field that appears once resolved (same reveal pattern used elsewhere — the system-name field only appearing after "existing system" is picked). An "Add question" action underneath.
- `gaps.ts` — `openQuestions` / `openQuestionCount` already group by lane; the walk changes from "does this item have a question" to "for each item, walk its list," and the count can now distinguish **open** vs. **resolved** questions — itself a small new stat (e.g., "9 open questions, 3 resolved") that wasn't expressible before.
- `GapsPanel.tsx` — renders resolved questions with their answer visible (struck-through or in a "resolved" sub-list), rather than dropping them once answered. This is actually new value the flat string never had: a running record of what was asked and what you learned, not just what's still outstanding.
- `ChartsPanel.tsx` — the "Open questions" stat tile keeps working, now reading the open-only count.
- `schemamap/model.ts` / `SchemaMapView.tsx` — the map currently renders one question as a nested line under a step. With a list, this becomes either a count ("3 open questions") with the detail left to the drawer, or the first unresolved question plus a "+2 more" — a rendering decision, not a data one; the underlying anchor/row-height math already handles a variable number of "extra lines" per step (it does this today for system-of-record + question as two optional lines), so a longer list is more of the same math, not new math.
- `templates.ts` — every seeded `openQuestion: "..."` string across the templates (Sales, Regulatory, QA, Warehouse, etc.) becomes `openQuestions: [{ id, text: "...", resolved: false }]`. Mechanical, one-line-per-question changes, no new authoring effort.

**Sizing, honestly.** This touches more files than any other BUILD NOW candidate (eight), but almost none of the individual changes are hard — it's breadth, not depth. The one piece that needs real care is the migration, because getting it wrong means silently losing every open question on every flow that already exists, including your live engagement. Write it, then test it specifically against a real saved flow from the current Celmark work before trusting it.

### 3.5 Completeness percentage

**What it is.** A number per lane and per flow saying how mapped-out it is. This turns "is Sales done" from a memory question into a number you can open a follow-up meeting with.

**How it's built.** Everything this needs is already counted by `computeGaps()` — placed steps, which ones have an owner, a system of record, a confirmed flag, an answered handoff. This is arithmetic over numbers already computed, not new derivation logic: add a `completeness` calculation to `gaps.ts` and render it as a stat at the top of the Summary tab, or as a small stat tile in Charts (that tab already uses Ant's `Statistic` component for exactly this shape of number). One thing to decide before building — see the open question below — is *what counts* as complete: filled-in fields, or filled-in **and** confirmed by the department. That choice changes what the number means, so pin it down first rather than guessing mid-build.

### 3.6 CSV export of the full register

**What it is.** A downloadable spreadsheet of the whole flow — one row per step, with its lane, owner, handoff target, mechanism, system of record, break point — the actual handoff register a build team works from, instead of the current options (copy the HTML summary, or screenshot the map).

**How it's built.** A new file, `lib/flowCsvExport.ts`, that joins `doc.items` with `computeGaps().answeredHandoffs` into rows and serializes them as CSV text — no new dependency, matching the plain-string approach already used in `lib/flowExport.ts`'s JSON export. A menu item next to the existing Export action in `FlowPage.tsx`'s kebab menu, using the same `triggerDownload()` helper that already exists. CSV rather than a real XLSX file on purpose — no new library, and it opens identically in Excel, Sheets, and Monday's importer for a flat single-table register. If you later want a workbook with a separate tab per lane, that's the point to add a library like `xlsx` — not needed for a first version.

### 3.7 Autosave indicator

**What it is.** A small "saved" / "saving…" signal near the flow name, reading state that already exists (the debounce timer in `FlowPage.tsx`) — nothing new is tracked, it just becomes visible.

**How it's built.** A small text or dot element in `FlowPage.tsx`'s topbar, next to the flow name, that flips between "saving…" and "saved" based on whether the existing `saveTimer` is currently pending. Genuinely small — no new state beyond a boolean derived from the timer.

**Why it matters beyond the obvious.** You flagged that this becomes useful for the iframe bridge — that's right, and worth stating plainly: whatever the bridge sends to the parent app (to build the public share page) should be sent from confirmed-saved state, not mid-keystroke state. The same signal that tells you "it's saved" is the signal the bridge would wait on before it hands data to the parent. Worth keeping that connection in mind if the bridge gets scoped later — this indicator is a small piece of its plumbing, not just a nicety for you.

---

## 4. Downgrades and redirects — the candidates that aren't a flat kill

None of these are being thrown away outright except two (§4.6). Each of the rest had a real want behind it; the point below is what survives once it's sized down to something that actually fits a single-user discovery tool.

### 4.1 Cycle time and frequency (#5)

**The original ask and why it's not quite right.** Real cycle-time data — how long a step actually takes, how often it runs — is value-stream-map territory. `docs/DISCOVERY_SWIMLANE_PLAN.md` already ruled on this by name: that kind of number comes from walking the floor with a stopwatch, not from an interview, and a made-up cycle time in front of manufacturing or ops people who know what a real VSM looks like is worse than not having the number at all. You said it yourself — you're not embedded enough in their system to gather that, and they may not think it's yours to know yet.

**The downgrade that keeps the value.** What you actually want isn't a measured duration — it's a rough, client-stated sense of cadence, useful for exactly the reason you raised: helping shape their Monday dashboards, where "how often does this happen" matters even as a rough label. That's a small, honest field: a `cadence?: string` on the step with a handful of suggested values — *daily, weekly, monthly, on-demand, rare* — presented as free-choice suggestions the same way handoff mechanism already works (a known list, but never a cage; whatever the client says gets stored as typed). Framed as "how often does this happen, roughly, in their own words" rather than "cycle time," it never pretends to be measured data, and it directly feeds the dashboard-cadence question. This is a LATER candidate, not BUILD NOW, but it's a real, smaller feature — not a kill.

### 4.2 Group by owner/stage/system as an alternate lane axis (#8)

**The original ask and why it's not quite right.** As stated, this means the lane column stops being the one placement axis and becomes one of several — which touches the drag-and-drop scope logic, the reducer's renumbering rules, and the Map view's whole "lane = table" vocabulary. That's a rewrite of how the board works, not a view on top of it, and it's the kind of platform-shaped work this plan is supposed to guard against for a single-user tool.

**The downgrade that keeps the value.** If what you actually want in the moment is "let me see this sorted by owner for a minute" — not drag steps around by owner, just look at them that way — that's a read-only re-sort of the existing Summary or Build list, computed the same way the systems tally already groups by system name. No new drag scope, no reducer changes, nothing draggable. This is worth sizing once there's a concrete moment you want it in a real session; noted as LATER rather than dropped.

### 4.3 Flowchart mode for a single-department session + promote to master (#9)

**The original ask and why it needs a test first, not a build.** The "promote" half is real, nontrivial work — merging one document's lanes, steps, and connections into another, reconciling ids, deciding what happens on a name collision. Before sizing that, it's worth checking whether the "flowchart mode" half is even a gap: the chooser already offers a plain Flowchart type with no lanes, for exactly the "I don't know the org structure yet" case. If sketching a department's flow as a flowchart first and then re-keying it into the swimlane by hand isn't too painful, the expensive half (auto-promote) may not be worth building at all. **Redirect**, not build: try the manual path in a real session before deciding whether promote-to-master earns its cost.

### 4.4 Read-only share link (#19) — redirected to the iframe bridge

**What changed.** The original candidate was a self-contained plan already written in `docs/SHARE_LINK_PLAN.md` — compress the doc into the URL itself, no server, a link that's a snapshot. That plan is sound on its own terms, but you've decided the actual direction is different: SmartFlow embeds in a parent app via an iframe, and that parent app is what generates and hosts the public share page — not SmartFlow generating a standalone link of its own.

**What this means for SHARE_LINK_PLAN.md.** Its hard design problems are still worth keeping even though the URL-encoding approach won't be built as written — specifically the trap it identifies in its §5: a doc loaded into the tool from outside (there, a `?flow=` URL param; here, presumably a bridge handing SmartFlow a flow to open) must never get written into your own local flow library by the normal autosave path, or you'd silently create or clobber a saved flow you didn't mean to touch. Whatever the bridge design ends up being, that same guard applies.

**What's genuinely not scoped here.** The bridge itself — what it sends, when, and how the parent turns it into a page — is new infrastructure outside this repo (or not yet built anywhere I can see). This plan doesn't invent that design; it's flagged as a redirect so it isn't silently lost, and #25 (autosave indicator) is called out in §3.6 as one small piece that'll matter once that bridge gets scoped for real.

### 4.5 Dated snapshots (#20)

**The original ask and why it's more than it needs to be.** Automatic point-in-time snapshots need a new storage table, a snapshot-list screen, a restore action, and a real answer to "do these pile up forever." That's meaningful surface area for a single user who can already get most of the same protection by hand.

**The downgrade that keeps the value.** `duplicate()` already exists today — before a big restructure of a lane, duplicate the flow and keep working on the copy. The only thing true automatic snapshots add on top of that is not having to remember to do it. Worth revisiting only if, in practice, you find yourself wishing you'd duplicated before a change you didn't think to protect — a real, lived gap, not a hypothetical one. Not built now.

### 4.6 The two that are a genuine hard no

**Compare two flows side by side (#11).** Every fact either flow can say is already computed per-flow by `computeGaps()` — a comparison page would be new layout work in service of something two open browser tabs already give you today, for an audience of one person occasionally glancing between two department lanes. Not worth a dedicated screen.

**Inline edit on the map (#24).** The map view was rebuilt twice specifically to become a stable, arrange-and-export surface — its whole layout math (row heights, line anchors) is built assuming step content doesn't change while you're looking at it. Turning it into a second place to edit the same fields the Build drawer edits means two write paths for the same data that have to agree, and re-flowing card heights while a line is anchored mid-edit — a real regression risk on a component that only just stopped being fragile, for a convenience ("click the step here to edit it") that's one click away already: click the step, the same drawer Build uses opens.

---

## 5. Dependency note: #2 and #17 are one feature

"Received from" as a field that's captured separately only has one real use: checking it against what the *other* step says about the handoff, and flagging when they disagree. That check is exactly candidate #17. Building #2 alone gives you a field nobody reads back. Building #17 alone is actually *cheaper*, because the check can run directly against data that already exists (`connectsTo` / `connections`) — no new field needed at all. **Recommendation: build #17 only, skip #2.** A separate stored "received from" field would just be a second copy of the same fact the arrows already encode, and it could drift out of sync with them — the kind of duplication the codebase already goes out of its way to avoid elsewhere (see how `mechanism` and `mechanisms` are kept in sync in one place in `store.ts` rather than trusted to stay consistent on their own).

---

## 6. Recommended first slice

One focused session, in build order. Every item here is either an additive optional field or a calculation over data that already exists — **except open questions, which is the one real migration in the slice** and should be built and verified on its own, separate from the additive fields around it.

1. **Owner field** — `types.ts`, `SET_OWNER` action, input in `StepDetailFields.tsx`. (§3.1)
2. **Break point flag** — `types.ts`, `SET_BREAK_POINT` action, toggle + note in `StepDetailFields.tsx`, dot on the card. (§3.2)
3. **Confirmed flag** — `types.ts`, `SET_CONFIRMED` action, toggle + badge. (§3.3)
4. **Open questions → list.** Model change, the read-time migration, the three reducer actions, the drawer rework, and updates to `gaps.ts` / `GapsPanel.tsx` / `ChartsPanel.tsx` / `schemamap/model.ts` / `templates.ts`. Build this as its own contained unit — write the migration, then test it against a real saved flow from the current engagement before moving on. (§3.4)
5. **Extend `computeGaps()`** for the additive fields — break-points list, owner tally, completeness calculation. (§3.5, plus the owner tally noted as a near-free add-on in §2's "#16" row once owner exists)
6. **Render the new findings in `GapsPanel.tsx`** — a Break Points section, and the completeness stat.
7. **CSV export** — `lib/flowCsvExport.ts`, menu item in `FlowPage.tsx`. (§3.6)
8. **Autosave indicator** — small saved/saving element in `FlowPage.tsx`'s topbar. (§3.7)

Steps 1–3 are the same shape and compound (each makes the next slightly easier). Step 4 stands alone — it's the one piece that can go wrong quietly (a bad migration silently drops real data), so give it its own verification pass rather than folding it into the same review as the additive fields. Steps 5–6 depend on 1–3 existing first. Steps 7–8 are independent of everything else and can slot in anywhere, including first, if you want a quick early win.

---

## 7. Open questions

- **What "complete" means for the completeness percentage (§3.5).** Two honest readings: (a) fields are filled in — owner, system of record, at least one handoff — regardless of department sign-off; or (b) fields are filled in **and** the confirmed flag (§3.3) is set. Reading (b) is the more useful number for the actual question ("is this lane truly done"), but it means every lane reads as incomplete until you're both filling in fields *and* actively marking lanes confirmed as you go — a real habit change mid-engagement, not just a UI addition. Decide this before building rather than after, since it changes what the number means on the flow you're running live right now.

- **Where the completeness number is shown.** Top of Summary, a stat tile in Charts, or a badge on the tab label itself ("Summary (72%)") are all reasonable. Not resolved here — a placement/taste call once it exists.

- **Owner: free text or a shared list.** This plan assumes free text, matching every other identity-style field in the model and the tool's general stance of capturing whatever the client says rather than a fixed list. If in practice you want a short autocomplete list of the 6–8 department names so you're not retyping them, that's a small addition (the same tag-style select already used for handoff mechanism) — flagged, not assumed.

- **How the Map shows a step with several open questions (§3.4).** Today one line, one question. With a list, showing every question inline could make a heavily-questioned step's card dominate the lane. A count with detail left to the drawer, versus the first unresolved question plus "+N more," is a real visual choice — not resolved here, worth trying both against a real busy step once the list exists.

- **The iframe bridge itself.** Not scoped in this document at all — what it sends, when it fires, how the parent app turns a flow into a public page, and how the autosave-clobber guard from `SHARE_LINK_PLAN.md` §5 applies to it. Worth its own planning pass when you're ready to size it.

- **#9's flowchart-to-swimlane path.** Flagged as a redirect in §4.3, not confirmed — worth actually trying the manual "sketch as flowchart, re-key into swimlane" workflow once, to see whether promote-to-master is solving a real friction or a hypothetical one.

- **Orphaned flows piling up in the library (raised 2026-08-31, not in the original 25).** Every flow, of every diagram type, autosaves 300ms after you stop editing — there's no way to opt out and no explicit save action, so a flow you started and wandered away from just sits in IndexedDB indefinitely with nothing prompting you to clean it up. The autosave indicator (§3.7) tells you a save is *happening*, but doesn't address this — it's a different problem, library hygiene rather than save trust. Not sized or scoped here because it wasn't clear yet whether this needs an actual feature (an "untouched 30+ days" flag or sort-by-age on the Library page) or whether an occasional manual glance at Library is good enough. Worth a real decision next time it comes up, rather than solving it by accident as a side effect of something else.

- **Disposition (keep / cut / merge-into / automate) — raised 2026-08-31, not in the original 25, not built.** During the build session below, "Confirmed" got renamed to "Validated" (see progress notes), which surfaced a second, genuinely different need Ruthnie described: marking whether a step *survives* a future-state redesign — kept as-is, cut, merged into another step, or automated — versus Validated's actual meaning (you've verified the as-is step is accurate). These are two different disciplines in normal swimlane/BPM practice: validation happens while confirming the as-is map is correct; disposition happens later, when deciding what changes. Explicitly deferred at Ruthnie's request — she doesn't yet have a concrete feel for how disposition should work with this engagement, and didn't want to overbuild a feature set (keep/cut/merge/automate, with "merge into X" needing a pointer to another step) from a fuzzy spec. Revisit once there's a real moment in a live session calling for it — don't build ahead of that.

---

## 8. Progress notes

### 2026-08-31 — Owner, break point, and validated built; map/drawer icon pass; Confirmed renamed to Validated

**What shipped, against the §6 first-slice plan:**
- **Steps 1–2 as planned:** Owner field (`types.ts`, `SET_OWNER`, drawer input) and break point (`types.ts`, `SET_BREAK_POINT`, drawer field) — both built per §3.1/§3.2.
- **Step 3 deviated from the plan as written.** §3.3 originally scoped "Confirmed" as a per-step boolean. Mid-session, Ruthnie clarified this tool has no other reviewer — she's not handing lane review off to a department, so the original "confirmed by the department" framing doesn't fit her actual workflow. The field was renamed **Confirmed → Validated** (same meaning: "I've verified this is accurate," not "the department signed off"), kept **per-step** for now rather than moved to lane-level. The lane-level move discussed during planning (§3.3 rationale: "a department doesn't review steps one at a time") is still believed to be the more correct end state and remains **not built** — flagged as the next open item, not done in this pass.
- **Break point's UI went through several iterations before landing.** First built as a toggle-then-note (matching the original plan's "toggle switch, reveals a note field" spec) — this had a real bug: toggling on with no note yet typed dispatched an empty note, which the reducer immediately collapsed back to "not flagged," so the toggle silently reverted itself. Rebuilt as a plain text field instead (has a note = flagged, matching how `owner`/`openQuestion` already work) — simpler and the bug can't recur structurally.
- **Card-face and map icons went through a full round-trip.** Initially shipped a bare ringed dot for break point on both card and map — this rendered as a stray "o" glyph due to a real CSS bug (`.sf-map-flag` had no `display` set, so `width`/`height` were ignored on the default-inline span) — fixed, but the ring was independently bad UI regardless of the bug (an abstract shape with no legend). Replaced with a real `WarningFilled` icon + hover tooltip on the card. On the map, an icon experiment was extended further — icons added to owner/system/question lines, plus splitting handoff target and method onto two separate lines — but this was **reverted at Ruthnie's explicit instruction**: the map got harder to read with icons added, not easier ("it looks like hieroglyphics now"). **Current state: the map is back to plain text with no icons except the break-point warning icon, which was kept.** The drawer keeps its full icon set (person/check/warning/database/share/hand icons on each field title) — that one landed well and stayed.
- **Steps 4–8 not started this session** (open questions → list, `computeGaps()` extensions beyond the additive break-points list + owner tally that shipped alongside steps 1–2, completeness %, CSV export, autosave indicator).

**What's actually in the app right now, end to end:**
- `Item.owner?: string`, `Item.breakPoint?: { note: string }`, `Item.validated?: boolean` in `types.ts`.
- `SET_OWNER`, `SET_BREAK_POINT`, `SET_VALIDATED` reducer actions in `store.ts`.
- Drawer (`StepDetailFields.tsx`, `ConnectionEditor.tsx`): all fields present with icons — Owner (person), Validated (check-outline, toggle), Break point (warning, plain text field), System of record (database), Handoff (share icon on the section, hand/drag icon on "Handoff method"), Open question (question-circle).
- Card face (`LaneItemCard.tsx`): owner icon (tooltip), validated check-outline icon, break-point warning icon (tooltip showing the note) — all wordless, `aria-label` only, matching the existing handoff-count/missing-detail badge convention.
- Gaps (`gaps.ts`): `breakPoints` list and `ownerTally` added to `GapsReport`; `GapsPanel.tsx` renders a "Break points" section (same shape as "Steps with no record"). Owner tally is computed but **not yet rendered anywhere** (no UI consumes `gaps.ownerTally` yet).
- Map (`schemamap/model.ts`, `SchemaMapView.tsx`): owner and break point both render as plain-text nested note lines (same tier as system-of-record), no icons except break point's warning icon. Handoff target + method are back on one line, as they were originally.
- Charts: **not touched** — owner/break-point still absent from `ChartsPanel.tsx`, this is known drift, not yet closed.

**Still open, in rough priority order Ruthnie can pick up from:**
1. Decide whether Validated moves to lane-level (the originally-planned shape) or stays per-step (what's built now, and what shipped this session).
2. Close remaining drift: owner tally isn't rendered in Gaps yet; owner/break-point aren't in Charts at all.
3. Ruthnie is still iterating on the map's visual design generally ("getting closer to something I'd be able to use," 2026-08-31) — not committed to a specific direction yet beyond "plain text, no icons, for now."
4. Disposition (keep/cut/merge/automate) — see the open-questions entry above. Deliberately not scoped yet.
5. Steps 4 (open questions → list, the one real migration), 5–8 (completeness %, CSV export, autosave indicator) from the original §6 slice remain unbuilt.
