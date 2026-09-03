/**
 * "Save as PDF" for a discovery session — same technique as
 * smartflow/diagram/printFindings.ts: clone read-only content into a hidden
 * iframe with its own print stylesheet and hand off to the browser's native
 * print dialog. Real selectable text, real page breaks, no PDF library.
 *
 * The clone source is DiscoverySummary, not the Build-mode edit forms — those
 * are drag handles and blur-to-commit inputs, not something that should ever
 * reach paper. No logo: this is meant to read as a plain internal working
 * document, not a branded deliverable.
 */

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 11pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    background: #fff;
  }

  /* Document title (the string passed to printDiscovery — the session name).
     Distinct from the process-name h1 the summary itself renders, same as
     printFindings.ts's own h1-plus-cloned-content shape. */
  body > h1 {
    font-size: 12pt;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #666;
    margin: 0 0 4pt;
  }

  /* Process name — the real headline of the document. Bold, large, and set
     off with a rule so it reads as a title, not another paragraph. */
  .sf-summary-heading {
    font-size: 22pt;
    font-weight: 750;
    letter-spacing: -0.01em;
    margin: 0 0 10pt;
    padding-bottom: 10pt;
    border-bottom: 1.5pt solid #1a1a1a;
  }

  /* Section headings (Steps, Artifacts, Decision rules, Glossary,
     Exceptions, Volume) — the one piece of hierarchy the old layout was
     missing entirely. Bumped well past body size, a rule underneath, and
     enough top margin to read as a break between sections rather than a
     bigger word above the same list. */
  .sf-section-title {
    font-size: 15pt;
    font-weight: 700;
    margin: 22pt 0 10pt;
    padding-bottom: 5pt;
    border-bottom: 1pt solid #ccc;
    break-after: avoid;
    page-break-after: avoid;
  }
  .sf-summary-section:first-of-type + .sf-summary-section .sf-section-title,
  .sf-summary-section-header + .sf-summary-section .sf-section-title {
    margin-top: 0;
  }

  .sf-summary-empty { color: #666; font-size: 10pt; }

  /* ---- Fact row: "Label   value", used everywhere (header facts, step
     facts, side-table facts). Label is a fixed-width column so a value that
     wraps onto a second line indents under the first line's value instead of
     colliding back under the label — the bug the previous version had. */
  .sf-summary-fact-row {
    display: grid;
    grid-template-columns: 96pt 1fr;
    column-gap: 8pt;
    font-size: 10pt;
    margin-bottom: 3pt;
  }
  .sf-summary-fact-label {
    color: #666;
    font-weight: 600;
  }
  .sf-summary-fact-value { }

  .sf-summary-header-facts { margin-top: 2pt; }
  .sf-summary-attendees { white-space: pre-wrap; }

  /* ---- Steps ---- */
  .sf-summary-steps { display: flex; flex-direction: column; }
  .sf-summary-step {
    break-inside: avoid;
    page-break-inside: avoid;
    padding: 9pt 0;
    border-bottom: 0.5pt solid #ddd;
  }
  .sf-summary-steps .sf-summary-step:first-child { padding-top: 0; }
  .sf-summary-step-head { margin-bottom: 5pt; }
  .sf-summary-step-label {
    display: inline-block;
    font-size: 11.5pt;
    font-weight: 750;
    padding: 1pt 7pt;
    border: 1pt solid #1a1a1a;
    border-radius: 3pt;
  }

  .sf-summary-pain-tag {
    display: inline-block;
    font-size: 9.5pt;
    color: #8a4b00;
    background: #fdf2e0;
    border: 0.5pt solid #d99a3a;
    border-radius: 3pt;
    padding: 1pt 6pt;
  }

  .sf-summary-backfill {
    margin-top: 6pt;
    padding-top: 6pt;
    border-top: 0.5pt dotted #ccc;
  }
  .sf-summary-backfill .sf-summary-fact-row { font-size: 9.5pt; }

  /* ---- Side tables (Artifacts, Decision rules, Glossary, Exceptions,
     Volume) ---- */
  .sf-summary-side-rows { display: flex; flex-direction: column; }
  .sf-summary-side-row {
    break-inside: avoid;
    page-break-inside: avoid;
    padding: 8pt 0;
    border-bottom: 0.5pt solid #ddd;
  }
  .sf-summary-side-rows .sf-summary-side-row:first-child { padding-top: 0; }
  .sf-summary-side-primary {
    font-size: 11.5pt;
    font-weight: 700;
    margin-bottom: 4pt;
  }
`;

/**
 * Print the given element as a standalone document.
 * Silently does nothing when there's no content — the caller disables the
 * button in that case, so reaching here with null is not an error worth raising.
 */
export function printDiscovery(source: HTMLElement | null, title = "Discovery session"): void {
  if (!source || typeof window === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 1000);
  };

  const win = frame.contentWindow;
  const docu = frame.contentDocument;
  if (!win || !docu) {
    frame.remove();
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;

  docu.open();
  docu.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${PRINT_CSS}</style></head><body></body></html>`,
  );
  docu.close();

  const heading = docu.createElement("h1");
  heading.textContent = title;
  docu.body.appendChild(heading);
  docu.body.appendChild(clone);

  win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    cleanup();
  });
}
