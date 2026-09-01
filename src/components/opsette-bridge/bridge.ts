/**
 * postMessage bridge — Opsette tool (child) ↔ Opsette dashboard (parent).
 *
 * Protocol v1.1 (storage) + v2 (`emit`). Canonical shared helper for every
 * Opsette tool. Copied verbatim into each tool at
 * `src/components/opsette-bridge/` (workspace convention — see opsette-share).
 *
 * Generalized from Process Checklist's proven bridge in two ways:
 *   1. Generic over the stored shape <T> (Process Checklist stores Checklist,
 *      Contact Capture stores an Event with nested contacts). The runtime logic
 *      is already shape-agnostic — only the types are loosened.
 *   2. Adds the `emit` channel (bridge v2): one typed payload fired at the
 *      parent, staged as a `pending` review-inbox item a human approves before
 *      it becomes a native entity (client / activity / file).
 *
 * ── Message envelope ──────────────────────────────────────────────────────
 * Every message carries { source: 'opsette', version: 1, type, ... }.
 *
 * Child → Parent:
 *   { type: 'ready' }
 *   { type: 'save',         request_id, data_id, value }
 *   { type: 'save_presets', request_id, presets }
 *   { type: 'delete',       request_id, data_id }
 *   { type: 'emit',         request_id, entity, payload }     // v2
 *
 * Parent → Child:
 *   { type: 'init',          presets, items }                 // items = [{ data_id, value }, ...]
 *   { type: 'saved',         request_id, data_id, updated_at }
 *   { type: 'presets_saved', request_id, updated_at }
 *   { type: 'deleted',       request_id, data_id }
 *   { type: 'emitted',       request_id, inbox_id, entity }   // v2
 *   { type: 'error',         request_id, message }
 *
 * Acks are matched on `request_id` (NOT data_id/type) so parallel requests
 * don't cross-resolve.
 *
 * Trusted origin: the Opsette dashboard runs on the apex `https://opsette.io`
 * (NOT app.opsette.io — confirmed against opsette-v2 source). The localhost
 * entry is for local round-trip testing; add the parent's actual dev port if
 * it differs (Next.js dev is typically :3000).
 */

const TRUSTED_ORIGINS = [
  'https://opsette.io',
  'http://localhost:8081',
  'http://localhost:3000',
] as const;
const MESSAGE_SOURCE = 'opsette';
const MESSAGE_VERSION = 1;
const HANDSHAKE_TIMEOUT_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;

// ── Emit channel types (bridge v2) — mirror opsette-v2 src/types/iframe-apps.ts
// ───────────────────────────────────────────────────────────────────────────

/** The native surface an emit targets. */
export type EmitEntity = 'client' | 'activity' | 'file';

/** Structured-data emits (Contact Capture → client, Review Request → activity). */
export interface EmitDataPayload {
  kind: 'data';
  /** Tool-shaped; normalized to native columns server-side. */
  data: Record<string, unknown>;
}

/** File emits (Process Checklist PDF, future document generators). */
export interface EmitFilePayload {
  kind: 'file';
  file_name: string;
  mime_type: string;
  bytes_base64: string;
  /** Omit / leave undefined to defer destination selection to the review inbox. */
  destination?:
    | { target: 'client'; client_id: string }
    | { target: 'task'; task_id: string };
}

export type EmitPayload = EmitDataPayload | EmitFilePayload;

/** Result of a successful emit — the payload landed in the review inbox. */
export interface EmitResult {
  /** The pending inbox row id, for the tool to reference if it wants. */
  inbox_id: string;
  entity: EmitEntity;
}

// ── Bridge surface ──────────────────────────────────────────────────────────

export interface InitPayload<T> {
  presets: Record<string, unknown>;
  items: Array<{ data_id: string; value: T }>;
}

export interface Bridge<T> {
  /** Shape from parent's init message. Only present when the bridge is active. */
  init: InitPayload<T>;
  /**
   * True once `init` is received — i.e. the tool is embedded in Opsette.
   * The gate for showing emit UI (always true on a live Bridge, but exposed
   * explicitly so consumers can read intent without a null check).
   */
  isEmbeddedInOpsette: boolean;
  save: (data_id: string, value: T) => Promise<void>;
  savePresets: (presets: Record<string, unknown>) => Promise<void>;
  delete: (data_id: string) => Promise<void>;
  /** Fire a typed payload at the parent; resolves with the inbox row once staged. */
  emit: (entity: EmitEntity, payload: EmitPayload) => Promise<EmitResult>;
  /** Register a callback invoked when any in-flight request times out. Returns an unsubscribe. */
  onTimeout: (handler: () => void) => () => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function isTrustedOrigin(origin: string): boolean {
  return (TRUSTED_ORIGINS as readonly string[]).includes(origin);
}

function isValidEnvelope(
  msg: unknown,
): msg is { source: string; version: number; type: string; [k: string]: unknown } {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.source === MESSAGE_SOURCE && m.version === MESSAGE_VERSION && typeof m.type === 'string';
}

/**
 * Post a message to every trusted origin. We can't know the parent's origin in
 * advance (a deployed tool at tools.opsette.io may be embedded by a LOCAL dev
 * parent on localhost:8081, by apex opsette.io in prod, etc.), so we post to
 * all of them and let the browser deliver only to the matching one and drop the
 * rest. The non-matching posts log a benign "target origin does not match"
 * console message — that noise is the price of supporting every parent origin,
 * and is NOT worth filtering: narrowing by the tool's own hostname (an earlier
 * mistake) stripped localhost:8081 when the deployed tool was embedded by a
 * local parent, so the handshake never reached it. Match the proven bridge:
 * post to all, always.
 */
function postToAllowedOrigins(message: Record<string, unknown>): void {
  for (const origin of TRUSTED_ORIGINS) {
    try {
      window.parent.postMessage(message, origin);
    } catch {
      // Browser drops wrong-origin deliveries silently; ignore thrown errors.
    }
  }
}

export function connectBridge<T>(): Promise<Bridge<T> | null> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const pending = new Map<string, PendingRequest>();
    const timeoutHandlers = new Set<() => void>();
    let handshakeSettled = false;
    let handshakeTimeoutId: ReturnType<typeof setTimeout>;

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;
      if (!isValidEnvelope(event.data)) return;

      const msg = event.data;

      // Handshake: parent's first `init` settles the promise and builds the Bridge.
      if (!handshakeSettled && msg.type === 'init') {
        handshakeSettled = true;
        clearTimeout(handshakeTimeoutId);

        const presets =
          msg.presets && typeof msg.presets === 'object'
            ? (msg.presets as Record<string, unknown>)
            : {};
        const items = Array.isArray(msg.items)
          ? (msg.items as InitPayload<T>['items'])
          : [];

        resolve(buildBridge<T>({ presets, items }, pending, timeoutHandlers));
        return;
      }

      if (!handshakeSettled) return;

      // Post-init: every ack is matched on request_id.
      const requestId = typeof msg.request_id === 'string' ? msg.request_id : null;
      if (!requestId) return;

      const req = pending.get(requestId);
      if (!req) return;

      clearTimeout(req.timeoutId);
      pending.delete(requestId);

      if (msg.type === 'error') {
        const message = typeof msg.message === 'string' ? msg.message : 'Unknown bridge error';
        req.reject(new Error(message));
      } else {
        // Any non-error ack with a matching request_id → success. The raw
        // message is handed back so request-specific resolvers (e.g. emit,
        // which needs inbox_id) can read their fields.
        req.resolve(msg);
      }
    };

    // Arm the handshake timeout BEFORE posting `ready` so it's set no matter
    // how synchronously the parent replies.
    handshakeTimeoutId = setTimeout(() => {
      if (handshakeSettled) return;
      handshakeSettled = true;
      window.removeEventListener('message', handleMessage);
      resolve(null);
    }, HANDSHAKE_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);

    postToAllowedOrigins({
      source: MESSAGE_SOURCE,
      version: MESSAGE_VERSION,
      type: 'ready',
    });
  });
}

function buildBridge<T>(
  init: InitPayload<T>,
  pending: Map<string, PendingRequest>,
  timeoutHandlers: Set<() => void>,
): Bridge<T> {
  const sendRequest = <R>(payload: Record<string, unknown>): Promise<R> => {
    return new Promise<R>((resolve, reject) => {
      const requestId = newRequestId();

      const timeoutId = setTimeout(() => {
        if (!pending.has(requestId)) return;
        pending.delete(requestId);
        timeoutHandlers.forEach((h) => {
          try {
            h();
          } catch {
            // a misbehaving handler must not break the others
          }
        });
        reject(new Error('Request timed out'));
      }, REQUEST_TIMEOUT_MS);

      pending.set(requestId, {
        resolve: resolve as PendingRequest['resolve'],
        reject,
        timeoutId,
      });

      postToAllowedOrigins({
        source: MESSAGE_SOURCE,
        version: MESSAGE_VERSION,
        request_id: requestId,
        ...payload,
      });
    });
  };

  return {
    init,
    isEmbeddedInOpsette: true,
    save: (data_id, value) =>
      sendRequest<unknown>({ type: 'save', data_id, value }).then(() => undefined),
    savePresets: (presets) =>
      sendRequest<unknown>({ type: 'save_presets', presets }).then(() => undefined),
    delete: (data_id) =>
      sendRequest<unknown>({ type: 'delete', data_id }).then(() => undefined),
    emit: (entity, payload) =>
      sendRequest<Record<string, unknown>>({ type: 'emit', entity, payload }).then((ack) => ({
        inbox_id: typeof ack.inbox_id === 'string' ? ack.inbox_id : '',
        entity: (typeof ack.entity === 'string' ? ack.entity : entity) as EmitEntity,
      })),
    onTimeout: (handler) => {
      timeoutHandlers.add(handler);
      return () => {
        timeoutHandlers.delete(handler);
      };
    },
  };
}
