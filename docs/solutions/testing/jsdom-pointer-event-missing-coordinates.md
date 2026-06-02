---
title: jsdom lacks PointerEvent — pointer-drag tests silently drop clientY
date: 2026-06-01
category: testing
module: src/ui/widget
problem_type: test_failure
component: react_component
symptoms:
  - "fireEvent.pointerDown/pointerMove with clientY does not move the dragged element"
  - "The drag handler receives undefined for clientX, clientY, and pointerId"
  - "Tests assert no position change even though the production component works correctly"
  - "Switching to fireEvent.mouseMove does not fix the test (component listens on pointer events)"
root_cause: environment_gap
resolution_type: polyfill
severity: medium
related_components:
  - jsdom
  - testing-library
  - pointer_events
tags:
  - jsdom
  - pointer-events
  - drag
  - polyfill
  - test-setup
  - floating-widget
---

# jsdom lacks PointerEvent — pointer-drag tests silently drop clientY

## Problem

Testing a pointer-based vertical drag on the `FloatingWidget` component. Calls to `fireEvent.pointerDown(el, { clientY: 300, pointerId: 1 })` and `fireEvent.pointerMove(el, { clientY: 400, pointerId: 1 })` produced no movement. The React `onPointerMove` handler executed but read `undefined` for all coordinates, so the drag logic treated every move as a no-op.

## Symptoms

- Drag tests pass (no assertion error on the handler call path) but position assertions fail — the element stays at its initial position.
- `console.log(e.clientY)` inside the handler prints `undefined` or `NaN`, not the value passed to `fireEvent`.
- Production behaviour is correct (the widget drags normally in a real browser), so the bug is test-environment-only.
- Replacing `onPointerMove` with `onMouseMove` in the component makes the test pass — but that is the wrong fix (it changes the component contract).

## What Didn't Work

- **Assuming jsdom fires pointer events with coordinates**: jsdom does not implement the `PointerEvent` constructor at all. `@testing-library/dom`'s `fireEvent.pointerDown` falls back to a generic `Event` instance that lacks `clientX`/`clientY`/`pointerId` on its prototype.
- **Using `fireEvent.mouseMove`**: the component's handler is registered on `onPointerMove`. A `mousemove` event never triggers it; the test becomes a false green that does not exercise the real code path.
- **Passing coordinates as a second argument to `fireEvent.pointerDown` without a polyfill**: the `init` object is merged into a plain `Event`, but `clientX`/`clientY` are read-only on `Event` and not present on `PointerEvent`'s prototype. They silently become `undefined`.

## Solution

Add a minimal `PointerEvent` polyfill that extends `MouseEvent` (which jsdom fully supports and which carries `clientX`/`clientY`) in the shared test setup file `src/test-setup.ts`. Guard the class definition so it only runs when `window` exists and the real `PointerEvent` is absent.

```ts
// src/test-setup.ts
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    PointerEventPolyfill as unknown as typeof PointerEvent
}
```

After adding this polyfill, `fireEvent.pointerDown(el, { clientY: 300, pointerId: 1 })` correctly delivers `clientY: 300` to the handler.

Companion caveat — `offsetHeight` is always `0` in jsdom. When the drag handler clamps position against element height (e.g. `Math.min(newY, el.offsetHeight - chipHeight)`), use `|| fallback` rather than `?? fallback`:

```ts
// jsdom returns 0 for offsetHeight; use || so 0 triggers the fallback
const containerHeight = containerRef.current?.offsetHeight || FALLBACK_HEIGHT
```

`?? 0` treats the real value `0` as valid and produces a clamp of `0`, pinning the widget to the top on every move.

## Why This Works

jsdom implements `MouseEvent` (including `clientX`, `clientY`, `screenX`, `screenY`, `buttons`) but not `PointerEvent`. By extending `MouseEvent`, the polyfill inherits the entire coordinate infrastructure that jsdom already wires up. Extending plain `Event` would not work because `Event` has no concept of pointer coordinates.

The polyfill is intentionally minimal — it only adds `pointerId`, which is the one `PointerEvent`-specific property the drag handler uses. No other `PointerEvent` fields (`pressure`, `tiltX`, etc.) are needed for this widget, and adding them speculatively would violate the simplicity guideline.

## Prevention

- Place the polyfill in the **shared test setup** (`src/test-setup.ts`, referenced by `vitest.config.ts` as `setupFiles`). Putting it in individual test files leads to duplication and divergence.
- Any component that handles `onPointerDown` / `onPointerMove` / `onPointerUp` will exhibit silent coordinate loss in jsdom without this polyfill. When adding a new pointer-driven component, confirm the polyfill is already in `test-setup.ts` before writing drag tests.
- Always mock or stub `offsetHeight`/`offsetWidth` explicitly in layout-sensitive drag tests, or use the `|| fallback` pattern in production code. jsdom never computes layout.
- The diagnostic tell: if a drag test passes (no throw) but position assertions fail, and production works, suspect missing coordinates before suspecting logic bugs.

## Related Issues

- Branch: `P1` (merged, master commit `b8b7a47`)
- Test file: `src/ui/widget/FloatingWidget.test.tsx`
- Component: `src/ui/widget/FloatingWidget.tsx`
- Companion: `docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md` (same widget, hover dead-zone fix)
