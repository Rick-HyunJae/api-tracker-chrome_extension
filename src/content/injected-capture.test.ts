import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApiCall, installFetchPatch, installHistoryPatch, installXhrPatch } from './injected-capture'
import { POSTMSG_SOURCE } from '../shared/messages'

describe('injected-capture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('buildApiCall normalizes a fetch request/response into ApiCall shape', () => {
    const call = buildApiCall({
      url: 'https://x/api/items',
      method: 'POST',
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: '{"a":1}',
      responseStatus: 201,
      responseHeaders: { 'x-id': '9' },
      responseBody: '{"ok":true}',
      durationMs: 42,
      now: 1000,
    })
    expect(call.id).toMatch(/^call_/)
    expect(call.url).toBe('https://x/api/items')
    expect(call.method).toBe('POST')
    expect(call.responseStatus).toBe(201)
    expect(call.durationMs).toBe(42)
    expect(call.capturedAt).toBe(1000)
  })

  it('installFetchPatch wraps fetch and posts a capture message', async () => {
    const responseBody = '{"ok":true}'
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const win = {
      fetch: fakeFetch,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn(),
    } as unknown as Window & typeof globalThis

    installFetchPatch(win)
    const res = await win.fetch('https://x/api/items', { method: 'GET' })
    await res.text()

    expect(fakeFetch).toHaveBeenCalledOnce()
    const call = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
    const posted = call[0]
    const targetOrigin = call[1]
    expect(posted.source).toBe(POSTMSG_SOURCE)
    expect(posted.kind).toBe('API_CAPTURED')
    expect(posted.call.url).toBe('https://x/api/items')
    expect(posted.call.pageUrl).toBe('https://x/page')
    // Must target the page origin, never '*' (would leak auth data to any listener).
    expect(targetOrigin).toBe('https://x')
  })

  it('installXhrPatch patches XMLHttpRequest and captures responses', async () => {
    const captured: Array<{ source: string; kind: string; call: { method: string } }> = []
    const win = {
      XMLHttpRequest: window.XMLHttpRequest,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn((msg: { source: string }) => {
        if (msg?.source === POSTMSG_SOURCE) captured.push(msg as never)
      }),
    } as unknown as Window & typeof globalThis

    installXhrPatch(win)

    await new Promise<void>((resolve) => {
      const xhr = new win.XMLHttpRequest()
      xhr.addEventListener('loadend', () => resolve())
      // jsdom XHR: trigger loadend synchronously via a fake transport, or mock
      // getAllResponseHeaders/status/responseText then dispatch 'loadend'.
      xhr.open('GET', 'https://api.example.com/data')
      // Simulate a completed response under jsdom by dispatching loadend manually.
      Object.defineProperty(xhr, 'status', { value: 200, configurable: true })
      Object.defineProperty(xhr, 'responseText', { value: '{"ok":true}', configurable: true })
      Object.defineProperty(xhr, 'getAllResponseHeaders', {
        value: () => 'content-type: application/json\r\n',
        configurable: true,
      })
      xhr.send()
      xhr.dispatchEvent(new Event('loadend'))
    })

    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0].call.method).toBe('GET')

    // Security: postMessage must target the page origin, never '*'
    const lastCall = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
    expect(lastCall[1]).toBe('https://x') // targetOrigin is not '*'
  })

  it('resolves a relative fetch URL against the page URL', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const win = {
      fetch: fakeFetch,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn(),
    } as unknown as Window & typeof globalThis

    installFetchPatch(win)
    const res = await win.fetch('/api/items')
    await res.text()

    const posted = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
    expect(posted.call.url).toBe('https://x/api/items') // 상대경로 → 절대화
  })

  it('resolves a relative XHR URL against the page URL', async () => {
    const captured: Array<{ source: string; call: { url: string } }> = []
    const win = {
      XMLHttpRequest: window.XMLHttpRequest,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn((msg: { source: string }) => {
        if (msg?.source === POSTMSG_SOURCE) captured.push(msg as never)
      }),
    } as unknown as Window & typeof globalThis

    installXhrPatch(win)

    await new Promise<void>((resolve) => {
      const xhr = new win.XMLHttpRequest()
      xhr.addEventListener('loadend', () => resolve())
      xhr.open('GET', '/api/data')
      Object.defineProperty(xhr, 'status', { value: 200, configurable: true })
      Object.defineProperty(xhr, 'responseText', { value: '{}', configurable: true })
      Object.defineProperty(xhr, 'getAllResponseHeaders', {
        value: () => 'content-type: application/json\r\n',
        configurable: true,
      })
      xhr.send()
      xhr.dispatchEvent(new Event('loadend'))
    })

    expect(captured[0].call.url).toBe('https://x/api/data')
  })

  it('installHistoryPatch posts SESSION_CHANGE on pushState', () => {
    const win = {
      history: { pushState: vi.fn(), replaceState: vi.fn() },
      location: { href: 'https://x/a', origin: 'https://x' },
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis

    installHistoryPatch(win)
    win.history.pushState({}, '', '/b')

    const posted = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
    expect(posted.source).toBe(POSTMSG_SOURCE)
    expect(posted.kind).toBe('SESSION_CHANGE')
    expect(posted.reason).toBe('pushState')

    // Also verify replaceState is patched and posts SESSION_CHANGE
    win.history.replaceState({}, '', '/c')
    const replacePosted = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
    expect(replacePosted.reason).toBe('replaceState')
  })
})
