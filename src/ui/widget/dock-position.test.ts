import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDockTop, setDockTop } from './dock-position'

describe('dock-position', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the stored numeric top', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ widgetDockTop: 320 })
    expect(await getDockTop()).toBe(320)
  })

  it('returns null when nothing is stored', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({})
    expect(await getDockTop()).toBeNull()
  })

  it('returns null when the stored value is not a number', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ widgetDockTop: 'oops' })
    expect(await getDockTop()).toBeNull()
  })

  it('persists the top under the widgetDockTop key', async () => {
    await setDockTop(275)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ widgetDockTop: 275 })
  })
})
