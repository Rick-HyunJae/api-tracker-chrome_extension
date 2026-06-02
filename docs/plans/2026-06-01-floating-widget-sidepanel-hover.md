# FloatingWidget 사이드패널 토글 + hover 유지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **격리 강제:** 코드 변경은 `superpowers:using-git-worktrees`로 확보한 격리 워크트리/전용 브랜치에서만 수행한다(`main`/`feature/2.0.0` 직접 커밋 금지). 문서는 예외.

**Goal:** 플로팅 위젯 메인 버튼으로 사이드패널을 완전 토글(열기/닫기)하고, chip으로 hover 이동 시 위젯이 닫히지 않도록 한다.

**Architecture:** (1) 사이드패널 페이지가 포트로 자신의 tabId를 SW에 보고해 열림 상태를 추적하고, SW의 `onMessage` 리스너가 `OPEN_SIDEPANEL`을 직렬화 큐 진입 전 **동기적으로** 처리해 user gesture를 보존하며 열기/닫기를 토글한다. (2) 위젯은 hover 시에만 활성화되는 투명 브리지(`::before`)로 메인 버튼↔chip 경로를 연속 hover 영역으로 연결한다.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, Chrome Extension MV3 (`chrome.sidePanel`, `chrome.runtime` 포트).

**Spec:** `docs/specs/2026-06-01-floating-widget-sidepanel-hover-design.md`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/test-setup.ts` | Vitest chrome mock | 수정 — `runtime.onConnect`, `runtime.connect`, `sidePanel.setOptions` 추가 |
| `src/background/index.ts` | SW 메시지 라우팅 | 수정 — `createSidePanelController` 추가, `OPEN_SIDEPANEL` 동기 토글 와이어링, dead 케이스 제거 |
| `src/background/index.test.ts` | SW 테스트 | 수정 — 컨트롤러/리스너 토글 테스트 추가 |
| `src/ui/sidepanel/port.ts` | 사이드패널 포트 연결 | 신규 — `connectSidePanelPort()` |
| `src/ui/sidepanel/port.test.ts` | 포트 연결 테스트 | 신규 |
| `src/ui/sidepanel/index.tsx` | 사이드패널 엔트리 | 수정 — App 마운트 시 `connectSidePanelPort()` 호출 |
| `src/ui/widget/FloatingWidget.tsx` | 플로팅 위젯 | 수정 — hover 브리지 CSS |

---

## Task 1: chrome mock 확장 (테스트 enabler)

`background/index.ts`를 import하면 모듈 로드 시 `registerBackground()`가 실행되며 `chrome.runtime.onConnect.addListener`를 호출한다. mock에 `onConnect`가 없으면 import 자체가 throw하므로 **이 작업을 먼저** 한다.

**Files:**
- Modify: `src/test-setup.ts:30-55`

- [ ] **Step 1: mock에 onConnect / connect / setOptions 추가**

`runtime` 객체에 `onConnect`와 `connect`를 추가하고, `sidePanel` 객체에 `setOptions`를 추가한다.

`src/test-setup.ts`의 `runtime` 블록(현재 30-36행)을 다음으로 교체:

```ts
  runtime: {
    id: 'test',
    sendMessage: vi.fn(async () => undefined),
    onMessage: makeEvent(),
    onConnect: makeEvent(),
    connect: vi.fn(() => ({
      name: 'sidepanel',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: makeEvent(),
      onDisconnect: makeEvent(),
    })),
    getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    lastError: undefined,
  },
```

`src/test-setup.ts`의 `sidePanel` 블록(현재 52-55행)을 다음으로 교체:

```ts
  sidePanel: {
    open: vi.fn(async () => undefined),
    setOptions: vi.fn(async () => undefined),
    setPanelBehavior: vi.fn(async () => undefined),
  },
```

- [ ] **Step 2: 기존 테스트가 여전히 통과하는지 확인**

Run: `npm run test:run`
Expected: PASS (기존 전체 스위트 그대로 통과 — mock 키 추가는 비파괴적)

- [ ] **Step 3: Commit**

```bash
git add src/test-setup.ts
git commit -m "test: extend chrome mock with onConnect, connect, sidePanel.setOptions"
```

---

## Task 2: 사이드패널 토글 컨트롤러 (background)

**Files:**
- Modify: `src/background/index.ts`
- Test: `src/background/index.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/index.test.ts` 상단 import에 `createSidePanelController`를 추가한다. 현재 1번째 줄
`import { handleMessage } from './index'` 를 다음으로 교체:

```ts
import { handleMessage, createSidePanelController } from './index'
```

그리고 파일 맨 끝(마지막 `})` 뒤)에 다음 describe 블록을 추가한다:

```ts
function emitter() {
  const ls: ((...a: unknown[]) => void)[] = []
  return {
    addListener: vi.fn((f: (...a: unknown[]) => void) => ls.push(f)),
    removeListener: vi.fn(),
    emit: (...a: unknown[]) => ls.forEach((l) => l(...a)),
  }
}

function fakePort(name = 'sidepanel') {
  return { name, onMessage: emitter(), onDisconnect: emitter(), postMessage: vi.fn(), disconnect: vi.fn() }
}

describe('side panel controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the panel when not already open', () => {
    const c = createSidePanelController()
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('closes the panel (setOptions disable) when already open', () => {
    const c = createSidePanelController()
    const port = fakePort('sidepanel')
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 }) // panel reports its tab
    c.toggle(42)
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false })
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })

  it('reopens after the panel disconnects (close clears tracking)', () => {
    const c = createSidePanelController()
    const port = fakePort()
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 })
    port.onDisconnect.emit() // panel closed
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('ignores non-sidepanel ports', () => {
    const c = createSidePanelController()
    const port = fakePort('other')
    c.registerPort(port as unknown as chrome.runtime.Port)
    port.onMessage.emit({ tabId: 42 })
    c.toggle(42)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 }) // not tracked -> opens
  })

  it('does nothing without a tabId', () => {
    const c = createSidePanelController()
    c.toggle(undefined)
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: FAIL — `createSidePanelController is not a function` (export 미존재)

- [ ] **Step 3: 컨트롤러 구현**

`src/background/index.ts`에서 import 블록 바로 아래(기존 `export interface RouterCtx` 위)에 다음을 추가한다:

```ts
const SIDEPANEL_PATH = 'public/sidepanel.html'

export interface SidePanelController {
  toggle: (tabId: number | undefined) => void
  registerPort: (port: chrome.runtime.Port) => void
}

// Chrome has no sidePanel.close(); we track which tabs have the panel open via a
// port the panel opens on load, and emulate close with setOptions(enabled:false)
// followed by a re-enable so the next open works. Tracking is per-tab.
export function createSidePanelController(): SidePanelController {
  const openTabs = new Set<number>()

  function toggle(tabId: number | undefined): void {
    if (tabId === undefined) return
    if (openTabs.has(tabId)) {
      openTabs.delete(tabId)
      void chrome.sidePanel
        .setOptions({ tabId, enabled: false })
        .then(() => chrome.sidePanel.setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH }))
        .catch(() => undefined)
    } else {
      // Synchronous call preserves the user gesture required by sidePanel.open().
      void chrome.sidePanel.open({ tabId }).catch(() => undefined)
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: PASS (새 5개 케이스 + 기존 케이스 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add src/background/index.ts src/background/index.test.ts
git commit -m "feat: add side panel toggle controller with port-based open tracking"
```

---

## Task 3: OPEN_SIDEPANEL 동기 와이어링 (background)

**Files:**
- Modify: `src/background/index.ts` (`handleMessage`의 dead 케이스 제거, `registerBackground` 와이어링)
- Test: `src/background/index.test.ts`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`src/background/index.test.ts`의 `side panel controller` describe 블록 아래에 다음을 추가한다. `registerBackground()`는 모듈 import 시 이미 실행되어 `chrome.runtime.onMessage` 리스너를 등록한다. mock 이벤트의 `_emit`으로 리스너를 직접 구동한다.

```ts
describe('OPEN_SIDEPANEL listener wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the side panel synchronously for the sender tab', () => {
    const sendResponse = vi.fn()
    const onMessage = chrome.runtime.onMessage as unknown as {
      _emit: (...a: unknown[]) => void
    }
    onMessage._emit({ type: MSG.OPEN_SIDEPANEL }, { tab: { id: 7 } }, sendResponse)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/background/index.test.ts -t "opens the side panel synchronously"`
Expected: FAIL — `chrome.sidePanel.open`가 호출되지 않음(현재 `OPEN_SIDEPANEL`은 직렬화 큐로 들어가 no-op)

- [ ] **Step 3: handleMessage의 dead 케이스 제거**

`src/background/index.ts`의 `handleMessage` 내부에서 다음 케이스를 **삭제**한다(이제 리스너가 가로채므로 도달 불가):

```ts
    case MSG.OPEN_SIDEPANEL: {
      return { state }
    }
```

(삭제 후에도 `default: return { state }`가 안전망으로 남는다.)

- [ ] **Step 4: registerBackground에 컨트롤러 와이어링**

`registerBackground` 함수 본문에서 `void chrome.sidePanel?.setPanelBehavior?.(...)` 호출 **다음 줄**에 컨트롤러 생성과 onConnect 등록을 추가한다:

```ts
  const sidePanel = createSidePanelController()
  chrome.runtime.onConnect.addListener((port) => sidePanel.registerPort(port))
```

그리고 `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {` 본문의 **맨 첫 줄**(기존 `const senderUrl = ...` 위)에 동기 분기를 추가한다:

```ts
    if (message.type === MSG.OPEN_SIDEPANEL) {
      // Handle synchronously, before any await, to preserve the user gesture
      // that chrome.sidePanel.open() requires. Does not enter the serialized
      // storage queue (no state mutation needed).
      sidePanel.toggle(sender.tab?.id)
      sendResponse({ ok: true })
      return
    }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: PASS (통합 테스트 + 기존 전체 통과)

- [ ] **Step 6: Commit**

```bash
git add src/background/index.ts src/background/index.test.ts
git commit -m "feat: handle OPEN_SIDEPANEL synchronously to preserve user gesture"
```

---

## Task 4: 사이드패널 포트 연결 (sidepanel)

**Files:**
- Create: `src/ui/sidepanel/port.ts`
- Test: `src/ui/sidepanel/port.test.ts`
- Modify: `src/ui/sidepanel/index.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/ui/sidepanel/port.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectSidePanelPort } from './port'

describe('connectSidePanelPort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connects a sidepanel port and reports the active tab id', async () => {
    ;(chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 42 }])
    const post = vi.fn()
    ;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockReturnValue({
      postMessage: post,
    } as unknown as chrome.runtime.Port)

    await connectSidePanelPort()

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'sidepanel' })
    expect(post).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('does nothing when no active tab id is available', async () => {
    ;(chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await connectSidePanelPort()

    expect(chrome.runtime.connect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/ui/sidepanel/port.test.ts`
Expected: FAIL — `Cannot find module './port'`

- [ ] **Step 3: port.ts 구현**

Create `src/ui/sidepanel/port.ts`:

```ts
// The side panel page opens a port on load so the background SW can track which
// tab has the panel open (Chrome exposes no "is the panel open" query). The port
// disconnects automatically when the panel closes, letting the SW clear tracking.
export async function connectSidePanelPort(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tabs[0]?.id
  if (typeof tabId !== 'number') return
  const port = chrome.runtime.connect({ name: 'sidepanel' })
  port.postMessage({ tabId })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/ui/sidepanel/port.test.ts`
Expected: PASS

- [ ] **Step 5: index.tsx에서 마운트 시 호출**

`src/ui/sidepanel/index.tsx`의 import에 다음을 추가한다(기존 import 그룹 끝):

```ts
import { connectSidePanelPort } from './port'
```

그리고 `App` 컴포넌트의 기존 `useEffect` 바로 아래에 새 `useEffect`를 추가한다:

```ts
  useEffect(() => {
    void connectSidePanelPort()
  }, [])
```

- [ ] **Step 6: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (타입 에러 없음, 전체 스위트 통과)

- [ ] **Step 7: Commit**

```bash
git add src/ui/sidepanel/port.ts src/ui/sidepanel/port.test.ts src/ui/sidepanel/index.tsx
git commit -m "feat: report side panel open state to SW via runtime port"
```

---

## Task 5: hover 연속 히트박스 브리지 (FloatingWidget)

CSS-only 변경. 단위테스트 대상이 아니므로(spec §5) 기존 테스트 통과로 회귀만 확인한다.

**Files:**
- Modify: `src/ui/widget/FloatingWidget.tsx:8-32` (`STYLE` 블록)
- Test: `src/ui/widget/FloatingWidget.test.tsx` (기존 유지, 변경 없음)

- [ ] **Step 1: STYLE에 브리지 규칙 추가**

`src/ui/widget/FloatingWidget.tsx`의 `STYLE` 템플릿 리터럴에서 `.amt-root { ... }` 규칙(현재 9-10행) **바로 다음**에 아래 규칙들을 삽입한다:

```css
.amt-root::before { content: ''; position: absolute; right: 0; width: 60px;
  pointer-events: none; }
.amt-root[data-drop="down"]::before { top: -8px; height: 96px; }
.amt-root[data-drop="up"]::before   { bottom: -8px; height: 96px; }
.amt-root:hover::before { pointer-events: auto; }
```

그리고 동일 `STYLE` 내 `.amt-chip { ... }` 규칙의 선언 목록에 `z-index: 1;`을 추가한다(메인 버튼은 이미 `position: relative`이므로 `.amt-main` 규칙에도 `z-index: 1;` 추가). 구체적으로:

`.amt-main { ... position: relative;` 가 끝나는 부분(현재 13행 `box-shadow: ...; position: relative;`)에 `z-index: 1;`을 덧붙여:

```css
.amt-main { width: 32px; height: 32px; border-radius: 50%; border: none; padding: 0;
  cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center;
  box-shadow: -2px 0 10px rgba(0,0,0,.2); position: relative; z-index: 1;
  transform: translateX(50%); transition: transform .25s ease; }
```

`.amt-chip` 규칙(현재 22-27행)에 `z-index: 1;`을 추가:

```css
.amt-chip { position: absolute; right: 0; width: 32px; height: 32px; border-radius: 50%;
  border: none; padding: 0; cursor: pointer; background: #fff; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,.18);
  opacity: 0; pointer-events: none;
  transition: transform .28s cubic-bezier(.2,.8,.3,1), opacity .2s; }
```

> 의도: 평상시 `::before`는 `pointer-events:none`이라 페이지 클릭을 가로채지 않는다. hover 시에만 `pointer-events:auto`가 되어 메인 버튼→8px 간격→chip 경로를 하나의 연속 hover 영역으로 잇는다. 버튼은 `z-index:1`로 브리지(z auto) 위에 쌓여 클릭이 보장된다.

- [ ] **Step 2: 기존 위젯 테스트 통과 확인**

Run: `npx vitest run src/ui/widget/FloatingWidget.test.tsx`
Expected: PASS (6개 케이스 모두 통과 — DOM 구조/식별자 불변)

- [ ] **Step 3: Commit**

```bash
git add src/ui/widget/FloatingWidget.tsx
git commit -m "fix: keep widget hover alive across the chip via transparent bridge"
```

---

## Task 6: 최종 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (타입 에러 0, 전체 스위트 그린)

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (tsc + vite build 통과, `dist/` 생성)

- [ ] **Step 3: 수동 검증 (확장 로드)**

빌드된 `dist/`를 Chrome `chrome://extensions`에 로드 후:
1. 임의 페이지에서 위젯 메인 버튼 클릭 → 사이드패널이 **열린다**.
2. 메인 버튼 다시 클릭 → 사이드패널이 **닫힌다**.
3. 위젯에 hover → 메인 버튼 슬라이드 인, chip 드롭 → 커서를 chip으로 이동해도 **위젯이 유지된다**(반쯤 숨김 복귀 없음).
4. chip 클릭 → 추적 토글 동작(파랑↔회색).

- [ ] **Step 4: `tabs` 권한 검증 (spec §6.1)**

위 3-1에서 사이드패널이 열리고 닫기 토글이 동작하면 `chrome.tabs.query`가 `id`를 정상 반환한 것이다. 만약 닫기가 동작하지 않으면(매번 열기만) tabId 미획득 가능성 → `manifest.json`의 `permissions`에 `"tabs"`를 추가하고 재빌드 후 재검증한다.

---

## Self-Review 결과

- **Spec 커버리지**: §2.1 사이드패널 미동작 → Task 2·3. §2.2 hover 풀림 → Task 5. §4.1 열림 추적/토글 → Task 2·3·4. §4.2 브리지 → Task 5. §5 테스트 → 각 Task의 테스트 step + Task 6. §6.1 권한 검증 → Task 6 Step 4. 누락 없음.
- **Placeholder 스캔**: TBD/TODO/추상 지시 없음. 모든 코드 step에 실제 코드 포함.
- **타입 일관성**: `createSidePanelController`/`SidePanelController`/`toggle`/`registerPort`/`connectSidePanelPort`/`SIDEPANEL_PATH` 명칭이 정의·사용처에서 일치. 포트 name 상수 `'sidepanel'`이 background(`port.name !== 'sidepanel'`)와 sidepanel(`connect({name:'sidepanel'})`) 양쪽 일치.
