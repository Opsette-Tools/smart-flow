# Schema designer — planning doc

**Status:** Phase 1 core built and verified (2026-09-03) — schema diagram
type, canvas, editable tables/columns, relationships, "Building for" target
picker, live capability notes, select/multi-select options editor. See the
progress entry at the bottom for the full account. Export (Phase 2) and
field alignment (Phase 3) not started.

**What this is.** A sixth SmartFlow diagram type: a relational schema
designer — tables, columns, column types, primary/foreign keys, and
relationship lines between tables — plus a companion **field alignment**
mode for reconciling several source briefs into one proposed schema before
building it out as a real Monday board (or Airtable base, or SQL database).
Two real, distinct jobs, both scoped here because the second is what the
first exists to feed: **(1)** lay out a schema visually and edit it like a
database designer would, **(2)** take multiple briefs' field lists, see them
side by side, decide what's actually the same field wearing two names, and
turn that decision into the schema from (1).

**Why SmartFlow and not a new app.** Ruthnie's call, already made — this is
the right home because the app already owns the exact primitives a schema
designer needs: a draggable/pannable canvas with bezier connector lines
(`schemamap/`), one shared doc-per-flow storage model (`flowsRepo.ts`), and a
`DiagramType` chooser pattern that already asks "what are you trying to
show" instead of assuming diagram vocabulary. Building a second app would
duplicate all three instead of extending them.

---

## 1. Why this is a sixth `DiagramType`, not a mode inside an existing flow

Looked at making this a `ViewMode` (`"build" | "diagram" | "charts" | "map"`,
[FlowPage.tsx:30](../src/pages/FlowPage.tsx#L30)) tacked onto an existing
flow instead of its own type, the way Map is swimlane-only today. Rejected:

- `Flow.type` ([db/types.ts:13](../src/db/types.ts#L13)) is what the library,
  the chooser, and every export path key on. A schema is not "a view of" a
  swimlane's process steps — it has no relationship to a flowchart's steps or
  a swimlane's lanes at all. Forcing it under an existing flow's `content`
  would mean bolting a second, unrelated doc shape onto `SmartFlowDoc`
  (`lanes`/`items` sitting next to `tables`/`relationships` that never
  interact) purely so it can ride the same `Flow` row. That's the "different
  content type" fork the app just finished removing
  ([UNIFIED-SCHEMA-AND-CONVERSION-PLAN.md](./UNIFIED-SCHEMA-AND-CONVERSION-PLAN.md)) —
  reintroducing the same shape of problem one document later would be a real
  regression, not a shortcut.
- A schema has its own natural identity as a saved thing: "Celmark RFP
  intake schema" is a flow in its own right, sitting in the Library next to
  your process maps, nameable and duplicatable the same way. It should not
  be a hidden tab bolted onto some other flow's page.
- The `DiagramType` chooser ([diagramTypes.ts](../src/components/smartflow/diagramTypes.ts))
  already asks "what are you trying to show" in plain language and routes to
  the right editor — "I want to design a database or a set of fields for a
  board" is exactly one more honest answer to that same question, not a
  special case.

So: `DiagramType` gains `"schema"`. New chooser entry, new doc shape, own
library entries, own `FlowPage` render branch — the same shape of addition
swimlane already is relative to the four outline types, not a graft onto an
existing one.

---

## 2. Data model

New file, `src/components/smartflow/schema/types.ts` (kept alongside the
existing `types.ts` rather than merged into it — a `SchemaColumn` has nothing
in common with an `Item`, and cramming both into one file would make neither
easier to read):

```ts
/** Canonical field types — human-readable, target-agnostic. Every export
 *  target (SQL, Airtable, Monday) maps FROM this list; the list itself never
 *  speaks any target's vocabulary. Kept intentionally small — see §4 for why
 *  a 1:1 match to every target's exotic types is a non-goal. */
export type ColumnType =
  | "text"        // varchar/text, Airtable single/long text, Monday text/long-text
  | "number"      // int/numeric, Airtable number, Monday numbers
  | "boolean"     // boolean, Airtable checkbox, Monday status(2-state)/checkbox
  | "date"        // date/timestamp, Airtable date, Monday date/timeline
  | "select"      // enum, Airtable single select, Monday status/dropdown
  | "multi-select"// Airtable multi select, Monday dropdown(multi)/tags
  | "money"       // numeric(currency), Airtable currency, Monday numbers(currency)
  | "person"      // no clean SQL equivalent, Airtable collaborator, Monday people
  | "attachment"  // no clean SQL equivalent, Airtable attachment, Monday files
  | "relation";   // foreign key, Airtable linked record, Monday connect-boards

export interface SelectOption {
  id: string;
  label: string;
}

export interface SchemaColumn {
  id: string;
  name: string;
  type: ColumnType;
  /** Only meaningful when type is "select" or "multi-select". */
  options?: SelectOption[];
  primaryKey?: boolean;
  required?: boolean;
  unique?: boolean;
  /** Free text, e.g. "today", "0", "Pending" — stored verbatim, never parsed
   *  or validated against `type`, matching the app's existing stance on
   *  free-text discovery fields (see HandoffMechanism in ../types.ts) rather
   *  than inventing a typed-default system nobody asked for. */
  defaultValue?: string;
  /** Which source brief(s) this column came from, in field-alignment mode.
   *  Absent on a column authored directly on the canvas with no brief
   *  behind it. See §5 — this is what lets the alignment view and the
   *  schema canvas share one column record instead of two. */
  sourceRefs?: SourceFieldRef[];
  note?: string;
}

export interface SchemaTable {
  id: string;
  name: string;
  columns: SchemaColumn[];
  /** Canvas position — same shape and same "presentational only, never
   *  inferred" rule as Lane/CardPosition in ../types.ts. */
  position?: { x: number; y: number };
}

export type RelationshipKind = "one-to-one" | "one-to-many" | "many-to-many";

export interface Relationship {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  kind: RelationshipKind;
  /** Optional label on the connector line, e.g. "assigned to". */
  label?: string;
}

/** One brief/source document, imported or pasted, in field-alignment mode. */
export interface SchemaSource {
  id: string;
  name: string; // e.g. "Product order brief — v2", "Client onboarding brief"
  /** Raw pasted text, kept verbatim so re-parsing or re-reading the original
   *  wording is always possible — the parsed fields below are a derived
   *  view, not a replacement for the source. */
  rawText: string;
  fields: SourceField[];
}

export interface SourceField {
  id: string;
  /** The field name exactly as it appeared in that brief. */
  label: string;
  /** Free-text notes carried alongside the field in the brief, if any
   *  (a type hint, an example value, a comment) — stored, never parsed. */
  note?: string;
}

/** Points a schema column back at the source field(s) it was reconciled
 *  from. A column can point at more than one source field when two briefs
 *  named the same concept differently ("Client Name" / "Customer") and were
 *  merged into one column. */
export interface SourceFieldRef {
  sourceId: string;
  fieldId: string;
}

export interface SchemaDoc {
  tables: SchemaTable[];
  relationships: Relationship[];
  /** Field-alignment mode's own data — absent doc-wide until the first brief
   *  is imported, matching every other optional-until-used field in the
   *  app's existing docs. */
  sources?: SchemaSource[];
}
```

**Why `SchemaDoc` is its own top-level shape and not squeezed into
`SmartFlowDoc`.** `Flow.content` is typed `SmartFlowDoc`
([db/types.ts:19](../src/db/types.ts#L19)) today, uniformly, for exactly the
five existing types. Adding a sixth type with a structurally unrelated doc
shape means `Flow.content` becomes `SmartFlowDoc | SchemaDoc`, narrowed by
`Flow.type` at every read site — a discriminated union, not the
`string`-vs-`SmartFlowDoc` fork that was just removed. That distinction
matters: the old fork was two shapes for **the same idea** (a process
diagram), one of them a lossy stand-in for the other. This is two shapes for
**different ideas** (a process vs. a schema) that were never going to
converge — a real discriminated union, same pattern React itself uses for
"this component renders one of several unrelated things," not a design
smell to unify away later.

**No migration risk.** `"schema"` is a new `DiagramType` value; every
existing flow keeps its `SmartFlowDoc` content untouched. This is purely
additive at the `Flow` level.

---

## 3. Canvas — fork the schema map, don't add React Flow

The app already has a hand-rolled draggable/pannable canvas with bezier
connector lines purpose-built for "cards with rows, lines between specific
rows" — [schemamap/SchemaMapView.tsx](../src/components/smartflow/schemamap/SchemaMapView.tsx),
[schemamap/model.ts](../src/components/smartflow/schemamap/model.ts),
[schemamap/paths.ts](../src/components/smartflow/schemamap/paths.ts). That
engine's whole job today is table-card-with-rows-and-handoff-lines, just
with lane/step vocabulary instead of table/column vocabulary. React Flow
already exists in the app too ([reactflow, used read-only for
flowchart/decision-tree/org-tree/timeline](../src/components/smartflow/diagram/DiagramCanvas.tsx#L38)),
but it's wired for auto-layout render-only display, not free-drag
authoring — retrofitting it for draggable table cards with per-column
connection handles would mean fighting its layout assumptions, not using
them.

**Decision: fork `schemamap/` into a new `schema/canvas/` directory**, not a
new dependency, and not a shared component between the two (see below for
why not shared). This is a genuine fork, not an import — the two canvases
will diverge in real ways from day one (a schema table's rows are typed
columns with PK/FK glyphs; a lane's rows are process steps with owner/
break-point icons), and forcing one component to serve both would mean
threading a "which kind of row is this" branch through every render path,
the exact kind of fork the app has already paid down once this year.

What's reused **as a pattern, not a shared module**:
- Pan/zoom/drag math (`model.ts`'s card-position logic).
- Bezier connector rendering (`paths.ts`).
- The interaction shape: click a card to focus it, drag to reposition, lines
  redraw live.

What's new:
- A table card renders a real column list (name, type badge, PK/FK glyph),
  not a lane's step list.
- Drawing a relationship means dragging from one column's connector handle
  to another column's handle (not "connect this step to that step") —
  genuinely new interaction, since today's schema map only connects whole
  cards' rows to each other in the handoff sense, never one specific field
  to another specific field with a typed kind (1:1/1:many/many:many)
  attached.
- A relationship line's kind (one-to-many, etc.) needs a visual convention
  (crow's-foot notation is the DB-design standard and worth adopting here
  rather than inventing a new one — see §6).

**If the fork turns out to fight us** — specifically if free per-column
connector handles prove awkward on the existing div/SVG approach — the
fallback is React Flow in **editable** mode (`nodesDraggable`/
`nodesConnectable: true`, a custom table node with per-row `Handle`
components). That's a known-working pattern (`react-erm-editor`, researched
externally) if the fork stalls, not the first move.

**Where `@dnd-kit` fits, precisely — one job, not the canvas engine.**
`@dnd-kit/core` + `@dnd-kit/sortable` are already installed and already used
in this app ([build/LaneColumn.tsx](../src/components/smartflow/build/LaneColumn.tsx),
[build/dndScope.ts](../src/components/smartflow/build/dndScope.ts)) — but
for a genuinely different interaction: dragging a step card between
sortable lists (inbox → lane, reorder within a lane). Confirmed by reading
`SchemaMapView.tsx` directly: the canvas itself uses none of it — free 2D
pan/zoom/positioning is hand-rolled on raw pointer events
([SchemaMapView.tsx:176-273](../src/components/smartflow/schemamap/SchemaMapView.tsx#L176)),
because that's a continuous-coordinate problem, not a sortable-list one, and
`@dnd-kit` doesn't model it. So: **`@dnd-kit` is reused for exactly one
thing here — dragging a column up/down to reorder it inside a table's
column list** (the same shape of problem as reordering steps in a lane).
Moving table cards around the canvas and drawing relationship lines stay
hand-rolled pointer-event code, forked from the schema map's existing
pan/zoom/drag math as described above. No new dependency needed for either
half.

---

## 4. Canonical types + target exporters

**The type vocabulary itself was already settled: human-readable
throughout, not SQL jargon.** `ColumnType` in §2 is the entire vocabulary a
user ever sees or picks from — Text, Number, Boolean, Date, Select,
Multi-select, Money, Person, Attachment, Relation. There is no "varchar"
anywhere in the UI. What still needs solving isn't naming, it's that the
three targets don't all have a same-shaped landing spot for every one of
those ten types, and a silent, wrong mapping is worse than no mapping at
all.

### 4.0 "Building for" target — reversal, 2026-09-03

Earlier drafting of this plan argued against a target-mode picker on the
grounds that every canonical type maps one-to-one across targets, so the
target is cosmetic. **That reasoning was wrong for a real case, and Ruthnie
was right to push back with sourced detail.** Monday's Mirror column and
Airtable's Lookup are the same *concept* (read a field across a link) but
not the same *capability* — a Mirror can't be grouped by, has limited
filter/sort, and formula columns have historically been unable to reference
it (a moving target on Monday's side, not guaranteed stable). Modeling
"Mirror" as pure display-label sugar over a fully-capable `lookup` would let
someone build a schema assuming powers the real Monday column doesn't have,
and the gap would only surface once they tried to actually use it — exactly
the kind of late, expensive discovery this whole tool exists to prevent.

**Corrected design:**

- The user knows their target when they know it — usually before they draw
  the first table, per Ruthnie's Celmark/Monday case. The tool should take
  that as an input, not hedge against an unknown that doesn't exist for
  most real sessions.
- `SchemaDoc` gains a top-level `buildingFor?: "sql" | "airtable" | "monday"`
  (absent = undecided, the only state that behaves like the original
  target-agnostic design). Set once, near table creation, not per-column —
  see §4.1 for exactly where.
- Every canonical type carries **capability notes per target**, not just a
  display-label map. A note is a plain sentence, not a boolean — "read-only,
  can't group or filter by it" is what a user needs to see, not a bare
  `capable: false`.
- **Warnings surface live, at the moment of picking a type on the canvas**,
  never backloaded to an export-time report. If `buildingFor` is set, the
  type picker and the column's badge both show a target-specific note the
  instant a lossy type is chosen — "Renders as Mirror on Monday: read-only,
  limited grouping/filtering" sits right on the card, not three steps later
  in an export you might not run until the schema is "done." Finding this
  out after building ten of them is the exact failure mode Ruthnie flagged
  by name (2026-09-03: "imagine me building all this thinking this is gonna
  work, and then I try to—").
- If `buildingFor` is undecided, no target-specific note shows at all — the
  canvas stays purely canonical, matching the original design for that one
  case only.

### 4.0.1 Board-vs-table modeling — explicitly out of scope

Monday's real unit of organization is a board (with its own permissions,
automations, views), not a table — and deciding "does this deserve its own
board, or is it just a column on one that already exists" is a genuine
judgment call (lifecycle, ownership) with no mechanical derivation from a
normalized schema. Considered building an assistant that suggests
merging thin/low-cardinality `SchemaTable`s into wider boards — **rejected
by Ruthnie, 2026-09-03**: this is the user's call to make, not something
the tool should infer or nudge. `SchemaTable` stays a plain one-table/
one-board unit with no merge-suggestion feature, now or later.

| Canonical | SQL (DDL) | Airtable field type | Monday column type |
|---|---|---|---|
| `text` | `varchar(255)` / `text` | Single line text / Long text | Text / Long Text |
| `number` | `numeric` | Number | Numbers |
| `boolean` | `boolean` | Checkbox | Checkbox |
| `date` | `date` / `timestamp` | Date | Date |
| `select` | `varchar` + CHECK, or a lookup table | Single select | Status or Dropdown |
| `multi-select` | join table (see below) | Multiple select | Dropdown (multi) or Tags |
| `money` | `numeric(12,2)` | Currency | Numbers (currency format) |
| `person` | `varchar` (name) or FK to a users table | Collaborator | People |
| `attachment` | *(no clean equivalent — store a URL/path column)* | Attachment | Files |
| `relation` | foreign key column + constraint | Linked record | Connect boards |

**Every exporter surfaces "no clean equivalent" instead of silently
downgrading.** `attachment` → SQL and `person` → SQL are the two real gaps
in that table; the SQL exporter emits the best fallback (a plain text/URL
column) *and* a visible warning line in the export output ("`attachment`
columns become a text column holding a file path/URL — SQL has no native
file type"), not a silent substitution. This mirrors the app's existing
stance on honest gaps — see how `computeGaps()` reports "recorded nowhere"
as its own finding rather than hiding it
([smartflow-feature-plan.md §1.3](./smartflow-feature-plan.md#L64)).

**`multi-select` → SQL needs a real decision, not a shortcut.** A
multi-value field has no single-column SQL equivalent — the correct
relational answer is a join table (`table_id`, `option_id`), not a
comma-packed string in one column (that's the classic normalization
mistake this whole tool exists to help avoid). The SQL exporter should emit
the join table automatically when a `multi-select` column is present,
named `{table}_{column}` — e.g. a `products` table with a `multi-select`
`tags` column emits a `products_tags` join table. This is more DDL than the
column count suggests, and the export output should say so plainly (a
one-line note: "`tags` produced an extra join table: `products_tags`") so
it's never a surprise.

**Export formats, in build-order priority:**
1. **CSV per table** (matches the existing `flowCsvExport.ts` pattern
   already shipped for swimlane's register — same `triggerDownload()`
   helper, no new dependency) — the fastest path to "paste this into a
   Monday board" or "import this into Airtable," since both accept CSV
   import directly.
2. **SQL DDL** (`CREATE TABLE` statements + foreign key constraints + any
   join tables from multi-select) — a plain-text export, no new dependency,
   matching `flowExport.ts`'s existing plain-string approach.
3. **Airtable field-type mapping as a readable spec**, not a live API push —
   a table of "table → field → Airtable type" for you to build the base
   from by hand, or hand to whoever does. A live Airtable API integration
   (creating the base directly) is out of scope for a first version — new
   auth, new failure modes, and not what's actually blocking you today. If
   this becomes a real recurring need, worth its own scoping pass later.
4. **Monday column-type mapping**, same shape as Airtable's — a readable
   spec, not a live board-creation call, for the same reason. (Also: you
   already have the `monday.com` MCP connector available in this
   environment for *ad hoc* board creation — a "push this schema straight
   to Monday" button is a plausible fast-follow once the exporter's mapping
   table is trusted, but that's a deliberate later step, not bundled into
   the first build.)

---

## 5. Field alignment mode — the part that's actually due today

This is the half of the feature solving your real, immediate problem: three
briefs (two product-order, one client-onboarding), each naming fields in
its own words, and no shared view of what's actually the same field twice
versus what's genuinely different.

**Flow, end to end:**
1. **Import each brief as a `SchemaSource`.** Paste raw text per brief (name
   it "Product order — Brief A," etc.) — no file-upload parsing in v1, just
   a textarea per source, matching the app's existing "paste text, we parse
   it" pattern already used for outline import
   ([outlineImport.ts](../src/components/smartflow/outlineImport.ts)).
2. **Parse pasted text into `SourceField[]`, one field per line.** Same
   naive-but-honest parsing style as `outlineTextToDoc()` — split on
   newlines, treat each non-empty line as one field label, no attempt to
   guess a type from the text (that guess is exactly the kind of inference
   the app's existing rule already forbids — see
   [smartflow-feature-plan.md §1.1](./smartflow-feature-plan.md#L53), "nothing
   is ever inferred"). A field's type gets assigned by you, explicitly, once
   it's placed on the schema — parsing only ever extracts names.
3. **Alignment grid.** One row per *distinct concept*, one column per
   source brief, showing what that brief called it (or blank, if that brief
   never mentioned it). This is the actual "lay them side by side" view —
   built as a plain Ant `Table` (the one UI shape confirmed genuinely absent
   from the app today, per the earlier survey — first real use of `Table`
   in this codebase). Rows start one-per-source-field (nothing merged yet);
   merging two rows together (because "Client Name" and "Customer" are the
   same concept) is an explicit drag-together or "merge" action — never
   auto-matched by fuzzy string similarity. Auto-matching field names by
   similarity is a tempting shortcut but a real risk: two fields that merely
   *sound* alike ("Order Date" vs. "Order Due Date") are exactly the pair a
   fuzzy match gets wrong, silently, in a client-facing deliverable. This
   follows the same explicit-action rule the rest of the app already holds
   to. A cheap, honest assist that stays inside that rule: sort or
   highlight rows by string-similarity score so likely matches surface near
   each other for you to confirm — a sort order is not a merge, so nothing
   moves until you say so.
4. **Promote a merged row to a schema column.** Once a row represents one
   settled concept (merged across however many briefs named it), an
   explicit action turns it into a `SchemaColumn` on whichever `SchemaTable`
   you assign it to, carrying `sourceRefs` back to every `SourceField` it
   came from — so the schema canvas and the alignment grid are two views of
   the *same* underlying decision, not a one-way export that goes stale the
   moment a brief changes.
5. **Unresolved rows stay visible, not hidden.** A source field nobody has
   promoted yet (not merged, not assigned to a table) stays listed as
   "unplaced" — the direct schema-mode equivalent of swimlane's inbox for
   unplaced steps. This is the same "surface the gap, don't hide it" stance
   as `computeGaps()`'s "recorded nowhere" list.

**What this mode is not, on purpose.** Not a two-way sync with the original
brief documents (briefs live wherever they live — Google Docs, Monday
itself, a PDF; this tool reads them once, on paste). Not automatic type
inference from field names (a field literally named "Date Ordered" still
gets its type set by you, not guessed — consistent with the whole app's
"nothing inferred" rule, and cheap insurance against a wrong guess landing
in a client board unnoticed).

---

## 6. Visual design — a deliberate break from the existing look, not a reskin

Per Ruthnie's standing visual-design rule and her explicit note this should
not mirror the current swimlane look: this needs its own considered layout,
not lane-cards recolored. Grounded against a real DrawDB screenshot
(Ruthnie, 2026-09-03) rather than a description of one — concretely, what
to take from it and what to deliberately leave behind:

**Table card — take the layout, drop the SQL vocabulary.**
- Solid colored header strip per table (one accent color, auto-cycled from
  a small fixed palette, matching the existing per-lane color convention
  the schema map already uses) — table name in bold, dark text on a light/
  white card body, **not** colored text on the colored strip.
- One row per column: name left-aligned, **type right-aligned in muted
  gray caps** — that alignment is what makes the DrawDB reference read as a
  scannable data grid instead of a text list, and it's a small, free thing
  to copy exactly. Tight fixed row height, thin 1px row dividers, rounded
  card corners, a subtle shadow lifting the card off the dotted canvas
  background.
- **Where this deliberately diverges from the reference:** DrawDB's type
  column shows literal SQL types (`VARCHAR`, `INT`, `ENUM`, `TIMESTAMP`) —
  that's the one thing not to copy. Ours shows the canonical human-readable
  `ColumnType` label (`Text`, `Number`, `Select`, `Date`, …) in that same
  right-aligned gray-caps slot. Same visual treatment, target-agnostic
  vocabulary — this is the concrete difference between "SQL diagram tool"
  and "relational-database-generic tool," and it has to hold on the card
  face, not just in the data model.
- A small leading glyph before a column name (DrawDB uses a bullet dot,
  seemingly for "this column touches a relationship") — worth reusing as a
  key glyph specifically for PK/FK instead of every row, so it carries real
  meaning (primary/foreign key) rather than being decorative on every line.

**Relationship lines — badges instead of true crow's-foot glyphs, and
orthogonal routing instead of our existing beziers.**
- DrawDB actually simplifies traditional crow's-foot notation into plain
  `1` / `n` circular badges sitting on the line at each end, rather than
  drawing real fork/tick crow's-foot marks. Adopting that badge exactly
  resolves the open question this doc originally flagged (§9, "crow's-foot
  rendering complexity") — a filled circle + a character in SVG is cheap to
  draw and, if anything, more legible to a non-DBA reader than the
  traditional symbol, which fits this tool's actual audience better than
  textbook ERD notation would.
- Lines route orthogonally (right-angle elbow joints) rather than the
  smooth beziers the existing swimlane schema map uses. This is the biggest
  single visual differentiator between the two canvases and is worth
  keeping deliberately distinct: a schema relationship is a structural
  constraint, a swimlane handoff is a process event, and they should not
  look like the same kind of line.
- No presence cursors, no multiplayer-editing chrome (DrawDB's colored
  name-tag pins) — that's solving a different, collaborative-editing
  problem this single-user tool doesn't have.

**The alignment grid** (§5) should look like a real comparison
tool — column-per-source, sticky first column for the concept name, clear
visual state for merged/unresolved rows — not a generic Ant Table default.
No external reference gathered for this one yet; worth a real layout pass
once it's in front of you.

**Shared type palette.** Type badges (canvas card, alignment grid, export
preview) get one small fixed color-per-`ColumnType` palette, decided once
up front and reused everywhere rather than three inconsistent ad hoc
choices per surface.

---

## 7. Build order

**Phase 1 — schema canvas, authoring only, no alignment mode yet.**
1. `DiagramType` gains `"schema"` (`diagramTypes.ts`), with chooser copy
   answering "I want to design a database or a set of fields for a board or
   spreadsheet."
2. New `schema/types.ts` (§2) — `SchemaDoc`, `SchemaTable`, `SchemaColumn`,
   `Relationship`. `Flow.content` becomes `SmartFlowDoc | SchemaDoc`,
   narrowed by `Flow.type === "schema"` at load/save (mirrors exactly how
   `Flow.type` already discriminates layout function per outline type
   today).
3. Fork `schemamap/` into `schema/canvas/` (§3): table cards with an
   editable column list (add/remove/reorder column, set name/type/PK/
   required/unique inline), drag-to-connect between column handles to
   create a `Relationship`, pick its kind from a small picker on the line.
4. `FlowPage.tsx` render branch for `type === "schema"`: no Build/Diagram/
   Charts/Map segmented tabs (those are outline-type concepts) — just the
   canvas, full width, the way Map is the swimlane-only surface today.
5. CSV export (§4.1) — reuses the existing `flowCsvExport.ts` pattern,
   one file per table (or one combined file with a table-name column, a
   real UX call to make once it's in front of you).

**Phase 2 — SQL + target-mapping exports.**
6. SQL DDL exporter (§4, incl. multi-select join-table generation).
7. Airtable and Monday mapping-spec exporters (§4) — readable output, not
   live API calls.

**Phase 3 — field alignment mode.**
8. `SchemaSource`/`SourceField` added to `schema/types.ts`; paste-parse
   pipeline mirroring `outlineImport.ts`'s pattern.
9. Alignment grid UI (§5) — first real use of Ant `Table` in this app.
10. Merge/promote actions wiring a settled row into a `SchemaColumn` with
    `sourceRefs`.
11. "Unplaced" list for source fields not yet merged or promoted.

**Why alignment mode is Phase 3, not Phase 1, despite being today's actual
need.** The alignment grid's whole purpose is to *produce* schema columns —
it has nothing to promote a row *into* until Phase 1's `SchemaTable`/
`SchemaColumn` model and canvas exist. Building the grid first would mean
either a throwaway placeholder target or building the schema model twice.
**For today's meeting specifically**, Phase 1 alone plus a plain side-by-
side read of the three briefs (no tooling, just eyes) is the honest
fallback — see §8.

---

## 8. For today's meeting, before any of this is built

Three briefs to reconcile (two product-order, one client-onboarding) and a
meeting today — this doc is Phase-1-not-started, so nothing here exists
yet to lean on. Two honest options, not a third pretending this can be
built and verified in the next hour:

- **Read the three briefs side by side by hand** (three windows/tabs, or
  print them) and note field overlaps on paper/in a scratch doc — slower
  than the tool this doc describes, but zero risk, and it's exactly the
  same reconciliation judgment call the tool automates later (nothing the
  tool would tell you today that a careful read won't).
- **If there's build time before the meeting**, Phase 1 steps 1–3 (schema
  type + model + a minimal canvas with editable table/column list, no
  relationships or export yet) gets you a place to *write down* the
  reconciled fields as you go, even without the alignment grid doing the
  comparison for you — genuinely useful today only if there's a real hour
  or two before the meeting, not a corner-cut version of the whole plan.

---

## 9. Open questions

- **CSV export shape for multi-table schemas (§4, §7 step 5):** one CSV per
  table (a zip, needing a new small dependency or browser zip approach) or
  one combined CSV with a table-name column (simpler, no new dependency,
  but less directly "one sheet = one Monday board" mapped). Leaning toward
  combined-with-table-column for v1 since it needs nothing new — worth
  confirming once real briefs are in front of it.
- ~~Relationship kind on the canvas — crow's-foot rendering complexity.~~
  **Resolved 2026-09-03** against a real DrawDB screenshot: use plain `1`/`n`
  circular badges on the line ends, not true crow's-foot fork glyphs — see
  §6. Cheaper to draw (a circle + character in SVG) than real crow's-foot
  marks, so the fallback this question originally worried about is now the
  actual plan, not a fallback.
- **Where "table" naming collides with Monday/Airtable's own vocabulary.**
  Monday calls its top-level container a "board," Airtable a "table" inside
  a "base." This doc uses `SchemaTable` as the canonical internal name
  throughout (matching SQL's term, since it's the most neutral of the
  three) — the exporters are what's responsible for relabeling it per
  target, not the internal model. Flagged so a future reader doesn't
  wonder why the model says "table" when the export target says "board."
- **Live Monday/Airtable API push (§4, item 3–4 fast-follow).** Deferred by
  design in this doc's Phase 2 — worth a real scoping pass once the mapping
  tables have been used and trusted a few times, not built speculatively
  ahead of that.

---

## 10. Progress — 2026-09-03 build session

**Phase 1 steps 1–3 shipped and verified live (Playwright), not just
typechecked.** Built the same session the plan above was written, in one
continuous pass, with real bugs caught and fixed via actual browser
verification rather than assumed from code review alone.

**Schema type + model (step 1–2 of §7):**
- `DiagramType` gained `"schema"` ([diagramTypes.ts](../src/components/smartflow/diagramTypes.ts)),
  with chooser copy. `Flow.content` is now `SmartFlowDoc | SchemaDoc`
  ([db/types.ts](../src/db/types.ts)) — a real discriminated union, not a
  graft onto `SmartFlowDoc`, exactly as scoped in §1–2.
- New `schema/types.ts`: `SchemaDoc`, `SchemaTable`, `SchemaColumn`,
  `Relationship`, `SchemaSource`/`SourceField` (Phase 3 shapes modeled now
  so Phase 1 doesn't need a breaking change later, per the original plan).
- New `schema/store.ts`: one reducer mirroring `../store.ts`'s shape
  exactly (dropEmpty convention, one action per mutation).
- `SchemaFlowPage.tsx` — a schema flow's own page, deliberately **not** a
  fifth branch inside `FlowPage.tsx`. A schema flow's content is a
  `SchemaDoc`, not a `SmartFlowDoc`; routing it through `FlowPage`'s
  existing `useReducer(reducer, emptyDoc)` risked a schema doc reaching the
  wrong reducer if the two paths ever brushed against each other. A
  separate component makes that impossible instead of merely unlikely.
  `FlowPage.tsx` now early-returns to it before any `SmartFlowDoc`-shaped
  code runs, and its own load effect casts `f.content` only after
  confirming `f.type !== "schema"` at runtime.
- Real fallout from widening `Flow.content` to a union, all fixed: `OutlineBuilder.tsx`'s
  `Exclude<DiagramType, "swimlane">` needed `| "schema"` added too (its
  `PLACEHOLDERS`/`HELP` records are keyed by outline type and don't apply to
  schema); `flowExport.ts`'s export-file type widened to accept either doc
  shape (import/parsing for schema docs is still out of scope — untouched,
  correctly rejected by the existing `isLikelySmartFlowDoc` check).
- One pre-existing, unrelated typecheck error in `outlineImport.ts:147`
  ("Variable 'items' is used before being assigned") was found during
  verification and confirmed via `git log`/`git stash` to predate this
  session — not touched, flagged to Ruthnie rather than fixed silently
  since it's a different file and a different feature.

**Canvas (step 3 of §7):**
- New `schema/canvas/` — `model.ts` (pure geometry, ported from
  `schemamap/model.ts`'s pattern), `paths.ts` (orthogonal elbow routing
  instead of the schema map's beziers, per §6), `SchemaCanvas.tsx` (the
  pan/zoom/drag pointer engine forked from `SchemaMapView.tsx`, with wholly
  new table-card and relationship rendering).
- Table cards: colored header strip, tight typed-column rows with
  right-aligned muted-gray type label — the DrawDB-informed look from §6,
  confirmed against a real screenshot Ruthnie provided mid-session, not
  guessed from a text description.
- Relationships: drag from one column's connector dot to another's draws a
  line with `1`/`n` circular badges (not true crow's-foot glyphs, per §6's
  resolved open question) and a hover-to-delete control.
- `@dnd-kit` was evaluated and correctly NOT used for canvas positioning —
  confirmed by reading `SchemaMapView.tsx` directly that the existing app
  never uses it for free 2D drag, only for sortable lists (Build mode's
  lane columns). Column reordering inside a table (a genuine sortable-list
  problem) is the one place `@dnd-kit` would fit — not yet built.
- Kebab menu with "Rename" added to the table header (Ruthnie's request,
  mid-session) as a more discoverable, more robust alternative to
  double-click — both now work side by side.

**Four real bugs found via live Playwright verification, not code review,
all fixed:**
1. **"Add column" stopped responding after the first column existed.** Root
   cause: `model.ts`'s card-height formula only budgeted space for column
   rows, not the trailing "Add column" control, so the card's fixed CSS
   height (with `overflow: hidden`) clipped the button the moment any
   column existed. Only worked pre-fix on a brand-new empty table because
   the height floor happened to leave exactly one row's worth of slack.
2. **Table header double-click didn't open the rename input.** Root cause:
   `onPointerDown`'s drag-start logic called `setPointerCapture` on the
   frame unconditionally for any click inside `[data-card-header]`, which
   steals the second click of a double-click before the browser can
   register it. Fixed by exempting the editable name span (and, once added,
   the kebab button) via a `data-card-name`/`data-no-drag` marker checked
   before the capture logic runs.
3. **Type dropdown opened but selecting an item never changed anything** —
   this was also the reported "Connect boards doesn't do anything" bug,
   which turned out to be the same root cause, not a missing feature.
   Diagnosed by instrumenting raw DOM events: `pointerdown`/`mousedown`
   reached the antd Dropdown's portaled menu item correctly, but
   `pointerup`/`click` never did. Cause: React's synthetic event system
   bubbles a portaled overlay's events along the **React tree**, not the
   DOM tree, so a click on the portal (rendered to `document.body`) still
   reached the canvas frame's `onPointerDown` handler. That handler's
   `target.closest(...)` checks operate on the real DOM and found none of
   the frame's own markers, so it fell into the "background pan" branch and
   called `setPointerCapture`, stealing the menu item's own click. Fixed
   with a `frameRef.current.contains(target)` guard at the top of
   `onPointerDown` — real DOM containment, not React-tree bubbling — so any
   portaled overlay's events pass through untouched.
4. **Column rename via double-click inserted text into the old name instead
   of replacing it** ("New columncustomer_id"). Root cause: antd's `Input
   autoFocus` focuses but doesn't select the field's text, so a
   double-click-to-rename convention needs an explicit `onFocus={(e) =>
   e.currentTarget.select()}` to make the first keystroke replace rather
   than insert. Fixed on both the column-name input and the table-name
   input.

**"Building for" target + capability notes (reversal from the original
§4.0 draft, corrected in conversation, 2026-09-03):**
- The plan originally argued against a target-mode picker on the grounds
  that every canonical type maps one-to-one across targets, so target is
  cosmetic. Ruthnie pushed back with sourced detail (Monday's Mirror column
  vs. Airtable's Lookup: same concept, genuinely different capabilities —
  no grouping, limited filter/sort, historically unreliable in formulas)
  and was right — modeling that as pure label sugar would hide a real
  capability gap until it was too late to matter cheaply. See the corrected
  §4.0/§4.0.1 above.
- `SchemaDoc.buildingFor?: "sql" | "airtable" | "monday"` added — schema-doc
  level, not per-column, set via a `Select` in the canvas toolbar
  ("Building for: Undecided/Monday/Airtable/SQL"). `SET_BUILDING_FOR`
  reducer action.
- `TARGET_LABEL` and `CAPABILITY_NOTE` maps added to `schema/types.ts`,
  keyed by canonical type × target. Surfaced **live, at the moment of
  picking a type** — every entry in the type dropdown shows the target's
  own name (`Number → Numbers`) when it differs from the neutral label, and
  a warning glyph with a tooltip when a capability note exists for that
  pairing. The currently-selected type's badge also shows the same warning
  glyph inline on the row. Explicitly never backloaded to an export-time
  report — Ruthnie was specific that discovering a capability gap only
  after building ten columns "thinking this is gonna work" is the exact
  failure mode to avoid.
- `relation`'s neutral label changed from "Connect boards" (Monday's own
  term, which the tool briefly defaulted to) to **"Relation"** — Ruthnie's
  explicit correction: the neutral vocabulary should stay neutral even
  though the known target is Monday, precisely so the tool doesn't read as
  Monday-flavored by default.
- Added three new canonical types: `formula`, `rollup`, `lookup` — sourced
  from Ruthnie's Airtable/Monday comparison, not guessed. `rollup`/`lookup`
  carry a `RollupSource` (`relationshipId`, `sourceColumnId`, optional
  `aggregate`) modeled but not yet wired to a picker UI (a column can be set
  to type Rollup/Lookup today; choosing *which* relationship and field it
  pulls from is not yet built — flagged below).
- Board-vs-table modeling assistant (merge-suggestion for thin/low-
  cardinality tables into wider Monday boards) — considered, **explicitly
  rejected by Ruthnie**: "I think we should leave that up to the user."
  `SchemaTable` stays a plain one-table/one-board unit, permanently, not
  just for this phase.

**Select/multi-select options editor:**
- `ColumnOptionsEditor` — a small anchored popover (not a modal, to stay
  fast to open/close while building out a table), opened via an edit-icon
  button that appears next to a column's name only when its type is
  `select` or `multi-select`. Add/rename/remove options, backed by the
  already-modeled `SET_COLUMN_OPTIONS` action.

**Verified together, live, end to end:** created a schema flow, added two
tables, renamed both (kebab menu AND double-click, both paths), added
multiple columns in sequence to one table, changed a column's type via the
dropdown, set "Building for" to Monday and confirmed the capability-note
glyphs appeared correctly on Relation/Rollup/Lookup, opened the options
editor on a Status column and added two options. Zero browser console
errors across the whole session.

**Not done — open, in priority order:**
1. **Rollup/lookup source picker.** A column typed Rollup or Lookup has
   nowhere yet to say which relationship + which far-side column it pulls
   from. The `RollupSource` shape exists; the UI (almost certainly: pick a
   relationship this table is party to, then pick a column on the other
   end) does not.
2. **Column reordering via drag** — the one place `@dnd-kit/sortable` was
   identified as the right tool (§3) — not built. Columns currently only
   reorder via the `REORDER_COLUMNS` action, which nothing calls yet.
3. **Primary/foreign key flags have no UI toggle yet** — `primaryKey`,
   `required`, `unique` all exist on `SchemaColumn` and `SET_COLUMN_FLAGS`
   exists in the reducer, but nothing in the canvas exposes them. The `Key`
   glyph in `ColumnRowView` only ever renders if `primaryKey` is
   already true, which nothing currently sets.
4. **Default value and column note fields** — `defaultValue`/`note` exist on
   the model and have reducer actions, no UI yet.
5. **Phase 2 (SQL/Airtable/Monday exporters)** — not started, per the
   original build order. The capability-note infrastructure built this
   session (§4.0) is a live-building-time aid, not an exporter; the actual
   CSV/SQL DDL/mapping-spec exporters described in §4/§7 remain unbuilt.
6. **Phase 3 (field alignment mode)** — not started, per the original build
   order. This is the piece that most directly serves Ruthnie's stated
   near-term need (reconciling the three onboarding/product-order briefs);
   not reached this session because Phase 1's canvas had to exist first
   (§7 explains why alignment mode is sequenced last despite being the
   most urgent real need).

### 2026-09-03 (same day, second pass) — four bugs found while Ruthnie was building a real onboarding table, all fixed

Found and fixed while Ruthnie actively used the tool to build a
"Company & Legal Identity" table — a much better bug-surfacing method than
the earlier Playwright pass alone, since real usage hits sequences a
scripted test doesn't think to try.

1. **Select/multi-select options popover rendered invisible after the
   "make it a real editor" pass, not before.** Root cause: the popover was
   a hand-rolled `position: absolute` div anchored via `left: 100%` on the
   row, but `.sf-schema-card` has `overflow: hidden` (needed to contain the
   "Add column" row and keep the card's rounded corners clean) — the
   popover rendered in the DOM with a correct bounding box but was clipped
   by its own ancestor before it could be seen. Ruthnie's screenshot from
   *before* this session's CSS tweak showed the same underlying conflict
   manifesting differently (an awkward overlap rather than invisible).
   **Fixed by switching to antd's `Popover`** (wrapping the trigger button,
   content unchanged) instead of a hand-rolled positioned div — `Popover`
   portals to `document.body` exactly like the `Dropdown`s already used
   elsewhere in this file, which escapes the card's clip entirely. The
   `ColumnOptionsEditor` component itself needed no logic changes, only its
   outer wrapper's CSS class swapped from an absolutely-positioned one to a
   plain content class.
2. **Dragging a table by its header stopped working.** Root cause: the
   `data-card-name` exemption added earlier (to let double-click-to-rename
   reach the name span without pointer-capture stealing it) meant clicking
   anywhere on or near the name text no longer started a drag — which in
   practice is most of the visible header, so it read as "the header just
   doesn't grab anymore." Ruthnie's fix request (drop double-click, keep
   only the kebab menu) resolved this directly: removed `onDoubleClick`
   from the name span, removed the `data-card-name` marker and its
   exemption from `onPointerDown` entirely, leaving only the more targeted
   `data-no-drag` marker on actual interactive controls (kebab button,
   delete button, rename input). The header now grabs everywhere except
   those specific controls, matching the schema map's original interaction
   model this canvas was forked from.
3. **A target-specific label change ("Relation" → Airtable's "Linked
   record") was hidden inside a tooltip instead of replacing the visible
   text.** Ruthnie's correction: once "Building for" is set, the badge
   itself should read the target's own name, not the neutral label with a
   tooltip explaining the difference — a tooltip is a hidden affordance,
   and the whole point of setting a target upfront is that it should
   visibly change what you're looking at. Fixed: the type badge now shows
   `targetLabel(...) ?? columnTypeLabel(...)` as its primary text, with the
   neutral label surviving only as a hover title when it differs from the
   target name. The type picker's menu items are unaffected — they still
   show the neutral label plus a `→ target name` hint, since that's the one
   place showing the mapping itself is the point.

**Not done, raised but not resolved this pass:**
- **Two-column layout for the type dropdown menu** — Ruthnie raised it,
  then talked herself out of certainty ("I don't know, maybe not") mid-
  message. Left as a genuine open question, not a rejected idea — worth
  trying once real usage shows the single-column list feels too long, not
  speculatively now.
- **Type icons on the left of each row** — Ruthnie mentioned wanting to
  style this "later," explicitly deferred by her, not attempted this
  session.

### 2026-09-03 (third pass) — a real modeling error caught by real usage, plus the truncation fix

**"Card width is fixed, columns truncate long names" — reversed from
"maybe fine" to a real fix.** The second pass logged this as flagged-but-
not-requested; a follow-up screenshot of Ruthnie's actual "Accounts" table
(fields like "Federal Tax ID / EIN", "D-U-N-S Number") showed it was
genuinely bad, not a maybe — every field name truncated hard, and once a
target's own label ("Single line text," "Multiple select") is longer than
the neutral one, the type text was crowding the name out further. Two
fixes: `CARD_WIDTH` 260→340 ([canvas/model.ts](../src/components/smartflow/schema/canvas/model.ts))
with the grid column count adjusted 4→3 to match; and a real flexbox bug in
`.sf-schema-row-name` — it had `flex: 1` but no `min-width: 0`, which in
CSS flexbox means a flex item won't shrink below its own content's natural
width, so it was losing the available-space fight to `.sf-schema-row-type`
(`flex-shrink: 0`) far more than it needed to. Fixed by adding
`min-width: 0` to the name and giving the type label its own bounded
`max-width: 110px` + truncation, so a long target-specific label truncates
itself instead of stealing space from the field name — the name is what a
builder actually needs to read in full.

**A real SQL-mapping modeling error, caught by Ruthnie building a real
table, not by review.** Two things were wrong, not just imprecise:
- `select` was mapped to `"varchar + CHECK, or a lookup table"` as its SQL
  equivalent. Postgres and MySQL both have a native `ENUM` type — that's
  the actual right default, not a workaround. Fixed: `select` → SQL is now
  `ENUM`, with a new capability note explaining the varchar+CHECK fallback
  exists for portability-sensitive cases (older MySQL, cross-engine
  projects), not as the primary answer.
- `multi-select` was mapped to `"join table"`, with a capability note
  claiming the SQL exporter would generate one. **This conflated two
  genuinely different things**: a multi-select COLUMN (many values in one
  field on one row) and a many-to-many RELATIONSHIP (two tables linked
  through a bridge table) — already modeled correctly and separately via
  `Relationship.kind`. A join table is not "the SQL translation of
  multi-select"; it's what a many-to-many relationship needs, and
  multi-select never implied a relationship at all. Fixed: `multi-select` →
  SQL is now `text[]` (or `ENUM[]` if the values are a fixed set), with the
  capability note now saying plainly that no separate table is implied,
  and pointing at a Relation column (many-to-many kind) as the right tool
  if the actual intent was a link to another entity's rows, not a
  multi-value field. This is the kind of error the capability-note
  infrastructure exists to prevent from reaching an actual export later —
  worth being honest that it shipped wrong in the first pass and needed a
  real user building a real table to surface it, not a self-review.

### 2026-09-03 (fourth pass) — remaining Phase 1 items closed; a second SQL correction; a pre-existing app-wide export bug found and fixed

**Priority set by Ruthnie for this pass:** JSON export/import first (she has
real work in local dev and wanted it extractable before going further),
then PK/required/unique toggles, then rollup/lookup source picker, then an
explicit relation target picker (table + column, not just drag), with
column drag-reordering explicitly deprioritized to the bottom on her own
reasoning ("when I'm writing SQL I don't care about column order... you can
always reorder it").

**A second real SQL-mapping correction, same session Ruthnie caught the
join-table error:**
- `text`'s SQL label was `varchar` — corrected to `text`. Modern Postgres
  guidance (and Supabase specifically) is to default to `text` and add a
  `CHECK (length(x) <= n)` only when a real length constraint is needed;
  `varchar(n)` is legacy-flavored advice that doesn't reflect current best
  practice on the exact database this schema designer is most likely
  feeding.
- New canonical type: **`rich_text`**, distinct from `text`. Prompted by
  Ruthnie noticing Airtable's "Long text" (formatted/rich content) isn't
  the same concept as "Single line text," and that neither is well-served
  by a bare SQL `text` column without saying so. Maps to `text` on SQL by
  default (formatting stored as embedded markup) with a capability note
  that `jsonb` is the better fit only for genuinely structured rich content
  (a Slate/ProseMirror document tree), not just formatted prose — a real
  distinction, not a coin flip, so both options are named rather than
  picking one silently.
- **`TARGET_LABEL` trimmed** — Ruthnie flagged `Number → Numbers` as noise
  ("that doesn't seem like a change that needs to happen... negligible").
  Correct call: a plural/capitalization difference isn't information a
  builder needs surfaced on every row. Removed every target-label entry
  that was only a cosmetic spelling difference (Number, Boolean, Date,
  Money, Attachment on Monday/Airtable); kept only genuinely different
  words (Relation→Connect boards/Linked record, Rollup/Lookup→Mirror,
  Person→People/Collaborator, text/rich_text's SQL labels).

**A pre-existing, app-wide bug found while building schema export, not
introduced by this feature:** `handleExport` in both the new
`SchemaFlowPage.tsx` and the original `FlowPage.tsx` serialized `flow`
(React state, updated only on load/rename) instead of `doc` (the live
reducer state, autosaved to IndexedDB but never copied back into `flow`).
Exporting a flow — any flow, of any type, including swimlanes and
flowcharts that predate this session — silently downloaded whatever the
doc looked like at page load, discarding every edit made since. Caught only
because a Playwright round-trip test (export, then re-import) came back
with an empty `tables: []` array despite a table clearly existing on
screen. Fixed in both files: `serializeFlowExport({ ...flow, content: doc })`
instead of `serializeFlowExport(flow)`. Flagged explicitly as pre-existing
and app-wide, not schema-specific, since it means every prior SmartFlow
export (any type) before this fix landed was liable to the same silent
data loss.

**Shipped this pass:**
- **JSON export/import**, verified via a real export→re-import round trip
  (Playwright): table name and column count both survived intact.
  `flowExport.ts`'s `parseFlowImport`/`isLikelySchemaDoc` now recognize a
  schema doc's shape (`tables`/`relationships` arrays) alongside the
  existing `lanes`/`items` check for process diagrams — the same envelope,
  discriminated by shape, not blindly trusted from the file's own `type`
  field (a hand-edited or mismatched file fails cleanly rather than
  importing the wrong doc shape into the wrong reducer). `SchemaFlowPage`'s
  kebab menu already had an "Export" entry pointed at the shared
  `flowExport.ts` pipeline — no new UI needed, only the parser's shape
  recognition and the stale-`flow.content` bug above.
- **PK/required/unique toggles.** A checkable `Dropdown` menu behind the
  column's key glyph (now a real button, `sf-schema-row-flags-btn`) — three
  independent toggles (not a radio group; a column can be any combination),
  wired to the already-existing `SET_COLUMN_FLAGS` action. The key glyph
  itself now shows gold only once actually set (`is-set` class), muted grey
  otherwise, so the trigger doesn't read as "already a key" on every
  untouched row.
- **Rollup/lookup source picker** (`RollupSourceEditor`) — a `Popover`
  (same escape-the-card's-`overflow:hidden` pattern as the options editor)
  offering: which relationship this table is a party to (only relevant
  ones listed, empty state says plainly "drag a connector first" when none
  exist), then which column on the relationship's far side, then — Rollup
  only — which aggregate (sum/count/avg/min/max). Wired to the already-
  modeled `RollupSource` shape and the new `SET_COLUMN_ROLLUP_SOURCE`
  reducer action (added this pass).
- **Explicit relation target picker** (`RelationTargetEditor`) — Ruthnie's
  direct ask: "we can't really say relation to what table on what field."
  A `Popover` with a table `Select`, then a column `Select` scoped to that
  table, then (once a relationship exists) a relationship-kind `Select`.
  Deliberately **updates the column's existing relationship rather than
  creating a second one** if you change the target after first setting
  it — a relation column has at most one relationship of its own, checked
  by finding any relationship where this column is on either end before
  dispatching. This is a genuine alternative to the drag-a-connector-dot
  gesture, not a replacement for it — both paths write the same
  `Relationship` record via the same `ADD_RELATIONSHIP` action.
- `SchemaCanvas.tsx`'s prop-drilling extended: `doc.tables` and
  `doc.relationships` now flow down through `TableCardView` into
  `ColumnRowView`, since both new pickers need to see the whole schema
  (every table's columns, every relationship), not just their own column.

**Verified live (Playwright), not just typechecked:** export→re-import
round trip preserving table/column data; PK toggle turning the key glyph
gold; the rollup/lookup picker's relationship and column selects
populating correctly; the relation picker creating a real `Relationship`
row confirmed by reading it directly out of IndexedDB (not just counting
DOM elements, which gave a misleading count due to an idle `DraftLine`
`<svg>` staying in the DOM — a test-script artifact, not an app bug, worth
noting so a future verification pass doesn't chase the same red herring).

**Column drag-reordering: deliberately not built, per Ruthnie's own
reasoning this pass, not just deprioritized.** She made the substantive
case herself — SQL doesn't care about column order at authoring time, and
reordering is trivial to do later regardless — so this isn't merely
"bottom of the queue," it's "genuinely low-value for how this tool is
actually used." Still technically buildable later if a real need
surfaces, but not treated as an open Phase 1 item going forward.

**Remaining, not done this pass:** default value and column note fields
still have no UI (model + reducer actions exist, from the original Phase 1
scope). Phase 2's actual exporters (CSV, SQL DDL text, Airtable/Monday
mapping-spec documents) are next — the capability-note infrastructure
built two passes ago tells you things live while building; it does not yet
produce a file you can hand to Postgres or paste into a board. Phase 3
(field alignment) remains fully unscoped for a build session — Ruthnie
asked what it consists of this pass and got a plain-language answer, not a
commitment to build it next.
