# 수집 탭 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전송 탭을 없애고 수집 탭 하나에서 목록·선택·요약·전송을 모두 처리하며, 세션 이름을 설정 탭으로 옮긴다.

**Architecture:** 전송 탭(`SendView`)의 요약 계산 로직을 신규 `SummaryBar`로 이관해 수집 탭 상단의 접이식 카드로 넣고, 기존 선택 바(`selbar`)를 그 안에 흡수한다. 세션 이름은 `Settings.sessionName`으로 옮겨 background가 전송 시점에 직접 읽으므로, `SEND_CURRENT_SESSION` 메시지에서 `name`이 사라진다.

**Tech Stack:** TypeScript, React 18, Vite (crxjs), Vitest + Testing Library, Chrome MV3

**입력 스펙:** `docs/specs/2026-07-28-collect-tab-consolidation-design.md`

## Global Constraints

- **격리 워크트리에서만 커밋** — 모든 작업은 전용 브랜치의 격리 워크트리에서 이뤄지며, 각 Task 끝의 커밋 스텝을 **그 워크트리 안에서 실행한다**. `main`에는 직접 커밋하지 않는다. 통합(squash) 여부는 전체 완료 후 사용자가 결정한다.
- **타입체크가 게이트** — 이 저장소에는 ESLint 설정이 없다. `npx tsc --noEmit`가 lint를 갈음한다.
- **상태 변경 불변식** — `settings`를 제외한 모든 `currentSession`/`sessions` 변경은 background 메시지(write-lock 큐)를 경유해야 한다. 패널에서 `patchStorage`로 직접 쓰지 않는다.
- **세션 이름은 가공 금지** — 설정에 적힌 문자열이 prefix/suffix 없이 그대로 `payload.name`으로 나간다. 서버 측 군집이 목적이다. 빈 문자열이면 `undefined`로 변환해 필드 자체를 생략한다.
- **테스트 파일 위치** — co-located (`src/**/X.test.tsx`).
- 단일 테스트 실행: `npx vitest run <path>`, 전체: `npm run test:run`

---

### Task 1: Settings에 sessionName 추가 + 설정 UI

**Files:**
- Modify: `src/shared/types.ts:14-25` (인터페이스), `src/shared/types.ts:64-74` (기본값)
- Modify: `src/ui/sidepanel/SettingsView.tsx:33-43` (전송 서버 그룹)
- Test: `src/shared/types.test.ts`, `src/ui/sidepanel/SettingsView.test.tsx`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: `Settings.sessionName: string` — Task 2의 `SummaryBar`가 표시용으로, Task 5의 background가 전송 페이로드 조립에 사용한다. `DEFAULT_SETTINGS.sessionName === ''`.

- [ ] **Step 1: 기본값 실패 테스트 작성**

`src/shared/types.test.ts`의 `DEFAULT_SETTINGS capture fields` describe 블록(46행 부근) 안에 추가:

```ts
  it('has an empty session name by default', () => {
    expect(DEFAULT_SETTINGS.sessionName).toBe('')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — `expected undefined to be ''`

- [ ] **Step 3: 타입과 기본값 추가**

`src/shared/types.ts`의 `Settings` 인터페이스에서 `apiKey` 바로 아래에 추가:

```ts
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
```

`DEFAULT_SETTINGS`에도 같은 위치에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/shared/types.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 설정 UI 실패 테스트 작성**

`src/ui/sidepanel/SettingsView.test.tsx`의 describe 블록 안에 추가:

```tsx
  it('edits the session name and emits a patch', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/세션 이름/), { target: { value: '주문 API' } })
    expect(onChange).toHaveBeenCalledWith({ sessionName: '주문 API' })
  })
```

> `<label>` 안에 보조 설명용 `<small>`이 들어가므로 접근성 이름은 `세션 이름 (선택) (비우면 이름 없이 전송)`으로 합쳐진다. 도메인 화이트리스트 필드와 같은 패턴이라 정규식 매칭을 쓴다.

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/SettingsView.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: /세션 이름/`

- [ ] **Step 7: 설정 필드 추가**

`src/ui/sidepanel/SettingsView.tsx`의 `전송 서버` 그룹에서 `set-token` 필드 **다음에** 세 번째 필드를 추가한다:

```tsx
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
            <div className="field">
              <label htmlFor="set-session-name">세션 이름 (선택) <small style={{ color: 'var(--text-3)' }}>(비우면 이름 없이 전송)</small></label>
              <input id="set-session-name" type="text" placeholder="주문 API" value={settings.sessionName} onChange={(e) => onChange({ sessionName: e.target.value })} />
            </div>
          </div>
```

- [ ] **Step 8: 통과 확인 + 타입체크**

Run: `npx vitest run src/ui/sidepanel/SettingsView.test.tsx && npx tsc --noEmit`
Expected: 4 tests PASS, 타입 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add src/shared/types.ts src/shared/types.test.ts src/ui/sidepanel/SettingsView.tsx src/ui/sidepanel/SettingsView.test.tsx
git commit -m "feat: 설정에 세션 이름 필드 추가"
```

---

### Task 2: SummaryBar 컴포넌트 신규

**Files:**
- Create: `src/ui/sidepanel/SummaryBar.tsx`
- Create: `src/ui/sidepanel/SummaryBar.test.tsx`
- Modify: `src/ui/theme/components.css:150-156` (`.selbar` 규칙 뒤에 `.sumbar` 규칙 추가)

**Interfaces:**
- Consumes: `Settings.sessionName` (Task 1)
- Produces: `SummaryBar` 컴포넌트 —
  ```ts
  interface SummaryBarProps {
    calls: ApiCall[]      // 선택분만
    totalCount: number    // 전체 호출 수
    settings: Settings
    disabled: boolean
    onToggleAll: () => void
  }
  ```
  Task 3의 `ListView`가 `selbar` 블록을 이것으로 교체한다.

- [ ] **Step 1: 실패 테스트 작성**

`src/ui/sidepanel/SummaryBar.test.tsx` 생성:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SummaryBar } from './SummaryBar'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { ApiCall, Settings } from '../../shared/types'

const call = (id: string, method: string): ApiCall => ({
  id, url: 'https://api.shop.io/v1/users', method,
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: 'abcde', durationMs: 1, capturedAt: 1,
})

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS, serverUrl: 'http://localhost:4599', ...over,
})

const base = { totalCount: 2, disabled: false, onToggleAll: vi.fn() }

describe('SummaryBar', () => {
  it('shows selected/total count, payload size and target host in the collapsed row', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    expect(screen.getByText(/1\/2건/)).toBeInTheDocument()
    expect(screen.getByText(/localhost:4599/)).toBeInTheDocument()
  })

  it('checks the select-all box only when every call is selected', () => {
    const { rerender } = render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).not.toBeChecked()
    rerender(<SummaryBar {...base} calls={[call('a', 'GET'), call('b', 'POST')]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeChecked()
  })

  it('leaves the select-all box unchecked when there are no calls at all', () => {
    render(<SummaryBar {...base} totalCount={0} calls={[]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).not.toBeChecked()
  })

  it('forwards select-all clicks', () => {
    const onToggleAll = vi.fn()
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} onToggleAll={onToggleAll} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
    expect(onToggleAll).toHaveBeenCalled()
  })

  it('hides the detail until expanded, then shows method distribution', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET'), call('b', 'POST')]} settings={settings()} />)
    expect(screen.queryByText('대상')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('POST')).toBeInTheDocument()
    expect(screen.getByText('대상')).toBeInTheDocument()
  })

  it('shows the configured session name in the detail', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ sessionName: '주문 API' })} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('주문 API')).toBeInTheDocument()
  })

  it('falls back to 이름 없음 when the session name is blank', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ sessionName: '   ' })} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('이름 없음')).toBeInTheDocument()
  })

  it('shows (미설정) as the target when serverUrl is empty', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ serverUrl: '' })} />)
    expect(screen.getByText(/\(미설정\)/)).toBeInTheDocument()
  })

  it('collapses again on a second toggle click', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    fireEvent.click(screen.getByRole('button', { name: '요약 접기' }))
    expect(screen.queryByText('대상')).not.toBeInTheDocument()
  })

  it('disables the select-all box when disabled', () => {
    render(<SummaryBar {...base} calls={[]} totalCount={0} disabled={true} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/SummaryBar.test.tsx`
Expected: FAIL — `Failed to resolve import "./SummaryBar"`

- [ ] **Step 3: 컴포넌트 구현**

`src/ui/sidepanel/SummaryBar.tsx` 생성:

```tsx
import React, { useState } from 'react'
import type { ApiCall, Settings } from '../../shared/types'
import { hostOf, sizeOf } from './view-utils'
import { Chevron } from './icons'

interface SummaryBarProps {
  calls: ApiCall[] // 선택된(전송 대상) 호출만 전달된다
  totalCount: number
  settings: Settings
  disabled: boolean
  onToggleAll: () => void
}

const methodVar: Record<string, string> = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del',
}

export function SummaryBar({ calls, totalCount, settings, disabled, onToggleAll }: SummaryBarProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const byMethod = calls.reduce<Record<string, number>>((a, e) => {
    a[e.method] = (a[e.method] ?? 0) + 1
    return a
  }, {})
  const totalBytes = calls.reduce((a, e) => a + sizeOf(e.responseBody), 0)
  // serverUrl이 비면 hostOf가 ''를 반환하므로 접힘 행·상세 모두 (미설정)으로 떨어진다
  const target = settings.serverUrl || '(미설정)'
  const targetHost = hostOf(settings.serverUrl) || target
  const name = settings.sessionName.trim() || '이름 없음'

  return (
    <div className="sumbar">
      <div className="sumbar-row">
        <input
          type="checkbox"
          aria-label="전체 선택"
          checked={totalCount > 0 && calls.length === totalCount}
          onChange={onToggleAll}
          disabled={disabled}
        />
        <span className="sumbar-stat">
          {calls.length}/{totalCount}건 · {(totalBytes / 1024).toFixed(1)}KB · {targetHost}
        </span>
        <button
          className={'sumbar-toggle' + (expanded ? ' open' : '')}
          aria-label={expanded ? '요약 접기' : '요약 펼치기'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Chevron size={14} />
        </button>
      </div>

      {expanded && (
        <div className="sumbar-detail">
          {Object.entries(byMethod).map(([m, n]) => (
            <div key={m} className="sumbar-dist">
              <span className={'badge ' + m}>{m}</span>
              <div className="sumbar-track">
                <div
                  className="sumbar-fill"
                  style={{
                    width: (calls.length ? (n / calls.length) * 100 : 0) + '%',
                    background: `var(--m-${methodVar[m] ?? 'get'})`,
                  }}
                />
              </div>
              <span className="sumbar-n">{n}</span>
            </div>
          ))}
          <div className="sumbar-kv"><span>이름</span><b>{name}</b></div>
          <div className="sumbar-kv"><span>대상</span><b>POST {target}</b></div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 스타일 추가**

`src/ui/theme/components.css`의 `.selbar-all input, .entry-check { ... }` 규칙(156행) **바로 뒤**에 삽입한다. `.selbar*` 규칙은 Task 3에서 마지막 사용처가 사라지므로 Task 3의 Step 5에서 제거한다.

```css
/* --- SummaryBar: 선택 바 + 접이식 전송 요약 --- */
.sumbar { border-bottom: 1px solid var(--border-soft); }
.sumbar-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; font-size: 11.5px; color: var(--text-3);
}
.sumbar-row input[type="checkbox"] { accent-color: var(--accent); cursor: pointer; flex: none; }
.sumbar-stat { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sumbar-toggle {
  flex: none; background: none; border: none; color: var(--text-3);
  cursor: pointer; padding: 2px; border-radius: 6px; display: flex;
  transform: rotate(90deg); transition: transform .18s ease;
}
.sumbar-toggle.open { transform: rotate(-90deg); }
.sumbar-toggle:hover { color: var(--text-2); background: var(--surface-2); }
.sumbar-detail {
  display: flex; flex-direction: column; gap: 6px;
  padding: 2px 14px 10px; background: var(--surface);
}
.sumbar-dist { display: flex; align-items: center; gap: 8px; }
.sumbar-dist .badge { width: 46px; text-align: center; }
.sumbar-track { flex: 1; height: 6px; border-radius: 6px; background: var(--surface-2); overflow: hidden; }
.sumbar-fill { height: 100%; border-radius: 6px; }
.sumbar-n { font-family: var(--mono); font-size: 11px; color: var(--text-2); width: 20px; text-align: right; }
.sumbar-kv { display: flex; gap: 10px; font-size: 11.5px; color: var(--text-3); }
.sumbar-kv span { width: 34px; flex: none; }
.sumbar-kv b { color: var(--text-2); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 5: 통과 확인 + 타입체크**

Run: `npx vitest run src/ui/sidepanel/SummaryBar.test.tsx && npx tsc --noEmit`
Expected: 10 tests PASS, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/ui/sidepanel/SummaryBar.tsx src/ui/sidepanel/SummaryBar.test.tsx src/ui/theme/components.css
git commit -m "feat: 접이식 전송 요약 SummaryBar 추가"
```

---

### Task 3: ListView에 SummaryBar 통합 + 푸터 직접 전송

**Files:**
- Modify: `src/ui/sidepanel/ListView.tsx` (props 시그니처, `selbar` 블록 79-91행, 푸터 145-152행)
- Modify: `src/ui/sidepanel/index.tsx:146-165` (ListView 호출부)
- Modify: `src/ui/theme/components.css` (`.selbar*` 규칙 제거)
- Test: `src/ui/sidepanel/ListView.test.tsx`

**Interfaces:**
- Consumes: `SummaryBar` (Task 2)
- Produces: 변경된 `ListViewProps` —
  ```ts
  selectedCalls: ApiCall[]   // 기존 selectedCount: number 를 대체
  settings: Settings          // 신규
  onSend: () => void          // 기존 onGoSend 를 대체
  ```
  Task 4의 `index.tsx`가 이 시그니처에 맞춰 호출한다.

> 이 Task 완료 시점에는 Rail의 전송 탭과 `SendView`가 **아직 남아 있다**. 두 경로 모두 동작하는 병존 상태이며, Task 4에서 전송 탭을 제거한다.

- [ ] **Step 1: 테스트 픽스처와 어설션 수정**

`src/ui/sidepanel/ListView.test.tsx`의 상단 import와 `base`를 교체한다:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListView } from './ListView'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { ApiCall } from '../../shared/types'

const call = (over: Partial<ApiCall> = {}): ApiCall => ({
  id: 'c1', url: 'https://api.shop.io/v1/users?p=1', method: 'GET',
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: '{}', durationMs: 12, capturedAt: 1700000000000, ...over,
})

const base = {
  tracking: true, query: '', freshId: null, sending: false,
  excludedIds: new Set<string>(), selectedCalls: [call()],
  settings: { ...DEFAULT_SETTINGS, serverUrl: 'http://localhost:4599' },
  onToggleTracking: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onToggleExclude: vi.fn(), onToggleAll: vi.fn(), onDelete: vi.fn(),
  onClear: vi.fn(), onSend: vi.fn(), onClose: vi.fn(),
}
```

같은 파일에서 `selectedCount`를 쓰던 3개 테스트를 교체한다.

`renders the checkbox unchecked when the call is excluded` (58-61행):

```tsx
  it('renders the checkbox unchecked when the call is excluded', () => {
    render(<ListView {...base} calls={[call()]} excludedIds={new Set(['c1'])} selectedCalls={[]} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).not.toBeChecked()
  })
```

`footer send button shows the selected count and disables at zero` (84-90행) — 푸터가 이제 실제 전송을 호출하므로 어설션을 바꾼다:

```tsx
  it('footer send button shows the selected count, fires onSend, and disables at zero', () => {
    const onSend = vi.fn()
    const { rerender } = render(<ListView {...base} calls={[call()]} selectedCalls={[call()]} onSend={onSend} />)
    // '1' 은 recbar 의 수집 건수(<b>)와도 우연히 겹치므로 pill 로 범위를 좁힌다
    expect(screen.getByText('1', { selector: '.pill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /서버로 전송/ }))
    expect(onSend).toHaveBeenCalled()
    rerender(<ListView {...base} calls={[call()]} selectedCalls={[]} onSend={onSend} />)
    expect(screen.getByRole('button', { name: /서버로 전송/ })).toBeDisabled()
  })
```

`disables the row checkbox and delete button while sending` (92-100행)은 그대로 통과한다 — `전체 선택` 체크박스가 SummaryBar로 옮겨가도 `disabled`가 유지되기 때문이다.

마지막으로 요약이 실제로 렌더되는지 확인하는 테스트를 describe 끝에 추가한다:

```tsx
  it('renders the summary bar with the selected count and target host', () => {
    render(<ListView {...base} calls={[call(), call({ id: 'c2' })]} selectedCalls={[call()]} />)
    expect(screen.getByText(/1\/2건/)).toBeInTheDocument()
    expect(screen.getByText(/localhost:4599/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx`
Expected: FAIL — `selectedCount` 관련 타입/렌더 실패 및 `1/2건` 텍스트 없음

- [ ] **Step 3: ListView props와 selbar 교체**

`src/ui/sidepanel/ListView.tsx` 상단 import에 추가:

```tsx
import React from 'react'
import type { ApiCall, Settings } from '../../shared/types'
import { hostOf, pathOf, sizeOf, statusClass, formatTime } from './view-utils'
import { Stack, Play, Pause, Trash, Search, Chevron, Send } from './icons'
import { SummaryBar } from './SummaryBar'
```

props 인터페이스에서 `selectedCount`/`onGoSend`를 교체하고 `settings`를 추가한다:

```tsx
interface ListViewProps {
  calls: ApiCall[]
  tracking: boolean
  query: string
  freshId: string | null
  sending: boolean
  excludedIds: Set<string> // 전송 제외로 표시된 호출 id (신규 도착은 자동 포함)
  selectedCalls: ApiCall[] // 전송 대상 — 요약 계산과 푸터 카운트에 함께 쓰인다
  settings: Settings
  onToggleTracking: () => void
  onSearch: (q: string) => void
  onSelect: (id: string) => void
  onToggleExclude: (id: string) => void
  onToggleAll: () => void
  onDelete: (id: string) => void
  onClear: () => void
  onSend: () => void
  onClose: () => void
}
```

기존 `selbar` 블록(79-91행) 전체를 다음으로 교체한다:

```tsx
      <SummaryBar
        calls={props.selectedCalls}
        totalCount={calls.length}
        settings={props.settings}
        disabled={!calls.length || sending}
        onToggleAll={props.onToggleAll}
      />
```

푸터의 전송 버튼을 `onSend`로 바꾼다:

```tsx
      <div className="pfoot">
        <button className="btn btn-primary" disabled={!props.selectedCalls.length || sending} onClick={props.onSend}>
          {sending ? '전송 중…' : <><Send size={16} /> 서버로 전송 <span className="pill">{props.selectedCalls.length}</span></>}
        </button>
        <button className="btn btn-ghost" title="전체 삭제" onClick={props.onClear} disabled={!calls.length || sending}>
          <Trash size={16} />
        </button>
      </div>
```

- [ ] **Step 4: index.tsx 호출부 수정**

`src/ui/sidepanel/index.tsx`의 ListView 렌더 블록(146-165행)에서 세 props를 교체한다. `onGoSend={() => setView('send')}` 줄을 지우고 `onSend={onSend}`로, `selectedCount={selectedCalls.length}`를 `selectedCalls={selectedCalls}`로 바꾸고, `settings={settings}`를 추가한다:

```tsx
    content = (
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        excludedIds={excludedIds}
        selectedCalls={selectedCalls}
        settings={settings}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onToggleExclude={onToggleExclude}
        onToggleAll={onToggleAll}
        onDelete={onDelete}
        onClear={onClear}
        onSend={onSend}
        onClose={() => window.close()}
      />
    )
```

- [ ] **Step 5: 죽은 CSS 제거**

`src/ui/theme/components.css`에서 `.selbar`, `.selbar-all` 규칙(150-155행)을 삭제한다. 단, 156행의 `.selbar-all input, .entry-check { ... }`는 `.entry-check`가 살아 있으므로 셀렉터만 좁혀 남긴다:

```css
.entry-check { accent-color: var(--accent); cursor: pointer; }
```

`.selbar-count` 규칙이 파일에 있다면 함께 삭제한다. 확인: `grep -n "selbar" src/ui/theme/components.css` → 결과가 없어야 한다.

- [ ] **Step 6: 통과 확인 + 타입체크**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx src/ui/sidepanel/index.test.tsx && npx tsc --noEmit`
Expected: ListView 13 tests PASS, index 10 tests PASS, 타입 에러 없음

> `index.test.tsx`의 `excluding a call via its checkbox removes it from the send payload` 테스트가 푸터 버튼의 disabled를 확인하는데, 이 시점에도 동일하게 통과해야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/ui/sidepanel/ListView.tsx src/ui/sidepanel/ListView.test.tsx src/ui/sidepanel/index.tsx src/ui/theme/components.css
git commit -m "feat: 수집 탭에 요약 흡수, 푸터에서 직접 전송"
```

---

### Task 4: 전송 탭 제거 (Rail · SendView · index)

**Files:**
- Modify: `src/ui/sidepanel/Rail.tsx`
- Modify: `src/ui/sidepanel/index.tsx` (View 타입, 상태, 렌더 분기, 실패 토스트)
- Delete: `src/ui/sidepanel/SendView.tsx`, `src/ui/sidepanel/SendView.test.tsx`
- Modify: `src/ui/theme/components.css` (SendView 전용 규칙)
- Test: `src/ui/sidepanel/Rail.test.tsx`, `src/ui/sidepanel/index.test.tsx`

**Interfaces:**
- Consumes: Task 3의 `ListView` 시그니처
- Produces: `RailView = 'list' | 'settings'` — 이후 어떤 코드도 `'send'`를 참조하지 않는다.

> **이 Task 완료 시점에는 세션 이름이 전송되지 않는다.** `index.tsx`가 `name`을 더 이상 보내지 않고, background는 아직 설정에서 읽지 않기 때문이다. Task 5에서 복구되므로 두 Task를 연속으로 실행한다.

- [ ] **Step 1: Rail 테스트 수정**

`src/ui/sidepanel/Rail.test.tsx`의 첫 테스트(`switches to the send view`)를 다음으로 교체한다:

```tsx
  it('switches to the settings view', () => {
    const onView = vi.fn()
    render(<Rail view="list" onView={onView} count={3} />)
    fireEvent.click(screen.getByRole('button', { name: /설정/ }))
    expect(onView).toHaveBeenCalledWith('settings')
  })

  it('has no send tab', () => {
    render(<Rail view="list" onView={vi.fn()} count={3} />)
    expect(screen.queryByRole('button', { name: '전송' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: index 테스트 수정**

`src/ui/sidepanel/index.test.tsx`에서 세 테스트를 고친다.

`sends SEND_CURRENT_SESSION with the selected callIds and name` (52-64행)을 다음으로 교체한다 — 전송 탭 경유가 사라지고 페이로드에서 `name`이 빠진다:

```tsx
  it('sends SEND_CURRENT_SESSION with the selected callIds from the list footer', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: /서버로 전송/ }))
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MSG.SEND_CURRENT_SESSION, callIds: ['c1'],
      }),
    )
  })
```

`omits name when the input is blank` (66-77행)은 **삭제한다** — 이름 입력이 UI에서 사라져 의미가 없어졌다. 이름 생략 동작은 Task 5에서 background 테스트가 커버한다.

`failure toast does not carry the ok class and shows the error icon` (101-110행)을 다음으로 교체한다:

```tsx
  it('failure toast keeps the error styling and states that data was archived', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'timeout' })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: /서버로 전송/ }))
    const toast = await screen.findByText(/히스토리에 보관됨/)
    expect(toast.closest('.toast')!.className).not.toContain('ok')
    expect(screen.getByTestId('toast-icon-err')).toBeInTheDocument()
  })
```

`settings` 픽스처(14-18행)에 `sessionName`을 추가한다:

```tsx
const settings = {
  serverUrl: '', apiKey: '', sessionName: '', trackingEnabled: true, blacklistedDomains: [],
  domainWhitelist: [], captureMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  saveBody: true, autoSend: false, dedupe: false,
}
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/ui/sidepanel/Rail.test.tsx src/ui/sidepanel/index.test.tsx`
Expected: FAIL — Rail에 여전히 `전송` 버튼이 있고, 페이로드에 `name: undefined`가 포함되며, 토스트에 `히스토리에 보관됨`이 없음

- [ ] **Step 4: Rail에서 전송 탭 제거**

`src/ui/sidepanel/Rail.tsx` 전문을 다음으로 교체한다:

```tsx
import React from 'react'
import { Stack, Gear, Clock } from './icons'

export type RailView = 'list' | 'settings'

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

- [ ] **Step 5: index.tsx 정리**

`src/ui/sidepanel/index.tsx`에서 다음을 순서대로 수정한다.

import에서 `SendView`와 `hostOf`를 제거한다 (`hostOf`는 `namePlaceholder` 계산에만 쓰였다):

```tsx
import { Rail } from './Rail'
import type { RailView } from './Rail'
import { ListView } from './ListView'
import { DetailView } from './DetailView'
import { SettingsView } from './SettingsView'
import { Check, X } from './icons'
import '../theme/components.css'

type View = RailView | 'detail'
```

상태에서 `sessionName`을 제거한다 (28-31행 부근):

```tsx
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [freshId, setFreshId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
```

`namePlaceholder` 계산(65-66행)을 삭제한다:

```tsx
  const calls: ApiCall[] = session?.calls ?? []
  const selected = calls.find((c) => c.id === selectedId) ?? null
  const selectedCalls = calls.filter((c) => !excludedIds.has(c.id))
```

`onSend`에서 `name`을 빼고 실패 토스트 문구를 바꾼다:

```tsx
  const onSend = (): void => {
    if (!selectedCalls.length || sending) return
    setSending(true)
    const n = selectedCalls.length
    void (chrome.runtime.sendMessage({
      type: MSG.SEND_CURRENT_SESSION,
      callIds: selectedCalls.map((c) => c.id),
    }) as Promise<SendSessionResponse>)
      .then((res) => {
        flash(
          res?.ok
            ? `${n}건을 서버로 전송했습니다`
            : `전송 실패 — ${n}건은 히스토리에 보관됨: ${res?.error ?? '알 수 없는 오류'}`,
          !!res?.ok,
        )
        if (res?.ok) setExcludedIds(new Set()) // 전송 후 잔류분은 전량 선택 상태로 초기화
      })
      .finally(() => setSending(false))
  }
```

렌더 분기에서 `send` 케이스를 삭제한다 (133-144행):

```tsx
  let content: React.ReactElement
  if (view === 'detail' && selected) {
    content = <DetailView call={selected} onBack={() => setView('list')} />
  } else if (view === 'settings') {
    content = <SettingsView settings={settings} onChange={onChangeSettings} />
  } else {
    content = (
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        excludedIds={excludedIds}
        selectedCalls={selectedCalls}
        settings={settings}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onToggleExclude={onToggleExclude}
        onToggleAll={onToggleAll}
        onDelete={onDelete}
        onClear={onClear}
        onSend={onSend}
        onClose={() => window.close()}
      />
    )
  }
```

`railView` 계산도 `'send'`가 사라졌으므로 그대로 유효하다 — `view === 'detail'`일 때만 `'list'`로 접힌다:

```tsx
  const railView: RailView = view === 'detail' ? 'list' : view
```

- [ ] **Step 6: SendView 삭제**

```bash
rm src/ui/sidepanel/SendView.tsx src/ui/sidepanel/SendView.test.tsx
```

`src/ui/theme/components.css`에서 SendView 전용 규칙을 제거한다. 168행의 주석 `/* --- SendView: 세션 이름 입력 · 불확정 진행률 --- */`부터 그 블록의 `.name-input`, `.progress-indet` 관련 규칙까지가 대상이다. 확인: `grep -n "name-input\|progress-indet" src/ui/theme/components.css src/ui` → 결과가 없어야 한다.

- [ ] **Step 7: 통과 확인 + 타입체크**

Run: `npm run test:run && npx tsc --noEmit`
Expected: 전체 통과. 테스트 파일 수는 22 → 22 (SendView 5개 삭제, SummaryBar 10개 추가)

- [ ] **Step 8: 커밋**

```bash
git add -A src/ui
git commit -m "refactor: 전송 탭 제거 — 수집 탭 단일 흐름으로 통합"
```

---

### Task 5: 메시지 계약 축소 + 이름 소스를 설정으로 전환

**Files:**
- Modify: `src/shared/messages.ts:36-40`
- Modify: `src/background/index.ts:141-147`
- Test: `src/shared/messages.test.ts`, `src/background/index.test.ts`

**Interfaces:**
- Consumes: `Settings.sessionName` (Task 1), `SEND_CURRENT_SESSION` 발송부 (Task 4)
- Produces: `SendCurrentSessionMessage = { type, callIds }` — `name` 필드 없음

> 이 프로젝트에는 `docs/solutions/integration-issues/manual-send-message-contract-drift.md` 선례가 있다. UI와 핸들러의 메시지 기대가 어긋났는데 양쪽 유닛 테스트가 모두 green이라 잡히지 않았던 건이다. **보내는 쪽(`index.test.tsx`, Task 4 Step 2에서 이미 `{ type, callIds }`로 갱신됨)과 받는 쪽(`background/index.test.ts`)이 같은 메시지 모양을 쓰는지 Step 6에서 확인한다.**

- [ ] **Step 1: 메시지 타입 테스트 수정**

`src/shared/messages.test.ts`의 `SendCurrentSessionMessage and DeleteCallMessage are constructable` 테스트(38-44행 부근)에서 `name` 줄을 제거한다:

```ts
    const send: SendCurrentSessionMessage = {
      type: MSG.SEND_CURRENT_SESSION,
      callIds: ['c1', 'c2'],
    }
```

- [ ] **Step 2: background 테스트 수정 및 추가**

`src/background/index.test.ts`의 `SEND_CURRENT_SESSION archives selected calls, sends them, keeps the rest` 테스트(238행)에서 이름의 출처를 설정으로 바꾼다:

```ts
  it('SEND_CURRENT_SESSION archives selected calls, sends them, keeps the rest', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, sessionName: '내 세션' },
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a'), makeCall('b'), makeCall('c')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['a', 'c'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    // sender가 받은 세션은 선택분만 + 설정의 이름 포함
    const sentSession = sendImpl.mock.calls[0][1]
    expect(sentSession.calls.map((c: ApiCall) => c.id)).toEqual(['a', 'c'])
    expect(sentSession.name).toBe('내 세션')
    // 아카이브는 sent, 미선택분은 새 현재 세션에 잔류
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
    expect(next.state.currentSession!.sessionId).not.toBe('cur')
    expect(next.response).toEqual({ ok: true })
  })
```

같은 describe에 두 테스트를 추가한다 — 가공 없음과 공백 생략을 각각 고정한다:

```ts
  it('SEND_CURRENT_SESSION passes the configured session name through unchanged', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, sessionName: '주문 API' },
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['a'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    // prefix/suffix 없이 그대로 — 서버 측 군집이 목적
    expect(sendImpl.mock.calls[0][1].name).toBe('주문 API')
  })

  it('SEND_CURRENT_SESSION omits the name when the setting is blank', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, sessionName: '   ' },
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['a'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl.mock.calls[0][1].name).toBeUndefined()
    expect('name' in sendImpl.mock.calls[0][1]).toBe(false)
  })
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: FAIL — `expected undefined to be '내 세션'` (아직 `msg.name`을 읽고 있음)

- [ ] **Step 4: 메시지 타입에서 name 제거**

`src/shared/messages.ts`의 `SendCurrentSessionMessage`를 다음으로 교체한다:

```ts
export interface SendCurrentSessionMessage {
  type: typeof MSG.SEND_CURRENT_SESSION
  callIds: string[] // 전송 대상으로 선택된 호출 id (체리픽). 세션 이름은 settings.sessionName에서 읽는다
}
```

- [ ] **Step 5: background가 설정에서 이름을 읽도록 수정**

`src/background/index.ts`의 `SEND_CURRENT_SESSION` 케이스(141-147행)를 교체한다:

```ts
    case MSG.SEND_CURRENT_SESSION: {
      // Cherry-pick manual send: archive ONLY the selected calls, keep the rest
      // in a fresh current session, then send. 세션 이름은 UI가 실어 보내지 않고
      // 전송 시점의 settings에서 직접 읽는다 — 값의 출처를 하나로 유지한다.
      const name = state.settings.sessionName.trim() || undefined
      const split = splitAndArchive(state, msg.callIds, name, ctx.now())
      if (split === state) return { state, response: { ok: false, error: 'no calls selected' } }
      return sendArchivedAt(split, split.sessions.length - 1, ctx)
    }
```

- [ ] **Step 6: 계약 일치 확인 (드리프트 방지)**

보내는 쪽과 받는 쪽이 같은 메시지 모양을 쓰는지 눈으로 확인한다:

```bash
grep -n "SEND_CURRENT_SESSION" -A 3 src/ui/sidepanel/index.tsx src/ui/sidepanel/index.test.tsx src/background/index.test.ts
```

Expected: 세 파일 모두 `{ type: ..., callIds: [...] }` 형태이고 어디에도 `name:` 키가 없다. 하나라도 `name`이 남아 있으면 계약 드리프트다.

- [ ] **Step 7: 전체 통과 + 타입체크 + 빌드**

Run: `npm run test:run && npm run build`
Expected: 전체 테스트 통과, `tsc --noEmit` 통과, `dist/` 생성

- [ ] **Step 8: 커밋**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts src/background/index.ts src/background/index.test.ts
git commit -m "refactor: 세션 이름을 설정에서 읽도록 전송 계약 축소"
```

---

### Task 6: E2E 검증 + handoff 문서 갱신

**Files:**
- Modify: `docs/handoff/2026-07-28-extension-usage.md` (§3, §4, §5)
- Replace: `docs/handoff/images/02-list-checkbox.png`, `docs/handoff/images/03-send-name.png`

**Interfaces:**
- Consumes: Task 1-5의 완성된 빌드

- [ ] **Step 1: 목 서버 기동**

`scratchpad/mock-server.mjs`에 다음을 작성하고 백그라운드로 실행한다 (포트 4599):

```js
import http from 'node:http'
const received = []
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body>
<button id="b-get">GET</button><button id="b-post">POST</button>
<script>
document.getElementById('b-get').onclick = () => fetch('/api/items')
document.getElementById('b-post').onclick = () => fetch('/api/items', {method:'POST',headers:{'Content-Type':'application/json'},body:'{"a":1}'})
</script></body></html>`
http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost:4599').pathname
  if (req.method === 'OPTIONS') return send(res, 204, '')
  if (p === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8')
  if (p === '/api/items' && req.method === 'GET') return send(res, 200, { items: [1, 2] })
  if (p === '/api/items' && req.method === 'POST') return send(res, 201, { created: true })
  if (p === '/api/sessions' && req.method === 'POST') {
    let b = ''
    req.on('data', (c) => (b += c))
    return req.on('end', () => {
      received.push(b)
      send(res, 200, { mcpServers: [] })
    })
  }
  if (p === '/_received') return send(res, 200, received)
  send(res, 404, { error: 'not found' })
}).listen(4599, () => console.log('mock on 4599'))
```

- [ ] **Step 2: 확장을 로드한 브라우저에서 캡처**

```bash
agent-browser --session amt-verify --headed --extension "$PWD/dist" open http://localhost:4599/
agent-browser --session amt-verify batch "click #b-get" "click #b-post" "wait 1200"
```

확장 ID를 얻는다:

```bash
agent-browser --session amt-verify eval "document.getElementById('__api-tracker-capture__').src"
```

- [ ] **Step 3: 4개 항목 확인**

사이드패널을 탭으로 열고(`chrome-extension://<ID>/public/sidepanel.html`) 다음을 순서대로 확인한다.

1. **요약 접힘/펼침** — 상단 행에 `2/2건 · …KB · localhost:4599`가 보이고, 토글 시 메서드 분포·이름·대상이 나타난다
2. **선택 변경 실시간 반영** — 행 체크박스를 하나 해제하면 요약이 `1/2건`으로, 푸터 pill이 `1`로 바뀐다
3. **1클릭 전송** — 푸터 `서버로 전송`을 누르면 탭 이동 없이 성공 토스트가 뜬다
4. **이름 전달** — 설정에 `주문 API`를 넣고 전송한 뒤 `/_received`에서 `"name":"주문 API"`를 확인하고, 설정을 비운 뒤 전송해 `name` 키가 없음을 확인한다

`_received` 확인:

```bash
agent-browser --session amt-verify eval "fetch('/_received').then(r=>r.json()).then(a=>a.map(s=>JSON.parse(s).name))"
```

Expected: `["주문 API", null]` 형태 — 두 번째 전송에는 `name` 키 자체가 없어 `undefined`로 나온다

- [ ] **Step 4: 스크린샷 교체**

수집 탭(요약 펼친 상태)과 설정 탭(세션 이름 필드)을 각각 캡처해 기존 이미지를 대체한다:

```bash
agent-browser --session amt-verify screenshot docs/handoff/images/02-list-summary.png
agent-browser --session amt-verify screenshot docs/handoff/images/04-settings.png
git rm docs/handoff/images/02-list-checkbox.png docs/handoff/images/03-send-name.png
```

- [ ] **Step 5: handoff 문서 갱신**

`docs/handoff/2026-07-28-extension-usage.md`에서 다음을 수정한다.

§3 제목 아래 이미지 참조를 `images/02-list-summary.png`로 바꾸고, 체크박스 설명 뒤에 요약 카드 문단을 추가한다:

```markdown
- **상단 요약** — 선택 건수·페이로드·대상 호스트가 한 줄로 보이고, `⌄`를 누르면
  메서드 분포·세션 이름·전송 대상이 펼쳐집니다.
```

§4를 전송 탭 기준에서 수집 탭 기준으로 다시 쓴다:

```markdown
## 4. 전송

수집 탭 하단의 **서버로 전송** 버튼을 누르면 선택한 호출이 바로 전송됩니다.
세션 이름은 설정 탭에서 지정하며, 적어둔 문자열이 그대로 서버로 전달됩니다.

전송 성공 시:
- 선택한 호출들이 지정한 이름과 함께 히스토리(`sent`)로 아카이브됩니다
- **체크 해제했던 호출은 새 세션에 그대로 남아** 이어서 수집·전송할 수 있습니다
- 실패하면 `failed`로 보관되고 데이터는 유실되지 않습니다
```

§5 설정 목록에 세션 이름 항목을 추가한다:

```markdown
- **세션 이름** — 전송 시 서버로 함께 보낼 이름. 가공 없이 그대로 전달되므로
  같은 이름으로 여러 번 보내면 서버에서 묶어 다룰 수 있습니다. 비우면 이름 없이 전송됩니다
```

§7의 재전송 관련 항목은 그대로 둔다 — 히스토리 뷰는 여전히 미구현이다.

- [ ] **Step 6: 정리**

```bash
agent-browser --session amt-verify close --all
pkill -f "node mock-server.mjs"
```

- [ ] **Step 7: 커밋**

```bash
git add docs/handoff
git commit -m "docs: handoff 문서를 수집 탭 통합 기준으로 갱신"
```

---

## 완료 확인

모든 Task 종료 후 다음이 모두 참이어야 한다.

- [ ] `npm run test:run` 전체 통과 (SendView 5개 삭제, SummaryBar 10개 추가, ListView 13개)
- [ ] `npm run build` 성공 (`tsc --noEmit` 포함)
- [ ] `grep -rn "SendView\|selectedCount\|onGoSend\|namePlaceholder" src/` → 결과 없음
- [ ] `grep -rn "selbar\|name-input\|progress-indet" src/` → 결과 없음
- [ ] `grep -rn "name" src/shared/messages.ts` → `SendCurrentSessionMessage`에 `name` 없음
- [ ] Rail이 수집 / MCP(준비 중) / 히스토리(준비 중) / 설정으로 구성
- [ ] E2E 4개 항목 확인 완료
- [ ] handoff 문서 §3·§4·§5 갱신, 스크린샷 교체
