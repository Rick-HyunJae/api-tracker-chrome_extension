export interface ApiCall {
  id: string
  url: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string | null
  durationMs: number
  capturedAt: number
}

export interface Settings {
  serverUrl: string
  apiKey: string
  sessionName: string // 전송 시 payload.name으로 가공 없이 전달 — 빈 문자열이면 필드 생략
  trackingEnabled: boolean
  blacklistedDomains: string[]
  domainWhitelist: string[]
  captureMethods: string[]
  saveBody: boolean
  autoSend: boolean
  dedupe: boolean
  consentGivenAt?: number // undefined = user has not yet consented to data collection
}

export interface CurrentSession {
  sessionId: string
  url: string
  startedAt: number
  calls: ApiCall[]
  status: 'recording' | 'idle'
}

export type TransmitStatus = 'pending' | 'sent' | 'failed'

export interface StoredSession {
  sessionId: string
  name?: string // 사용자가 전송 시 지정한 세션 이름 (선택)
  url: string
  startedAt: number
  endedAt: number
  calls: ApiCall[]
  transmitStatus: TransmitStatus
  sentAt?: number
}

export interface McpEntry {
  id: string
  name: string
  sourceUrl: string
  endpoint: string
  createdAt: number
  active: boolean
}

export interface StorageSchema {
  settings: Settings
  currentSession: CurrentSession | null
  sessions: StoredSession[]
  mcpList: McpEntry[]
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: '',
  apiKey: '',
  sessionName: '',
  trackingEnabled: true,
  blacklistedDomains: [],
  domainWhitelist: [],
  captureMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  saveBody: true,
  autoSend: false,
  dedupe: false,
}

export const DEFAULT_STORAGE: StorageSchema = {
  settings: DEFAULT_SETTINGS,
  currentSession: null,
  sessions: [],
  mcpList: [],
}
