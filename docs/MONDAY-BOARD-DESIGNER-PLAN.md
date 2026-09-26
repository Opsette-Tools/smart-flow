# Monday board designer — planning doc

**Written 2026-09-25.** A seventh `DiagramType`, `"monday"`, built alongside
the existing Schema Designer rather than inside it.

> **Status: BUILT 2026-09-26.** §7 steps 1–7 are complete and the designer
> is live. **See §9 for what shipped, five deliberate departures from this
> plan, and what is next** — in particular §9.3, which records that §5.5's
> subitem note was cut rather than shipped. Read §9 before acting on any
> earlier section; where the two disagree, §9 is what exists.

**What this is for.** The Schema Designer is the tool for planning an
Airtable base or a SQL database — design the schema, review it, hand it over,
instead of mocking it up live in the product itself. This is the same thing
for Monday: a board blueprint you can build, show, and revise before anyone
touches a real workspace. It is a reusable engagement tool, not a one-off.

---

## 1. Why this is a separate designer, not a Monday mode on the Schema Designer

The Schema Designer models one unit: a `SchemaTable` — a flat list of typed
columns — plus `Relationship` lines drawn column-to-column. Picking
`buildingFor: "monday"` today changes **labels only**: `targetLabel()`
renames "Relation" to "Connect boards" and `capabilityNote()` attaches a
sentence about Mirror limitations. The structure underneath is identical for
all three targets.

**That is honest for SQL and Airtable, and wrong for Monday.** Airtable
genuinely *is* a relational store with a friendlier surface — base → tables →
linked records is a real foreign-key graph, so a flat table of typed columns
models it faithfully. Monday is not shaped that way:

- **Group** is a first-class structural container with no analog in SQL or
  Airtable. It is not a column value; it holds items, and in practice it
  usually carries pipeline stage.
- **Subitem** rows carry **their own separate column set**, not the parent's.
  One board therefore holds two schemas.
- Monday nests **exactly one level** — subitems, never sub-subitems.
- **Connect Boards** is not a foreign key: no cascade delete, no uniqueness,
  no referential integrity.
- **Mirror** is not a lookup that can reach anywhere — it travels exactly one
  hop, down a Connect column that already exists.

Forcing one model to serve both means either Monday's groups and subitem
column sets become optional fields SQL mode ignores (junk in the model), or
SQL tables grow a fake "group" concept. Per the standing rule — take the
durable path even when it means building the second thing properly — this is
**a separate doc type sharing only the column-type vocabulary.**

### 1.1 Conversion between the two is out of scope

Corollary of the above. SQL ↔ Airtable field-correspondence makes sense
because they are the same shape. Monday is not, so a Monday ↔ SQL converter
would be inventing correspondences that do not exist. **No conversion in
either direction for v1.**

One direction was floated and deliberately left unbuilt: SQL/Airtable →
Monday as a *starting point* (a normalized schema does suggest candidate
boards). Not rejected on the merits, just not scoped here — every
board-vs-subitem call would still be made by hand, so the conversion saves
less than it appears to. Revisit only if real use asks for it.

---

## 2. Scope — four structural nouns, and no more

| Noun | What it is |
|---|---|
| **Board** | The top-level container. Owns one item column set and optionally one subitem column set. |
| **Group** | A named section inside a board holding items. Ordered. Usually a pipeline stage. |
| **Item** | A row in a group. Its columns are the board's item column set. |
| **Subitem** | A row under an item. Its columns are the board's *subitem* column set — a different set. |
| **Connect** | A column type linking a board to another board. |
| **Mirror** | A column type reading a column from the far side of an existing Connect. |

**Out of scope:**

- **Folders.** Organizational grouping of boards in the sidebar. No schema
  consequence, and always addable later.
- **Dashboards.** Assembled bespoke by users once boards exist — a dashboard
  reads boards, it adds no structure to them. An earlier draft argued they
  were a real deliverable and therefore belonged in the model; that conflated
  *deliverable* with *schema*.
- **Views** (table, chart, timeline, etc.). Presentational.
- **Automations.** Deferred to their own planning session and their own page
  — see §8, which covers what the model must leave room for so that page is
  additive rather than a rewrite.

---

## 3. Data model

New file, `src/components/smartflow/monday/types.ts`. Sits beside
`schema/types.ts`, importing `ColumnType` from it and nothing else.

```ts
import type { ColumnType, SelectOption } from "../schema/types";

/** A column on a Monday board. Reuses the canonical ColumnType vocabulary
 *  from the Schema Designer — the *types* are shared even though the
 *  *structure* is not. Two Monday-only kinds are added below. */
export type MondayColumnKind =
  | { kind: "plain"; type: ColumnType }
  /** Connect Boards. The "road" between two boards. */
  | { kind: "connect"; targetBoardId: string }
  /** Mirror. Reads one column from the board at the far end of a Connect
   *  column ON THIS BOARD. Both ids are required — a Mirror with no
   *  Connect beneath it cannot exist in Monday (see §4). */
  | { kind: "mirror"; viaConnectColumnId: string; sourceColumnId: string };

export interface MondayColumn {
  id: string;
  name: string;
  spec: MondayColumnKind;
  /** Only meaningful when spec.kind === "plain" and the type is
   *  "select" / "multi-select". */
  options?: SelectOption[];
  note?: string;
}

/** A named section inside a board. Ordered, and carries a color the way a
 *  real Monday group does. Holds no schema of its own — every item in every
 *  group on a board shares the board's one item column set. */
export interface MondayGroup {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  groups: MondayGroup[];
  /** The board's item column set. */
  columns: MondayColumn[];
  /** The board's subitem column set — a SEPARATE schema, shared by every
   *  subitem under every item on this board (Monday allows exactly one
   *  subitem column set per board). Absent = this board has no subitems,
   *  which is the default: in Monday subitems only exist once the Subitems
   *  column is added. */
  subitemColumns?: MondayColumn[];
  /** Canvas position. Presentational only, never inferred — same rule as
   *  SchemaCardPosition and Lane/CardPosition elsewhere in the app. */
  position?: { x: number; y: number };
}

export interface MondayDoc {
  boards: MondayBoard[];
  /** The workspace name, when the user wants it recorded. Purely a label —
   *  workspaces are not modeled as containers (§2). */
  workspaceName?: string;
}

export const emptyMondayDoc: MondayDoc = { boards: [] };
```

**Note there is no `MondayItem` or `MondaySubitem` record.** This is a
**schema** designer, not a data entry tool — it models what an item's columns
*are*, not which items exist. Same stance the Schema Designer takes: it holds
`SchemaColumn`, never a row of data. Groups ARE modeled because a group is
structure the builder decides up front; items are content filled in later.

**Connect lines are derived, not stored.** A `Relationship[]` array would be
a second source of truth alongside the `connect` columns that already encode
every link. The canvas derives its edges by walking each board's columns for
`kind: "connect"` — so a line can never disagree with the column that makes
it. (The Schema Designer stores `relationships` separately because a SQL
foreign key is genuinely its own object; a Monday Connect is just a column.)

### 3.1 Wiring into `Flow`

`DiagramType` gains `"monday"`; `Flow.content` becomes
`SmartFlowDoc | SchemaDoc | MondayDoc`. Exactly the precedent `"schema"` set
in [db/types.ts:16-24](../src/db/types.ts#L16-L24) — a discriminated union on
`type`, narrowed at each read site. Purely additive; no existing flow
changes.

---

## 4. Mirror and Connect — the constraint, and why it is enforced

**A Mirror is Monday's answer to an Airtable Lookup, and it is meaningfully
weaker.** Both show a value living on a linked record. The differences are
what make enforcement worth building:

- A **Connect** column is the road between two boards. A **Mirror** is the
  cargo carried down it. **No Connect, no Mirror.**
- A Mirror travels **exactly one hop** and reaches **only** the board at the
  far end of the specific Connect column it names. Reaching a board two hops
  away requires either a second direct Connect, or a mirror-of-a-mirror —
  which Monday handles poorly and which breaks quietly.
- Mirrored values often **cannot be grouped, filtered or sorted** as freely
  as native ones.
- Monday has **no true rollup**. Summarizing across boards is Connect +
  Mirror **plus a hand-built automation**.
- Formulas have historically been unable to reference Mirror columns.

(These limits are a moving target on Monday's side; the capability notes
already in [schema/types.ts](../src/components/smartflow/schema/types.ts) say
so and this designer should keep that hedge.)

**The two-hop limit is the trap.** Given boards A → B → C, a Mirror on A
cannot show a column from C, because A's only Connect reaches B. This is easy
to get wrong *while looking at the schema*, which is the argument for
enforcing rather than warning.

**Therefore the Mirror editor enforces, it does not warn:**

1. Pick the Connect column first. If the board has no Connect column, the
   Mirror option is unavailable, with a plain sentence saying why.
2. The source-column picker then offers **only** columns from the board that
   Connect actually reaches.
3. It is structurally impossible to author a Mirror that could not exist in
   Monday.

This is a real platform constraint, not a judgment call — so enforcing beats
warning, and it does not cross the "never decide for the user" line in §5.
Deleting a Connect column must also delete every Mirror that rides it (same
cascade rule as `pruneRelationshipsForColumn` in
[schema/store.ts](../src/components/smartflow/schema/store.ts)).

The capability note still shows on every Mirror: *read-only; may not be
groupable or filterable; no true rollup — summarizing across boards needs an
automation you build.*

---

## 5. The subitem note

### 5.1 What actually goes wrong

A subitem *can* hold a Connect column. The link is just second-class, in
three ways:

- **Mirroring from a subitem to another board is the weak spot.** Another
  board connects to a subitem and tries to mirror one of its values back —
  this is where it gets flaky.
- **A subitem Connect is board-wide.** Subitem columns are shared across the
  whole board, so every subitem under every item gets that column. One item's
  subitems cannot have a link the others lack.
- **Reporting across subitems is worse.** Dashboards and cross-board views
  handle top-level items far better. Subitem data that needs to roll up
  anywhere is where this is felt.

**When subitems are right — the common case.** A subitem is detail under its
parent that nobody outside ever looks at: checklist steps, tasks, notes, line
detail read only in context. This is most subitems, which is why the pattern
is correct far more often than not.

**When they are wrong.** The subitem rows are entities in their own right —
things another board needs to point at, filter on, or report across. That is
a real entity stored in a second-class slot.

**The risk is migration cost, not breakage.** Subitems do not fail loudly.
What happens is that months later something needs to reference them, and now
the rows have to move to a new board, the connects rebuilt, and anything
pointing at the old shape redone. The decision is cheap while a board is
being designed and expensive afterwards. That asymmetry is the entire reason
this note exists.

### 5.2 The remedy, in three steps

When subitem rows do need to be referenced from elsewhere:

1. The rows become **items on their own board**.
2. That board gets a **Connect column pointing back to the original board**.
3. Many new-board items → one original item. A many-to-one, back to where
   they came from.

Same data, but the rows are now top-level items, so other boards can connect
and mirror against them reliably.

### 5.3 The recurring failure shape, as a worked example

The same chain turns up whenever a list of rows under an item is a real
entity. Generic form, using a parts-and-pricing structure:

1. A board holds **products**, with **components** as subitems under each
   one. Looks right: components belong to their product, and nothing else
   needs them yet.
2. Later, a **pricing** board is added — several vendor quotes per component,
   so one component has many cost rows.
3. Pricing must therefore point at a **component**. But components are
   subitems, so this is a board connecting to subitems, and the chosen price
   then has to mirror back *from* that connection — the weakest case in
   §5.1.
4. The fix is §5.2: components are promoted to **their own board**, with a
   Connect back to products. Pricing then connects to components
   item-to-item, and nothing load-bearing sits on a subitem.

**The end state is a board per entity** — products, components, quotes —
each linked one hop to the next. That is the same structure a normalized
Airtable base or SQL schema would use; it is not a Monday-specific
contortion. What differs is only that Monday cannot traverse it cheaply
(§5.4).

**Subitems still have a place** in that end state — checklists, tasks, notes:
detail under a parent that nothing outside references. They are only wrong in
the load-bearing path.

### 5.4 No rollup: a schema can be correct and still not produce the number

The limitation that outlasts every structural fix. Once the boards above are
correct, a value like *selected quote price → component cost → product
material cost → opportunity total* still does not exist anywhere, because:

- **Mirrors do not chain.** A mirror of a mirror crosses two hops and is
  where Monday becomes unreliable (§4).
- **Mirrors do not aggregate.** Where one row links to many, there is no
  single value to mirror — summing many rows into one is a rollup, and
  Monday has none.

Neither is solvable by rearranging boards. More boards means more hops, which
makes it worse, not better. **The only mechanisms that produce the number are
an automation writing a real column, or manual entry.**

This matters for the designer because a schema can look complete and still
imply a number it cannot produce. The tool should say so at the point it
arises — the same honest-gap stance the Schema Designer already takes with
"no clean equivalent" rather than silently downgrading a type. Concretely:
**where a Connect is one-to-many and something upstream needs a total across
it, note that the total requires an automation, not a mirror.** Wording and
placement to be settled with §8's session; the principle is fixed here.

### 5.5 How it surfaces: one standing note, no conditional logic

A **short standing note on the subitem band**, shown whenever a board has
subitem columns:

> Subitems are for detail under their parent. If another board will need to
> point at these rows, make them items on their own board with a Connect back
> here — subitems link and report across boards poorly.

One clause for when subitems are right, one for what to do instead. It names
the remedy from §5.2, so it is actionable rather than a warning with no exit.

**Always shown, never conditional.** Two earlier designs were considered and
dropped:

- *A question at the moment subitem columns are added* ("does anything
  outside this item need to reference these rows?"), with the answer stored
  on the board. Overbuilt: it needed a paragraph to explain what it was
  asking, and asked for information the user had not gathered yet.
- *A conditional flag* that fires only when another board's Connect points at
  a board with subitems. The schema cannot tell the difference between a
  Connect that cares about the parent items (normal, common) and one that
  really needs the subitem rows (the trap) — they are identical in the data.
  A conditional flag would therefore fire mostly on correct schemas, and a
  flag that cries wolf gets ignored.

A standing note has no trigger logic to get wrong, and it teaches the rule at
the moment the decision is being made — which is where someone learns it.

Nothing is stored and nothing is asked, which is why `MondayBoard` carries no
note-answer field. A user recording their own reasoning uses the `note` field
columns already have.

This is the pattern `capabilityNote()` already established in the Schema
Designer ([schema/types.ts](../src/components/smartflow/schema/types.ts)):
state the known platform limit, in one sentence, at the point of use.

### 5.6 Verify these claims before shipping

The three limits in §5.1 come from prior research and general knowledge of
Monday, and **Monday changes this behavior over time**. Before this note goes
in front of a client, confirm each one hands-on — the `monday.com` MCP
connector is available in this environment, and a scratch workspace is enough
to test all three. The existing Mirror capability notes in the Schema
Designer already carry a "verify current behavior" hedge for the same reason;
this note should be held to that standard rather than stated flatly.

### 5.7 Relationship to the Schema Designer's §4.0.1

`SCHEMA-DESIGNER-PLAN.md` §4.0.1 is headed *"Board-vs-table modeling —
explicitly out of scope"* and records that call being rejected on 2026-09-03.
The decision underneath the heading is narrower than the heading:

> Considered building an assistant that **suggests merging** thin/low-
> cardinality `SchemaTable`s into wider boards — **rejected**: this is the
> user's call to make, not something the tool should infer or nudge.

**What was rejected is an inference engine that guesses at board structure.**
That rejection stands, and the flags above do not cross it: they state a
fixed platform limitation, they do not evaluate whether a given board is
structured correctly. **§4.0.1's heading is broader than its decision and
should be corrected** to "Board-structure *inference* — explicitly out of
scope," pointing here. (Action item, §7.)


## 6. Canvas and visual design

**Fork the Schema Designer's canvas, do not extend it** — the same call
`SCHEMA-DESIGNER-PLAN.md` §3 made about the schema map, for the same reason:
the geometry differs enough that one parameterized renderer would be harder
to read than two clear ones. `schema/canvas/model.ts` is 132 lines of pure
geometry and is the file to copy the *shape* of, not the numbers.

A board card is structurally richer than a table card:

```
┌─ Board name ──────────────────────┐
│ ▸ Groups   Stage one · Stage two · │   groups as a chip row
│            Stage three             │
├─ Item columns ────────────────────┤
│ Name              Text             │
│ Owner             Person           │
│ Status            Status           │
│ Linked board      → Other board    │   connect: shows its target
│ Amount            Number           │
├─ Subitem columns ─────────────────┤   only when subitemColumns exists
│ Name              Text             │
│ Category          Status           │
│ Qty               Number           │
│ Unit cost         Currency         │
└────────────────────────────────────┘
```

Design notes:

- **The subitem band is visually distinct** — a tinted, inset section under a
  labelled divider, not just more rows. Its being a separate schema is the
  single most misunderstood thing about Monday and the card should say so at
  a glance.
- **Groups render as a chip row in the header**, not as rows. They are not
  columns and must not read as columns.
- **Connect columns draw the edges**, anchored row-to-row (not card-centre)
  so parallel connections stay distinguishable — the rule already proven in
  `schemamap/model.ts`.
- **Mirror columns render with a hairline back to the Connect row they ride**,
  inside the card. The dependency should be visible without clicking.
- Per the global design rules: no three-up card grids, no pill buttons, type
  and spacing carry the hierarchy. Mobile-first — at 375px the board card
  drops to full width and the group chips wrap; the subitem band stays
  visually distinct, since that is the point of the card.

---

## 7. Build order

1. **`monday/types.ts`** — the model in §3, plus `"monday"` added to
   `DiagramType`, `DIAGRAM_TYPES` and the `Flow.content` union. Nothing
   renders yet.
2. **`monday/store.ts`** — one reducer, mirroring `schema/store.ts`'s shape:
   board/group/column CRUD and the Connect-delete cascade from §4. Every
   mutation funnels through it.
3. **Board card + canvas** (§6), read-only first, against a hand-made
   `MondayDoc` fixture exercising every structure in §2: several boards,
   groups, a board with subitem columns and a board without, a Connect, and a
   Mirror riding it. **If any of that cannot be expressed, the model is wrong
   and steps 1–2 get revised before any editing UI is built.**
4. **Editing** — add board, add group, add column, the column-kind picker.
5. **Connect + Mirror editors**, with §4's enforcement. Not before step 4:
   the constraint needs real columns to point at.
6. **The subitem note** (§5.5) — a standing note on the subitem band, plus
   §5.6's hands-on verification of the three claims behind it before the
   wording is final.
7. **Correct `SCHEMA-DESIGNER-PLAN.md` §4.0.1's heading** to
   "Board-structure *inference* — explicitly out of scope," with a pointer
   here. Small, but it prevents a future session reading the old heading as
   forbidding this whole plan.

Export is deliberately absent from v1 and should be scoped against a real
need rather than built speculatively — but see §8: a blueprint you can hand
to a client is most of why this tool exists, so export is the likeliest v2,
not a someday-maybe.

---

## 8. Automations — a separate session, planned for here

Automations get their own planning session and their own page in the tool.
They are not schema, so they stay out of §2's model. But they are a large
part of a Monday build's real weight, and Connect + Mirror largely exist to
enable them — so the model should be built so that page is **additive**, not
a rewrite.

What v1 must leave room for:

- **Automations attach to boards and columns, and reference another board.**
  A rule is roughly *when <trigger on this board> then <action on that
  board>*. Every id an automation would point at — board, group, column —
  must be stable and addressable. The model in §3 satisfies this; the note
  exists so nothing later introduces positional or derived ids.
- **A separate page, not a canvas layer.** Rules are a list, not a picture.
  Drawing them as edges on the board canvas would drown the structure the
  canvas exists to show.
- **`MondayDoc` gains an `automations?: MondayAutomation[]` field** when that
  session happens — top-level and optional, the same shape as every other
  optional-until-used field in the app's docs. No placeholder type is
  defined now; designing it half-way without its own planning pass is how it
  ends up wrong.
- **The Mirror capability note already points at automations** ("no true
  rollup — summarizing across boards needs an automation you build"). Once
  the automations page exists, that note should link to it.
- **§5.4 is the case that makes this page necessary, not optional.** A
  correct schema can still fail to produce a number that a dashboard is
  expected to show, and no arrangement of boards fixes it. A board designer
  that cannot express *"this total comes from an automation, not from the
  structure"* is hiding the most expensive part of the build. That is the
  brief for the session.

**One caution to carry into that session.** Automations as a *substitute for
derived values* — rules pushing numbers between boards to stand in for
rollups — are genuinely worse than a real computed field: they fail quietly,
they drift, and a stale number on a reporting board is the failure noticed
last. That objection is correct and should not be designed away. It is also
not avoidable: Monday offers no other mechanism, so the choice is an
automation or no number at all. The designer's job is therefore to make the
dependency **visible** — to show which values are automation-produced rather
than structural — not to make it feel seamless.

---

## 9. Progress — built 2026-09-26

**Status: §7 steps 1–7 complete.** The designer is wired end to end and was
driven through a real board in-session: two boards, groups, subitem columns,
a Connect between them and a Mirror riding it. Typecheck (`tsc --noEmit`) and
lint are clean. One pre-existing unrelated error remains in
`outlineImport.ts:147` — untouched since 2026-09-03, not from this work.

### 9.1 What shipped

| File | What it holds |
|---|---|
| `monday/types.ts` | The §3 model, plus `MONDAY_COLUMN_TYPES` (see 9.2) and `MIRROR_NOTE`. |
| `monday/store.ts` | The reducer. Board/group/column CRUD, the §4 Connect→Mirror delete cascade, and `isValidMirror` / `mirrorTargetBoard` shared by the reducer and the editor. |
| `monday/canvas/model.ts` | Pure geometry, forked from the schema canvas. Adds `orderedColumns()` (see 9.2). |
| `monday/canvas/paths.ts` | Orthogonal edge routing, forked and keyed to this card width. |
| `monday/canvas/MondayCanvas.tsx` | The canvas. Pan/zoom/drag ported from `SchemaCanvas`; board card, group band, two column bands, Connect/Mirror editors. |
| `pages/MondayFlowPage.tsx` | Own page, own reducer, own autosave — the split `SchemaFlowPage` established. |

Plumbing: `"monday"` added to `DiagramType` / `DIAGRAM_TYPES`, `MondayDoc`
added to `Flow.content`, `flowsRepo.emptyContentFor()`, `flowExport`'s
shape-checked import, `HomePage` icon, and `OutlineBuilder`'s exclusion type.
`FlowPage` gained `hasOwnDocShape()` so `type === "schema"` stopped doubling
as "not a SmartFlowDoc flow."

### 9.2 Departures from the plan, and why

Five. All but the first came out of Ruthnie testing the canvas live.

1. **Monday-native column types, not the shared `COLUMN_TYPES` list.**
   The plan had the Monday designer reuse the Schema Designer's
   target-agnostic type list. That list offers **Rollup** and **Lookup**,
   which are not Monday column types — both are Mirror, already modeled as
   their own `MondayColumnKind` — plus `relation` (Connect) and `rich_text`
   (no Monday equivalent). Offering them would let someone author a board
   Monday cannot build, the exact failure this designer exists to prevent.
   `MONDAY_COLUMN_TYPES` in `monday/types.ts` is the Monday-only selection,
   still valued as canonical `ColumnType`s so the two tools keep one
   vocabulary and one set of type colors. **Caught by Ruthnie**, not by the
   plan.

2. **Groups render as ordered colour bars, stacked — and do not nest.**
   §6 said "a chip row in the header." Chips read as tags; a real Monday
   group is a coloured bar owning a section of rows. Now stacked vertically
   with a colour bar, an order number, and a `GROUPS` band label matching the
   two column bands. Nesting was raised and rejected on the merits: **Monday
   groups are a flat ordered list** with no parent/child, consistent with
   §2's "nests exactly one level." Ruthnie's point resolved to items nesting
   visually *inside* groups in the real product — which does not reach a
   designer that models columns, not rows. The group *order* carries the
   hierarchy that matters (on a pipeline board it is the stage order), which
   is why the order number is shown.

3. **A Mirror is nested under the Connect it rides — no hairline.**
   §6 specified "a hairline back to the Connect row it rides, inside the
   card." Built, and it failed twice: drawn in the shared lines SVG it sat
   *behind* the opaque cards, and a Mirror is usually created right after its
   Connect, so the two rows are adjacent and a bracket between them has no
   distance to travel — it rendered as a dashed smudge at the row edge.
   **Ruthnie's suggestion — indent it — is what shipped**, and it is better
   than the plan's version: `orderedColumns()` moves each Mirror up to sit
   directly beneath its Connect and indents it with a `⤷`, so the dependency
   is permanent, needs no hover, and survives any number of columns sitting
   between the two in the stored order. Presentation only; the stored order
   in `MondayBoard.columns` is untouched.

4. **Groups and subitems have on-card affordances.**
   Not in the plan. A new board hid both of its defining features behind the
   kebab, so it read as a worse schema designer rather than a different tool.
   A quiet dashed `+ Group` in the group band, and an `Add subitem columns`
   row styled like `Add column`, sitting where the subitem band will appear.
   Board rename (double-click the name, or the kebab) was also missing
   entirely and was added.

5. **The §5.5 subitem note is CUT, not shipped.** See 9.3 — the one worth
   reading before touching this again.

Smaller fixes worth recording, all from live testing: new boards were landing
almost a screen apart (`GRID_X`/`GRID_ROW_H` cut from +100/400 to +56/300);
the "Add subitem columns" control rendered *above* `ITEM COLUMNS`, reading as
though subitems came first; the group input and its button had different
widths and heights, so the row jumped when swapping between them; and the
Connect/Mirror icons were backwards — `LinkOutlined` sat on the Mirror, where
"link" belongs to the Connect. Connect is now `ApiOutlined` (a plug — the
road between two boards, Ruthnie's pick) and Mirror is `EyeOutlined`
(read-only, which is the most important thing about a Mirror; `SwapOutlined`
was considered and rejected because a Mirror does not sync, it only reads).

### 9.3 The subitem note was cut, and §5.5/§5.6 should be read in that light

§5.5 specifies a standing note on the subitem band: *"subitems link and
report across boards poorly."* It was built as specified, moved to a tooltip
on the band heading when the paragraph proved too heavy on the card, and then
**cut entirely.**

The reason is §5.6. Ruthnie asked, repeatedly, what "poorly" concretely
means. There was no answer worth shipping: the three claims in §5.1 come from
prior research rather than hands-on testing, §5.6 already requires verifying
them before the note reaches a client, and **Monday permits all of it — it is
a quality judgment, not a platform limit.** Successive rewordings made the
prose tighter without closing that gap, which is the tell. Her call to cut it
was correct, and a replacement stating only structural facts was also
rejected, rightly, as stating the obvious to someone who just built those
columns.

**What survives, because it names a mechanism rather than grading quality:**

- **No rollup** — many rows pointing at one thing cannot be summarized into
  one value. Structural, verifiable, and already on `MIRROR_NOTE`. This is
  the real reason §5.3's parts/pricing chain needs its own boards.
- **A subitem Connect is board-wide** — subitem columns are shared, so every
  subitem under every item gets that column. Readable straight off the model.

**If §5.6's verification happens, write the replacement the same way: name
the mechanism, do not grade it.** `ColumnBand` still accepts a `note` prop,
so restoring one is a one-line change at the call site. The reasoning is also
recorded in a comment in `monday/types.ts` where the constant used to live,
so a future session does not re-add it by reading §5.5 alone.

The §5.3 subitem-vs-own-board insight is **not** discredited by this — it is
load-bearing for the Celmark BOM structure. It belongs in analysis, not in a
tooltip as an unverified warning.

### 9.4 Also done

§7 step 7: `SCHEMA-DESIGNER-PLAN.md` §4.0.1's heading corrected to
"Board-structure *inference* — explicitly out of scope," with a dated note
recording that what was rejected was an inference engine, not modeling Monday
boards, and a pointer here.

### 9.5 Next session

Ruthnie's own list, 2026-09-26:

1. **On-canvas notes — the next thing to build.** A notes drawer or popover
   on the canvas, so a board blueprint can carry its own explanation: "a
   little schema explainer." Wanted on **both** designers — build it for
   Monday first, then apply the same primitive to the Schema Designer. Per
   the globalize rule this should be one shared component from the start, not
   two implementations. Note `MondayColumn` already has a `note?` field and
   `MondayBoard` does not — board-level notes need a model change, and so
   does `SchemaTable`.
2. **Verify §5.1's claims** against a real Monday workspace (§5.6), and only
   then decide whether a subitem note goes back in. See 9.3.
3. **Export** — already works via the flow export (`MondayFlowPage`'s kebab →
   Export), so §7's "export is the likeliest v2" is partly satisfied already.
   A Monday-specific export (a build checklist, or something handed to a
   client) is still unscoped.
4. **Automations** (§8) — still its own planning session.
