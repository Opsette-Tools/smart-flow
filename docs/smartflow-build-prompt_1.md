# SmartFlow — Build Prompt

## Context
SmartFlow is a tool inside the Opsette monorepo (alongside other shared tools). It lives in a workspace that already has shared brand-styling components — check the existing workspace structure and reuse those shared components/tokens rather than introducing new ones. Do not scaffold a new design system; integrate with what's already there.

## What SmartFlow does
SmartFlow lets a non-technical user turn a flat or pre-grouped list of process steps into a clean swimlane diagram — without using AI/LLM text parsing. The user manually assigns each item to a lane, an order within that lane, and (optionally) which other item it hands off to. No free-text interpretation, no "AI guesses the structure" — every placement is an explicit user choice via form controls.

Initial use case: a product development pipeline (e.g. opportunity intake → negotiation → bid winning → launch) where steps belong to different departments (lanes) but some steps in one department hand off to steps in another.

## Core data model
Each item:
- `id`
- `label` (the pasted text)
- `lane` (department/column it belongs to)
- `order` (vertical position within its lane)
- `connectsTo` (array of other item IDs — cross-lane handoffs)

Lanes:
- `id`, `name`, `order` (left-to-right column position)

## User flow
1. **Define lanes** — user types in lane names (e.g. "Sales, Legal, Ops, Finance"). Reorderable.
2. **Add items** — two entry points feeding the same data model:
   - A general inbox textarea (one item per line) for flat/unsorted source text.
   - Per-lane textareas, so if the user's source doc is already grouped by department, they can paste directly into that lane and skip manual assignment.
3. **Assign unsorted items** — anything entered via the general inbox shows as a list with a dropdown to pick its lane, and a way to set its order within that lane (drag-to-reorder is ideal; a numeric/select fallback is fine for v1).
4. **Assign order within lane** — drag-to-reorder within each lane's items (or up/down controls as a simpler fallback).
5. **Assign connections** — each item gets a "leads to →" control (multi-select or repeatable dropdown) listing other items by label, to define cross-lane handoffs. This is form-based assignment, NOT click-to-connect on canvas, for this version.
6. **Render** — a read-only diagram showing lanes as columns, items as cards in their assigned order, with connector lines drawn between items per their `connectsTo` relationships, using React Flow for rendering only (no live canvas editing in v1).
7. **Export** — output should be exportable as a static image (PNG at minimum; SVG/PDF as a stretch goal) so it can be shared with clients who aren't using the tool directly.

## Hard technical constraints (non-negotiable)
- **No TanStack libraries** of any kind (no TanStack Router, Query, Table, etc.) — use built-in React state/routing only.
- **Ant Design** for all UI components and styling. **No Tailwind CSS.**
- **React Flow** is approved specifically for rendering the swimlane diagram with cross-lane connectors — this is the one diagramming-specific dependency, used as a renderer, not a free-form editor.
- **No AI/LLM/GPT integration of any kind.** All structure comes from explicit user input (dropdowns, drag-and-drop, typed lane names) — never inferred or parsed by a model.
- **Static files only**, deployable to GitHub Pages. No backend, no server-side rendering, no database, no API keys, no server dependencies.
- **Mobile responsive** using Ant Design's grid system — swimlane view should degrade gracefully on narrow screens (e.g. stacked lanes or horizontal scroll, not broken layout).
- Keep external dependencies minimal beyond Ant Design and React Flow.
- Reuse the monorepo's existing shared brand/styling components rather than duplicating design tokens.
- Avoid a generic AI-template look — clean, intentional, professional layout consistent with the rest of the Opsette toolset.

## Out of scope for v1
- Click-to-connect editing directly on the rendered diagram (form-based connection assignment only, for now).
- Any AI-assisted classification or text parsing.
- Templates beyond the swimlane/process-pipeline type (hierarchy/org-chart and other layouts are a later phase, not this build).
- Multi-user collaboration or saved/shared state beyond local session (confirm with me before adding persistence — this should stay simple unless there's a clear need).

## Naming
Tool name: **SmartFlow**. Use this name in the package/module name, UI header, and any user-facing labels.
