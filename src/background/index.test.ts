import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMessage, createSidePanelController } from './index'
import { MSG } from '../shared/messages'
import { DEFAULT_STORAGE } from '../shared/types'
import type { ApiCall, CurrentSession, StorageSchema } from '../shared/types'

function makeCall(id: string): ApiCall & { pageUrl: string } {
  return {
    id, url: 'https://x/api', method: 'GET', requestHeaders: {}, requestBody: null,
    responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1,
    pageUrl: 'https://x/page',
  }
}

// Fixture with consentGivenAt set; used by tests that predate the MVP gate removal.
// trackingEnabled = true (default) so captures are not blocked.
const CONSENTED: StorageSchema = {
  ...DEFAULT_STORAGE,
  settings: { ...DEFAULT_STORAGE.settings, consentGivenAt: 1 },
}

const ctx = {
  now: () => 5000,
  send: vi.fn(),
}

describe('background message router', () => {
  it('API_CAPTURED appends the call to the current session', async () => {
    const next = await handleMessage(
      CONSENTED,
      { type: MSG.API_CAPTURED, payload: makeCall('c1') },
      'https://x/page',
      ctx,
    )
    expect(next.state.currentSession!.calls).toHaveLength(1)
  })

  it('captures API_CAPTURED without consentGivenAt (MVP gate removed)', async () => {
    // DEFAULT_STORAGE has no consentGivenAt and trackingEnabled = true.
    const next = await handleMessage(
      DEFAULT_STORAGE,
      { type: MSG.API_CAPTURED, payload: makeCall('1') },
      'https://example.com',
      ctx,
    )
    expect(next.state.currentSession?.calls ?? []).toHaveLength(1)
  })

  it('ignores API_CAPTURED when tracking disabled', async () => {
    const off: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, trackingEnabled: false },
    }
    const next = await handleMessage(
      off,
      { type: MSG.API_CAPTURED, payload: makeCall('1') },
      'https://example.com',
      ctx,
    )
    expect(next.state.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('resumes existing currentSession after SW restart', async () => {
    const existingSession: CurrentSession = {
      sessionId: 'sess-1',
      url: 'https://example.com',
      startedAt: Date.now() - 60000,
      calls: [makeCall('existing')],
      status: 'recording',
    }
    // Simulate storage having a currentSession from before the SW terminated.
    const state: StorageSchema = { ...CONSENTED, currentSession: existingSession }

    // New call arrives after SW restart.
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('new') },
      'https://example.com',
      ctx,
    )

    // Should append to the existing session, not create a new one.
    expect(next.state.currentSession?.sessionId).toBe('sess-1')
    expect(next.state.currentSession?.calls).toHaveLength(2)
  })

  it('serializes concurrent API_CAPTURED writes without losing calls', async () => {
    // The actual concurrent safety lives in registerBackground's serialized()
    // queue. handleMessage is pure, so we validate the serialization design by
    // chaining two writes through the same read-modify-write contract: the
    // second call must observe the first call's result.
    const s1 = await handleMessage(
      CONSENTED,
      { type: MSG.API_CAPTURED, payload: makeCall('1') },
      'https://example.com',
      ctx,
    )
    const s2 = await handleMessage(
      s1.state,
      { type: MSG.API_CAPTURED, payload: makeCall('2') },
      'https://example.com',
      ctx,
    )
    expect(s2.state.currentSession?.calls).toHaveLength(2)
  })

  it('SESSION_CHANGE keeps the current session (no rotate)', async () => {
    const recording: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 's0', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('c1')], status: 'recording',
      },
    }
    const next = await handleMessage(
      recording,
      { type: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b' },
      'https://x/b',
      ctx,
    )
    // URL 변경은 세션을 끊지 않는다: 아카이브되지 않고 기존 세션이 그대로 유지된다.
    expect(next.state.sessions).toHaveLength(0)
    expect(next.state.currentSession!.sessionId).toBe('s0')
    expect(next.state.currentSession!.calls).toHaveLength(1)
  })

  it('TOGGLE_TRACKING updates settings.trackingEnabled', async () => {
    const next = await handleMessage(
      DEFAULT_STORAGE,
      { type: MSG.TOGGLE_TRACKING, enabled: false },
      'https://x/page',
      ctx,
    )
    expect(next.state.settings.trackingEnabled).toBe(false)
  })

  it('SEND_SESSION calls the sender and marks the session sent on success', async () => {
    const withPending: StorageSchema = {
      ...DEFAULT_STORAGE,
      sessions: [{
        sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
        calls: [makeCall('c1')], transmitStatus: 'pending',
      }],
    }
    const sendImpl = vi.fn().mockResolvedValue({
      ok: true,
      mcpServers: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }],
    })
    const next = await handleMessage(
      withPending,
      { type: MSG.SEND_SESSION, sessionId: 's1' },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.mcpList).toHaveLength(1)
    expect(next.response).toEqual({ ok: true })
  })

  it('SEND_SESSION marks the session failed on sender failure', async () => {
    const withPending: StorageSchema = {
      ...DEFAULT_STORAGE,
      sessions: [{
        sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
        calls: [makeCall('c1')], transmitStatus: 'pending',
      }],
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: false, error: 'server responded 500' })
    const next = await handleMessage(
      withPending,
      { type: MSG.SEND_SESSION, sessionId: 's1' },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(next.state.sessions[0].transmitStatus).toBe('failed')
    expect(next.response).toEqual({ ok: false, error: 'server responded 500' })
  })

  it('auto-sends and archives the session when autoSend threshold is hit', async () => {
    const calls = Array.from({ length: 49 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, autoSend: true },
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('c49') },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.currentSession!.calls).toHaveLength(0)
  })

  it('does not auto-send below the threshold', async () => {
    const calls = Array.from({ length: 10 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, autoSend: true },
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('c10') },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).not.toHaveBeenCalled()
    expect(next.state.currentSession!.calls).toHaveLength(11)
  })

  it('marks the auto-sent session failed (and keeps it) when the sender fails', async () => {
    const calls = Array.from({ length: 49 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, autoSend: true },
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: false, error: 'timeout' })
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('c49') },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('failed')
    expect(next.state.sessions[0].calls).toHaveLength(50) // 49 + the 50th capture, not lost
  })

  it('SEND_CURRENT_SESSION archives selected calls, sends them, keeps the rest', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a'), makeCall('b'), makeCall('c')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, name: '내 세션', callIds: ['a', 'c'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    // sender가 받은 세션은 선택분만 + 이름 포함
    const sentSession = sendImpl.mock.calls[0][1]
    expect(sentSession.calls.map((c: ApiCall) => c.id)).toEqual(['a', 'c'])
    expect(sentSession.name).toBe('내 세션')
    // 아카이브는 sent, 미선택분은 새 현재 세션에 잔류
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
    expect(next.state.currentSession!.sessionId).not.toBe('cur')
    expect(next.response).toEqual({ ok: true })
  })

  it('SEND_CURRENT_SESSION marks the archived session failed on sender failure', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: false, error: 'timeout' })
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['a'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(next.state.sessions[0].transmitStatus).toBe('failed')
    expect(next.state.sessions[0].calls).toHaveLength(1) // 데이터 보존
    expect(next.response).toEqual({ ok: false, error: 'timeout' })
  })

  it('SEND_CURRENT_SESSION with no matching calls responds with an error and does not send', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn()
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['nope'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).not.toHaveBeenCalled()
    expect(next.state).toBe(state)
    expect(next.response).toEqual({ ok: false, error: 'no calls selected' })
  })

  it('DELETE_CALL removes a single call from the current session', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a'), makeCall('b')], status: 'recording',
      },
    }
    const next = await handleMessage(
      state, { type: MSG.DELETE_CALL, callId: 'a' }, 'https://x/a', ctx,
    )
    expect(next.state.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
  })

  it('DELETE_CALL with an unknown id is a no-op', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const next = await handleMessage(
      state, { type: MSG.DELETE_CALL, callId: 'zzz' }, 'https://x/a', ctx,
    )
    expect(next.state.currentSession!.calls).toHaveLength(1)
  })
})

function emitter() {
  const ls: ((...a: unknown[]) => void)[] = []
  return {
    addListener: vi.fn((f: (...a: unknown[]) => void) => ls.push(f)),
    removeListener: vi.fn(),
    emit: (...a: unknown[]) => ls.forEach((l) => l(...a)),
  }
}

function fakePort(name = 'sidepanel') {
  return { name, onMessage: emitter(), onDisconnect: emitter(), postMessage: vi.fn(), disconnect: vi.fn() }
}

describe('side panel controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the panel when not already open', () => {
    const c = createSidePanelController()
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('re-enables the panel before opening (self-heal from a stuck-disabled state)', () => {
    const c = createSidePanelController()
    c.toggle(42)
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: true,
      path: 'public/sidepanel.html',
    })
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('closes the panel (disable then re-enable) when already open', async () => {
    const c = createSidePanelController()
    const port = fakePort('sidepanel')
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 }) // panel reports its tab
    c.toggle(42)
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false })
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
    // flush the .then chain to assert the re-enable (covers SIDEPANEL_PATH)
    await Promise.resolve()
    await Promise.resolve()
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: true,
      path: 'public/sidepanel.html',
    })
  })

  it('reopens after the panel disconnects (close clears tracking)', () => {
    const c = createSidePanelController()
    const port = fakePort()
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 })
    port.onDisconnect.emit() // panel closed
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('ignores non-sidepanel ports', () => {
    const c = createSidePanelController()
    const port = fakePort('other')
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 })
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 }) // not tracked -> opens
  })

  it('does nothing without a tabId', () => {
    const c = createSidePanelController()
    c.toggle(undefined)
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })
})

// registerBackground() registers its onMessage listener at module load; this
// test fires it via _emit on the same global mock. It validates wiring/branching,
// not gesture preservation (a browser-only runtime constraint not reproducible in jsdom).
describe('OPEN_SIDEPANEL listener wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the side panel synchronously for the sender tab', () => {
    const sendResponse = vi.fn()
    const onMessage = chrome.runtime.onMessage as unknown as {
      _emit: (...a: unknown[]) => void
    }
    onMessage._emit({ type: MSG.OPEN_SIDEPANEL }, { tab: { id: 7 } }, sendResponse)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it('tracks panel-open via onConnect so a second toggle closes it', () => {
    const onConnect = chrome.runtime.onConnect as unknown as { _emit: (...a: unknown[]) => void }
    const port = fakePort('sidepanel')
    onConnect._emit(port)
    port.onMessage.emit({ tabId: 9 }) // panel reports its tab via the registered port
    const sendResponse = vi.fn()
    const onMessage = chrome.runtime.onMessage as unknown as { _emit: (...a: unknown[]) => void }
    onMessage._emit({ type: MSG.OPEN_SIDEPANEL }, { tab: { id: 9 } }, sendResponse)
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 9, enabled: false })
  })
})
