import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectSidePanelPort } from './port'

describe('connectSidePanelPort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connects a sidepanel port and reports the active tab id', async () => {
    ;(chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 42 }])
    const post = vi.fn()
    ;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockReturnValue({
      postMessage: post,
    } as unknown as chrome.runtime.Port)

    await connectSidePanelPort()

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'sidepanel' })
    expect(post).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('does nothing when no active tab id is available', async () => {
    ;(chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await connectSidePanelPort()

    expect(chrome.runtime.connect).not.toHaveBeenCalled()
  })
})
