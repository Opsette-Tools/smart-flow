# SmartFlow — Build Plan

**Status:** Planned, not built (2026-06-30)
**Slug:** `smart-flow` · **Tool name:** SmartFlow · **Short name:** SmartFlow (≤12 ✅)
**Type:** New Opsette tool — static Vite + AntD SPA, deployed to GitHub Pages at `tools.opsette.io/smart-flow/`.

This is the **working/build doc** and progress log for SmartFlow. When the build runs, append dated completion notes to the bottom of this file (file/line results, what shipped, what's left).

---

## 1. What SmartFlow is

A no-AI swimlane-diagram builder. The user turns a flat or pre-grouped list of process steps into a clean lanes-and-connectors diagram by **explicit form-based assignment** — every placement (lane, order, handoff) is a user choice, never inferred by a model. Output is a read-only React Flow render, exportable as a PNG to send to clients.

Initial use case: a product-development pipeline (intake → negotiation → bid → launch) where steps belong to different departments (lanes) and some steps hand off across lanes.

### Hard constraints (from the build prompt — non-negotiable)
- **No TanStack** anything. Built-in React state only. ✅ matches family.
- **AntD for all UI, no Tailwind.** ✅ matches family.
- **React Flow** approved as the one diagram-specific dep — render-only, no live canvas editing in v1.
- **No AI/LLM** of any kind. All structure is explicit user input.
- **Static only**, GitHub Pages deployable. No backend/DB/API keys.
- **Mobile responsive** via AntD grid — swimlanes degrade gracefully (horizontal scroll / stacked, never broken).
- **Reuse the monorepo's shared brand components**, don't duplicate tokens.
- **No generic AI-template look** — clean, intentional, consistent with the Opsette family.

### Confirmed product decisions (2026-06-30, Ruthnie)
1. **Persistence: localStorage autosave.** Diagram (lanes + items + connections) auto-saves to `localStorage` and restores on reload. Still 100% static/no-backend. Key: `smart-flow-doc`.
2. **Reordering: real drag-and-drop** via `@dnd-kit` (touch-friendly) — drag-to-reorder within lanes and drag-to-assign from the inbox. (dnd-kit is the only added dep beyond React Flow; it's small and the family standard for DnD.)
3. **Diagram polish: branded + clean export.** Lane columns with headers, item cards in Opsette brand styling, smart connector routing, and a PNG export with **no UI chrome** (no minimap/controls/background dots in the exported image). The diagram is the product — it must look client-ready.

---

## 2. How it fits the Opsette family (reuse, don't reinvent)

SmartFlow is built exactly like the most recent family SPA, **StartUp Planner** (`c:\Opsette Tools\startup-planner`), which is the cleanest reference. Copy its skeleton, not its feature code.

### Shared bundles to copy in (verbatim, into `src/components/`)
| Source (`_shared/…`) | Dest (`src/components/…`) | Notes |
|---|---|---|
| `opsette-share/` (all 7 files + `share.css`) | `components/opsette-share/` | Then create `config.ts` from `config.template.ts`. |
| `opsette-header/` (4 files + `fonts/*.woff2`) | `components/opsette-header/` | Then create `config.ts` → `{ toolName: "SmartFlow" }`. |

These are framework-free and render identically across the family. **Do not modify them** — copy as-is, only fill the per-app `config.ts`.

### Family tokens / patterns to mirror (not re-derive)
- **Brand:** green `#2f4f46`, green-light `#426f62`, gold `#cfae60`, bg `#fafafa` (light page `#f5f5f5`/`#f5f6f8`), text `#1a1a1a`/`#666`. Font **Inter** (Gilmer is bundled in the header for the H1 only).
- **`theme.tsx`** — copy StartUp Planner's `ThemeProvider` (AntD `ConfigProvider`, `colorPrimary: #2f4f46`, dark/light toggle, `html.dark` + `data-theme` cascade, mobile `componentSize="large"` + `fontSize:16`, `Select` brand-tint). Change only the `STORAGE_KEY` → `smart-flow-theme`.
- **`Shell.tsx`** — copy StartUp Planner's Shell: `OpsetteHeader` (with sun/moon dark toggle in `rightExtra`) + `Content` + family `Footer` (About · Privacy · By Opsette) + About/Privacy modals.
- **`main.tsx`** — copy the PWA-register-with-iframe-guard block verbatim.
- **`vite.config.ts`** — copy verbatim, change `base` → `command === "build" ? "/smart-flow/" : "/"` and `port` → **8123** (next free after photo-studio @ 8122; record in `DEV_SERVERS.md`). _(Plan originally said 8131; corrected to 8123 on build — Ruthnie flagged 8123 was the real next slot.)_
- **`uuid.ts`** — copy the secure-context-safe `uuid()` helper (memory: `crypto.randomUUID` breaks on phone-over-http). Use it for all item/lane IDs.

### Head + manifest (canonical specs)
- `index.html` `<head>` per `HEAD_AND_MANIFEST.md`: title `SmartFlow — Opsette`, author `Opsette`, `theme-color #2f4f46`, OG/Twitter pointing at `tools.opsette.io/smart-flow/`. Description (≤160, present-tense, no "list of three"): _"Turn a list of process steps into a clean swimlane diagram — assign lanes, order, and handoffs by hand, then export to share."_
- `public/manifest.webmanifest` per spec: name `SmartFlow — Opsette`, short_name `SmartFlow`, bg `#fafafa`, theme `#2f4f46`, categories `["productivity", "business"]`.

---

## 3. Data model

```ts
interface Lane {
  id: string;
  name: string;
  order: number;      // left-to-right column position
}

interface Item {
  id: string;
  label: string;
  laneId: string | null;   // null = still in the unsorted inbox
  order: number;           // vertical position within its lane
  connectsTo: string[];    // item IDs — cross-lane (or same-lane) handoffs
}

interface SmartFlowDoc {
  lanes: Lane[];
  items: Item[];
}
```

- Single source of truth held in one `useReducer` (or a small `useState` + helper-fns module). Both inbox and per-lane paste feed the **same `items` array** — the only difference is whether `laneId` is set on add.
- Autosave: a `useEffect` serializes `SmartFlowDoc` to `localStorage['smart-flow-doc']` on every change (debounced ~300ms); hydrate on mount. Versioned wrapper `{ v: 1, doc }` so future schema changes can migrate.
- **No derived structure is ever inferred** — `laneId`, `order`, `connectsTo` are only ever written by explicit user actions.

---

## 4. UI structure & component breakdown

Two-mode page: **Build** (assignment) and **Diagram** (render/export), toggled by an AntD `Segmented` control in the page body (not the header — header stays family chrome). Build is where all the work happens; Diagram is read-only output.

Componentize (no monolith page). Proposed tree under `src/components/`:

```
components/
  opsette-header/         # copied bundle
  opsette-share/          # copied bundle
  Shell.tsx               # copied from startup-planner
  AboutModal.tsx          # family modal, SmartFlow copy
  PrivacyModal.tsx        # family modal (copy verbatim)
  smartflow/
    SmartFlowApp.tsx      # owns the doc reducer + mode segmented + autosave
    build/
      LaneManager.tsx     # add / rename / reorder / delete lanes (DnD)
      InboxPanel.tsx      # general textarea (one item per line) → unsorted list
      InboxItemRow.tsx    # one unsorted item: label + lane <Select> + drag handle
      LaneColumn.tsx      # one lane: header, per-lane paste textarea, sortable item list
      LaneItemCard.tsx    # one item in a lane: label, order (drag), "leads to →" control
      ConnectionEditor.tsx# the "leads to →" multi-select (lists other items by label)
    diagram/
      DiagramView.tsx     # React Flow render (read-only) + export toolbar
      laneLayout.ts       # pure fn: SmartFlowDoc → { nodes, edges } with x/y per lane+order
      exportImage.ts      # PNG export (html-to-image or RF toImage) sans chrome
  lib/
    theme.tsx  uuid.ts  haptics.ts  store.ts (reducer + localStorage)
```

### Build mode — the flow (matches the prompt's 5 steps)
1. **Define lanes** — `LaneManager`: type lane names (comma-add or Enter), drag to reorder columns, rename/delete.
2. **Add items** — two entry points, same data model:
   - `InboxPanel` general textarea (one item/line) → items added with `laneId: null`.
   - Each `LaneColumn` has its own paste textarea → items added straight into that lane (skip assignment).
3. **Assign unsorted** — `InboxItemRow` per unsorted item: a lane `Select` + a drag handle to drop it into a lane at a position.
4. **Order within lane** — `LaneColumn` renders a `@dnd-kit` sortable list of `LaneItemCard`s; drag to reorder.
5. **Assign connections** — each `LaneItemCard` has a `ConnectionEditor` ("leads to →" multi-select listing every *other* item by label, grouped by lane). Writes to `connectsTo`. Self-reference disallowed; duplicates deduped.

### Diagram mode — render & export
- `laneLayout.ts` maps the doc to React Flow `nodes` (one custom lane-background node per lane + one card node per item, positioned by `lane.order` × column-width and `item.order` × row-height) and `edges` (one per `connectsTo`, styled as smooth/step connectors with arrowheads).
- `DiagramView` renders React Flow **render-only**: `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`, `fitView`. Lane headers as styled label nodes or a custom node type.
- **Export**: button → render the flow to PNG with no minimap/controls/background grid in the captured frame (toggle chrome off, or capture the `.react-flow__viewport` via `html-to-image`). PNG min; SVG/PDF noted as stretch, not built v1.
- **Mobile**: diagram gets horizontal scroll + pinch/`fitView`; build mode stacks lanes vertically under `md`. Decide per-panel what shows on a phone (lane columns become an accordion/stacked list under `md`, not a squeezed row).

---

## 5. Dependencies (keep minimal)
Added beyond the family baseline (`antd`, `@ant-design/icons`, `react`, `react-dom`, `vite-plugin-pwa`):
- **`reactflow`** (`@xyflow/react` / `reactflow` v11) — approved, render-only.
- **`@dnd-kit/core` + `@dnd-kit/sortable`** — drag-and-drop (confirmed decision #2).
- **`html-to-image`** — clean PNG export (or use React Flow's own `toPng` util from `@xyflow/react` if it captures cleanly without chrome — prefer that if it works, one fewer dep).

No other deps. No charting lib, no state lib, no router.

---

## 6. Family-registry housekeeping (a complete build, not just the app folder)

SmartFlow is a **new** tool, so finishing the build means registering it everywhere the family is enumerated. This is easy to forget and is part of "done":

1. **Phosphor icon assignment.** SmartFlow has no icon yet. **Recommended: `flow-arrow`** (Phosphor `flow-arrow`) — literally depicts a flow/handoff, unused by any sibling. (Alternatives if you dislike it: `git-branch`, `tree-structure`.) **Confirm the icon on build**, then:
   - Add a row to `_shared/brand-icons/generate.mjs` `TOOLS` array: `{ slug: "smart-flow", name: "SmartFlow", phosphor: "flow-arrow" }`.
   - Run the generator → produces `favicon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png` into `output/smart-flow/`; copy into `public/`.
   - Save the source SVG to `_shared/brand-icons/sources/smart-flow.svg`.
2. **`HEAD_AND_MANIFEST.md`** — add SmartFlow to the per-tool reference table.
3. **`ICONS_AND_BRANDING.md`** — add SmartFlow to the per-tool icon mapping table (icon + concept). OG image: generate `public/og-image.png` per the dark-card OG template, mark ✅.
4. **`HEADER_BAR.md`** — add SmartFlow to the per-tool reference table (`toolName: SmartFlow`, icon).
5. **Apex landing page** (`opsette-tools.github.io`): add `images/smart-flow-icon.svg` + a card linking to `/smart-flow/`, with the same description string. Keep landing description in sync with the head.
6. **`DEV_SERVERS.md`** — record port 8131 → smart-flow.

---

## 7. Build order (suggested)

1. **Scaffold from StartUp Planner**: copy `package.json` (rename, add `reactflow`, `@dnd-kit/*`, `html-to-image`), `vite.config.ts` (base `/smart-flow/`, port 8131), `tsconfig`, `eslint`, `index.html` head, `public/` shell, `main.tsx`. `npm install`.
2. **Copy shared bundles** (`opsette-share`, `opsette-header`) + `theme.tsx`, `uuid.ts`, `haptics.ts`, `Shell.tsx`, About/Privacy modals. Get an empty branded shell rendering. Typecheck.
3. **Data layer**: `store.ts` reducer + localStorage autosave + hydrate. Types from §3.
4. **Build mode** lane manager → inbox → per-lane paste → DnD ordering → connection editor. Verify each sub-step in the running app.
5. **Diagram mode**: `laneLayout.ts` → `DiagramView` render-only → branded node/edge styling → PNG export sans chrome.
6. **Mobile pass**: stack/scroll behavior, tap targets, verify at 375px.
7. **Brand assets + registry** (§6): icon, og-image, all four docs, apex card, dev-servers.
8. **Verify → build → commit** (only after Ruthnie verifies). `npx tsc --noEmit` continuously; full `vite build` only at the end.

---

## 8. Open / confirm-on-build
- **Phosphor icon** = `flow-arrow` unless Ruthnie picks otherwise (§6.1).
- **Export lib**: prefer React Flow's built-in `toPng` if it captures clean (no chrome); fall back to `html-to-image`.
- **SVG/PDF export** = stretch, not v1.
- **Apex repo location**: confirm `opsette-tools.github.io` is the local apex repo (it is, at `c:\Opsette Tools\opsette-tools.github.io`).

---

## Progress log

### 2026-06-30 — Initial build (working agent)

**Status: built, awaiting Ruthnie's in-app verification.** Dev server on **http://localhost:8123/** (port corrected from the plan's 8131 → 8123, the real next-free after photo-studio @ 8122). `npx tsc --noEmit` is clean.

**Scaffold** — copied the StartUp Planner skeleton and stripped the estimator feature. Files rewired for SmartFlow:
- `package.json` (name `smart-flow`; added `reactflow@11`, `@dnd-kit/core` + `/sortable` + `/utilities`, `html-to-image`; dropped `jspdf*`).
- `vite.config.ts` (`base` → `/smart-flow/`, `port` → 8123).
- `index.html` head + `public/manifest.webmanifest` per `HEAD_AND_MANIFEST.md` (title `SmartFlow — Opsette`, short_name `SmartFlow`, theme `#2f4f46`, categories `["productivity","business"]`).
- `src/lib/theme.tsx` `STORAGE_KEY` → `smart-flow-theme`. `Shell.tsx` comment, About/Privacy modals rewritten (Privacy now states localStorage autosave — NOT "nothing saved", which would be wrong for an autosaving app).
- `main.tsx` renders `SmartFlowApp`, imports `reactflow/dist/style.css`.
- `tokens.css` generalized (dropped estimator-only tokens; added brand-palette vars).

**Data layer** — `components/smartflow/types.ts` (Lane/Item/SmartFlowDoc/PersistedDoc) + `store.ts` (one reducer, all mutations; dense-order renormalization; versioned `{v:1,doc}` localStorage at key `smart-flow-doc`; debounced 300ms autosave in `SmartFlowApp`; first-run seed = the Sales/Product/Operations product-dev pipeline). Inbox + per-lane add feed the same `items` array; nothing is ever inferred.

**Build mode** (`components/smartflow/build/`) — `BuildMode` owns one `DndContext` spanning inbox + all lanes (cross-scope item drag). `LaneManager` (chip add via comma/Enter, rename, delete→items fall back to inbox, drag-reorder columns in its own context). `InboxPanel` + textarea (one/line) + `InboxItemRow` (lane `Select` + drag handle). `LaneColumn` (droppable, per-lane paste, sortable list) → `LaneItemCard` (rename, delete, connection summary row, `ConnectionEditor`). `ConnectionEditor` = grouped multi-select (by lane + Inbox), self-ref excluded, deduped. Touch sensor uses a 180ms long-press so taps-to-edit aren't read as drags.

**Diagram mode** (`components/smartflow/diagram/`) — `laneLayout.ts` (pure doc→nodes/edges; lane-background nodes + item nodes positioned by lane.order × column and item.order × row; edges pick bottom→top handles for same-column downward handoffs, else right→left). `nodes.tsx` (render-only custom nodes, hidden handles). `DiagramView` (`nodesDraggable/Connectable/elementsSelectable=false`, `fitView`, attribution hidden, empty states). `exportImage.ts` (html-to-image on `.react-flow__viewport`, frames node bounds at 1:1 + 48px pad, pixelRatio 2, no minimap/controls/grid/attribution in the capture).

**Brand assets** — added `{ slug:"smart-flow", phosphor:"flow-arrow" }` to `_shared/brand-icons/generate.mjs`; ran it → favicon.svg/.ico + icon-192/512 into `public/`; source cached at `_shared/brand-icons/sources/smart-flow.svg`. Wrote a reusable `_shared/brand-icons/generate-og.mjs` (dark-card OG template) and generated `public/og-image.png` (green canvas, gold flow-arrow, off-white name, muted 2-line tagline, gold Opsette logo bottom-right). Landing SVG copied to `opsette-tools.github.io/images/smart-flow-icon.svg`.

**Family registry** — added SmartFlow rows to `HEAD_AND_MANIFEST.md`, `ICONS_AND_BRANDING.md` (OG ✅), and `HEADER_BAR.md` (also backfilled the missing palette-studio/icon-kit/frame-board/startup-planner rows and removed the stale deleted `space-planner` row). Apex landing card added (productivity, accent `#2f4f46`). `DEV_SERVERS.md` row added (8123).

**Left to do:** (1) Ruthnie verifies in the running app — especially DnD on touch and the PNG export crop. (2) Then full `vite build` + commit (smart-flow repo + apex repo + the shared-docs changes). (3) Stretch (not built): SVG/PDF export.

### 2026-08-18 — Dark-mode fixes in the chooser (working agent)

Two bugs Ruthnie hit on landing, both fixed and typechecking clean (`npx tsc -b`, exit 0; eslint clean on both changed files). **Not yet verified in-app, not committed.**

**1. First-run chooser trapped the user.** `SmartFlowApp.tsx` passed `dismissible={activeType !== null}`, so on a fresh visit the modal had no close button, no mask-click, and no Esc. Since the mask covers the header, the theme toggle and share button were both unreachable until a diagram type was committed to — the app was literally unconfigurable on arrival. The prop is gone; the chooser is now always dismissible. The `sf-empty-diagram` landing state that catches a dismissal already existed but was dead code — its copy is now written for a real user who lands there on purpose.

**2. Chooser modal was near-unreadable in dark mode.** Root cause was a surface-stacking inversion: template cards were `#1d1d1d` sitting on AntD's `#1f1f1f` dark modal body, so cards rendered *darker than the surface beneath them* and read as holes rather than raised cards. Borders at `#303030` on `#1f1f1f` were roughly 1.2:1 — effectively invisible, which matches the screenshot. Fixes in `smartflow.css`:
- Card and chooser-row surfaces lifted to `#262625` (above the modal body), borders to `#43433f`.
- Modal content itself lifted to `#1f1f1e` with a `#3a3a37` edge, so the panel reads as a panel instead of a void.
- Inactive tab labels lifted from AntD's default near-`#5c5c5c` to `#a8a69d` ("Start from a template" was barely legible); active tab and ink bar now carry the brand gold.
- Card blurb `#9a9a9a` → `#b9b7ae` and card name → `#f0efe9`, both clearing AA on the new surface.

**New doc:** `docs/DISCOVERY_SWIMLANE_PLAN.md` — plan for turning the swimlane into a process-discovery instrument (handoff mechanism per connection, system of record + open question per step, and a derived gaps panel). Includes the reasoning for **rejecting a value stream map** as the wrong artifact for interview-based discovery. Not built.
