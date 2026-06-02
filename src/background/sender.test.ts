import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendSession, mergeMcpList, MAX_RETRIES, backoffDelayMs } from './sender'
import type { Settings, StoredSession } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  serverUrl: 'https://server.test',
  apiKey: 'KEY123',
  trackingEnabled: true,
  blacklistedDomains: [],
}

const session: StoredSession = {
  sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
  calls: [], transmitStatus: 'pending',
}

describe('sender', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('backoff grows exponentially', () => {
    expect(backoffDelayMs(0)).toBe(500)
    expect(backoffDelayMs(1)).toBe(1000)
    expect(backoffDelayMs(2)).toBe(2000)
  })

  it('MAX_RETRIES is 3', () => {
    expect(MAX_RETRIES).toBe(3)
  })

  it('posts to {serverUrl}/api/sessions with Bearer auth and returns mcpServers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mcpServers: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://server.test/api/sessions')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer KEY123',
    })
    expect(result.ok).toBe(true)
    expect(result.mcpServers).toHaveLength(1)
  })

  it('retries up to MAX_RETRIES on failure then returns failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('500')
  })

  it('succeeds on a later retry after transient failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ mcpServers: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('fails fast when serverUrl missing', async () => {
    const result = await sendSession({ ...settings, serverUrl: '' }, session, { sleep: async () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('serverUrl')
  })

  it('merges new MCP entries without duplicating existing ones', () => {
    const existing = [{ id: 'a', name: 'A', sourceUrl: 'x', endpoint: 'y', createdAt: 1, active: true }]
    const incoming = [
      { id: 'a', name: 'A-updated', sourceUrl: 'x', endpoint: 'y', createdAt: 1, active: true },
      { id: 'b', name: 'B', sourceUrl: 'z', endpoint: 'w', createdAt: 2, active: true },
    ]
    const result = mergeMcpList(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result.find((m) => m.id === 'a')?.name).toBe('A-updated')
  })
})
