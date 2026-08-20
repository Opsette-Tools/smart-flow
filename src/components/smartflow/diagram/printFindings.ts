/**
 * "Save as PDF" for the findings page.
 *
 * Uses the browser's own print pipeline rather than a PDF library. That is the
 * better tool here, not the cheaper one: this page is text — headings, lists,
 * a written summary — so printing gives real selectable text, real page breaks,
 * and the user's familiar Save-as-PDF dialog. A canvas-based PDF library would
 * mean re-laying-out every paragraph at fixed coordinates and would rasterize
 * text that should stay searchable.
 *
 * The technique: clone the findings into a hidden iframe with its own minimal
 * stylesheet and print that. Printing the live page instead would drag along
 * the app header, the tab bar, antd's collapse chrome, and dark-mode colors —
 * and would need a print stylesheet fighting every one of them. A clean
 * document is easier to get right and can't be broken by an unrelated UI change.
 */

/** Expand every collapsed section so a printed copy is never half-empty. */
function expandCollapsedSections(root: HTMLElement): void {
  // antd renders a closed panel's body with `display: none` inline, or omits
  // it entirely. Un-hide what's there; a panel that never opened has no body
  // in the DOM, so its heading still prints with its count.
  root.querySelectorAll<HTMLElement>(".ant-collapse-content").forEach((el) => {
    el.style.display = "block";
    el.classList.remove("ant-collapse-content-hidden");
  });
  root.querySelectorAll<HTMLElement>("[hidden]").forEach((el) => {
    el.removeAttribute("hidden");
  });
}

/** Strip interactive chrome that means nothing on paper. */
function removeControls(root: HTMLElement): void {
  root
    .querySelectorAll(
      "button, .ant-btn, .sf-summary-actions, .ant-collapse-expand-icon, .ant-tooltip",
    )
    .forEach((el) => el.remove());
}

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 11pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    background: #fff;
  }
  h1 { font-size: 20pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; }
  h3 { font-size: 12pt; margin: 14pt 0 5pt; }
  /* A section heading stranded at the foot of a page reads as an empty
     section, so keep each one with the lines that follow it. */
  h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
  ul, ol { margin: 0 0 8pt; padding-inline-start: 18pt; }
  li { margin-bottom: 3pt; break-inside: avoid; page-break-inside: avoid; }
  p { margin: 0 0 8pt; }

  /* The app's own finding markup, restated for paper. */
  .sf-finding { list-style: disc; }
  .sf-finding-say { display: block; }
  .sf-finding-why { display: block; font-size: 9.5pt; color: #666; }
  .sf-gap-group-name {
    font-weight: 650;
    margin: 8pt 0 3pt;
    break-after: avoid;
    page-break-after: avoid;
  }
  .sf-gap-intro { display: block; font-size: 9.5pt; color: #666; margin-bottom: 5pt; }
  .sf-gap-head { display: flex; gap: 8pt; align-items: baseline; font-weight: 650; }
  .sf-gap-count { font-weight: 400; color: #666; }

  /* antd leaves its own scaffolding behind in the clone; flatten it so the
     panels read as plain document sections. */
  .ant-collapse, .ant-collapse-item, .ant-collapse-content, .ant-collapse-content-box,
  .ant-collapse-header, .ant-tag {
    border: 0 !important;
    background: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .ant-collapse-header { font-weight: 650; margin: 12pt 0 4pt !important; }
  .ant-collapse-item { margin-bottom: 10pt !important; }
  .ant-tag { color: #666 !important; }

  .sf-summary { margin-top: 20pt; }
  .sf-summary-editor { outline: none; }
`;

/**
 * Print the given element as a standalone document.
 * Silently does nothing when there's no content — the caller disables the
 * button in that case, so reaching here with null is not an error worth raising.
 */
export function printFindings(source: HTMLElement | null, title = "Findings"): void {
  if (!source || typeof window === "undefined") return;

  const frame = document.createElement("iframe");
  // Off-screen rather than display:none — a hidden iframe doesn't always get a
  // layout, and an unlaid-out document can print blank.
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const cleanup = () => {
    // Deferred: removing the iframe while the print dialog still owns it can
    // cancel the job in some browsers.
    window.setTimeout(() => frame.remove(), 1000);
  };

  const win = frame.contentWindow;
  const docu = frame.contentDocument;
  if (!win || !docu) {
    frame.remove();
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  expandCollapsedSections(clone);
  removeControls(clone);

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

  // One frame so the cloned content has a layout before the dialog opens.
  win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    cleanup();
  });
}
