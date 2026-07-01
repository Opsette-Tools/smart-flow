/**
 * Generate a unique id that works in EVERY context.
 *
 * crypto.randomUUID() only exists in a *secure context* (https or localhost).
 * When the app is opened over a plain-http LAN address — e.g. testing on a
 * phone at http://192.168.x.x:port — crypto.randomUUID is undefined and throws.
 * That silently broke industry seeding on mobile. This helper falls back to a
 * non-crypto id when the native one isn't available.
 */
export function uuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: RFC-4122-shaped id from getRandomValues, or Math.random as a
  // last resort. Uniqueness here only needs to scope to one in-memory list.
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
