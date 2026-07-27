import type { McpEntry, Settings, StoredSession } from '../shared/types'

export const MAX_RETRIES = 3

export function backoffDelayMs(attempt: number): number {
  return 500 * 2 ** attempt
}

export interface SendResult {
  ok: boolean
  mcpServers?: McpEntry[]
  error?: string
}

export interface SenderDeps {
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function sendSession(
  settings: Settings,
  session: StoredSession,
  deps: SenderDeps = {},
): Promise<SendResult> {
  if (!settings.serverUrl) {
    return { ok: false, error: 'serverUrl is not configured' }
  }
  const sleep = deps.sleep ?? defaultSleep
  const endpoint = `${settings.serverUrl.replace(/\/$/, '')}/api/sessions`

  let lastError = 'unknown error'
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffDelayMs(attempt - 1))
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          name: session.name, // undefined면 JSON.stringify가 필드 자체를 생략
          url: session.url,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          calls: session.calls,
        }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        lastError =
          `Server error ${res.status}: ${errBody.slice(0, 200)}. ` +
          (res.status === 401 ? 'Check your API Key in Settings. ' : '') +
          (res.status === 404 ? 'Check your Server URL in Settings. ' : '') +
          (res.status >= 500 ? 'Server may be temporarily unavailable. ' : '')
        continue
      }
      const data = (await res.json()) as { mcpServers?: McpEntry[] }
      return { ok: true, mcpServers: data.mcpServers ?? [] }
    } catch (e) {
      lastError = `서버에 연결할 수 없습니다. Server URL과 네트워크 연결을 확인하세요. (${e instanceof Error ? e.message : String(e)})`
    }
  }
  return { ok: false, error: lastError }
}

export function mergeMcpList(existing: McpEntry[], incoming: McpEntry[]): McpEntry[] {
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()]
}
