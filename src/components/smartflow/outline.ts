/**
 * Shared outline parser for the paste-a-list diagram types (flowchart,
 * decision-tree, org-tree, timeline).
 *
 * The whole point of SmartFlow is that a non-technical person just pastes a
 * list. Indentation (tabs or spaces) means "this sits under the line above it."
 * That single, forgiving rule powers every hierarchical diagram — the user
 * never learns syntax, they just indent.
 *
 * Examples:
 *   Owner            ← top level
 *     Manager        ← under Owner
 *       Staff        ← under Manager
 *     Manager 2      ← under Owner
 */

export interface OutlineNode {
  id: string;
  label: string;
  depth: number;
  parentId: string | null;
  children: OutlineNode[];
}

/** Count leading-whitespace "levels". Tabs = one level; every 2 spaces = one. */
function indentLevel(line: string): number {
  const ws = line.match(/^[\t ]*/)?.[0] ?? "";
  let level = 0;
  for (const ch of ws) {
    if (ch === "\t") level += 1;
  }
  const spaces = (ws.match(/ /g) ?? []).length;
  level += Math.floor(spaces / 2);
  return level;
}

/**
 * Parse pasted text into a forest of OutlineNodes. Blank lines are skipped.
 * Indentation jumps are tolerated (a line indented 3 past its parent is treated
 * as one level deeper, not three) so messy paste still produces a sane tree.
 *
 * `idFor(index)` supplies a stable id per line so re-parses can reuse ids when
 * the caller wants; default is a positional id.
 */
export function parseOutline(text: string, idFor: (i: number) => string = (i) => `n${i}`): OutlineNode[] {
  const rawLines = text.split("\n");
  const roots: OutlineNode[] = [];
  // Stack of ancestors keyed by their normalized depth.
  const stack: OutlineNode[] = [];
  let order = 0;

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const rawDepth = indentLevel(raw);
    const label = raw.trim();

    // Normalize depth so it can be at most one deeper than the current parent.
    const parentDepth = stack.length ? stack[stack.length - 1].depth : -1;
    const depth = Math.min(rawDepth, parentDepth + 1);

    // Pop the stack until the top is a valid parent (depth one less than ours).
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    const parent = stack.length ? stack[stack.length - 1] : null;
    const node: OutlineNode = {
      id: idFor(order),
      label,
      depth,
      parentId: parent ? parent.id : null,
      children: [],
    };
    order += 1;

    if (parent) parent.children.push(node);
    else roots.push(node);

    stack.push(node);
  }

  return roots;
}
