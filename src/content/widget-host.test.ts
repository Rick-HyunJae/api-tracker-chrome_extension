import { describe, it, expect, beforeEach, vi } from 'vitest'

// crxjs ?script import returns a ROOT-ABSOLUTE path ("/assets/..."), mirroring
// the real build output. injectMainWorldCapture must resolve it via getURL.
vi.mock('./injected-capture.ts?script&module', () => ({ default: '/assets/injected-capture.js' }))
vi.mock('../ui/widget/FloatingWidget', () => ({ FloatingWidget: () => null }))

import {
  isBlacklisted, mountWidgetHost, injectMainWorldCapture,
  watchTrackingForInjection, WIDGET_HOST_ID,
} from './widget-host'

describe('widget-host', () => {
  beforeEach(() => {
    ;(chrome.storage.onChanged as unknown as { _listeners: unknown[] })._listeners.length = 0
    document.body.innerHTML = ''
    document.getElementById('__api-tracker-capture__')?.remove()
    document.getElementById(WIDGET_HOST_ID)?.remove()
  })

  it('isBlacklisted matches exact and subdomain', () => {
    expect(isBlacklisted('app.example.com', ['example.com'])).toBe(true)
    expect(isBlacklisted('example.com', ['example.com'])).toBe(true)
    expect(isBlacklisted('other.com', ['example.com'])).toBe(false)
    expect(isBlacklisted('notexample.com', ['example.com'])).toBe(false)
  })

  it('mountWidgetHost attaches a host element with an open shadow root', () => {
    mountWidgetHost()
    const host = document.getElementById(WIDGET_HOST_ID)
    expect(host).not.toBeNull()
    expect(host!.shadowRoot).not.toBeNull()
  })

  it('mountWidgetHost is idempotent (no duplicate hosts)', () => {
    mountWidgetHost()
    mountWidgetHost()
    expect(document.querySelectorAll(`#${WIDGET_HOST_ID}`)).toHaveLength(1)
  })

  it('mountWidgetHost re-attaches the host after removal', () => {
    mountWidgetHost()
    document.getElementById(WIDGET_HOST_ID)!.remove()
    mountWidgetHost()
    expect(document.getElementById(WIDGET_HOST_ID)).not.toBeNull()
  })

  it('injectMainWorldCapture resolves the capture src against the extension origin', () => {
    injectMainWorldCapture()
    const script = document.getElementById('__api-tracker-capture__')
    expect(script).not.toBeNull()
    expect(script!.getAttribute('src')).toBe(chrome.runtime.getURL('assets/injected-capture.js'))
  })

  it('injectMainWorldCapture is idempotent (no duplicate script tags)', () => {
    injectMainWorldCapture()
    injectMainWorldCapture()
    expect(document.querySelectorAll('#__api-tracker-capture__')).toHaveLength(1)
  })

  it('watchTrackingForInjection injects capture when trackingEnabled flips to true', () => {
    watchTrackingForInjection()
    expect(document.getElementById('__api-tracker-capture__')).toBeNull()
    ;(chrome.storage.onChanged as unknown as { _emit: (...a: unknown[]) => void })._emit(
      { settings: { newValue: { trackingEnabled: true } } },
      'local',
    )
    expect(document.getElementById('__api-tracker-capture__')).not.toBeNull()
  })

  it('watchTrackingForInjection ignores changes that do not enable tracking', () => {
    watchTrackingForInjection()
    ;(chrome.storage.onChanged as unknown as { _emit: (...a: unknown[]) => void })._emit(
      { settings: { newValue: { trackingEnabled: false } } },
      'local',
    )
    expect(document.getElementById('__api-tracker-capture__')).toBeNull()
  })

  it('watchTrackingForInjection does not duplicate an already-injected capture', () => {
    injectMainWorldCapture() // simulate init() having injected at load
    watchTrackingForInjection()
    ;(chrome.storage.onChanged as unknown as { _emit: (...a: unknown[]) => void })._emit(
      { settings: { newValue: { trackingEnabled: true } } },
      'local',
    )
    expect(document.querySelectorAll('#__api-tracker-capture__')).toHaveLength(1)
  })
})
