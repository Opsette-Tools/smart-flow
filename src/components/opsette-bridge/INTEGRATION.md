# opsette-bridge — shared postMessage bridge

Canonical `postMessage` bridge between an Opsette **tool** (child, served from
`tools.opsette.io`) and the Opsette **dashboard** (parent, apex `opsette.io`).
One source of truth, copied verbatim into each tool — same convention as
`opsette-share` / `opsette-header`.

## Install into a tool

Copy this folder to `<tool>/src/components/opsette-bridge/`:

```
src/components/opsette-bridge/
  bridge.ts
  index.ts
  INTEGRATION.md
```

Import via the `@/` alias:

```ts
import { connectBridge, type Bridge } from "@/components/opsette-bridge";
```

## Two capabilities

The bridge carries **two independent channels**. A tool uses whichever its
Opsette app entry enables (`storage_scope: 'shared'` and/or `emit_enabled`):

1. **Shared storage (v1.1)** — `save` / `savePresets` / `delete`, rehydrated
   from `init.items`. The tool's save-game persists in Opsette cross-device.
2. **Emit (v2)** — `emit(entity, payload)` fires one typed payload at the
   parent; it's staged as a `pending` review-inbox item a human approves before
   it becomes a native entity (`client` / `activity` / `file`). Independent of
   storage scope.

## Connect (the handshake)

`connectBridge<T>()` posts `ready` and waits for the parent's `init`:

- **Embedded in Opsette** → resolves a `Bridge<T>` (`isEmbeddedInOpsette: true`).
- **Standalone** (opened directly, no parent, or 1s handshake timeout) →
  resolves `null`. The tool falls back to its local store (e.g. IndexedDB).

```ts
const bridge = await connectBridge<MyStoredShape>();
if (bridge) {
  // embedded: persist via bridge.save(...), reveal emit UI, etc.
} else {
  // standalone: use local storage only
}
```

`<T>` is the per-`data_id` stored value (Process Checklist: `Checklist`;
Contact Capture: an `Event` with nested contacts).

## Emit example (Contact Capture → client)

```ts
const { inbox_id } = await bridge.emit("client", {
  kind: "data",
  data: {
    name, company, email, phone,
    title: position,          // our `position` maps to the contract's `title`
    contact_type: "Lead",     // Lead | Client | Vendor → server resolves relationship + status
  },
});
// → toast: "Added to your Opsette inbox for review."
```

## Trusted origin

`TRUSTED_ORIGINS` in `bridge.ts` lists the parent origins the tool will accept
messages from and post to: apex `https://opsette.io` (prod — confirmed against
`opsette-v2`, NOT `app.opsette.io`), plus `localhost:8081` / `localhost:3000`
for local round-trip testing. A wrong origin fails **silently** (the browser
drops the message), so confirm the parent's actual dev port when testing
locally.
