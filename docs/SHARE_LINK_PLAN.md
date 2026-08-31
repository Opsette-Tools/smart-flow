# SmartFlow sharing: a link that rebuilds the board

**Status:** planned 2026-08-27. Not built.
**Author's note:** written as a build brief. Section 9 is the build order.

---

## 1. The question

Ruthnie needs to hand a process map to a business partner or a client and say
"this is what I mapped." Today the only exits are a PNG of the map and reading
the summary off her own screen. Sending a JSON blob to paste is the fallback
nobody wants.

Two things were confirmed against the code before planning:

- **The PNG already exports what you dragged.** `schemamap/exportMap.ts`
  computes its capture bounds from the same live positions the canvas renders
  from, so a dragged layout exports exactly as arranged. No work needed there.
- **A whole board fits in a URL once compressed.** Measured, not assumed:

  | Board | Raw JSON | Plain base64 | Compressed + base64url |
  |---|---|---|---|
  | 5 lanes, 18 steps, discovery text filled | 6,177 B | 8,236 | **1,168** |
  | 12 lanes, 60 steps, long text throughout | 27,238 B | ~36,000 | **1,938** |

  Process boards repeat their own vocabulary constantly (lane names, step names,
  "QuickBooks", the same open question), so they compress roughly 14:1. Plain
  base64 would blow past a safe URL length; compression is the whole reason
  this works, and it is not optional.

## 2. The hard constraint, stated plainly

**A share link is a photograph, not a window.**

The link *is* the data: the compressed board is encoded into the URL string
itself, and nothing is stored anywhere. The recipient sees exactly what was true
when the link was generated, forever. Edit a step afterward and their link still
shows the old board, because their copy has no path back to Ruthnie's.

This is not a limitation that a cleverer link fixes. Live updates need a place
both browsers can read from, and GitHub Pages serves static files with nowhere
to write. **Every meaningful change means generating a fresh link.**

Two design consequences follow, and the build must honor both:

1. **The UI must never imply live.** No "shared with" list, no "synced" language.
   The share modal says what a link is: a snapshot of the board as it is now.
2. **Regenerating must be one click**, because it is the normal case, not the
   exception. The share button always encodes current state; there is no stale
   "your link" to manage.

## 3. What this is NOT

Rejected on purpose, so a future session does not re-litigate:

- **A backend.** Real-time collaboration means a server and accounts, which
  changes what an Opsette tool is. Out of scope.
- **Gist / paste-service hosting.** Shifts the data to a third party, needs a
  token, and breaks the "nothing leaves your browser" story that is currently
  true and worth keeping.
- **A round-trip edit flow.** A recipient can edit their copy and send a link
  back. That is workable for two people and tedious for five. Ship it as a
  by-product, do not build ceremony around it.

## 4. What gets built

### 4.1 Transport: `?flow=<compressed>`

Encode: `JSON.stringify(doc)` → deflate → base64url → query param.
Decode: the exact inverse, and it **never throws**. A truncated or hand-edited
link falls back to the tool's normal state with a plain message, exactly the way
`decodeSeed` in the kit-link library already behaves.

Reuse, do not reinvent: `toBase64Url` / `fromBase64Url` and the never-throw
decode discipline already exist in `_shared/opsette-kit-link/`. Compression uses
**`lz-string`**, already a dependency in Signature Studio, so it is a
family-approved library rather than a new one.

Guard rails:
- Cap the encoded length (~8,000 chars). Past that, tell the user the board is
  too large to link and offer the PNG or a downloaded file instead. Measured
  worst case is ~1,900, so this should never fire; it exists so the failure is a
  sentence rather than a broken URL.
- Version the payload (`v`) so a future schema change can migrate rather than
  silently misread an old link.

### 4.2 Viewer mode: `&view=map` | `&view=summary` | `&view=build`

Lands the recipient on the artifact instead of a build tool they did not ask
for. In `map` and `summary` the editing chrome is hidden; the map stays fully
interactive (pan, zoom, drag), because a schema map you cannot move is a
picture, and a picture is what the PNG is already for. Their dragging is local
and reaches nobody.

A visible "Make a copy to edit" action turns a viewed link into their own board.
That is the round-trip, offered without ceremony.

### 4.3 The share modal

One button in the header. It shows:
- the generated link with a copy action,
- a view selector (map / summary / whole board),
- one line saying this is a snapshot of the board as it is right now,
- the existing PNG export, kept where it is discoverable.

## 5. The trap that will break this if missed

`SmartFlowApp` autosaves the doc to `localStorage` on a 300ms debounce, on every
change. A visitor opening a share link would have **their own saved board
silently destroyed** by the incoming one.

**A doc loaded from a URL must not be written to localStorage** unless the
visitor explicitly chooses "Make a copy to edit." Until then it lives in memory
only. This has to be handled in the autosave effect itself, not by remembering
to avoid it at each call site.

Same class of problem: the first-run chooser modal must not appear over a shared
link, and `loadActiveType()` must not be clobbered for a visitor who has their
own work in progress.

## 6. Privacy, stated because it is a selling point

The board never reaches a server. It rides inside the URL and is decoded in the
recipient's browser. That is worth saying out loud in the share modal: a client's
process map is often sensitive, and "this was never uploaded anywhere" is a real
answer, not a disclaimer.

Caveat worth one line in the UI: a URL carrying the data can sit in browser
history, chat logs, and email. Not private *from the recipient's systems*, just
not stored by Opsette.

## 7. Registry work

- Add SmartFlow to `SLUGS` in `_shared/opsette-kit-link/opsette-kit-link.ts`
  (slug `smart-flow`), then run `node _shared/opsette-kit-link/sync.mjs`.
  **Never hand-edit a vendored copy.**
- If the share encoder ends up useful to other tools, it belongs in the shared
  master and gets vendored the same way. Judge that when the second tool needs
  it, not before.

## 8. Open question for Ruthnie

Should a shared link default to `map` or `summary`? The map is the artifact
people react to; the summary is the one that reads without explanation. This is
a taste call about how she presents to a client, not a technical fork.

## 9. Build order

1. `shareLink.ts`: encode / decode / cap / version. Pure, no UI. Test the round
   trip on a real board and on deliberately corrupted input.
2. Read `?flow=` at boot, before the chooser. **Fix the autosave guard first**
   (section 5) so a visitor can never lose their own board.
3. Viewer mode: hide editing chrome for `map` and `summary`, keep the map
   interactive, add "Make a copy to edit".
4. Share modal: link, copy, view selector, snapshot line, PNG export.
5. Registry + sync. Typecheck throughout; full build only before the commit.
