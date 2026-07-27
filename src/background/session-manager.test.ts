import { describe, it, expect } from 'vitest'
import {
  startSession,
  appendCall,
  rotateSession,
  splitAndArchive,
  shouldAutoSend,
  AUTO_SEND_THRESHOLD,
  IDLE_TIMEOUT_MS,
} from './session-manager'
import { DEFAULT_STORAGE, DEFAULT_SETTINGS } from '../shared/types'
import type { ApiCall, StorageSchema } from '../shared/types'

function makeCall(id: string): ApiCall & { pageUrl: string } {
  return {
    id, url: 'https://x/api', method: 'GET', requestHeaders: {}, requestBody: null,
    responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 100,
    pageUrl: 'https://x/page',
  }
}

describe('session-manager', () => {
  it('idle timeout constant is 30 minutes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('startSession creates a recording session with no calls', () => {
    const next = startSession(DEFAULT_STORAGE, 'https://x/page', 1000)
    expect(next.currentSession).not.toBeNull()
    expect(next.currentSession!.url).toBe('https://x/page')
    expect(next.currentSession!.status).toBe('recording')
    expect(next.currentSession!.calls).toEqual([])
    expect(next.currentSession!.startedAt).toBe(1000)
  })

  it('appendCall starts a session if none exists then appends', () => {
    const next = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
    expect(next.currentSession!.calls).toHaveLength(1)
    expect(next.currentSession!.calls[0].id).toBe('c1')
  })

  it('appendCall accumulates into existing session', () => {
    const s1 = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
    const s2 = appendCall(s1, makeCall('c2'), 1100, DEFAULT_SETTINGS)
    expect(s2.currentSession!.calls.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('rotateSession moves current into sessions[] as pending and starts a fresh one', () => {
    const recording = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
    const next = rotateSession(recording, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(1)
    expect(next.sessions[0].transmitStatus).toBe('pending')
    expect(next.sessions[0].endedAt).toBe(2000)
    expect(next.sessions[0].calls.map((c) => c.id)).toEqual(['c1'])
    expect(next.currentSession!.url).toBe('https://x/b')
    expect(next.currentSession!.calls).toEqual([])
  })

  it('rotateSession with no current session just starts a new one', () => {
    const next = rotateSession(DEFAULT_STORAGE, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(0)
    expect(next.currentSession!.url).toBe('https://x/b')
  })

  it('rotateSession does not archive an empty current session', () => {
    const empty = startSession(DEFAULT_STORAGE, 'https://x/a', 1000)
    const next = rotateSession(empty as StorageSchema, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(0)
    expect(next.currentSession!.url).toBe('https://x/b')
  })

  function call(over: Partial<ApiCall & { pageUrl: string }>): ApiCall & { pageUrl: string } {
    return { ...makeCall('cX'), ...over }
  }

  it('drops a call whose method is not in captureMethods', () => {
    const settings = { ...DEFAULT_SETTINGS, captureMethods: ['POST'] }
    const next = appendCall(DEFAULT_STORAGE, call({ method: 'GET' }), 1, settings)
    expect(next.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('drops a call whose host is outside a non-empty whitelist', () => {
    const settings = { ...DEFAULT_SETTINGS, domainWhitelist: ['*.allowed.io'] }
    const next = appendCall(DEFAULT_STORAGE, call({ url: 'https://evil.com/api' }), 1, settings)
    expect(next.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('keeps a whitelisted host', () => {
    const settings = { ...DEFAULT_SETTINGS, domainWhitelist: ['*.allowed.io'] }
    const next = appendCall(DEFAULT_STORAGE, call({ url: 'https://api.allowed.io/x' }), 1, settings)
    expect(next.currentSession!.calls).toHaveLength(1)
  })

  it('strips the response body when saveBody is off', () => {
    const settings = { ...DEFAULT_SETTINGS, saveBody: false }
    const next = appendCall(DEFAULT_STORAGE, call({ responseBody: '{"a":1}' }), 1, settings)
    expect(next.currentSession!.calls[0].responseBody).toBeNull()
  })

  it('dedupes by path, keeping the latest response', () => {
    const settings = { ...DEFAULT_SETTINGS, dedupe: true }
    const s1 = appendCall(DEFAULT_STORAGE, call({ id: 'a', url: 'https://x/api/users', responseStatus: 200 }), 1, settings)
    const s2 = appendCall(s1, call({ id: 'b', url: 'https://x/api/users?page=2', responseStatus: 500 }), 2, settings)
    expect(s2.currentSession!.calls).toHaveLength(1)
    expect(s2.currentSession!.calls[0].id).toBe('b')
  })

  it('shouldAutoSend is true only when autoSend is on and threshold reached', () => {
    const calls = Array.from({ length: AUTO_SEND_THRESHOLD }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: true })).toBe(true)
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: false })).toBe(false)
  })

  it('shouldAutoSend is false below the threshold', () => {
    const calls = Array.from({ length: AUTO_SEND_THRESHOLD - 1 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: true })).toBe(false)
  })

  describe('splitAndArchive', () => {
    function recorded(ids: string[]): StorageSchema {
      return {
        ...DEFAULT_STORAGE,
        currentSession: {
          sessionId: 'cur', url: 'https://x/page', startedAt: 1000,
          calls: ids.map((id) => makeCall(id)), status: 'recording',
        },
      }
    }

    it('archives selected calls as pending with the given name', () => {
      const next = splitAndArchive(recorded(['a', 'b', 'c']), ['a', 'c'], '내 세션', 2000)
      expect(next.sessions).toHaveLength(1)
      expect(next.sessions[0].name).toBe('내 세션')
      expect(next.sessions[0].transmitStatus).toBe('pending')
      expect(next.sessions[0].endedAt).toBe(2000)
      expect(next.sessions[0].calls.map((c) => c.id)).toEqual(['a', 'c'])
    })

    it('keeps unselected calls in a fresh current session', () => {
      const next = splitAndArchive(recorded(['a', 'b', 'c']), ['a', 'c'], undefined, 2000)
      expect(next.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
      expect(next.currentSession!.sessionId).not.toBe('cur') // 새 세션 id
      expect(next.currentSession!.startedAt).toBe(2000)
      expect(next.currentSession!.url).toBe('https://x/page')
    })

    it('omits name when not provided', () => {
      const next = splitAndArchive(recorded(['a']), ['a'], undefined, 2000)
      expect(next.sessions[0].name).toBeUndefined()
    })

    it('returns the SAME state reference when nothing is selected (no-op contract)', () => {
      const state = recorded(['a', 'b'])
      expect(splitAndArchive(state, [], undefined, 2000)).toBe(state)
      expect(splitAndArchive(state, ['nope'], undefined, 2000)).toBe(state)
    })

    it('returns the SAME state reference when there is no current session', () => {
      expect(splitAndArchive(DEFAULT_STORAGE, ['a'], undefined, 2000)).toBe(DEFAULT_STORAGE)
    })

    it('selecting every call empties the new current session', () => {
      const next = splitAndArchive(recorded(['a', 'b']), ['a', 'b'], undefined, 2000)
      expect(next.sessions[0].calls).toHaveLength(2)
      expect(next.currentSession!.calls).toEqual([])
    })
  })
})
