import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FloatingWidget } from './FloatingWidget'
import { MSG } from '../../shared/messages'

// jsdom does not implement PointerEvent, so fireEvent.pointer* falls back to
// plain Event which silently drops clientY/pointerId. Polyfill via MouseEvent
// (which jsdom supports) so the drag-position tests can work correctly.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean
    width: number
    height: number
    pressure: number
    tangentialPressure: number
    tiltX: number
    tiltY: number
    twist: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
      this.width = init.width ?? 1
      this.height = init.height ?? 1
      this.pressure = init.pressure ?? 0
      this.tangentialPressure = init.tangentialPressure ?? 0
      this.tiltX = init.tiltX ?? 0
      this.tiltY = init.tiltY ?? 0
      this.twist = init.twist ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill
}

describe('FloatingWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      currentSession: { sessionId: 's1', url: 'https://x/a', startedAt: 1, calls: [{ id: 'c1' }, { id: 'c2' }], status: 'recording' },
      settings: { serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [] },
    })
  })

  it('shows the current capture count as a badge', async () => {
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-badge')).toHaveTextContent('2'))
  })

  it('reflects tracking state in the button class', async () => {
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-button')).toHaveAttribute('data-state', 'tracking'))
  })

  it('opens the side panel via runtime message on main button click', async () => {
    render(<FloatingWidget />)
    await waitFor(() => screen.getByTestId('widget-button'))
    fireEvent.click(screen.getByTestId('widget-button'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })

  it('toggles tracking via runtime message on the track-toggle chip', async () => {
    render(<FloatingWidget />)
    await waitFor(() => screen.getByTestId('widget-track-toggle'))
    fireEvent.click(screen.getByTestId('widget-track-toggle'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.TOGGLE_TRACKING, enabled: false })
  })

  it('labels the track-toggle chip as "추적 중지" while tracking', async () => {
    render(<FloatingWidget />)
    await waitFor(() =>
      expect(screen.getByTestId('widget-track-toggle')).toHaveAttribute('aria-label', '추적 중지'),
    )
  })

  it('labels the track-toggle chip as "추적 시작" while paused', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      currentSession: { sessionId: 's1', url: 'https://x/a', startedAt: 1, calls: [], status: 'paused' },
      settings: { serverUrl: '', apiKey: '', trackingEnabled: false, blacklistedDomains: [] },
    })
    render(<FloatingWidget />)
    await waitFor(() =>
      expect(screen.getByTestId('widget-track-toggle')).toHaveAttribute('aria-label', '추적 시작'),
    )
  })

  it('loads the persisted dock top on mount', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: unknown) => {
      if (key === 'widgetDockTop') return { widgetDockTop: 411 }
      return {
        currentSession: { sessionId: 's1', url: 'https://x/a', startedAt: 1, calls: [], status: 'recording' },
        settings: { serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [] },
      }
    })
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-root')).toHaveStyle({ top: '411px' }))
  })

  it('repositions the dock when dragged more than 3px and persists on release', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    // initial top = round(innerHeight*0.5); jsdom offsetHeight=0 so the clamp upper
    // bound (innerHeight - 0 - 10) is far above, leaving top = start + dy.
    const expected = Math.round(window.innerHeight * 0.5) + 160 // dy = 460 - 300
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(window, { clientY: 460, pointerId: 1 })
    await waitFor(() => expect(root).toHaveStyle({ top: `${expected}px` }))
    fireEvent.pointerUp(window, { clientY: 460, pointerId: 1 })
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ widgetDockTop: expected })
  })

  it('treats a sub-3px pointer move as a click (opens the panel)', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    const btn = screen.getByTestId('widget-button')
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(window, { clientY: 302, pointerId: 1 })
    fireEvent.pointerUp(window, { clientY: 302, pointerId: 1 })
    fireEvent.click(btn)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })

  it('suppresses the click that ends a real drag', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    const btn = screen.getByTestId('widget-button')
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(window, { clientY: 380, pointerId: 1 })
    fireEvent.pointerUp(window, { clientY: 380, pointerId: 1 })
    fireEvent.click(btn)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })

  // Regression guard for the dead-button bug: capturing the pointer on the root
  // (an ancestor of the buttons) makes Chrome retarget the trailing `click` to the
  // capturing element, so neither button's onClick ever fires. The fix is to never
  // capture; drag is tracked via window listeners instead. jsdom cannot reproduce
  // the retargeting, so we lock the invariant — setPointerCapture is never used.
  it('never calls setPointerCapture (capturing on an ancestor steals the buttons\' click)', async () => {
    const capture = vi.fn()
    ;(Element.prototype as unknown as { setPointerCapture: typeof capture }).setPointerCapture = capture
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(window, { clientY: 460, pointerId: 1 })
    fireEvent.pointerUp(window, { clientY: 460, pointerId: 1 })
    expect(capture).not.toHaveBeenCalled()
  })
})
