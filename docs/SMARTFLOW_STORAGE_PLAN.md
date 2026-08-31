# SmartFlow storage: a flow library, then the Opsette bridge

**Status:** Phase 1 (flow library) built and shipped 2026-08-31, plus real
routing and export/import that weren't in the original plan. Phase 2 (the
Opsette bridge, §5) is **not started** — still just this plan.
**Author's note:** written as a build brief, researched against the family's
proven patterns before any code changes. Section 6 is the build order.
See §7 for the 2026-08-31 completion notes — the actual delivery diverged
from §4/§6 in real, deliberate ways and §7 is the accurate record of what
exists now.

---

## 1. The problem, diagnosed

SmartFlow's persistence was built as a deliberate MVP shortcut, called out in
`SMARTFLOW_BUILD_PLAN.md` line 28: **"Persistence: localStorage autosave...
Key: `smart-flow-doc`."** One key. One slot.

Confirmed in the running code:

- `store.ts` — the swimlane doc lives at a single localStorage key,
  `smart-flow-doc`. There is exactly one swimlane board at a time.
- `appState.ts` — the four outline types (flowchart, decision-tree, org-tree,
  timeline) share `smart-flow-outline-texts`, one text blob per type. Same
  shape of bug: one flowchart at a time, one decision tree at a time.
- `SmartFlowApp.tsx` `handlePickTemplate` — loading a template when the target
  type already has content throws up `Modal.confirm`: *"This replaces your
  current swimlane. It can't be undone."* That's not a bug fix opportunity,
  it's the honest description of what the single-slot design forces: there is
  nowhere else for a second board to go.

So "I have to destroy everything I made if I change diagrams" is exactly
right. Mapping a second process (a second client, a second department) has no
path that doesn't overwrite the first. Swapping the storage *backend*
(localStorage → IndexedDB) alone would not fix this — it would just be a
bigger single slot. The actual fix is **multiple saved documents**, which is
a structural change, not a swap.

## 2. What the rest of the family already solved this with

Three tools carry the same "small tool, needs to remember more than one
thing" problem, all upstream of SmartFlow, all worth reusing rather than
reinventing:

**`_shared/opsette-bridge/`** — the canonical, current bridge library (copied
verbatim into every tool, same convention as `opsette-share` / `opsette-header`).
Generic `Bridge<T>`: `init.items` is an array of `{ data_id, value }`, and
`save` / `delete` operate per `data_id`. It is explicitly generalized *from*
Process Checklist's bridge specifically because Process Checklist stores more
than one document. Content Flow and Script Builder both predate this shared
version and carry their own near-duplicate copies — `_shared/opsette-bridge`
is the one to install fresh, not the older forks.

**Process Checklist (`src/lib/storage.ts`)** — the clearest proof of the
target shape. `Checklist[]`, each with its own `data_id`, stored as one flat
array (`opsette.checklist.v1`). Create makes a new entry; nothing is ever
overwritten by picking a template — `duplicateAsActive` / `duplicateAsTemplate`
both mint a fresh `data_id`. Each checklist bridges independently via
`bridge.save(data_id, value)`. This is the exact model SmartFlow needs, generalized
from "list of checklists" to "list of flows."

**Content Flow (`src/db/index.ts`, `src/lib/bridgeInstance.ts`)** — the fuller
version of the same idea, one step further: real IndexedDB (via `idb`, already
a family dependency) instead of a flat localStorage array, plus a module-level
`bridgeInstance` singleton (`isBridgeMode()` / `getBridgeInstance()`) so
non-React code can branch on bridge-vs-standalone without threading React
context, plus `hydrateFromBridge` (parent's `init.items` become the local
IndexedDB truth on first embed) and an "unsynced" overlay so a save that never
reached the parent survives a reload. This is heavier than SmartFlow needs on
day one — the unsynced/hydrate machinery exists because Content Flow can be
edited standalone *and* embedded and has to reconcile the two — but it's the
right target shape for Phase 2, and the IndexedDB conventions (db name,
`idb` usage, versioned `upgrade()`) are worth matching exactly.

**`DataLossBanner.tsx`** — the standalone-mode UX: a dismissible AntD
`Alert` that says plainly "your content lives in this browser," with an
export-backup action and a "sync with Opsette" link. Rendered only when
`!isBridgeMode()`. Reusable pattern for SmartFlow's own standalone notice.

## 3. The decision this plan makes

**Build a Flow library.** One IndexedDB store, `flows`, where a row is:

```ts
interface Flow {
  id: string;            // data_id — also the future bridge key
  type: DiagramType;     // "flowchart" | "swimlane" | "decision-tree" | "org-tree" | "timeline"
  name: string;           // user-given, defaults to "Untitled <type name>"
  createdAt: number;
  updatedAt: number;
  // Swimlane carries the full rich doc. Every outline type carries its pasted
  // text. One field, shape depends on `type` — no separate stores per type.
  content: SmartFlowDoc | string;
}
```

**Scope: all five diagram types, not swimlane-only.** The destructive-overwrite
bug is identical in `appState.ts` for the four outline types — it's just less
visible because outline content is a text blob, not a drag-built board. Fixing
only swimlane would leave the same trap for a flowchart or an org chart, and
the whole point of one `flows` store is that it doesn't care which type a row
is. Building it type-scoped would be the "pixelate every file" mistake — one
shared primitive, all five types opt in.

**Why `id` doubles as the future bridge `data_id`:** this is what makes Phase
2 (the bridge) close to free. Process Checklist's proof is that "a flat list
of docs, each with a `data_id`, each independently `bridge.save()`'d" is
*already* the bridge's data model. Building the IndexedDB layer with that same
per-row identity from day one means Phase 2 adds a sync call per row; it does
not restructure storage again.

**Migration, not replacement.** On first boot after this ships, read the
legacy `smart-flow-doc` and `smart-flow-outline-texts` keys. Any type that had
real content becomes exactly one `Flow` row (named e.g. "Swimlane" / "Flowchart"
— whatever the type's display name is, since there was never a name before).
The legacy keys are left in place, untouched, after a successful write —
cheap insurance, not cleaned up as part of this change. Nothing existing is
ever silently dropped.

## 4. What changes for the user

- **"Change diagram" opens a library, not a type-picker.** Today's swap icon
  in the header currently jumps straight to `ChooserModal`'s type/template
  tabs. It now opens a flow list first: name, type badge, last-edited date,
  and Open / Rename / Duplicate / Delete per row, plus a "New flow" action
  that leads into the existing type-or-template chooser. Picking a type or a
  template **always creates a new row** — the `Modal.confirm("This replaces
  your current swimlane...")` destructive path is deleted, because there is
  no longer a reason for it to exist.
- **The board never disappears out from under you.** Switching flows saves
  the one you're leaving (same 300ms debounce as today, just scoped to a row
  instead of the one global key) before opening the next.
- **Reload reopens what you were just on.** A small pointer —
  `smart-flow-active-flow-id` in localStorage, not the data itself — remembers
  which flow was open.

## 5. Phase 2 — the Opsette bridge (same session, once Phase 1 is solid)

1. Copy `_shared/opsette-bridge/` verbatim into
   `src/components/opsette-bridge/` (`bridge.ts`, `index.ts`, `INTEGRATION.md`)
   — do not adapt Content Flow's or Script Builder's older forks, install the
   canonical one fresh, per the family convention.
2. `main.tsx`: call `connectBridge<Flow["content"]>()` before render, same
   pattern as every other tool — render is never blocked past the 1s handshake.
3. A tiny `bridgeInstance.ts` (module-level singleton, ported directly from
   Content Flow's — `setBridgeInstance` / `getBridgeInstance` / `isBridgeMode`)
   so the IndexedDB repo layer can branch on bridge-vs-standalone without
   threading it through every component.
4. Each `Flow` row becomes one bridge item: `init.items` seeds IndexedDB on
   first embed (parent is truth, same "clear local, hydrate from parent" shape
   as Content Flow's `hydrateFromBridge`, simpler here since SmartFlow has no
   presets to reconcile); every write also fires `bridge.save(id, content)`.
   Delete fires `bridge.delete(id)`.
5. Standalone (no parent, or 1s timeout) keeps using the Phase-1 IndexedDB
   library exactly as built — no behavior change, no regression, this is the
   whole reason Phase 1 has to stand on its own first.
6. A `DataLossBanner`-shaped standalone note, SmartFlow-worded: "Your flows
   live in this browser" + export/sync affordances, dismissible, hidden
   whenever `isBridgeMode()`.

**Explicitly deferred:** `SHARE_LINK_PLAN.md` (URL-encoded share links).
Ruthnie's call, 2026-08-31 — not part of this build.

## 6. Build order

1. `db/types.ts` — the `Flow` interface above.
2. `db/flowsRepo.ts` — `idb`-backed CRUD: `list`, `get`, `create`, `update`
   (patches `content` + bumps `updatedAt`), `rename`, `duplicate`, `remove`.
   Debounced save helper mirroring `store.ts`'s existing 300ms pattern.
3. `db/migrateLegacy.ts` — one-time read of `smart-flow-doc` +
   `smart-flow-outline-texts`, converts to `Flow` rows, runs once behind a
   `smart-flow-migrated-v1` marker.
4. `activeFlow.ts` — the small localStorage pointer (get/set active flow id).
5. Rewire `SmartFlowApp.tsx`: state becomes "list of flows + active flow id"
   instead of "one doc + one outline-texts map." `store.ts`'s reducer is
   unchanged (it already operates on one `SmartFlowDoc` — it just now writes
   into a `Flow` row instead of the single localStorage key).
6. New `FlowLibrary.tsx` (replaces the bare type/template entry point behind
   "Change diagram"): list + rename + duplicate + delete, "New flow" hands off
   into the existing `ChooserModal`.
7. Delete the destructive `Modal.confirm` overwrite path in
   `handlePickTemplate` — template pick always creates.
8. Phase 2, once Phase 1 is verified in the running app: bridge install per
   §5 above.

## 7. Completion notes — 2026-08-31

**Phase 1 shipped, but not exactly as §4/§6 described.** Mid-build, "real
routes" and "a header button to reach the library" turned into a full
persistent sidebar layout instead of a library reachable only through the
header's swap icon. Recorded here because the plan above doesn't match the
app anymore, and a future session should trust this section over §3–§6 for
"what actually exists."

**What's built:**

- `db/types.ts`, `db/flowsRepo.ts`, `db/migrateLegacy.ts`, `lib/activeFlow.ts`
  — exactly as planned in §6.1–§6.4. `flowsRepo` is `idb`-backed, one `flows`
  store, CRUD + `updateContent`/`rename`/`duplicate`/`remove`.
- **Real routing**, not in the original plan: `App.tsx` (`BrowserRouter`,
  `basename` from `BASE_URL`), `public/404.html` + a decode step at the top
  of `main.tsx` (rafgraph SPA-on-GitHub-Pages pattern, paired), so a deep
  link or a refresh on any route resolves instead of 404ing.
- **`layout/AppLayout.tsx` + `layout/FlowSidebar.tsx` + `layout/FlowsContext.tsx`**
  — a persistent chrome layer wrapping every route via `<Outlet/>`. Sidebar
  mechanics mirror Content Flow's `AppLayout` (sticky collapsible `Sider`,
  `Drawer` on mobile) but with a dynamic flow list instead of static nav
  items, and Colors set explicitly rather than via AntD's `theme="dark"` —
  that prop's own dark surface read as a mismatched, washed-out panel
  against SmartFlow's flat `#000`. Same reasoning killed AntD's default
  collapse trigger (a translucent strip) in favor of a custom solid one.
  `lib/theme.tsx` also got a `Menu` component override (`itemSelectedBg` /
  `itemSelectedColor`) matching the existing `Select` override — without it
  the sidebar's selected row rendered as a flat gray-olive block instead of
  the brand-green tint used everywhere else.
- Sidebar content, top to bottom: an **Import flow** button (explicitly a
  temporary placement — "for now, I'll redesign it later," her words,
  2026-08-31 — not a considered final home for it), then Home / Library.
  Individual flows are deliberately NOT listed in the sidebar — first built
  that way, then pulled 2026-08-31 same session: an unbounded, un-searchable
  scrolling name list isn't real navigation past a handful of flows, and
  Library already exists as the place to browse/open them. No other buttons
  live in the sidebar; it's otherwise pure navigation (Home, Library).
- `pages/StartPage.tsx` (`/`) — resumes the last-active flow, or shows the
  original empty-landing-with-chooser-open state when there's nothing to
  resume.
- `pages/LibraryPage.tsx` (`/library`) — kept as its own route, not replaced
  by the sidebar as an earlier pass in this session assumed without asking.
  List + New flow + rename/duplicate/delete per row.
- `pages/FlowPage.tsx` (`/flow/:id`) — the workspace. Rename/Duplicate/
  Export/Delete live in a "⋯" menu next to the flow's name here, not on the
  library page alone.
- **The header's pre-existing "Change diagram" button was restored**, same
  icon/position/label as before this session, positioned after the
  dark-mode toggle (original order). Its behavior necessarily changed: it
  creates a new flow instead of destructively replacing the current one,
  since single-slot replace has no meaning once flows are non-destructive.
- **Single-flow JSON export/import** — not in the original plan, added
  2026-08-31 at Ruthnie's request after a manual-backup conversation.
  `lib/flowExport.ts`: a typed envelope (`opsette-smartflow-flow`, `v: 1`)
  mirroring Brand Board's `projectFile.ts` convention. Export lives in
  FlowPage's "⋯" menu; Import lives in the sidebar (see placement note
  above). The importer accepts **two** shapes on purpose: a real Export, and
  the bare legacy `{ v, doc }` shape — which is what a manual
  `localStorage.getItem('smart-flow-doc')` backup (see below) downloads
  verbatim, with no wrapper at all. Built narrow at first (Export-shape
  only), which broke importing Ruthnie's own manual backup file — fixed same
  session.
- **Robustness fix in `main.tsx`:** `migrateLegacyIfNeeded()` previously had
  no `.catch()` — a migration failure (blocked IndexedDB, private browsing,
  quota) would have left `createRoot(...).render()` never called, i.e. a
  blank page. Now caught; migration failure logs and falls through to
  rendering regardless. The legacy `smart-flow-doc` key is never deleted by
  the migration either way, so this only affects whether the app renders,
  never whether the source data survives.

**Verification status — read this before assuming production is safe:**
Ruthnie pulled her real production `smart-flow-doc` value via a manual
console snippet (`localStorage.getItem` → `Blob` → download) and shared the
file. It was traced field-by-field against the actual migration/import
validation code — 5 lanes, 20 items, connections with mechanisms, the
written summary, and all 5 hand-dragged schema-map positions all parse
cleanly and round-trip. **What this does NOT cover:** nobody has yet loaded
the new build against the actual production origin and watched
`migrateLegacyIfNeeded` run for real. The code-level trace is solid; a live
run has not happened. Do that before treating this as closed.

**Not done:**

- **Phase 2 (the Opsette bridge) — zero work started.** §5 above is still
  just the plan.
- No "export the whole library at once" — deliberately scoped out for now
  (single-flow export/import only); Ruthnie's manual console-snippet backup
  and the per-flow Export together cover the stated need. Small addition on
  top of the same code if wanted later.
- `PrivacyModal.tsx` still says "browser's local storage" — colloquially
  fine, technically IndexedDB now. Never asked to fix, left as-is.
