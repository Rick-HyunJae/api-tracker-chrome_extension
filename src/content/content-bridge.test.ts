import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleBridgeMessage } from './content-bridge'
import { POSTMSG_SOURCE, MSG } from '../shared/messages'

describe('content-bridge', () => {
  beforeEach(() => vi.clearAllMocks())

  // Helper: build a same-window, same-origin MessageEvent (passes the security gate).
  function ev(data: unknown): MessageEvent {
    return { data, source: window, origin: location.origin } as unknown as MessageEvent
  }

  it('ignores messages without the correct source tag', () => {
    handleBridgeMessage(ev({ source: 'evil', kind: MSG.API_CAPTURED }))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('ignores messages from a foreign origin even with the correct source tag', () => {
    const evil = { data: { source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED }, source: window, origin: 'https://evil.com' } as unknown as MessageEvent
    handleBridgeMessage(evil)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('ignores messages from a different window even with correct source tag and origin', () => {
    const iframe = {} as unknown as Window
    const crossWindow = {
      data: { source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED },
      source: iframe,
      origin: location.origin,
    } as unknown as MessageEvent
    handleBridgeMessage(crossWindow)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('forwards API_CAPTURED as a runtime CaptureMessage', () => {
    const call = { id: 'c1', url: 'u', method: 'GET', requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1, pageUrl: 'https://x/page' }
    handleBridgeMessage(ev({ source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED, call }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.API_CAPTURED, payload: call })
  })

  it('forwards SESSION_CHANGE as a runtime SessionChangeMessage', () => {
    handleBridgeMessage(ev({ source: POSTMSG_SOURCE, kind: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b' }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b',
    })
  })
})
