# API Collector P2 — 사이드패널 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자인 "API Collector" 사이드 패널(Rail + List/Detail/Send/Settings 뷰)을 TSX로 구현해 실 캡처 데이터에 연결하고, 별도 옵션 페이지를 제거한다.

**Architecture:** 디자인 `panel.jsx`/`app.jsx`의 프레젠테이션 컴포넌트를 TSX로 옮긴다. 표시값은 `ApiCall`에서 순수 함수(`view-utils.ts`)로 파생한다. 루트(`index.tsx`)가 `view` 상태로 뷰를 전환하고 `getStorage`/`onStorageChanged`로 실데이터를 구독한다. 설정은 `patchStorage`로 직접 영속한다(P3가 SW에서 소비). MCP·히스토리는 Rail의 **비활성 탭**으로만 노출. 스타일은 P1의 `tokens.css` + 신규 `components.css` 클래스를 사용한다.

**Tech Stack:** TypeScript, React 18, Vite, Vitest + @testing-library/react, Chrome MV3 storage.

**Spec:** `docs/specs/2026-06-01-api-collector-design-application-design.md` (§3.2, §3.5)

> **BLOCKING PREREQUISITE:** P3 Task 1(`Settings` 타입 확장 + `DEFAULT_SETTINGS` 신규 필드)을 **반드시 선행**할 것. 미선행 시 Task 8(`SettingsView`)·Task 10(`index.tsx`)이 미정의 `Settings.captureMethods`/`domainWhitelist`/`saveBody`/`autoSend`/`dedupe`를 참조해 `tsc` 컴파일 실패한다. 권장 실행 순서: **P1 → P3 → P2**.

**의존:** P1의 `src/ui/theme/tokens.css`·`fonts.css`가 존재해야 한다(import). P1 미완 시 Task 4에서 빈 토큰이라도 import 경로는 맞춰 두고 P1 머지 후 표시 확인.

**디자인 출처(시각 진실):** claude-design 번들을 저장소 `docs/design-src/`에 복사해 두었다 — `panel.jsx`(List/Detail/Settings/Rail), `app.jsx`(SendView), `icons.jsx`, `API Collector.html`(CSS). 구현은 이들을 픽셀 충실히 옮긴다. (휘발성 `/tmp`가 아닌 저장소 경로를 참조해 워크트리/재부팅에도 안전.)

---

## File Structure

- Create: `src/ui/sidepanel/view-utils.ts` — `ApiCall` → 표시값 파생(순수).
- Create: `src/ui/sidepanel/view-utils.test.ts`
- Create: `src/ui/sidepanel/icons.tsx` — 라인 아이콘 세트(`icons.jsx` 이식).
- Create: `src/ui/sidepanel/CopyBtn.tsx` (+ `.test.tsx`)
- Create: `src/ui/theme/components.css` — 패널 컴포넌트 스타일(`API Collector.html` `<style>` 이식).
- Create: `src/ui/sidepanel/ListView.tsx` (+ `.test.tsx`)
- Create: `src/ui/sidepanel/DetailView.tsx` (+ `.test.tsx`)
- Create: `src/ui/sidepanel/SendView.tsx` (+ `.test.tsx`)
- Create: `src/ui/sidepanel/SettingsView.tsx` (+ `.test.tsx`)
- Create: `src/ui/sidepanel/Rail.tsx` (+ `.test.tsx`)
- Rewrite: `src/ui/sidepanel/index.tsx` — 뷰 합성 + 상태 + 실데이터.
- Delete: `src/ui/sidepanel/CaptureList.tsx`, `CaptureList.test.tsx`, `SendButton.tsx`, `SendButton.test.tsx`.
- Delete: `public/options.html`, `src/ui/options/*`.
- Modify: `manifest.json` — `options_page` 제거.

---

## Task 1: 표시값 파생 유틸 (TDD)

**Files:**
- Create: `src/ui/sidepanel/view-utils.ts`
- Test: `src/ui/sidepanel/view-utils.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/ui/sidepanel/view-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hostOf, pathOf, sizeOf, statusClass, headersEntries, highlightJson } from './view-utils'

describe('view-utils', () => {
  it('hostOf extracts the host', () => {
    expect(hostOf('https://api.example.com/v1/users?x=1')).toBe('api.example.com')
  })
  it('pathOf extracts the path without query', () => {
    expect(pathOf('https://api.example.com/v1/users?x=1')).toBe('/v1/users')
  })
  it('hostOf/pathOf are safe on malformed urls', () => {
    expect(hostOf('not a url')).toBe('')
    expect(pathOf('not a url')).toBe('not a url')
  })
  it('sizeOf returns body length, 0 for null', () => {
    expect(sizeOf('abcd')).toBe(4)
    expect(sizeOf(null)).toBe(0)
  })
  it('statusClass maps ranges', () => {
    expect(statusClass(200)).toBe('ok')
    expect(statusClass(301)).toBe('warn')
    expect(statusClass(404)).toBe('err')
    expect(statusClass(500)).toBe('err')
  })
  it('headersEntries converts a record to pairs', () => {
    expect(headersEntries({ a: '1', b: '2' })).toEqual([['a', '1'], ['b', '2']])
  })
  it('highlightJson wraps keys and strings in token spans', () => {
    const html = highlightJson('{"a":"b"}')
    expect(html).toContain('tok-key')
    expect(html).toContain('tok-str')
  })
  it('highlightJson escapes HTML in untrusted response bodies (no raw tags)', () => {
    const html = highlightJson('{"x":"</span><img src=x onerror=alert(1)>"}')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/view-utils.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/ui/sidepanel/view-utils.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/view-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/view-utils.ts src/ui/sidepanel/view-utils.test.ts
git commit -m "feat(panel): add ApiCall display-derivation utils"
```

---

## Task 2: 아이콘 세트

**Files:**
- Create: `src/ui/sidepanel/icons.tsx`

> 순수 SVG. 단위 테스트 대신 타입체크로 검증(다음 태스크들이 import해 사용).

- [ ] **Step 1: icons.tsx 작성** (`icons.jsx`에서 패널이 쓰는 글리프만 이식)

`src/ui/sidepanel/icons.tsx`:

```tsx
import React from 'react'

interface IcProps {
  size?: number
  className?: string
}

function Svg({
  size = 18,
  sw = 1.7,
  fill,
  className,
  children,
}: IcProps & { sw?: number; fill?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export const Stack = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></Svg>
)
export const Send = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M4 12l16-8-6 16-3-6-7-2z" /></Svg>
)
export const Gear = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z" /></Svg>
)
export const Play = (p: IcProps): React.ReactElement => (
  <Svg {...p} fill="currentColor" sw={0}><path d="M7 5v14l12-7z" /></Svg>
)
export const Pause = (p: IcProps): React.ReactElement => (
  <Svg {...p} fill="currentColor" sw={0}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Svg>
)
export const Copy = (p: IcProps): React.ReactElement => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>
)
export const Check = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M5 13l4 4L19 7" /></Svg>
)
export const Trash = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Svg>
)
export const Chevron = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
)
export const Back = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>
)
export const Search = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></Svg>
)
export const Cloud = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 0 8.5H7z" /></Svg>
)
export const Clock = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>
)
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/sidepanel/icons.tsx
git commit -m "feat(panel): port line icon set to TSX"
```

---

## Task 3: 패널 컴포넌트 CSS

**Files:**
- Create: `src/ui/theme/components.css`

> CSS 전용. `API Collector.html` `<style>`에서 가짜 브라우저/플로팅 독/Tweaks를 제외한 **패널 내부** 규칙을 이식한다. 검증은 빌드.

- [ ] **Step 1: components.css 작성**

`API Collector.html`(읽기: `docs/design-src/API Collector.html`)의 다음 셀렉터 그룹을 그대로 복사한다(값 변경 금지): `#root`, `.pmain`, `.phead*`, `.icon-btn`, `.recbar*`, `@keyframes ping2`, `.searchrow*`, `.scroll`, `.list`, `.entry*`, `@keyframes pop`, `.badge.*`, `.status*`, `.empty*`, `.pfoot`, `.btn*`, `.dhead/.dback/.durl*`, `.tabs/.tab*`, `.section-tools`, `.copy-btn*`, `.kv*`, `.codeblock/pre.code/.tok-*`, `.empty-body`, `.settings/.set-group/.field/.chips/.chip*/.togrow/.sw*`, `.rail*`, `.toast*`, `@keyframes rise`. 제외: `.browser`, `.chrome*`, `.omni*`, `.page*`, `.panel`, `.fab*`, `body`/`html` 배경, `.ava`(아바타) 유지 가능.

상단에 토큰 import:

```css
@import './tokens.css';
@import './fonts.css';

#root { width: 100%; height: 100%; display: flex; min-height: 0; }
/* ↑ 이하 위 셀렉터 그룹을 API Collector.html에서 그대로 이식 */
```

- [ ] **Step 2: 빌드 검증**

Run: `npx vite build`
Expected: PASS (CSS 번들 생성)

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme/components.css
git commit -m "feat(panel): port panel component styles"
```

---

## Task 4: CopyBtn (TDD)

**Files:**
- Create: `src/ui/sidepanel/CopyBtn.tsx`
- Test: `src/ui/sidepanel/CopyBtn.test.tsx`

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/CopyBtn.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyBtn } from './CopyBtn'

describe('CopyBtn', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  it('writes the text to the clipboard and shows the done label', async () => {
    render(<CopyBtn text="hello" label="복사" />)
    fireEvent.click(screen.getByRole('button'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('복사됨'))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/CopyBtn.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/ui/sidepanel/CopyBtn.tsx`:

```tsx
import React, { useState } from 'react'
import { Check, Copy } from './icons'

export function CopyBtn({ text, label = '복사' }: { text: string; label?: string }): React.ReactElement {
  const [done, setDone] = useState(false)
  const copy = (): void => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setDone(true)
    setTimeout(() => setDone(false), 1300)
  }
  return (
    <button className={'copy-btn' + (done ? ' done' : '')} onClick={copy}>
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? '복사됨' : label}
    </button>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/CopyBtn.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/CopyBtn.tsx src/ui/sidepanel/CopyBtn.test.tsx
git commit -m "feat(panel): add CopyBtn"
```

---

## Task 5: ListView (TDD)

**Files:**
- Create: `src/ui/sidepanel/ListView.tsx`
- Test: `src/ui/sidepanel/ListView.test.tsx`

ListView prop 계약:
```ts
interface ListViewProps {
  calls: ApiCall[]
  tracking: boolean
  query: string
  freshId: string | null
  onToggleTracking: () => void
  onSearch: (q: string) => void
  onSelect: (id: string) => void
  onClear: () => void
  onGoSend: () => void
  onClose: () => void
  sending: boolean
}
```

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/ListView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListView } from './ListView'
import type { ApiCall } from '../../shared/types'

const call = (over: Partial<ApiCall> = {}): ApiCall => ({
  id: 'c1', url: 'https://api.shop.io/v1/users?p=1', method: 'GET',
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: '{}', durationMs: 12, capturedAt: 1700000000000, ...over,
})

const base = {
  tracking: true, query: '', freshId: null, sending: false,
  onToggleTracking: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onClear: vi.fn(), onGoSend: vi.fn(), onClose: vi.fn(),
}

describe('ListView', () => {
  it('shows empty state when there are no calls', () => {
    render(<ListView {...base} calls={[]} />)
    expect(screen.getByText('아직 수집된 요청이 없습니다')).toBeInTheDocument()
  })

  it('renders one entry per call with method badge, path and status', () => {
    render(<ListView {...base} calls={[call()]} />)
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('/v1/users')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('calls onSelect with the call id when an entry is clicked', () => {
    const onSelect = vi.fn()
    render(<ListView {...base} calls={[call()]} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('/v1/users'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('filters by query (path/method)', () => {
    render(<ListView {...base} calls={[call({ id: 'a', url: 'https://x/users' }), call({ id: 'b', url: 'https://x/orders' })]} query="orders" />)
    expect(screen.queryByText('/users')).not.toBeInTheDocument()
    expect(screen.getByText('/orders')).toBeInTheDocument()
  })

  it('toggles tracking via the recbar button', () => {
    const onToggleTracking = vi.fn()
    render(<ListView {...base} calls={[]} onToggleTracking={onToggleTracking} />)
    fireEvent.click(screen.getByTitle('수집 일시정지'))
    expect(onToggleTracking).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** (`panel.jsx`의 ListView 이식)

`src/ui/sidepanel/ListView.tsx`:

```tsx
import React from 'react'
import type { ApiCall } from '../../shared/types'
import { hostOf, pathOf, sizeOf, statusClass, formatTime } from './view-utils'
import { Stack, Play, Pause, Trash, Search, Chevron, Send } from './icons'

interface ListViewProps {
  calls: ApiCall[]
  tracking: boolean
  query: string
  freshId: string | null
  sending: boolean
  onToggleTracking: () => void
  onSearch: (q: string) => void
  onSelect: (id: string) => void
  onClear: () => void
  onGoSend: () => void
  onClose: () => void
}

export function ListView(props: ListViewProps): React.ReactElement {
  const { calls, tracking, query, freshId, sending } = props
  const q = query.toLowerCase()
  const filtered = calls.filter(
    (c) => !q || pathOf(c.url).toLowerCase().includes(q) || c.method.toLowerCase().includes(q),
  )
  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><Stack size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>API 수집기</h1>
          <div className="sub">REST · 사이드 패널</div>
        </div>
        <button className="icon-btn" title="패널 닫기" onClick={props.onClose}><Chevron size={17} /></button>
      </div>

      <div className={'recbar' + (tracking ? ' live' : '')}>
        <button
          className={'rec-toggle ' + (tracking ? 'on' : 'off')}
          onClick={props.onToggleTracking}
          title={tracking ? '수집 일시정지' : '수집 시작'}
        >
          {tracking ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="rec-meta">
          <div className="rec-state">
            <span className="blip" style={{ background: tracking ? 'var(--rec)' : 'var(--text-3)' }} />
            {tracking ? '수집 중' : '일시정지됨'}
          </div>
          <div className="rec-count">
            <b>{calls.length}</b>건 수집됨{tracking ? ' · URL 이동 감지 중' : ' · 토글하여 시작'}
          </div>
        </div>
        <button
          className="icon-btn"
          title="전체 삭제"
          onClick={props.onClear}
          disabled={!calls.length}
          style={{ opacity: calls.length ? 1 : 0.4 }}
        >
          <Trash size={16} />
        </button>
      </div>

      <div className="searchrow">
        <Search size={14} />
        <input
          placeholder="경로 · 메서드 검색"
          value={query}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>

      <div className="scroll">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="ring"><Stack size={22} /></div>
            <p>{calls.length ? '검색 결과가 없습니다' : '아직 수집된 요청이 없습니다'}</p>
            <span>{calls.length ? query : '수집을 시작하고 페이지를 이동해 보세요'}</span>
          </div>
        ) : (
          <div className="list">
            {filtered.map((c) => (
              <button
                key={c.id}
                className={'entry' + (c.id === freshId ? ' fresh' : '')}
                onClick={() => props.onSelect(c.id)}
              >
                <div className="entry-top">
                  <span className={'badge ' + c.method}>{c.method}</span>
                  <span className="path">{pathOf(c.url)}</span>
                  <span className={'status ' + statusClass(c.responseStatus)}>{c.responseStatus}</span>
                </div>
                <div className="entry-meta">
                  <span className="host">{hostOf(c.url)}</span>
                  <span className="sep">·</span>
                  <span>{c.durationMs}ms</span>
                  <span className="sep">·</span>
                  <span>{sizeOf(c.responseBody)}B</span>
                  <span style={{ marginLeft: 'auto' }}>{formatTime(c.capturedAt)}</span>
                </div>
                <span className="chev"><Chevron size={15} /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pfoot">
        <button className="btn btn-primary" disabled={!calls.length || sending} onClick={props.onGoSend}>
          {sending ? '전송 중…' : <><Send size={16} /> 서버로 전송 <span className="pill">{calls.length}</span></>}
        </button>
        <button className="btn btn-ghost" title="전체 삭제" onClick={props.onClear} disabled={!calls.length}>
          <Trash size={16} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/ListView.tsx src/ui/sidepanel/ListView.test.tsx
git commit -m "feat(panel): add ListView"
```

---

## Task 6: DetailView (TDD)

**Files:**
- Create: `src/ui/sidepanel/DetailView.tsx`
- Test: `src/ui/sidepanel/DetailView.test.tsx`

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/DetailView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailView } from './DetailView'
import type { ApiCall } from '../../shared/types'

const call: ApiCall = {
  id: 'c1', url: 'https://api.shop.io/v1/users', method: 'POST',
  requestHeaders: { 'x-req': 'r' }, requestBody: null, responseStatus: 201,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"ok":true}', durationMs: 30, capturedAt: 1700000000000,
}

describe('DetailView', () => {
  it('shows the body tab by default with highlighted JSON', () => {
    render(<DetailView call={call} onBack={vi.fn()} />)
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('switches to the response headers tab', () => {
    render(<DetailView call={call} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /응답 헤더/ }))
    expect(screen.getByText('content-type')).toBeInTheDocument()
  })

  it('calls onBack', () => {
    const onBack = vi.fn()
    render(<DetailView call={call} onBack={onBack} />)
    fireEvent.click(screen.getByText('수집 리스트'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows a no-content message when the body is empty', () => {
    render(<DetailView call={{ ...call, responseBody: null }} onBack={vi.fn()} />)
    expect(screen.getByText(/본문 없음/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/DetailView.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** (`panel.jsx`의 DetailView 이식, 실 `ApiCall` 사용)

`src/ui/sidepanel/DetailView.tsx`:

```tsx
import React, { useState } from 'react'
import type { ApiCall } from '../../shared/types'
import { hostOf, pathOf, sizeOf, statusClass, headersEntries, highlightJson, formatTime } from './view-utils'
import { Back } from './icons'
import { CopyBtn } from './CopyBtn'

type Tab = 'body' | 'res' | 'req'

export function DetailView({ call, onBack }: { call: ApiCall; onBack: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('body')
  const resHeaders = headersEntries(call.responseHeaders)
  const reqHeaders = headersEntries(call.requestHeaders)
  const headersText = (hs: [string, string][]): string => hs.map(([k, v]) => `${k}: ${v}`).join('\n')

  // Derive the body format from the response Content-Type (not hardcoded JSON).
  const ct = (call.responseHeaders['content-type'] ?? call.responseHeaders['Content-Type'] ?? '').toLowerCase()
  const fmt = !call.responseBody
    ? '—'
    : ct.includes('json') ? 'JSON' : ct.includes('html') ? 'HTML' : ct.includes('xml') ? 'XML' : (ct.split(';')[0] || 'TEXT')

  return (
    <div className="pmain">
      <div className="dhead">
        <button className="dback" onClick={onBack}><Back size={15} /> 수집 리스트</button>
        <div className="durl">
          <div className="durl-top">
            <span className={'badge ' + call.method}>{call.method}</span>
            <span className={'status ' + statusClass(call.responseStatus)} style={{ fontSize: 12 }}>{call.responseStatus}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{formatTime(call.capturedAt)}</span>
          </div>
          <div className="full"><span style={{ color: 'var(--text-3)' }}>https://{hostOf(call.url)}</span><b>{pathOf(call.url)}</b></div>
          <div className="durl-stat">
            <span>응답 <b>{call.durationMs}ms</b></span>
            <span>크기 <b>{sizeOf(call.responseBody)}B</b></span>
            <span>형식 <b>{fmt}</b></span>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab' + (tab === 'body' ? ' active' : '')} onClick={() => setTab('body')}>본문</button>
        <button className={'tab' + (tab === 'res' ? ' active' : '')} onClick={() => setTab('res')}>응답 헤더<span className="n">{resHeaders.length}</span></button>
        <button className={'tab' + (tab === 'req' ? ' active' : '')} onClick={() => setTab('req')}>요청 헤더<span className="n">{reqHeaders.length}</span></button>
      </div>

      <div className="scroll">
        {tab === 'body' && (call.responseBody ? (
          <>
            <div className="section-tools"><CopyBtn text={call.responseBody} label="본문 복사" /></div>
            <div className="codeblock"><pre className="code" dangerouslySetInnerHTML={{ __html: highlightJson(call.responseBody) }} /></div>
          </>
        ) : (
          <div className="empty-body">{call.responseStatus} · 본문 없음 (No Content)</div>
        ))}
        {tab === 'res' && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(resHeaders)} label="헤더 복사" /></div>
            <div className="kv">{resHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
        {tab === 'req' && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(reqHeaders)} label="헤더 복사" /></div>
            <div className="kv">{reqHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
      </div>

      <div className="pfoot">
        <CopyBtn text={call.url} label="요청 URL 복사" />
        <span style={{ marginLeft: 'auto' }}>
          <CopyBtn text={`curl -X ${call.method} '${call.url}'`} label="cURL" />
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/DetailView.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/DetailView.tsx src/ui/sidepanel/DetailView.test.tsx
git commit -m "feat(panel): add DetailView with body/header tabs"
```

---

## Task 7: SendView (TDD)

**Files:**
- Create: `src/ui/sidepanel/SendView.tsx`
- Test: `src/ui/sidepanel/SendView.test.tsx`

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/SendView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendView } from './SendView'
import type { ApiCall, Settings } from '../../shared/types'

const call = (m: string): ApiCall => ({
  id: m, url: 'https://x/a', method: m, requestHeaders: {}, requestBody: null,
  responseStatus: 200, responseHeaders: {}, responseBody: 'abc', durationMs: 1, capturedAt: 1,
})
const settings = { serverUrl: 'https://c/api' } as Settings

describe('SendView', () => {
  it('shows the capture count and the endpoint', () => {
    render(<SendView calls={[call('GET'), call('POST')]} settings={settings} sending={false} progress={0} onSend={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('https://c/api')).toBeInTheDocument()
  })

  it('disables the send button when there are no calls', () => {
    render(<SendView calls={[]} settings={settings} sending={false} progress={0} onSend={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onSend on click', () => {
    const onSend = vi.fn()
    render(<SendView calls={[call('GET')]} settings={settings} sending={false} progress={0} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSend).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/SendView.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** (`app.jsx`의 SendView 이식)

`src/ui/sidepanel/SendView.tsx`:

```tsx
import React from 'react'
import type { ApiCall, Settings } from '../../shared/types'
import { sizeOf } from './view-utils'
import { Cloud, Send } from './icons'

interface SendViewProps {
  calls: ApiCall[]
  settings: Settings
  sending: boolean
  progress: number
  onSend: () => void
}

const methodVar: Record<string, string> = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del',
}

export function SendView({ calls, settings, sending, progress, onSend }: SendViewProps): React.ReactElement {
  const byMethod = calls.reduce<Record<string, number>>((a, e) => {
    a[e.method] = (a[e.method] ?? 0) + 1
    return a
  }, {})
  const totalBytes = calls.reduce((a, e) => a + sizeOf(e.responseBody), 0)

  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><Cloud size={17} /></div>
        <div style={{ flex: 1 }}><h1>서버로 전송</h1><div className="sub">batch upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
          <div className="set-group">
            <h3>업로드 요약</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '13px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600 }}>{calls.length}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>수집 건수</div>
              </div>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '13px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600 }}>{(totalBytes / 1024).toFixed(1)}<span style={{ fontSize: 13, color: 'var(--text-3)' }}>KB</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>페이로드</div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>메서드 분포</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Object.entries(byMethod).map(([m, n]) => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className={'badge ' + m} style={{ width: 52, textAlign: 'center' }}>{m}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: (calls.length ? (n / calls.length) * 100 : 0) + '%', background: `var(--m-${methodVar[m] ?? 'get'})`, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', width: 22, textAlign: 'right' }}>{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="set-group">
            <h3>대상</h3>
            <div className="durl" style={{ background: 'var(--surface)' }}>
              <div className="full"><span style={{ color: 'var(--text-3)' }}>POST </span><b>{settings.serverUrl || '(미설정)'}</b></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pfoot" style={{ flexDirection: 'column', gap: 9, alignItems: 'stretch' }}>
        {sending && (
          <div style={{ height: 5, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: progress + '%', background: 'var(--accent)', borderRadius: 5, transition: 'width .2s' }} />
          </div>
        )}
        <button className="btn btn-primary" disabled={!calls.length || sending} onClick={onSend} style={{ height: 44 }}>
          {sending ? `업로드 중… ${progress}%` : <><Send size={16} /> {calls.length}건 전송</>}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/SendView.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/SendView.tsx src/ui/sidepanel/SendView.test.tsx
git commit -m "feat(panel): add SendView with method distribution"
```

---

## Task 8: SettingsView (TDD)

**Files:**
- Create: `src/ui/sidepanel/SettingsView.tsx`
- Test: `src/ui/sidepanel/SettingsView.test.tsx`

> 입력값을 `Settings` 형태로 매핑: 엔드포인트→`serverUrl`, 토큰→`apiKey`, 도메인 화이트리스트→`domainWhitelist`(콤마 구분 문자열↔배열), 메서드 칩→`captureMethods`, 토글→`saveBody`/`autoSend`/`dedupe`. `onChange(patch: Partial<Settings>)` 콜백으로 부모가 영속.

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/SettingsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { DEFAULT_SETTINGS } from '../../shared/types'

describe('SettingsView', () => {
  it('edits the endpoint and emits a patch', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('업로드 엔드포인트'), { target: { value: 'https://c/api' } })
    expect(onChange).toHaveBeenCalledWith({ serverUrl: 'https://c/api' })
  })

  it('toggles a method chip off', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'GET' }))
    expect(onChange).toHaveBeenCalledWith({ captureMethods: ['POST', 'PUT', 'PATCH', 'DELETE'] })
  })

  it('toggles saveBody', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('sw-saveBody'))
    expect(onChange).toHaveBeenCalledWith({ saveBody: false })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/SettingsView.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** (`panel.jsx`의 SettingsView 이식 + 신규 필드)

`src/ui/sidepanel/SettingsView.tsx`:

```tsx
import React from 'react'
import type { Settings } from '../../shared/types'
import { Gear } from './icons'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

interface SettingsViewProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsView({ settings, onChange }: SettingsViewProps): React.ReactElement {
  const toggleMethod = (m: string): void => {
    const has = settings.captureMethods.includes(m)
    onChange({ captureMethods: has ? settings.captureMethods.filter((x) => x !== m) : [...settings.captureMethods, m] })
  }
  const Switch = ({ k }: { k: 'saveBody' | 'autoSend' | 'dedupe' }): React.ReactElement => (
    <button
      className={'sw' + (settings[k] ? ' on' : '')}
      data-testid={'sw-' + k}
      onClick={() => onChange({ [k]: !settings[k] } as Partial<Settings>)}
    />
  )

  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph" style={{ background: 'var(--surface-hi)', color: 'var(--text)' }}><Gear size={16} /></div>
        <div style={{ flex: 1 }}><h1>설정</h1><div className="sub">capture &amp; upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
          <div className="set-group">
            <h3>전송 서버</h3>
            <div className="field">
              <label htmlFor="set-endpoint">업로드 엔드포인트</label>
              <input id="set-endpoint" type="text" value={settings.serverUrl} onChange={(e) => onChange({ serverUrl: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="set-token">인증 토큰 (선택)</label>
              <input id="set-token" type="text" placeholder="Bearer …" value={settings.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} />
            </div>
          </div>

          <div className="set-group">
            <h3>캡처 대상</h3>
            <div className="field">
              <label htmlFor="set-domain">도메인 화이트리스트 <small style={{ color: 'var(--text-3)' }}>(콤마 구분, 비우면 전체)</small></label>
              <input
                id="set-domain"
                type="text"
                placeholder="*.example.com, api.foo.io"
                value={settings.domainWhitelist.join(', ')}
                onChange={(e) => onChange({ domainWhitelist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <div className="field">
              <label>HTTP 메서드</label>
              <div className="chips">
                {METHODS.map((m) => (
                  <button key={m} className={'chip' + (settings.captureMethods.includes(m) ? ' on' : '')} onClick={() => toggleMethod(m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>동작</h3>
            <div className="togrow">
              <div className="lbl">응답 본문 저장<small>JSON 본문을 함께 기록합니다</small></div>
              <Switch k="saveBody" />
            </div>
            <div className="togrow">
              <div className="lbl">자동 전송<small>50건마다 서버로 자동 업로드</small></div>
              <Switch k="autoSend" />
            </div>
            <div className="togrow">
              <div className="lbl">중복 URL 제외<small>같은 경로는 마지막 응답만 유지</small></div>
              <Switch k="dedupe" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/SettingsView.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/SettingsView.tsx src/ui/sidepanel/SettingsView.test.tsx
git commit -m "feat(panel): add SettingsView with capture filters"
```

---

## Task 9: Rail (비활성 MCP/히스토리 탭) (TDD)

**Files:**
- Create: `src/ui/sidepanel/Rail.tsx`
- Test: `src/ui/sidepanel/Rail.test.tsx`

Rail 뷰 식별자: `'list' | 'send' | 'settings'` (탐색 가능). MCP·히스토리는 비활성.

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/Rail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Rail } from './Rail'

describe('Rail', () => {
  it('switches to the send view', () => {
    const onView = vi.fn()
    render(<Rail view="list" onView={onView} count={3} />)
    fireEvent.click(screen.getByRole('button', { name: /전송/ }))
    expect(onView).toHaveBeenCalledWith('send')
  })

  it('shows the capture count badge', () => {
    render(<Rail view="list" onView={vi.fn()} count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders MCP and 히스토리 as disabled tabs that do not navigate', () => {
    const onView = vi.fn()
    render(<Rail view="list" onView={onView} count={0} />)
    const mcp = screen.getByRole('button', { name: /MCP/ })
    expect(mcp).toBeDisabled()
    fireEvent.click(mcp)
    expect(onView).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/Rail.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/ui/sidepanel/Rail.tsx`:

```tsx
import React from 'react'
import { Stack, Cloud, Gear, Clock } from './icons'

export type RailView = 'list' | 'send' | 'settings'

interface RailProps {
  view: RailView
  onView: (v: RailView) => void
  count: number
}

export function Rail({ view, onView, count }: RailProps): React.ReactElement {
  return (
    <div className="rail">
      <div className="tabs-top">
        <button className={'rail-btn' + (view === 'list' ? ' active' : '')} onClick={() => onView('list')}>
          <Stack size={19} /><span className="lab">수집</span>
          {count ? <span className="ndot">{count > 99 ? '99+' : count}</span> : null}
        </button>
        <button className={'rail-btn' + (view === 'send' ? ' active' : '')} onClick={() => onView('send')}>
          <Cloud size={19} /><span className="lab">전송</span>
        </button>
        <button className="rail-btn" disabled title="준비 중">
          <Stack size={19} /><span className="lab">MCP</span>
        </button>
        <button className="rail-btn" disabled title="준비 중">
          <Clock size={19} /><span className="lab">히스토리</span>
        </button>
      </div>
      <div className="spacer" />
      <button className={'rail-btn' + (view === 'settings' ? ' active' : '')} onClick={() => onView('settings')}>
        <Gear size={19} /><span className="lab">설정</span>
      </button>
      <div className="ava">K</div>
    </div>
  )
}
```

> `.rail-btn:disabled`는 `components.css`에 `opacity:.4; cursor:not-allowed; pointer-events:none` 추가(디자인엔 없던 비활성 상태). Task3 CSS에 한 줄 보강하거나 본 태스크 커밋에 함께 포함.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/Rail.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidepanel/Rail.tsx src/ui/sidepanel/Rail.test.tsx src/ui/theme/components.css
git commit -m "feat(panel): add Rail with disabled MCP/history tabs"
```

---

## Task 10: 사이드패널 루트 합성 (TDD)

**Files:**
- Rewrite: `src/ui/sidepanel/index.tsx`
- Test: `src/ui/sidepanel/index.test.tsx` (신규)

루트 책임: 실데이터 구독, 뷰 상태, 액션 배선.
- 추적 토글 → `chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled })`
- 설정 변경 → `patchStorage({ settings: { ...settings, ...patch } })`
- 전체 삭제 → `patchStorage({ currentSession: { ...session, calls: [] } })`
- 전송 → 기존과 동일하게 `MSG.SEND_SESSION`(현 세션 send 시맨틱은 기존과 불변; 백엔드 매칭은 본 plan 범위 밖)
- 엔트리 선택 → DetailView 전환

- [ ] **Step 1: 실패 테스트**

`src/ui/sidepanel/index.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Panel } from './index'
import { MSG } from '../../shared/messages'

const session = {
  sessionId: 's1', url: 'https://x/a', startedAt: 1, status: 'recording',
  calls: [{
    id: 'c1', url: 'https://api.shop.io/v1/users', method: 'GET',
    requestHeaders: {}, requestBody: null, responseStatus: 200,
    responseHeaders: {}, responseBody: '{}', durationMs: 5, capturedAt: 1,
  }],
}
const settings = {
  serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [],
  domainWhitelist: [], captureMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  saveBody: true, autoSend: false, dedupe: false,
}

describe('Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ currentSession: session, settings })
  })

  it('renders captured entries from storage', async () => {
    render(<Panel />)
    await waitFor(() => expect(screen.getByText('/v1/users')).toBeInTheDocument())
  })

  it('opens the detail view when an entry is clicked', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByText('/v1/users'))
    await waitFor(() => expect(screen.getByText('수집 리스트')).toBeInTheDocument())
  })

  it('toggles tracking via a runtime message', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByTitle('수집 일시정지'))
    fireEvent.click(screen.getByTitle('수집 일시정지'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.TOGGLE_TRACKING, enabled: false })
  })

  it('navigates to settings via the rail', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: /설정/ }))
    await waitFor(() => expect(screen.getByText('업로드 엔드포인트')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/index.test.tsx`
Expected: FAIL — `Panel` export 없음

- [ ] **Step 3: index.tsx 재작성**

`src/ui/sidepanel/index.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getStorage, onStorageChanged, patchStorage } from '../../shared/storage'
import { MSG } from '../../shared/messages'
import type { SendSessionResponse } from '../../shared/messages'
import type { ApiCall, CurrentSession, Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { connectSidePanelPort } from './port'
import { Rail } from './Rail'
import type { RailView } from './Rail'
import { ListView } from './ListView'
import { DetailView } from './DetailView'
import { SendView } from './SendView'
import { SettingsView } from './SettingsView'
import { Check } from './icons'
import '../theme/components.css'

type View = RailView | 'detail'

export function Panel(): React.ReactElement {
  const [session, setSession] = useState<CurrentSession | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const prevIds = useRef<Set<string>>(new Set())

  const flash = (msg: string, ok = true): void => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => {
    void getStorage().then((s) => {
      prevIds.current = new Set((s.currentSession?.calls ?? []).map((c) => c.id))
      setSession(s.currentSession)
      setSettings(s.settings)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) {
        const next = changes.currentSession.newValue as CurrentSession | null
        const nextCalls = next?.calls ?? []
        const added = nextCalls.find((c) => !prevIds.current.has(c.id))
        prevIds.current = new Set(nextCalls.map((c) => c.id))
        if (added) {
          setFreshId(added.id)
          setTimeout(() => setFreshId((id) => (id === added.id ? null : id)), 1500)
        }
        setSession(next)
      }
      if (changes.settings) setSettings(changes.settings.newValue as Settings)
    })
    void connectSidePanelPort()
  }, [])

  const calls: ApiCall[] = session?.calls ?? []
  const selected = calls.find((c) => c.id === selectedId) ?? null

  const onToggleTracking = (): void => {
    void chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !settings.trackingEnabled })
  }
  const onChangeSettings = (patch: Partial<Settings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void patchStorage({ settings: next })
  }
  const onClear = (): void => {
    if (!session) return
    setSelectedId(null)
    void patchStorage({ currentSession: { ...session, calls: [] } })
  }
  const onSend = (): void => {
    if (!session || !calls.length || sending) return
    setSending(true)
    const n = calls.length
    void (chrome.runtime.sendMessage({ type: MSG.SEND_SESSION, sessionId: session.sessionId }) as Promise<SendSessionResponse>)
      .then((res) => flash(res?.ok ? `${n}건을 서버로 전송했습니다` : `전송 실패: ${res?.error ?? '알 수 없는 오류'}`, !!res?.ok))
      .finally(() => setSending(false))
  }
  const onSelect = (id: string): void => {
    setSelectedId(id)
    setView('detail')
  }

  let content: React.ReactElement
  if (view === 'detail' && selected) {
    content = <DetailView call={selected} onBack={() => setView('list')} />
  } else if (view === 'settings') {
    content = <SettingsView settings={settings} onChange={onChangeSettings} />
  } else if (view === 'send') {
    content = <SendView calls={calls} settings={settings} sending={sending} progress={sending ? 50 : 0} onSend={onSend} />
  } else {
    content = (
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onClear={onClear}
        onGoSend={() => setView('send')}
        onClose={() => window.close()}
      />
    )
  }

  const railView: RailView = view === 'detail' ? 'list' : view
  return (
    <div id="rootpanel" style={{ width: '100%', height: '100%', display: 'flex', minHeight: 0, position: 'relative' }}>
      {content}
      <Rail view={railView} onView={(v) => setView(v)} count={calls.length} />
      {toast && (
        <div className={'toast' + (toast.ok ? ' ok' : '')}>
          <span className="ic"><Check size={15} /></span>{toast.msg}
        </div>
      )}
    </div>
  )
}

const el = document.getElementById('root')
if (el) createRoot(el).render(<Panel />)
```

> `progress`는 실제 업로드 진척 신호가 없어 sending 중 50% 고정 인디케이터로 둔다(디자인의 시뮬레이션 프로그레스 대체). 정밀 진척은 후속(별도 메시지 필요).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/sidepanel/index.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 사이드패널 HTML 타이틀 갱신(선택)**

`public/sidepanel.html`의 `<title>`을 `API 수집기`로 변경(기능 무관, 표시만).

- [ ] **Step 6: Commit**

```bash
git add src/ui/sidepanel/index.tsx src/ui/sidepanel/index.test.tsx public/sidepanel.html
git commit -m "feat(panel): compose side panel with rail + views on real data"
```

---

## Task 11: 구 컴포넌트·옵션 페이지 제거

**Files:**
- Delete: `src/ui/sidepanel/CaptureList.tsx`, `CaptureList.test.tsx`, `SendButton.tsx`, `SendButton.test.tsx`
- Delete: `public/options.html`, `src/ui/options/` (전체)
- Modify: `manifest.json`

- [ ] **Step 1: 구 사이드패널 컴포넌트 삭제**

```bash
git rm src/ui/sidepanel/CaptureList.tsx src/ui/sidepanel/CaptureList.test.tsx \
       src/ui/sidepanel/SendButton.tsx src/ui/sidepanel/SendButton.test.tsx
```

- [ ] **Step 2: 옵션 페이지 삭제**

```bash
git rm public/options.html
git rm -r src/ui/options
```

- [ ] **Step 3: manifest.json에서 options_page 제거**

`manifest.json`에서 다음 줄 삭제:

```json
  "options_page": "public/options.html",
```

- [ ] **Step 4: 잔여 참조 확인**

Run: `grep -rn "options\|CaptureList\|SendButton" src manifest.json public --include="*.ts" --include="*.tsx" --include="*.json" --include="*.html"`
Expected: 매칭 없음 (있으면 제거)

- [ ] **Step 5: 빌드·타입체크**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS — 옵션 엔트리 없이 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove options page and legacy side panel components"
```

---

## Task 12: P2 통합 검증

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 2: 타입체크 + lint + 빌드**

Run: `npx tsc --noEmit && npx eslint src/ui && npx vite build`
Expected: PASS, 경고 없음

---

## Self-Review (작성자 체크)

- **Spec 커버리지(§3.2, §3.5):** Rail(수집/전송/설정 + 비활성 MCP/히스토리) ✓(T9) / ListView ✓(T5) / DetailView 탭·복사·cURL ✓(T6) / SendView 분포·프로그레스 ✓(T7) / SettingsView 신규 필드 UI ✓(T8) / CopyBtn ✓(T4) / 실데이터 연결 ✓(T10) / 구 컴포넌트·options 제거·manifest ✓(T11) / tokens·components·fonts 소비 ✓(T3,T10).
- **Placeholder 스캔:** CSS 이식(T3)은 출처 파일·셀렉터 목록을 명시(추상 아님). 모든 컴포넌트는 완전한 TSX 제공. 테스트는 실제 코드.
- **타입 일관성:** `RailView='list'|'send'|'settings'`(T9) ↔ index의 `View=RailView|'detail'`(T10) 일치. `ListView`/`DetailView`/`SendView`/`SettingsView` prop 계약이 정의(각 태스크)↔사용(T10) 일치. `Settings` 신규 필드(P3 Task1)명을 SettingsView가 그대로 사용 — **P2는 P3 Task1(타입 확장)에 의존**: P2를 P3보다 먼저 실행하면 `Settings`에 신규 필드가 없어 컴파일 실패. **실행 순서: P1 → P3 Task1(타입만) → P2 나머지**, 또는 P3 전체 → P2. 아래 메모 참조.
- **view-utils:** `hostOf/pathOf/sizeOf/statusClass/headersEntries/highlightJson/formatTime` 정의(T1) ↔ 사용(T5/T6/T7) 일치.

### 실행 순서 메모 (중요)
SettingsView·index가 `Settings`의 신규 필드(`domainWhitelist`/`captureMethods`/`saveBody`/`autoSend`/`dedupe`)와 `DEFAULT_SETTINGS`를 참조한다. 따라서:
- 권장: **P1 → P3 → P2** 순서 (P3가 타입·SW를 먼저 확정).
- 또는 P2를 먼저 하려면 **P3 Task 1(Settings 타입 확장)만 선행**한 뒤 P2 진행.

---

## 다음 단계
- 세 plan(P1/P2/P3) 완료 시 spec 전체 구현. 각 단계 격리 워크트리 → `superpowers:finishing-a-development-branch` squash 통합.
