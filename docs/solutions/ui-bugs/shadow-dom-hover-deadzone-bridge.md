---
title: Shadow DOM hover persistence across a dead zone via a transparent CSS bridge
date: 2026-06-01
category: ui-bugs
module: src/ui/widget
problem_type: ui_bug
component: floating_widget
symptoms:
  - "Hover-reveal widget collapses when the cursor moves from the main button to a sub-chip"
  - "Sub-chips appear and immediately disappear, making them unclickable"
  - "Adding a JS hover-intent timer feels laggy and still loses hover during fast moves"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - shadow_dom
  - css_pseudo_elements
tags:
  - shadow-dom
  - hover
  - css-bridge
  - floating-widget
  - pointer-events
---

# Shadow DOM hover persistence across a dead zone via a transparent CSS bridge

## Problem
An edge-docked floating widget reveals secondary chip buttons on hover of the main button. When the cursor crosses the gap between the 32px main button and the absolutely-positioned chips, the hover state on the container is lost and the chips disappear before the cursor can land on them.

## Symptoms
- Hovering the main button reveals a chip; moving toward the chip causes the entire group to collapse.
- The chip is technically visible for ~100ms but is never reachable — `mouseleave` fires the instant the cursor enters the dead zone.
- Slowing the cursor or hovering directly over the chip's projected position (without grazing the dead zone) does work, confirming a geometry issue rather than a timing issue.

## What Didn't Work
- **Increasing the chip's `top`/`bottom` to overlap the main button**: visually wrong (chip clipping into the main button) and only shifts the dead zone rather than eliminating it.
- **JS `setTimeout` hover-intent on `onMouseLeave`**: introduces a perceptible delay before the widget collapses on intentional exits, and still collapses during fast diagonal moves where the cursor leaves the entire `.amt-root` rectangle before re-entering the chip's standalone box.
- **Wrapping main + chip in a single static container without `position:absolute`**: forces a much larger always-rendered hitbox that intercepts page clicks, defeating the "invisible until hover" purpose of an overlay widget.
- **Listening for hover on the chip itself with a JS class toggle**: same fundamental problem — the moment the cursor leaves the main button's box, `:hover` on the container drops before the cursor enters the chip's box.

## Solution

A transparent `::before` pseudo-element on the root, sized to span the entire reveal area (main button + gap + chip). It is `pointer-events:none` by default (so the page underneath stays clickable) and switches to `pointer-events:auto` on `:hover`, forming a continuous hit region.

```css
.amt-root { position: fixed; right: 0; top: 50%; transform: translateY(-50%); }

/* Transparent hover bridge — only active while hovered */
.amt-root::before {
  content: '';
  position: absolute;
  right: 0;
  width: 60px;
  pointer-events: none;          /* let the host page receive clicks */
}
.amt-root[data-drop="down"]::before { top: -8px;    height: 96px; }
.amt-root[data-drop="up"]::before   { bottom: -8px; height: 96px; }
.amt-root:hover::before { pointer-events: auto; }   /* engage only on hover */

/* Buttons stack above the bridge so clicks reach them */
.amt-main, .amt-chip { position: relative; z-index: 1; }
```

Key shape rules:
- The bridge extends 8px past the chip's far edge (`-8px` / `bottom:-8px`, `height:96px`) so the cursor cannot escape diagonally through a corner.
- The bridge geometry is mirrored for both drop directions (`data-drop="down"` and `data-drop="up"`) — whichever direction the chips deploy, the bridge follows.
- Buttons use `z-index:1` to stack above the bridge so clicks land on the real elements, not the transparent overlay.

## Why This Works

`:hover` is computed against the union of the element's own box and any pseudo-element boxes that currently have non-zero hit area. By making `::before` opt-in (`pointer-events` toggling on `:hover`), the element only grows its hit region once the user has already entered it.

The result:

- **Before hover**: `::before` is `pointer-events:none`, so the root's hit area is just the 32px main button. The widget does not intercept page clicks in the surrounding 60×96px region.
- **During hover**: `::before` is `pointer-events:auto`, so the root's effective hit area becomes the union of main button + gap + chip. The cursor can move freely within that union without the root losing `:hover`.
- **On exit**: the cursor leaves the bridge, `:hover` drops, `::before` becomes inert again, and the page reclaims the area.

This is a pure-CSS solution with no JS hover-intent timer, no event listeners, and no rAF loops. It also stays scoped to the Shadow DOM because the styles are injected as a `<style>` child of the widget's shadow root — there is no risk of leaking the `::before` rule onto the host page.

## Prevention

- **Recognize the dead-zone pattern early**: any UI that reveals secondary controls on hover but separates them from the trigger with a gap will exhibit this bug. The fix is structural (geometry), not behavioral (timing).
- **Prefer CSS bridges over JS hover-intent**: bridges have zero latency, no timer to tune, and no race conditions with fast cursor moves. Reach for hover-intent only when the bridge would conflict with the page layout (e.g., the bridge would cover a critical underlying control even when not hovered).
- **Always toggle `pointer-events` on the bridge with `:hover`**: an always-on bridge silently steals clicks from the host page. The toggle keeps the bridge invisible to page interactions until the user has already opted in by hovering.
- **Mirror bridge geometry for every drop direction**: if the chips can deploy up or down (or left or right), every direction needs its own `::before` geometry. A single direction will silently break the other.
- **Use `z-index` to keep real buttons above the bridge**, otherwise clicks register on the transparent `::before` and the buttons stop working.
- **Test heuristic**: move the cursor along several straight-line paths from the trigger to each sub-control, including diagonal paths and paths that graze the bridge edges. Any path that drops hover indicates an under-sized bridge.

## Related Issues

- Spec: `docs/specs/2026-06-01-floating-widget-edge-dock-design.md`
- Spec (followup): `docs/specs/2026-06-01-floating-widget-sidepanel-hover-design.md`
- Plan: `docs/plans/2026-06-01-floating-widget-sidepanel-hover.md`
- Merge commit: `9162be8` (branch `feat/floating-widget-sidepanel-hover`)
- Companion learning: `docs/solutions/integration-issues/mv3-sidepanel-toggle-from-page.md` (the side panel toggle fix shipped in the same branch)
