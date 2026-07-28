import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_STORAGE } from './types'
import type { StorageSchema, ApiCall, StoredSession } from './types'

describe('shared types defaults', () => {
  it('DEFAULT_SETTINGS has tracking enabled and empty blacklist', () => {
    expect(DEFAULT_SETTINGS.trackingEnabled).toBe(true)
    expect(DEFAULT_SETTINGS.serverUrl).toBe('')
    expect(DEFAULT_SETTINGS.apiKey).toBe('')
    expect(DEFAULT_SETTINGS.blacklistedDomains).toEqual([])
  })

  it('DEFAULT_STORAGE has no current session and empty collections', () => {
    const s: StorageSchema = DEFAULT_STORAGE
    expect(s.currentSession).toBeNull()
    expect(s.sessions).toEqual([])
    expect(s.mcpList).toEqual([])
    expect(s.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('ApiCall shape is assignable', () => {
    const call: ApiCall = {
      id: 'c1',
      url: 'https://x/api',
      method: 'GET',
      requestHeaders: {},
      requestBody: null,
      responseStatus: 200,
      responseHeaders: {},
      responseBody: null,
      durationMs: 12,
      capturedAt: 1,
    }
    expect(call.method).toBe('GET')
  })

  it('StoredSession accepts an optional name', () => {
    const s: StoredSession = {
      sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
      calls: [], transmitStatus: 'pending', name: '결제 API 세션',
    }
    expect(s.name).toBe('결제 API 세션')
  })
})

describe('DEFAULT_SETTINGS capture fields', () => {
  it('captures all five HTTP methods by default', () => {
    expect(DEFAULT_SETTINGS.captureMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  })
  it('has an empty domain whitelist by default (capture everything)', () => {
    expect(DEFAULT_SETTINGS.domainWhitelist).toEqual([])
  })
  it('saves response bodies by default', () => {
    expect(DEFAULT_SETTINGS.saveBody).toBe(true)
  })
  it('disables auto-send and dedupe by default', () => {
    expect(DEFAULT_SETTINGS.autoSend).toBe(false)
    expect(DEFAULT_SETTINGS.dedupe).toBe(false)
  })
  it('has an empty session name by default', () => {
    expect(DEFAULT_SETTINGS.sessionName).toBe('')
  })
})
