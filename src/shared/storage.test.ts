import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStorage, patchStorage, onStorageChanged } from './storage'
import { DEFAULT_STORAGE } from './types'

describe('storage wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns defaults when storage empty', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
    const s = await getStorage()
    expect(s).toEqual(DEFAULT_STORAGE)
  })

  it('merges stored values over defaults', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mcpList: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }],
    })
    const s = await getStorage()
    expect(s.mcpList).toHaveLength(1)
    expect(s.sessions).toEqual([])
  })

  it('patchStorage reads-modifies-writes only provided keys', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
    await patchStorage({ sessions: [] })
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ sessions: [] })
  })

  it('onStorageChanged only fires for local area', () => {
    const cb = vi.fn()
    onStorageChanged(cb)
    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener({ mcpList: { newValue: [] } }, 'sync')
    expect(cb).not.toHaveBeenCalled()
    listener({ mcpList: { newValue: [] } }, 'local')
    expect(cb).toHaveBeenCalledOnce()
  })
})
