---
title: MV3 chrome.sidePanel full toggle (open + close) from a page-script user gesture
date: 2026-06-01
category: integration-issues
module: src/background, src/ui/sidepanel
problem_type: integration_issue
component: service_worker
symptoms:
  - "Clicking the floating widget button opens the side panel but a second click does not close it"
  - "chrome.sidePanel.open() throws \"must be called in response to a user gesture\" when invoked from the SW message handler"
  - "After a close-and-reopen cycle the panel becomes permanently disabled on that tab until reload"
root_cause: wrong_api
resolution_type: code_fix
severity: high
related_components:
  - service_worker
  - sidepanel_page
  - content_script_widget
tags:
  - chrome-extension
  - manifest-v3
  - sidepanel
  - user-gesture
  - service-worker
---

# MV3 chrome.sidePanel full toggle (open + close) from a page-script user gesture

## Problem
Chrome MV3 exposes `chrome.sidePanel.open()` but **no `chrome.sidePanel.close()`**, and `open()` only works inside a live user-gesture stack. A floating widget button rendered in page context (Shadow DOM, content script) needs to both open and close the side panel by sending a single message to the background service worker — without losing the gesture and without leaving the panel in a broken state.

## Symptoms
- First click opens the side panel; second click on the same widget button does nothing visible.
- Background SW logs `chrome.sidePanel.open() must be called in response to a user gesture` even though the call originated from a real click.
- Edge case: after one open → close → re-open cycle interrupted by SW termination, the panel becomes permanently disabled on that tab and no further `open()` call recovers it until the tab reloads.
- jsdom-based unit tests cannot reproduce the gesture-loss bug (no real `userActivation` stack in jsdom).

## What Didn't Work
- **Calling `chrome.sidePanel.close()`**: API does not exist. TypeScript types in `@types/chrome` do not include it; runtime throws `undefined is not a function`.
- **Awaiting `getStorage()` before branching on `OPEN_SIDEPANEL`** in the SW `onMessage` listener: the existing write-serialization queue (`writeLock.then(...)`) is asynchronous. Any `await` between the listener entry and `chrome.sidePanel.open()` drops the synchronous gesture stack and `open()` rejects.
- **Using `setOptions({enabled:false})` alone to "close"**: disables the panel for that tab but leaves it disabled — the next open call silently no-ops because the panel is no longer enabled on the tab. No error is thrown, which makes this especially misleading.
- **Tracking "is panel open?" by listening to `chrome.runtime.onMessage` from the panel page**: works while the panel is open but provides no signal when the user closes the panel via the native close button — the SW keeps thinking the panel is open and the next click "closes" it (no-op) instead of opening.
- **Querying `chrome.tabs.query` from the panel page without the `tabs` permission**: a reviewer flagged this as a problem expecting `tab.id` to be `undefined`. In practice `tab.id` is **always** returned regardless of permissions — `tabs`/host permissions only gate url/title/favicon. The query works fine.

## Solution

Four cooperating pieces:

### 1. Synchronous gesture-preserving branch in the SW message listener

Handle `OPEN_SIDEPANEL` on the **first line** of the listener, before any `await`, and bypass the write-serialization queue entirely (no state mutation needed).

```ts
// src/background/index.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.OPEN_SIDEPANEL) {
    // Handle synchronously, before any await, to preserve the user gesture
    // that chrome.sidePanel.open() requires. Does not enter the serialized
    // storage queue (no state mutation needed). Returns without `return true`:
    // the synchronous sendResponse closes the channel; `return true` is only
    // for deferred async responses. Adding any await above this breaks both.
    sidePanel.toggle(sender.tab?.id)
    sendResponse({ ok: true })
    return
  }
  // ...other messages go through the serialized async path with `return true`
})
```

Two subtleties:

- The handler must `return` (no value), **not** `return true`. `return true` keeps the message channel open for a deferred async `sendResponse`. Since the response was already sent synchronously, returning `true` makes Chrome wait for a second response that never arrives.
- The synchronous branch must dispatch every `chrome.sidePanel.*` call synchronously too — any awaited storage read or message hop in between drops the gesture.

### 2. Close emulation via disable → re-enable

Track open tabs in an in-memory `Set<number>`. To "close", call `setOptions({enabled:false})` and chain `setOptions({enabled:true, path})` so the next click can open again.

```ts
// src/background/index.ts — createSidePanelController()
function toggle(tabId: number | undefined): void {
  if (tabId === undefined) return
  if (openTabs.has(tabId)) {
    void chrome.sidePanel
      .setOptions({ tabId, enabled: false })
      .then(() => chrome.sidePanel.setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH }))
      .catch((e) => console.error('[AMT] side panel close failed', e))
  } else {
    // Re-assert enabled before opening: a prior close (disable→re-enable) could
    // be interrupted by SW termination, leaving this tab's panel disabled with
    // no recovery. Both calls dispatch synchronously, preserving the user
    // gesture that sidePanel.open() requires.
    void chrome.sidePanel
      .setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH })
      .catch((e) => console.error('[AMT] side panel enable failed', e))
    void chrome.sidePanel.open({ tabId }).catch((e) => console.error('[AMT] side panel open failed', e))
  }
}
```

The pre-open `setOptions(enabled:true)` is **self-healing**: if the previous close-chain was interrupted between disable and re-enable (SW termination), the tab would be stuck disabled. Asserting `enabled:true` before every open recovers it. Both calls dispatch synchronously to preserve the gesture.

### 3. Long-lived port as the single source of truth for "is the panel open?"

The panel page opens a `chrome.runtime.connect({name:'sidepanel'})` port on mount and posts its own `tabId`. The SW tracks the tab via `onConnect`, and **`onDisconnect` fires automatically when the panel page unloads** — which covers both programmatic close (disable) and the user's native close button.

```ts
// src/ui/sidepanel/port.ts
export async function connectSidePanelPort(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tabs[0]?.id
  if (typeof tabId !== 'number') return
  const port = chrome.runtime.connect({ name: 'sidepanel' })
  port.postMessage({ tabId })
}
```

```ts
// src/background/index.ts — createSidePanelController()
function registerPort(port: chrome.runtime.Port): void {
  if (port.name !== 'sidepanel') return
  let tabId: number | undefined
  port.onMessage.addListener((m: unknown) => {
    const id = (m as { tabId?: number })?.tabId
    if (typeof id === 'number') {
      tabId = id
      openTabs.add(id)
    }
  })
  port.onDisconnect.addListener(() => {
    if (tabId !== undefined) openTabs.delete(tabId)
  })
}
```

### 4. Controller factory for testability

`createSidePanelController()` returns `{toggle, registerPort}` so unit tests can mock `chrome.sidePanel` and feed fake port emitters without booting the whole SW. The gesture-loss and "panel actually opens" assertions still require a real browser — keep manual verification in the loop.

## Why This Works

- **Gesture preservation**: Chrome propagates `userActivation` only through synchronous call stacks. The MV3 SW receives a message with the activation flag intact, but every `await` resets it. Branching on `OPEN_SIDEPANEL` as the first synchronous statement keeps the flag alive long enough for `chrome.sidePanel.open()` to accept the call.
- **Close emulation**: The Chrome team intentionally omitted `sidePanel.close()` (see [crbug/1487588](https://crbug.com/1487588)). `setOptions({enabled:false})` is the documented workaround; chaining the re-enable restores future-open capability without leaving a disabled state behind.
- **Port-based tracking**: `onDisconnect` fires whenever the panel page unloads — programmatic disable, user close button, tab navigation, or window close. That makes the port the only signal that catches all four close paths. The `openTabs` Set is in-memory, so MV3 SW termination resets it, but `registerPort` re-populates the Set whenever the panel reconnects after SW wake-up.
- **Self-heal on open**: The disable→re-enable chain can be interrupted by SW termination between the two `setOptions` calls. Without the pre-open `setOptions(enabled:true)`, the tab would be stuck disabled forever. Asserting `enabled:true` is idempotent and cheap.

## Prevention

- **Lint rule of thumb**: any handler that calls `chrome.sidePanel.open()`, `chrome.action.openPopup()`, or other gesture-required APIs must not contain `await` above the call. Treat the gesture stack as a non-renewable resource.
- **Never assume a Chrome extension API exists because it would be symmetric** (`open`/`close`, `enable`/`disable`). Check the API reference and the Chromium bug tracker for known omissions — `sidePanel.close()` is the most commonly hit example.
- **Track lifecycle with a long-lived port, not request/response messages**: `onConnect`/`onDisconnect` cover every close path including the user's native close button. One-shot messages do not.
- **Add an idempotent `setOptions(enabled:true)` before every `open()`** in the toggle path. The cost is one extra API call; the win is recovering from arbitrary SW-termination timing.
- **Test factoring**: extract the controller as `createSidePanelController()` so unit tests can drive `toggle()` and `registerPort()` with mocked Chrome APIs and a fake port emitter. Keep a manual checklist for the real-browser checks the harness can't simulate:
  1. Click widget → panel opens
  2. Click widget again → panel closes
  3. Click widget a third time → panel reopens (catches the disable-stuck bug)
  4. Open panel, navigate the host page, close panel via native button → click widget → panel opens (catches stale `openTabs` tracking)
- **Permission expectation**: `chrome.tabs.query()` returns `tab.id` without the `tabs` permission. Code review feedback claiming otherwise is incorrect — `tabs`/host permissions only gate `url`, `title`, `favIconUrl`. Document this so the same review comment doesn't recur.

## Related Issues

- Spec: `docs/specs/2026-06-01-floating-widget-sidepanel-hover-design.md`
- Plan: `docs/plans/2026-06-01-floating-widget-sidepanel-hover.md`
- Merge commit: `9162be8` (branch `feat/floating-widget-sidepanel-hover`)
- Companion learning: `docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md` (the hover persistence fix shipped in the same branch)
