import React from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingWidget } from '../ui/widget/FloatingWidget'
import { getStorage, onStorageChanged } from '../shared/storage'
// Import the main-world script URL via crxjs's ?script&module query.
// This yields the correct hashed asset URL at build time, so the injected
// <script src> points at a real file in dist/assets/ (not a raw .ts path).
// @ts-ignore – crxjs vite plugin transform; not resolvable in TypeScript
import captureScriptUrl from './injected-capture.ts?script&module'

export const WIDGET_HOST_ID = 'api-to-mcp-tracker-host'

let _root: ReturnType<typeof createRoot> | null = null
let _observer: MutationObserver | null = null

export function isBlacklisted(hostname: string, blacklist: string[]): boolean {
  return blacklist.some((d) => hostname === d || hostname.endsWith(`.${d}`))
}

export function mountWidgetHost(): void {
  if (document.getElementById(WIDGET_HOST_ID)) return
  const host = document.createElement('div')
  host.id = WIDGET_HOST_ID
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  document.documentElement.appendChild(host)
  _root = createRoot(mountPoint)
  _root.render(React.createElement(FloatingWidget))
}

function observeReinjection(): void {
  _observer = new MutationObserver(() => {
    if (!document.getElementById(WIDGET_HOST_ID)) mountWidgetHost()
  })
  _observer.observe(document.documentElement, { childList: true, subtree: true })
}

export function teardownWidgetHost(): void {
  _observer?.disconnect()
  _observer = null
  _root = null
  document.getElementById(WIDGET_HOST_ID)?.remove()
}

export function watchTrackingForInjection(): void {
  // When the user resumes tracking on an already-loaded tab, inject the capture
  // script immediately instead of waiting for a reload. injectMainWorldCapture
  // is idempotent, so an already-injected page is a no-op.
  onStorageChanged((changes) => {
    const next = changes.settings?.newValue as { trackingEnabled?: boolean } | undefined
    if (next?.trackingEnabled === true) injectMainWorldCapture()
  })
}

export function injectMainWorldCapture(): void {
  if (document.getElementById('__api-tracker-capture__')) return
  const script = document.createElement('script')
  script.id = '__api-tracker-capture__'
  // crxjs ?script import yields a root-absolute path ("/assets/..."). A page
  // <script src> would resolve that against the PAGE origin (404). Pin it to the
  // extension origin. Strip the leading slash so getURL builds a clean path.
  script.src = chrome.runtime.getURL((captureScriptUrl as string).replace(/^\//, ''))
  script.type = 'module'
  ;(document.head ?? document.documentElement).appendChild(script)
}

async function init(): Promise<void> {
  const { settings } = await getStorage()
  if (isBlacklisted(location.hostname, settings.blacklistedDomains)) return
  // MVP: consent gate bypassed. Capture is gated by trackingEnabled only.
  // ConsentBanner/consentGivenAt are retained for future re-introduction.
  if (settings.trackingEnabled) injectMainWorldCapture()
  mountWidgetHost()
  observeReinjection()
  watchTrackingForInjection()
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof window !== 'undefined') {
  void init()
}
