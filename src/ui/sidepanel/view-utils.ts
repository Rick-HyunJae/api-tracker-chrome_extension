export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin // 스킴 포함 — https:// 하드코딩으로 인한 오표기 방지
  } catch {
    return ''
  }
}

export function sizeOf(body: string | null): number {
  return body ? body.length : 0
}

export type StatusClass = 'ok' | 'warn' | 'err'
export function statusClass(status: number): StatusClass {
  return status < 300 ? 'ok' : status < 400 ? 'warn' : 'err'
}

export function headersEntries(rec: Record<string, string>): [string, string][] {
  return Object.entries(rec)
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Minimal JSON syntax highlighter (ported from the design's panel.jsx). Returns
// an HTML string for dangerouslySetInnerHTML — input is HTML-escaped first.
export function highlightJson(json: string | null): string {
  if (!json) return ''
  const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'tok-num'
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'tok-key' : 'tok-str'
      else if (/true|false/.test(m)) cls = 'tok-bool'
      else if (/null/.test(m)) cls = 'tok-null'
      return `<span class="${cls}">${m}</span>`
    },
  )
}
