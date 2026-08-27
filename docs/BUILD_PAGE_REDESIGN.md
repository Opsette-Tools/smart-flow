# Build page redesign: board plus drawers

**Status:** planned 2026-08-27, building same session.
**Scope:** swimlane Build mode only. Diagram/Summary/Map are untouched. Ruthnie
confirmed those read well and are not in question.

---

## 1. What's actually wrong

Not taste. Structure. The data model is three levels deep (Lane, Step,
Handoff) and the page renders all three at the same visual weight, so nothing
signals containment.

1. **Lanes are declared twice.** `LaneManager` renders a pill-chip row (rename,
   delete, drag-reorder) and `LaneColumn` renders the same lanes again as
   columns with a second editable name. Two rows of UI, two rename affordances,
   one concept. Most of the "bulky" feeling starts here.
2. **The card is five unlabeled zones:** header, connection summary line,
   "Leads to" select, mechanism rows, Details disclosure. Three different
   divider styles separate them (dashed top border, left border, bare gap), and
   only one zone ("Details") has a name.
3. **The disclosure looks cheap because it isn't a component.** A hand-rolled
   `<button>` swapping `DownOutlined`/`RightOutlined`, no surface, floating on
   the card.
4. **Rename + delete are always-on icon buttons on every card**, so N steps =
   2N text buttons of visual noise.
5. **The fields are slim because the column is ~280px** (`flex: 1 1 280px`).
   Interview answers ("QuickBooks, Airtable, shared drive, nowhere") cannot fit
   in a swimlane column. **This one cannot be restyled away.** It's a container
   problem, and it's what forces the redesign below.

Sixth, cutting across all of it: **the page never names its own levels.** The
words Lane, Step, and Handoff appear nowhere as labels. Ruthnie built it and
still had to ask whether card headers are steps. A client watching a live
presentation has no chance.

## 2. The decision: board plus drawers

**The board is for reading. A drawer is for filling in.**

- Lane columns hold slim, uniform step cards: sequence number, name, handoff
  count, and an amber dot when discovery detail is missing.
- Clicking a card opens a drawer over the board with that step's fields.
- Clicking a lane's number or name opens a drawer with every step in that lane,
  expanded and stacked, so a whole lane can be reviewed in one pass instead of
  card by card.

**The drawer never masks the board.** The point is to click from one step to the
next without closing anything in between.

**Both drawers are the same primitive** (`WorkDrawer` plus `useDrawerWidth`), so
there is one drawer treatment on the page and one shared, resizable width.

Rejected during the build:
- **A side-by-side inspector column.** With five real lanes there is no width to
  give up. It became a drawer instead.
- **A legend naming Lane / Step / Handoff.** Instructional copy on a working
  page. The labels on the fields carry it.
- **Review lane in the kebab.** The most useful thing on the lane head should
  not be the hardest to reach, so the head itself is the button.
- **Restyle-in-place.** Treats the symptom, leaves the page long and the fields
  narrow.

## 3. Visual anchoring

| Level | Treatment |
|---|---|
| **Lane** | Solid green header band, position number, name, step count, a menu. The only heavy surface on the page, and the button into the lane review. |
| **Step** | White card inside the lane body, quiet 1px border, sequence number. |
| **Handoff** | Never a surface. A count on the card face; the detail is in the drawer. |

Lanes sit on a horizontally scrolling track at a fixed 300px each (82vw on a
phone, so the next lane peeks). A lane that shrinks to fit more lanes on screen
is a lane you cannot read, and a wrapped swimlane stops reading left to right.

## 4. Changes, file by file

- **`LaneManager.tsx`** exports `LaneAddBar`: just the add-a-lane input, sitting
  in the top action row beside Discovery mode. The chip bar is deleted.
- **`LaneColumn.tsx`** head carries the position number, the name (both inside
  one button that opens the lane review), the count, and a kebab holding
  Rename, Move left, Move right, Delete. `REORDER_LANES` already took an ordered
  ID list, so Move left/right drives it with no store change. (Lane *columns*
  never had drag; only the deleted chips did.)
- **`LaneItemCard.tsx`** is the slim face plus a kebab (Rename, Move to lane,
  Delete). No tooltips: they fired on hover exactly where the drawer opens.
- **`StepDetailFields.tsx`** (new) holds the four fields, shared by both
  drawers so they cannot drift.
- **`StepInspector.tsx`** (new) wraps those fields with a header and Delete.
- **`LaneReview.tsx`** (new) stacks every step in one lane.
- **`WorkDrawer.tsx`** + **`useDrawerWidth.ts`** (new) are the shared drawer:
  no mask, left-edge resize (320px to 90vw), bottom placement on a phone. The
  hook is a separate file so Fast Refresh keeps working.
- **`ConnectionEditor.tsx`** moved into the drawer, laid out full width.
- **`BuildMode.tsx`** owns `selectedId` and `reviewLaneId` and renders both
  drawers.
- **`useIsNarrow.ts`** now takes a named breakpoint from a `BREAKPOINTS` map
  instead of hardcoding one width.
- **`smartflow.css`** gained the step, drawer, and review rules; lost the chip,
  old card, details-disclosure, and inline mechanism-row blocks.

## 5. Preserved on purpose

- Drag of **steps** between and within lanes. That's the core act of building a
  swimlane, and it works.
- The whole data model. **No `types.ts` or `store.ts` change.** This is a
  presentation-layer redesign; every existing doc keeps working.
- Discovery mode as a toggle, and the amber unfilled-field cue (moved to the
  inspector + a card dot).

---

## Progress log

### 2026-08-27: built (working agent)

Shipped, verified by Ruthnie in the running app.

**The board.** Step cards reduced to a sequence number, name, handoff count, an
amber dot when detail is missing, and a kebab (Rename, Move to lane, Delete).
The duplicate lane chip bar is gone; the lane column head now owns rename,
reorder, and delete, and its number plus name is a button that opens the lane
review. Lanes scroll sideways at a fixed 300px (82vw on a phone) instead of
wrapping. Add-a-lane sits in the top action row.

**ResizableDrawer** (`components/common/`) is the reusable primitive, built on
the same structure as Brand Board's ToolEmbedDrawer: maskless, left-edge drag
handle with a visible grip, a drag shield with a live px readout so an embedded
surface cannot swallow the mouseup, teardown on blur and pointer-leave, and a
width persisted to localStorage. Both SmartFlow drawers share one storage key,
so sizing one sizes the other. The toolbar title is editable in place, which is
how a step or lane gets renamed from inside the drawer.

Three false starts before that landed, all worth recording so they are not
repeated: a panel set to `height: 100%` with its own background paints over an
absolutely-positioned handle; the handle cannot live inside `.ant-drawer-body`,
which is a flex item, not the positioning context; and `styles.header` only sets
an inline style, so AntD's own `.ant-drawer-header` still holds a row until it
is hidden through `rootClassName`.

**Handoff method is multiselect.** "A spreadsheet, sent by email" is a real
answer and the model could not hold it. `Connection.mechanisms` is the array;
`Connection.mechanism` stays as its first entry so the gaps panel, the map, the
summary, and the card dot all keep working and saved docs load unchanged. A
compound handoff counts as manual if any leg is carried by a person. The drawer
writes the whole thing as a sentence, the way the summary does.

**Discovery mode removed.** It used to gate whether the detail stacked on the
card face. With the detail in a drawer the card is slim either way, so the
toggle only decided whether three fields existed at all. Every step now always
carries them. `SmartFlowDoc.discovery` is kept optional so saved docs parse.

**"Storage system" renamed to "System of record."** Storage was wrong for the
common case: QuickBooks is software a process runs in, not a place things are
stored. System of record is the term the data model already used
(`Item.systemOfRecord`), and the gaps panel already said "Steps with no record."

**View diagram button removed.** It routed to the retired `diagram` mode.

### Not done, carried forward

- The **map truncates** long labels. Ruthnie's call: another session.
- The map computes each handoff's mechanism but only uses it for line color; the
  label itself is never drawn on the edge.
