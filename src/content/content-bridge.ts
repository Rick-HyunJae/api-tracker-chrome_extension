import { POSTMSG_SOURCE, MSG } from '../shared/messages'
import type { ApiCall } from '../shared/types'
import type { SessionChangeReason } from '../shared/messages'

interface BridgeCapture {
  source: typeof POSTMSG_SOURCE
  kind: typeof MSG.API_CAPTURED
  call: ApiCall & { pageUrl: string }
}
interface BridgeSessionChange {
  source: typeof POSTMSG_SOURCE
  kind: typeof MSG.SESSION_CHANGE
  reason: SessionChangeReason
  url: string
}
type BridgeData = BridgeCapture | BridgeSessionChange

export function handleBridgeMessage(event: MessageEvent): void {
  // Only accept messages this window posted to its own origin with our source tag.
  // Rejecting cross-window / cross-origin events prevents 3p scripts or iframes
  // from injecting forged captures into the SW.
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    (event.data as Partial<BridgeData> | undefined)?.source !== POSTMSG_SOURCE
  ) {
    return
  }
  const data = event.data as BridgeData

  if (data.kind === MSG.API_CAPTURED) {
    void chrome.runtime.sendMessage({ type: MSG.API_CAPTURED, payload: (data as BridgeCapture).call })
    return
  }
  if (data.kind === MSG.SESSION_CHANGE) {
    const d = data as BridgeSessionChange
    void chrome.runtime.sendMessage({ type: MSG.SESSION_CHANGE, reason: d.reason, url: d.url })
  }
}

export function registerBridge(): void {
  window.addEventListener('message', handleBridgeMessage)
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  registerBridge()
}
