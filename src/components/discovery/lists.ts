/**
 * Session-scoped controlled lists for `role` and `system`.
 *
 * Unlike smartflow/types.ts's MECHANISMS (one fixed app-wide list), a role or
 * system vocabulary is per-client — "AP clerk" at one company is "accounts
 * payable" at another. So the options themselves live on the DiscoveryDoc
 * (`roles`/`systemsList`), seeded empty and growing as you type new ones in
 * the meeting. The parse/label helpers below mirror parseMechanism/
 * mechanismLabel's exact shape so a Select wired to either list behaves
 * identically to the existing mechanism picker.
 */

import type { ListOption } from "./types";

/** Match an existing option by value or label (case-insensitive); otherwise
 *  treat the raw text as a brand-new option to add to the list. */
export function resolveListValue(options: ListOption[], raw: string): { value: string; isNew: boolean } {
  const trimmed = raw.trim();
  const byValue = options.find((o) => o.value.toLowerCase() === trimmed.toLowerCase());
  if (byValue) return { value: byValue.value, isNew: false };
  const byLabel = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) return { value: byLabel.value, isNew: false };
  return { value: trimmed, isNew: true };
}

export function listLabel(options: ListOption[], value: string | undefined): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

/** antd Select (mode="tags") options shape — value + label, same as MECHANISMS. */
export function toSelectOptions(options: ListOption[]): ListOption[] {
  return options;
}
