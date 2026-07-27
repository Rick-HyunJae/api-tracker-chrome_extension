import type { ApiCall } from './types'

export const POSTMSG_SOURCE = 'api-to-mcp-tracker' as const

export const MSG = {
  API_CAPTURED: 'API_CAPTURED',
  SESSION_CHANGE: 'SESSION_CHANGE',
  SEND_SESSION: 'SEND_SESSION',
  SEND_CURRENT_SESSION: 'SEND_CURRENT_SESSION',
  DELETE_CALL: 'DELETE_CALL',
  TOGGLE_TRACKING: 'TOGGLE_TRACKING',
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

export type SessionChangeReason = 'pushState' | 'replaceState' | 'popstate' | 'beforeunload' | 'idle'

export interface CaptureMessage {
  type: typeof MSG.API_CAPTURED
  payload: ApiCall & { pageUrl: string } // URL at time of capture (survives SPA navigation)
}

export interface SessionChangeMessage {
  type: typeof MSG.SESSION_CHANGE
  reason: SessionChangeReason
  url: string
}

export interface SendSessionMessage {
  type: typeof MSG.SEND_SESSION
  sessionId: string
}

export interface SendCurrentSessionMessage {
  type: typeof MSG.SEND_CURRENT_SESSION
  name?: string // 세션 이름 (선택) — 아카이브·페이로드에 스탬프
  callIds: string[] // 전송 대상으로 선택된 호출 id (체리픽)
}

export interface DeleteCallMessage {
  type: typeof MSG.DELETE_CALL
  callId: string
}

export interface ToggleTrackingMessage {
  type: typeof MSG.TOGGLE_TRACKING
  enabled: boolean
}

export interface OpenSidePanelMessage {
  type: typeof MSG.OPEN_SIDEPANEL
}

export type RuntimeMessage =
  | CaptureMessage
  | SessionChangeMessage
  | SendSessionMessage
  | SendCurrentSessionMessage
  | DeleteCallMessage
  | ToggleTrackingMessage
  | OpenSidePanelMessage

export interface SendSessionResponse {
  ok: boolean
  error?: string
}
