import { POSTMSG_SOURCE, MSG } from '../shared/messages'
import type { SessionChangeReason } from '../shared/messages'
import type { ApiCall } from '../shared/types'

export interface RawCall {
  url: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string | null
  durationMs: number
  now: number
}

export function buildApiCall(raw: RawCall): ApiCall {
  return {
    id: `call_${raw.now}_${Math.random().toString(36).slice(2, 8)}`,
    url: raw.url,
    method: raw.method,
    requestHeaders: raw.requestHeaders,
    requestBody: raw.requestBody,
    responseStatus: raw.responseStatus,
    responseHeaders: raw.responseHeaders,
    responseBody: raw.responseBody,
    durationMs: raw.durationMs,
    capturedAt: raw.now,
  }
}

function postCapture(win: Window, call: ApiCall): void {
  // Target the page's own origin, NOT '*'. A wildcard target broadcasts captured
  // auth headers and response bodies to any listener on the page (XSS/3p scripts).
  //
  // NOTE: These postMessage payloads use `kind` (page → content-script protocol),
  // which is intentionally distinct from the chrome.runtime RuntimeMessage shape
  // (which uses `type`). The content bridge in content-bridge.ts translates `kind`
  // into the RuntimeMessage `type` field when forwarding to the background worker.
  win.postMessage(
    { source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED, call: { ...call, pageUrl: win.location.href } },
    win.location.origin,
  )
}

function postSessionChange(win: Window, reason: SessionChangeReason, url: string): void {
  // See postCapture: `kind` is the page-to-content-script protocol, distinct from RuntimeMessage `type`.
  win.postMessage({ source: POSTMSG_SOURCE, kind: MSG.SESSION_CHANGE, reason, url }, win.location.origin)
}

// Resolve relative URLs (the common SPA pattern: fetch('/api/x')) against the
// page URL at capture time, so downstream URL parsing — whitelist host match,
// dedupe path key, detail-view display — always sees an absolute URL.
function absolutize(url: string, win: Window): string {
  try {
    return new URL(url, win.location.href).href
  } catch {
    return url // malformed input: keep the raw string, capture stays best-effort
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function normalizeReqHeaders(init?: RequestInit): Record<string, string> {
  // When input is a Request object, baked-in headers/body are not captured
  // (body stream already consumed by the time we could read it; init takes precedence).
  if (!init?.headers) return {}
  if (init.headers instanceof Headers) return headersToObject(init.headers)
  if (Array.isArray(init.headers)) return Object.fromEntries(init.headers)
  return { ...(init.headers as Record<string, string>) }
}

export function installFetchPatch(win: Window & typeof globalThis): void {
  const original = win.fetch.bind(win)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(win as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = Date.now()
    const url = absolutize(
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url,
      win,
    )
    const method =
      init?.method ??
      (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET')
    const res = await original(input as RequestInfo, init)
    try {
      const clone = res.clone()
      const body = await clone.text()
      const end = Date.now()
      postCapture(
        win,
        buildApiCall({
          url,
          method: method ?? 'GET',
          requestHeaders: normalizeReqHeaders(init),
          requestBody: typeof init?.body === 'string' ? init.body : null,
          responseStatus: res.status,
          responseHeaders: headersToObject(res.headers),
          responseBody: body,
          durationMs: end - start,
          now: end,
        }),
      )
    } catch {
      // capture is best-effort; never break the page
    }
    return res
  }
}

export function installHistoryPatch(win: Window & typeof globalThis): void {
  const origPush = win.history.pushState.bind(win.history)
  const origReplace = win.history.replaceState.bind(win.history)

  win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    origPush(data, unused, url ?? null)
    postSessionChange(win, 'pushState', win.location.href)
  }
  win.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    origReplace(data, unused, url ?? null)
    postSessionChange(win, 'replaceState', win.location.href)
  }

  win.addEventListener('popstate', () => postSessionChange(win, 'popstate', win.location.href))
  win.addEventListener('beforeunload', () => postSessionChange(win, 'beforeunload', win.location.href))
}

export function installXhrPatch(win: Window & typeof globalThis): void {
  const OrigXHR = win.XMLHttpRequest
  if (!OrigXHR) return
  const proto = OrigXHR.prototype
  const origOpen = proto.open as (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) => void
  const origSend = proto.send as (body?: Document | XMLHttpRequestBodyInit | null) => void

  type Tracked = XMLHttpRequest & {
    __cap?: { url: string; method: string; body: string | null; start: number }
  }

  proto.open = function (this: Tracked, method: string, url: string | URL, ...rest: unknown[]) {
    // Call through first, then stamp __cap. In tests, installXhrPatch layers onto the
    // same XMLHttpRequest.prototype more than once: importing this module auto-installs
    // against the global jsdom window (see the guard at the bottom), and each test's
    // explicit installXhrPatch(win) stacks on top with nothing un-patching in between.
    // Setting __cap after the delegate call lets the outermost layer's `win` win.
    // On a real page this cannot happen — __apiToMcpInjected prevents double-install.
    const result = origOpen.call(this, method, url, ...rest)
    this.__cap = { url: absolutize(url.toString(), win), method, body: null, start: 0 }
    return result
  }

  proto.send = function (this: Tracked, body?: Document | XMLHttpRequestBodyInit | null) {
    if (this.__cap) {
      this.__cap.body = typeof body === 'string' ? body : null
      this.__cap.start = Date.now()
      this.addEventListener('loadend', () => {
        const cap = this.__cap!
        try {
          const end = Date.now()
          postCapture(
            win,
            buildApiCall({
              url: cap.url,
              method: cap.method,
              requestHeaders: {}, // XHR does not expose set headers back to JS; intentionally empty
              requestBody: cap.body,
              responseStatus: this.status,
              responseHeaders: parseRawHeaders(this.getAllResponseHeaders()),
              responseBody: typeof this.responseText === 'string' ? this.responseText : null,
              durationMs: end - cap.start,
              now: end,
            }),
          )
        } catch {
          // capture is best-effort; never break the page
        }
      })
    }
    return origSend.call(this, body ?? null)
  }
}

function parseRawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  raw
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const idx = line.indexOf(':')
      if (idx > 0) out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    })
  return out
}

export function installCapture(win: Window & typeof globalThis): void {
  installFetchPatch(win)
  installXhrPatch(win)
  installHistoryPatch(win)
}

// Auto-install when this script is loaded as a <script type="module"> into the page's
// main world. The double-injection guard prevents duplicate patching if the script is
// somehow injected more than once. widget-host.ts gates injection behind blacklist and
// consent checks before inserting the <script> tag, so by the time we reach here it is
// safe to call installCapture directly.
if (typeof window !== 'undefined' && (window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected !== true) {
  ;(window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected = true
  installCapture(window as Window & typeof globalThis)
}
