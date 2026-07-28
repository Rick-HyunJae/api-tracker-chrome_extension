import { getStorage, patchStorage } from '../shared/storage'
import { MSG } from '../shared/messages'
import type { RuntimeMessage, SendSessionResponse } from '../shared/messages'
import { appendCall, rotateSession, splitAndArchive, shouldAutoSend, IDLE_TIMEOUT_MS } from './session-manager'
import { sendSession as defaultSendSession, mergeMcpList } from './sender'
import type { SendResult } from './sender'
import type { Settings, StorageSchema, StoredSession } from '../shared/types'

const SIDEPANEL_PATH = 'public/sidepanel.html'

export interface SidePanelController {
  toggle: (tabId: number | undefined) => void
  registerPort: (port: chrome.runtime.Port) => void
}

// Chrome has no sidePanel.close(); we track which tabs have the panel open via a
// port the panel opens on load, and emulate close with setOptions(enabled:false)
// followed by a re-enable so the next open works. Tracking is per-tab.
export function createSidePanelController(): SidePanelController {
  // openTabs is in-memory and resets on every MV3 SW restart. registerPort
  // re-populates it when the panel reconnects, but in the brief window after a
  // SW wake-up (before the port re-registers) toggle() may open an already-open
  // panel. Acceptable for MVP; persisting to chrome.storage.session would close it.
  const openTabs = new Set<number>()

  function toggle(tabId: number | undefined): void {
    if (tabId === undefined) return
    if (openTabs.has(tabId)) {
      // Emulate close (no sidePanel.close() API): disable then re-enable so the
      // next open works. The panel page unloads on disable, disconnecting its
      // port, which clears openTabs via onDisconnect — the single source of truth.
      void chrome.sidePanel
        .setOptions({ tabId, enabled: false })
        .then(() => chrome.sidePanel.setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH }))
        .catch((e) => console.error('[AMT] side panel close failed', e))
    } else {
      // Re-assert enabled before opening: a prior close (disable→re-enable) could
      // be interrupted by SW termination, leaving this tab's panel disabled with
      // no recovery. Both calls dispatch synchronously, preserving the user
      // gesture that sidePanel.open() requires.
      void chrome.sidePanel
        .setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH })
        .catch((e) => console.error('[AMT] side panel enable failed', e))
      void chrome.sidePanel.open({ tabId }).catch((e) => console.error('[AMT] side panel open failed', e))
    }
  }

  function registerPort(port: chrome.runtime.Port): void {
    if (port.name !== 'sidepanel') return
    let tabId: number | undefined
    port.onMessage.addListener((m: unknown) => {
      const id = (m as { tabId?: number })?.tabId
      if (typeof id === 'number') {
        tabId = id
        openTabs.add(id)
      }
    })
    port.onDisconnect.addListener(() => {
      if (tabId !== undefined) openTabs.delete(tabId)
    })
  }

  return { toggle, registerPort }
}

export interface RouterCtx {
  now: () => number
  sendSession?: (s: Settings, sess: StoredSession) => Promise<SendResult>
}

export interface RouterResult {
  state: StorageSchema
  response?: SendSessionResponse
}

// Sends sessions[idx] and folds the result back into state: sent + mcpList
// merge on success, failed on error. Shared by SEND_SESSION,
// SEND_CURRENT_SESSION and the auto-send path.
async function sendArchivedAt(
  state: StorageSchema,
  idx: number,
  ctx: RouterCtx,
): Promise<RouterResult> {
  const send = ctx.sendSession ?? defaultSendSession
  let result: SendResult
  try {
    result = await send(state.settings, state.sessions[idx])
  } catch (e) {
    // 주입된 sender가 reject하면 응답 자체가 유실된다(serialized의 무음 catch).
    // 단일 관문에서 실패 결과로 접어 sendResponse가 항상 나가게 한다.
    result = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const sessions = state.sessions.slice()
  if (result.ok) {
    sessions[idx] = { ...sessions[idx], transmitStatus: 'sent', sentAt: ctx.now() }
    const mcpList = mergeMcpList(state.mcpList, result.mcpServers ?? [])
    return { state: { ...state, sessions, mcpList }, response: { ok: true } }
  }
  sessions[idx] = { ...sessions[idx], transmitStatus: 'failed' }
  return { state: { ...state, sessions }, response: { ok: false, error: result.error } }
}

export async function handleMessage(
  state: StorageSchema,
  msg: RuntimeMessage,
  senderUrl: string,
  ctx: RouterCtx,
): Promise<RouterResult> {
  void senderUrl // reserved for logging/future origin checks
  switch (msg.type) {
    case MSG.API_CAPTURED: {
      // MVP: consent gate removed. Capture is gated by trackingEnabled only.
      // consentGivenAt is retained in the schema for future re-introduction.
      if (!state.settings.trackingEnabled) return { state }
      const next = appendCall(state, msg.payload, ctx.now(), state.settings)
      if (next === state) return { state } // dropped by a capture filter (appendCall returns the same ref)
      if (!shouldAutoSend(next, next.settings)) return { state: next }

      // Auto-send: archive the full current session, then upload it.
      const archived = rotateSession(next, next.currentSession?.url ?? '', ctx.now())
      const { state: sent } = await sendArchivedAt(archived, archived.sessions.length - 1, ctx)
      return { state: sent }
    }
    case MSG.SESSION_CHANGE: {
      // URL 변경은 더 이상 세션을 끊지 않는다. 추적 중에는 SPA 이동·전체 페이지
      // 이동과 무관하게 하나의 세션에 계속 누적한다. 세션 경계는 idle 타임아웃
      // (registerBackground의 IDLE_ALARM)과 추적 토글로만 결정된다. 이 메시지는
      // 이제 IDLE_ALARM 리셋(활동 신호)으로만 쓰인다.
      return { state }
    }
    case MSG.TOGGLE_TRACKING: {
      return {
        state: { ...state, settings: { ...state.settings, trackingEnabled: msg.enabled } },
      }
    }
    case MSG.SEND_SESSION: {
      const idx = state.sessions.findIndex((s) => s.sessionId === msg.sessionId)
      if (idx === -1) return { state, response: { ok: false, error: 'session not found' } }
      return sendArchivedAt(state, idx, ctx)
    }
    case MSG.SEND_CURRENT_SESSION: {
      // Cherry-pick manual send: archive ONLY the selected calls, keep the rest
      // in a fresh current session, then send. 세션 이름은 UI가 실어 보내지 않고
      // 전송 시점의 settings에서 직접 읽는다 — 값의 출처를 하나로 유지한다.
      const name = state.settings.sessionName.trim() || undefined
      const split = splitAndArchive(state, msg.callIds, name, ctx.now())
      if (split === state) return { state, response: { ok: false, error: 'no calls selected' } }
      return sendArchivedAt(split, split.sessions.length - 1, ctx)
    }
    case MSG.DELETE_CALL: {
      const current = state.currentSession
      if (!current) return { state }
      const calls = current.calls.filter((c) => c.id !== msg.callId)
      if (calls.length === current.calls.length) return { state }
      return { state: { ...state, currentSession: { ...current, calls } } }
    }
    case MSG.CLEAR_SESSION: {
      // 패널의 직접 patchStorage는 write-lock을 우회해 진행 중 전송의 늦은 쓰기가
      // 삭제를 되살릴 수 있다(lost update). 전체 삭제도 큐를 태운다.
      const current = state.currentSession
      if (!current || current.calls.length === 0) return { state }
      return { state: { ...state, currentSession: { ...current, calls: [] } } }
    }
    default:
      return { state }
  }
}

const IDLE_ALARM = 'idle-timeout'

export function registerBackground(): void {
  // Write serialization to prevent concurrent storage mutations.
  // Every API_CAPTURED does getStorage -> mutate -> patchStorage(full state).
  // Without serialization, concurrent messages read the same snapshot and the
  // last write wins, silently dropping calls. Chaining writes onto a single
  // promise lock forces strict read-modify-write ordering.
  let writeLock: Promise<void> = Promise.resolve()

  function serialized(fn: () => Promise<void>): Promise<void> {
    writeLock = writeLock.then(fn).catch(() => {})
    return writeLock
  }

  void chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch(() => undefined)

  const sidePanel = createSidePanelController()
  chrome.runtime.onConnect.addListener((port) => sidePanel.registerPort(port))

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    if (message.type === MSG.OPEN_SIDEPANEL) {
      // Handle synchronously, before any await, to preserve the user gesture
      // that chrome.sidePanel.open() requires. Does not enter the serialized
      // storage queue (no state mutation needed). Returns without `return true`:
      // the synchronous sendResponse closes the channel; `return true` is only
      // for deferred async responses. Adding any await above this breaks both.
      sidePanel.toggle(sender.tab?.id)
      sendResponse({ ok: true })
      return
    }
    const senderUrl = sender.tab?.url ?? sender.url ?? ''
    void serialized(async () => {
      const state = await getStorage()
      const ctx: RouterCtx = { now: () => Date.now() }
      const { state: next, response } = await handleMessage(state, message, senderUrl, ctx)
      await patchStorage(next as Partial<typeof next>)
      if (message.type === MSG.API_CAPTURED || message.type === MSG.SESSION_CHANGE) {
        await chrome.alarms.clear(IDLE_ALARM)
        chrome.alarms.create(IDLE_ALARM, { delayInMinutes: IDLE_TIMEOUT_MS / 60000 })
      }
      sendResponse(response ?? { ok: true })
    })
    return true
  })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== IDLE_ALARM) return
    void serialized(async () => {
      const state = await getStorage()
      const next = rotateSession(state, state.currentSession?.url ?? '', Date.now())
      await patchStorage(next as Partial<typeof next>)
    })
  })
}

registerBackground()
