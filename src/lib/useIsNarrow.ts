import { useEffect, useState } from "react";

/**
 * True on phone-width viewports. One definition of "narrow" for the whole app,
 * so a component never hardcodes its own breakpoint — the number lives here and
 * matches the `575px` boundary the stylesheet already uses.
 *
 * Layout that CSS can do belongs in CSS. This is for the cases CSS can't reach:
 * dropping a button's text label, or swapping which control renders at all.
 */
const NARROW_QUERY = "(max-width: 575px)";

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(NARROW_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    // Re-sync on mount: the viewport can change between the lazy initializer
    // and this effect (rotation, or a resize during hydration).
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
