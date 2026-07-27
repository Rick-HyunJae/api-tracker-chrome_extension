import type { ApiCall, CurrentSession, Settings, StorageSchema, StoredSession } from '../shared/types'
import { matchDomain } from '../shared/domain-match'

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const AUTO_SEND_THRESHOLD = 50

export function shouldAutoSend(state: StorageSchema, settings: Settings): boolean {
  return settings.autoSend && (state.currentSession?.calls.length ?? 0) >= AUTO_SEND_THRESHOLD
}

function newSessionId(now: number): string {
  return `sess_${now}_${Math.random().toString(36).slice(2, 8)}`
}

function freshSession(url: string, now: number): CurrentSession {
  return {
    sessionId: newSessionId(now),
    url,
    startedAt: now,
    calls: [],
    status: 'recording',
  }
}

export function startSession(state: StorageSchema, url: string, now: number): StorageSchema {
  return { ...state, currentSession: freshSession(url, now) }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url // malformed URL: best-effort key from the raw string
  }
}

// Appends a captured call subject to the capture filters. Returns the SAME state
// reference (===) when the call is dropped by a filter — callers rely on this
// referential equality to detect a no-op (see index.ts API_CAPTURED).
export function appendCall(
  state: StorageSchema,
  call: ApiCall & { pageUrl: string },
  now: number,
  settings: Settings,
): StorageSchema {
  // Method filter
  if (!settings.captureMethods.includes(call.method)) return state

  // Domain whitelist (only when non-empty)
  if (settings.domainWhitelist.length > 0) {
    let host = ''
    try {
      // .host는 포트를 포함해(`localhost:8787`) 도메인 패턴과 매칭이 깨진다.
      // 블랙리스트(widget-host)의 location.hostname과 동일하게 포트 없는 hostname을 쓴다.
      host = new URL(call.url).hostname
    } catch {
      host = ''
    }
    const allowed = host !== '' && settings.domainWhitelist.some((p) => matchDomain(host, p))
    if (!allowed) return state
  }

  const stored = settings.saveBody ? call : { ...call, responseBody: null }
  const current = state.currentSession ?? freshSession(call.pageUrl, now)

  // Dedupe key is the URL pathname only — calls with different query strings on
  // the same path are treated as the same endpoint (last response wins).
  const base = settings.dedupe
    ? current.calls.filter((c) => safePath(c.url) !== safePath(call.url))
    : current.calls

  return {
    ...state,
    currentSession: {
      ...current,
      status: 'recording',
      calls: [...base, stored],
    },
  }
}

export function rotateSession(state: StorageSchema, nextUrl: string, now: number): StorageSchema {
  const current = state.currentSession
  const shouldArchive = current !== null && current.calls.length > 0

  const archived: StoredSession[] = shouldArchive
    ? [
        ...state.sessions,
        {
          sessionId: current!.sessionId,
          url: current!.url,
          startedAt: current!.startedAt,
          endedAt: now,
          calls: current!.calls,
          transmitStatus: 'pending',
        },
      ]
    : state.sessions

  return {
    ...state,
    sessions: archived,
    currentSession: freshSession(nextUrl, now),
  }
}

// Cherry-pick rotation for manual send: archives ONLY the selected calls as a
// pending StoredSession (with an optional user-given name) and keeps the rest
// in a fresh current session. Returns the SAME state reference (===) when there
// is nothing to archive — callers rely on referential equality to detect a
// no-op, mirroring the appendCall contract.
export function splitAndArchive(
  state: StorageSchema,
  callIds: string[],
  name: string | undefined,
  now: number,
): StorageSchema {
  const current = state.currentSession
  if (!current) return state
  const ids = new Set(callIds)
  const selected = current.calls.filter((c) => ids.has(c.id))
  if (selected.length === 0) return state
  const remaining = current.calls.filter((c) => !ids.has(c.id))

  const archived: StoredSession = {
    sessionId: current.sessionId,
    ...(name !== undefined ? { name } : {}),
    url: current.url,
    startedAt: current.startedAt,
    endedAt: now,
    calls: selected,
    transmitStatus: 'pending',
  }

  return {
    ...state,
    sessions: [...state.sessions, archived],
    currentSession: { ...freshSession(current.url, now), calls: remaining },
  }
}
