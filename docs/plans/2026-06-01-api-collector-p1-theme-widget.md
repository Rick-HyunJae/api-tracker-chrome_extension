# API Collector P1 — 디자인 토대 + 플로팅 위젯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** claude-design "API Collector" 다크 틸 테마의 **공유 토큰 레이어**를 도입하고, 플로팅 위젯을 그 테마로 리스타일하면서 **세로 드래그 이동(위치 영속)**을 추가한다.

**Architecture:** 디자인 `:root` OKLCH 토큰을 `src/ui/theme/tokens.css`로 추출(P2 패널이 소비). 위젯은 콘텐츠 스크립트 shadow DOM이라 외부 시트를 쓰기 어려우므로 동일 토큰을 shadow `<style>`의 `:host` 변수로 주입한다. 기존 hover-bridge dead-zone 해법(`::before` 투명 브리지)을 보존한 채 색/아이콘/크기만 교체하고, pointer 기반 세로 드래그를 추가한다. 드래그 위치는 호스트 페이지 `localStorage` 오염을 피해 `chrome.storage.local`에 영속한다.

**Tech Stack:** TypeScript, React 18, Vite, Vitest + @testing-library/react, Chrome MV3 (`chrome.storage.local`), Shadow DOM.

**Spec:** `docs/specs/2026-06-01-api-collector-design-application-design.md` (§3.1, §3.4)

---

## File Structure

- Create: `src/ui/theme/tokens.css` — 디자인 `:root` 토큰 전량 (색/폰트/radius). P2 패널·옵션이 import.
- Create: `src/ui/theme/fonts.css` — `@font-face` (Space Grotesk, IBM Plex Mono). document 레벨 선언.
- Create: `public/fonts/` — `space-grotesk-{400,500,600,700}.woff2`, `ibm-plex-mono-{400,500,600}.woff2` (OFL 바이너리, 외부 취득).
- Create: `src/ui/widget/dock-position.ts` — 드래그 위치 영속(get/set, `chrome.storage.local` 키 `widgetDockTop`).
- Create: `src/ui/widget/dock-position.test.ts`
- Modify: `src/ui/widget/FloatingWidget.tsx` — 다크 토큰·신규 아이콘·툴팁·34px·세로 드래그.
- Modify: `src/ui/widget/FloatingWidget.test.tsx` — 드래그/영속 테스트 추가, 기존 테스트 유지.
- Modify: `manifest.json` — `web_accessible_resources`에 `fonts/*` 추가.

**Why tokens are a CSS file but the widget inlines them:** shadow DOM은 document 스타일시트를 자동 상속하지 않는다. P2의 패널/옵션은 일반 DOM이라 `tokens.css`를 import하지만, 위젯은 같은 값들을 shadow `<style>` 안 `:host`에 복제한다. 단일 출처 유지를 위해 토큰 값은 spec/tokens.css와 **동일 리터럴**을 쓴다.

---

## Task 1: 디자인 토큰 CSS 레이어

**Files:**
- Create: `src/ui/theme/tokens.css`

> CSS 전용 자산이라 단위 테스트 대상이 아니다. 검증은 빌드/타입체크 통과 + 파일 존재로 한다.

- [ ] **Step 1: tokens.css 작성**

`src/ui/theme/tokens.css`:

```css
:root {
  --accent: oklch(0.74 0.075 210);
  --accent-dim: oklch(0.74 0.075 210 / 0.14);
  --accent-ink: oklch(0.20 0.02 235);

  --bg: oklch(0.165 0.012 260);
  --canvas: oklch(0.12 0.012 260);
  --surface: oklch(0.205 0.012 262);
  --surface-2: oklch(0.235 0.013 262);
  --surface-hi: oklch(0.27 0.015 262);
  --border: oklch(0.31 0.014 262);
  --border-soft: oklch(0.27 0.012 262);

  --text: oklch(0.96 0.004 260);
  --text-2: oklch(0.74 0.01 260);
  --text-3: oklch(0.56 0.012 260);

  --m-get: oklch(0.76 0.085 158);
  --m-post: oklch(0.72 0.075 248);
  --m-put: oklch(0.79 0.075 82);
  --m-del: oklch(0.68 0.10 28);
  --m-patch: oklch(0.72 0.085 305);

  --ok: oklch(0.76 0.085 158);
  --warn: oklch(0.79 0.075 82);
  --err: oklch(0.68 0.10 28);
  --rec: oklch(0.67 0.115 30);

  --ui: "Space Grotesk", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;

  --r: 10px;
  --r-sm: 7px;
}
```

- [ ] **Step 2: 빌드 검증**

Run: `npx tsc --noEmit`
Expected: PASS (타입 에러 없음 — CSS는 타입체크 무관, 회귀 없음 확인용)

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme/tokens.css
git commit -m "feat(theme): add shared OKLCH design tokens"
```

---

## Task 2: 폰트 @font-face + 매니페스트 리소스

**Files:**
- Create: `src/ui/theme/fonts.css`
- Create: `public/fonts/` (woff2 바이너리)
- Modify: `manifest.json`

> 폰트 바이너리는 외부 취득(OFL). 미확보 시에도 `system-ui`/`ui-monospace` 폴백으로 빌드는 동작한다.

- [ ] **Step 1: 폰트 파일 배치**

Google Fonts 또는 공식 저장소에서 woff2를 받아 `public/fonts/`에 배치:
- `space-grotesk-400.woff2`, `-500.woff2`, `-600.woff2`, `-700.woff2`
- `ibm-plex-mono-400.woff2`, `-500.woff2`, `-600.woff2`

Run: `ls public/fonts/`
Expected: 확보된 woff2 (0~7개). **바이너리 미확보 시**(네트워크/폰트 접근 불가) `public/fonts/`를 비운 채 진행 — `@font-face`의 `src` URL은 선언하되 파일이 없으면 브라우저가 `system-ui`/`ui-monospace` 폴백을 사용하므로 빌드·동작에 지장 없음. 폰트는 후속에 채워도 됨.

- [ ] **Step 2: fonts.css 작성**

`src/ui/theme/fonts.css` (가중치별 `@font-face` 7개; 패턴 동일하므로 2개만 예시, 나머지는 weight만 변경):

```css
@font-face {
  font-family: "Space Grotesk";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/space-grotesk-400.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/ibm-plex-mono-400.woff2") format("woff2");
}
/* 위 패턴을 500/600(+Space Grotesk 700)까지 weight만 바꿔 반복 */
```

- [ ] **Step 3: manifest.json에 폰트 리소스 추가**

`manifest.json`의 `web_accessible_resources` 배열에 항목 추가 (위젯 shadow DOM이 페이지 위에서 폰트를 로드하려면 노출 필요):

```json
{
  "resources": ["fonts/*"],
  "matches": ["<all_urls>"]
}
```

- [ ] **Step 4: 빌드 검증**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS, `dist/fonts/`에 woff2 복사됨

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme/fonts.css public/fonts manifest.json
git commit -m "feat(theme): bundle Space Grotesk + IBM Plex Mono, expose as web-accessible"
```

---

## Task 3: 드래그 위치 영속 모듈 (TDD)

**Files:**
- Create: `src/ui/widget/dock-position.ts`
- Test: `src/ui/widget/dock-position.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/ui/widget/dock-position.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDockTop, setDockTop } from './dock-position'

describe('dock-position', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the stored numeric top', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ widgetDockTop: 320 })
    expect(await getDockTop()).toBe(320)
  })

  it('returns null when nothing is stored', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({})
    expect(await getDockTop()).toBeNull()
  })

  it('returns null when the stored value is not a number', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ widgetDockTop: 'oops' })
    expect(await getDockTop()).toBeNull()
  })

  it('persists the top under the widgetDockTop key', async () => {
    await setDockTop(275)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ widgetDockTop: 275 })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/widget/dock-position.test.ts`
Expected: FAIL — `getDockTop`/`setDockTop` 미정의(모듈 없음)

- [ ] **Step 3: 최소 구현**

`src/ui/widget/dock-position.ts`:

```ts
// Persist the floating widget's vertical position. We use a dedicated
// chrome.storage.local key (NOT the host page's localStorage, which a content
// script would otherwise pollute and which is origin-isolated per site).
const KEY = 'widgetDockTop'

export async function getDockTop(): Promise<number | null> {
  const r = await chrome.storage.local.get(KEY)
  const v = (r as Record<string, unknown>)[KEY]
  return typeof v === 'number' ? v : null
}

export async function setDockTop(top: number): Promise<void> {
  await chrome.storage.local.set({ [KEY]: top })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/widget/dock-position.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/widget/dock-position.ts src/ui/widget/dock-position.test.ts
git commit -m "feat(widget): persist dock vertical position via chrome.storage"
```

---

## Task 4: 위젯 리스타일 + 세로 드래그 (TDD)

**Files:**
- Modify: `src/ui/widget/FloatingWidget.tsx`
- Modify: `src/ui/widget/FloatingWidget.test.tsx`

### 4a. 드래그 동작 테스트 추가

- [ ] **Step 1: 실패 테스트 추가**

`src/ui/widget/FloatingWidget.test.tsx`의 `describe` 블록 끝에 추가:

```ts
  it('loads the persisted dock top on mount', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: unknown) => {
      if (key === 'widgetDockTop') return { widgetDockTop: 411 }
      return {
        currentSession: { sessionId: 's1', url: 'https://x/a', startedAt: 1, calls: [], status: 'recording' },
        settings: { serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [] },
      }
    })
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-root')).toHaveStyle({ top: '411px' }))
  })

  it('repositions the dock when dragged more than 3px and persists on release', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    // initial top = round(innerHeight*0.5); jsdom offsetHeight=0 so the clamp upper
    // bound (innerHeight - 0 - 10) is far above, leaving top = start + dy.
    const expected = Math.round(window.innerHeight * 0.5) + 160 // dy = 460 - 300
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(root, { clientY: 460, pointerId: 1 })
    await waitFor(() => expect(root).toHaveStyle({ top: `${expected}px` }))
    fireEvent.pointerUp(root, { clientY: 460, pointerId: 1 })
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ widgetDockTop: expected })
  })

  it('treats a sub-3px pointer move as a click (opens the panel)', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    const btn = screen.getByTestId('widget-button')
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(root, { clientY: 302, pointerId: 1 })
    fireEvent.pointerUp(root, { clientY: 302, pointerId: 1 })
    fireEvent.click(btn)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })

  it('suppresses the click that ends a real drag', async () => {
    render(<FloatingWidget />)
    const root = await screen.findByTestId('widget-root')
    const btn = screen.getByTestId('widget-button')
    fireEvent.pointerDown(root, { clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(root, { clientY: 380, pointerId: 1 })
    fireEvent.pointerUp(root, { clientY: 380, pointerId: 1 })
    fireEvent.click(btn)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/widget/FloatingWidget.test.tsx`
Expected: FAIL — `widget-root` testid 없음, 드래그 미구현

### 4b. 위젯 구현 교체

- [ ] **Step 3: FloatingWidget.tsx 전체 교체**

`src/ui/widget/FloatingWidget.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { getStorage, onStorageChanged } from '../../shared/storage'
import { MSG } from '../../shared/messages'
import { getDockTop, setDockTop } from './dock-position'

// Dark-teal design tokens, scoped to the widget's shadow root via :host so the
// host page's CSS cannot leak in or out. Values mirror src/ui/theme/tokens.css.
// Hover-reveal + the transparent ::before bridge are preserved verbatim from the
// prior dead-zone fix (docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md):
// the bridge geometry is relative to .amt-root, so vertical drag does not break it.
const STYLE = `
:host {
  --accent: oklch(0.74 0.075 210);
  --accent-ink: oklch(0.20 0.02 235);
  --surface-hi: oklch(0.27 0.015 262);
  --border: oklch(0.31 0.014 262);
  --text-2: oklch(0.74 0.01 260);
  --rec: oklch(0.67 0.115 30);
  --canvas: oklch(0.12 0.012 260);
  --mono: "IBM Plex Mono", ui-monospace, monospace;
}
.amt-root { position: fixed; right: 0; font-family: var(--mono); touch-action: none; }
.amt-root::before { content: ''; position: absolute; right: 0; width: 60px; pointer-events: none; }
.amt-root[data-drop="down"]::before { top: -8px; height: 96px; }
.amt-root[data-drop="up"]::before   { bottom: -8px; height: 96px; }
.amt-root:hover::before { pointer-events: auto; }
.amt-root.dragging { cursor: grabbing; }
.amt-root.dragging .amt-main, .amt-root.dragging .amt-chip { transition: none; }

.amt-main { width: 34px; height: 34px; border-radius: 50%; border: none; padding: 0;
  cursor: pointer; color: var(--accent-ink); display: flex; align-items: center; justify-content: center;
  background: linear-gradient(150deg, var(--accent), oklch(0.66 0.07 252));
  box-shadow: -5px 7px 22px -7px oklch(0.05 0.01 260 / 0.85), 0 0 0 1px oklch(1 0 0 / 0.1) inset;
  position: relative; z-index: 1; transform: translateX(50%); transition: transform .25s ease; }
.amt-root:hover .amt-main { transform: translateX(0); }
.amt-main svg { width: 16px; height: 16px; }
.amt-badge { position: absolute; top: -4px; left: -4px; background: var(--rec); color: #fff;
  border-radius: 9px; font-size: 9.5px; min-width: 16px; height: 16px; line-height: 16px;
  text-align: center; padding: 0 4px; border: 2px solid var(--canvas); font-weight: 600; }

.amt-chip { position: absolute; right: 0; width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid var(--border); padding: 0; cursor: pointer; background: var(--surface-hi);
  color: var(--text-2); z-index: 1; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 7px 18px -7px oklch(0.05 0.01 260 / 0.8);
  opacity: 0; pointer-events: none; transition: transform .28s cubic-bezier(.2,.8,.3,1), opacity .2s; }
.amt-chip svg { width: 15px; height: 15px; }
.amt-chip[data-state="tracking"] { color: var(--accent); border-color: oklch(0.74 0.075 210 / 0.5);
  background: oklch(0.74 0.075 210 / 0.14); }
.amt-chip[data-state="tracking"]::after { content: ''; position: absolute; inset: -1px; border-radius: 50%;
  box-shadow: 0 0 0 0 oklch(0.67 0.115 30 / 0.5); animation: amt-ping 1.5s ease-out infinite; }
@keyframes amt-ping { 0% { box-shadow: 0 0 0 0 oklch(0.67 0.115 30 / 0.45);} 70%,100% { box-shadow: 0 0 0 8px transparent;} }
.amt-rec-dot { position: absolute; top: -2px; right: -2px; width: 9px; height: 9px; border-radius: 50%;
  background: var(--rec); border: 2px solid var(--canvas); }
.amt-root[data-drop="down"] .amt-chip { top: 42px; transform: translateY(-10px); }
.amt-root[data-drop="up"]   .amt-chip { bottom: 42px; transform: translateY(10px); }
.amt-root:hover .amt-chip { opacity: 1; pointer-events: auto; transform: translateY(0); }
`

function PanelIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      style={{ transform: open ? 'scaleX(1)' : 'scaleX(-1)' }}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )
}

// Broadcast / signal glyph — represents live capture (design choice over play/pause).
function BroadcastIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

const DRAG_THRESHOLD = 3
const CHIP_REACH = 52 // chip offset (42) + breathing room

export function FloatingWidget(): React.ReactElement {
  const [count, setCount] = useState(0)
  const [tracking, setTracking] = useState(true)
  const [dropUp, setDropUp] = useState(false)
  const [top, setTop] = useState<number>(() => Math.round(window.innerHeight * 0.5))
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startY: 0, startTop: 0, moved: false })
  const topRef = useRef(top)
  topRef.current = top

  useEffect(() => {
    let mounted = true
    void getStorage().then((s) => {
      if (!mounted) return
      setCount(s.currentSession?.calls.length ?? 0)
      setTracking(s.settings.trackingEnabled)
    })
    void getDockTop().then((t) => {
      if (mounted && t !== null) setTop(t)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) {
        const v = changes.currentSession.newValue as { calls?: unknown[] } | null
        setCount(v?.calls?.length ?? 0)
      }
      if (changes.settings) {
        const v = changes.settings.newValue as { trackingEnabled?: boolean }
        if (typeof v?.trackingEnabled === 'boolean') setTracking(v.trackingEnabled)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  // Flip the chip above the main button only when it would overflow the viewport.
  const handleEnter = (): void => {
    setDropUp(top + 34 + CHIP_REACH > window.innerHeight)
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { active: true, startY: e.clientY, startTop: topRef.current, moved: false }
    try {
      rootRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // jsdom / unsupported: capture is best-effort
    }
    rootRef.current?.classList.add('dragging')
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d.active) return
    const dy = e.clientY - d.startY
    if (Math.abs(dy) > DRAG_THRESHOLD) d.moved = true
    // `|| 90` (not `?? 90`): jsdom and pre-layout mounts report offsetHeight === 0,
    // which `??` would not replace, breaking the clamp upper bound.
    const h = rootRef.current?.offsetHeight || 90
    const next = Math.max(10, Math.min(window.innerHeight - h - 10, d.startTop + dy))
    setTop(next)
  }
  const onPointerUp = (): void => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    rootRef.current?.classList.remove('dragging')
    if (d.moved) void setDockTop(topRef.current)
  }

  // Suppress the click that fires immediately after a drag; let real clicks through.
  const guard = (fn: () => void) => (): void => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    fn()
  }

  const state = tracking ? 'tracking' : 'paused'

  return (
    <div
      className="amt-root"
      data-testid="widget-root"
      data-drop={dropUp ? 'up' : 'down'}
      style={{ top }}
      onMouseEnter={handleEnter}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <style>{STYLE}</style>
      <button
        className="amt-chip"
        data-testid="widget-track-toggle"
        data-state={state}
        aria-label={tracking ? '추적 중지' : '추적 시작'}
        onClick={guard(() =>
          chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !tracking }),
        )}
      >
        <BroadcastIcon />
        {tracking && <span className="amt-rec-dot" />}
      </button>
      <button
        className="amt-main"
        data-testid="widget-button"
        data-state={state}
        aria-label="패널 열기"
        onClick={guard(() => chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL }))}
      >
        <PanelIcon open={false} />
        <span className="amt-badge" data-testid="widget-badge">
          {count}
        </span>
      </button>
    </div>
  )
}
```

> 주의: 기존 테스트는 `data-state`로 `tracking`/`paused`를, badge로 count를, 클릭 시 `OPEN_SIDEPANEL`/`TOGGLE_TRACKING` 메시지를 검증한다. 위 구현은 모두 보존한다(메인 클릭은 이제 `guard`로 감싸지만 드래그가 없으면 그대로 통과). 칩이 이제 broadcast 아이콘이라, 기존 "Pause/Play" 시각 가정에 의존하는 테스트는 없다(aria-label·data-state만 검사하므로 안전).

- [ ] **Step 4: 전체 위젯 테스트 통과 확인**

Run: `npx vitest run src/ui/widget/FloatingWidget.test.tsx`
Expected: PASS (기존 6 + 신규 4 = 10 tests)

- [ ] **Step 5: hover-bridge 회귀 가드 주석 확인**

`STYLE` 내 `.amt-root::before` 브리지 + `pointer-events` 토글 + `data-drop` 양방향 기하가 그대로인지 육안 확인 (해법 문서: `docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md`).

- [ ] **Step 6: Commit**

```bash
git add src/ui/widget/FloatingWidget.tsx src/ui/widget/FloatingWidget.test.tsx
git commit -m "feat(widget): dark-teal restyle + draggable vertical dock, preserve hover bridge"
```

---

## Task 5: P1 통합 검증

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: PASS (위젯 포함 전 스위트 그린)

- [ ] **Step 2: 타입체크 + 빌드**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS, `dist/`에 `fonts/` 포함

- [ ] **Step 3: lint**

Run: `npx eslint src/ui/widget src/ui/theme`
Expected: 신규 코드 경고 없음

---

## Self-Review (작성자 체크)

- **Spec 커버리지(§3.1, §3.4):** tokens.css(Task1) ✓ / 로컬 폰트+web_accessible(Task2) ✓ / 위젯 다크 토큰·broadcast·펄스·34px·툴팁(Task4) ✓ / 세로 드래그+chrome.storage 영속(Task3·4) ✓ / hover-bridge 보존(Task4 Step5) ✓. **미커버**: 위젯 툴팁(`.fab-tip`)은 spec에 언급되나 P1 구현에서 호버 reveal로 갈음 — 텍스트 툴팁이 꼭 필요하면 별도 추가 필요(아래 메모).
- **Placeholder 스캔:** 폰트 바이너리는 외부 취득 단계로 명시(추상 지시 아님). fonts.css 반복은 "weight만 변경" 명시 + 2개 예시 제공. 코드 스텝은 전부 실제 코드.
- **타입 일관성:** `getDockTop(): Promise<number|null>` / `setDockTop(top:number)` — Task3 정의와 Task4 사용 일치. `widgetDockTop` 키 일관. `data-testid="widget-root"` 신규 — 테스트/구현 일치.
- **메모(P1 범위 외):** 디자인의 텍스트 툴팁(`.fab-tip`)은 P1에서 생략(호버 reveal로 의도 전달). 필요 시 P1 후속 또는 P2에서 추가.

---

## 다음 단계
- **P2 — 패널 UI** (`docs/plans/2026-06-01-api-collector-p2-panel-ui.md`): Rail/ListView/DetailView/SendView/SettingsView/CopyBtn, tokens.css·fonts.css 소비, options.html 제거.
- **P3 — SW 실동작** (`docs/plans/2026-06-01-api-collector-p3-capture-settings.md`): `appendCall` 필터(methods/whitelist/saveBody/dedupe)+autoSend, `Settings` 확장/마이그레이션.
