# Network Capture Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 사이트에서 API 호출이 캡처되어 세션에 쌓이도록, 캡처 미동작의 두 근본 원인(동의 게이트 + 주입 스크립트 경로 오류)을 제거한다.

**Architecture:** MVP 단계에서는 동의(consent) 게이트를 우회하고 `trackingEnabled`만으로 캡처를 제어한다(ConsentBanner/`consentGivenAt`은 향후 재도입 위해 코드 보존). 메인월드 캡처 스크립트의 `src`는 `chrome.runtime.getURL()`로 확장 origin에 해석시킨다. 추적 토글이 켜지는 순간 현재 탭에서 새로고침 없이 즉시 캡처가 시작되도록 `storage.onChanged`를 구독해 동적 주입한다.

**Tech Stack:** TypeScript, Chrome MV3, @crxjs/vite-plugin, React 18, Vitest(jsdom)

---

## 근본 원인 (확정)

1. **주입 스크립트 경로 오류** — `src/content/widget-host.ts:9`의 `import captureScriptUrl from './injected-capture.ts?script&module'`은 루트 절대경로 `/assets/injected-capture.ts-*.js`를 반환한다. 이를 `<script src>`에 그대로 넣으면 브라우저가 **페이지 origin** 기준으로 해석 → `https://방문사이트/assets/...` → 404. (빌드 산출물 `dist/assets/widget-host.ts-*.js`에서 `const I="/assets/injected-capture.ts-*.js"; t.src=I` 확인됨)
2. **동의 게이트가 닫힌 채로 잠김** — 동의를 받는 유일한 컴포넌트 `ConsentBanner`가 어떤 진입점에도 렌더링되지 않아(`grep` 확인) `consentGivenAt`이 영구히 `undefined`. 그 결과 `widget-host.ts:63`에서 캡처 스크립트가 절대 주입되지 않고, `src/background/index.ts:28`에서 캡처 메시지도 폐기된다.

> 위젯 미표시(증상 1)는 코드 버그가 아니라 `chrome://` 새 탭 페이지에서 테스트한 환경 문제였음 — 일반 사이트에서 정상 표시 확인 완료. 본 plan 범위 아님.

## 설계 결정

- **Consent**: MVP에서는 동의 게이트 **제거**(생략). `ConsentBanner`, `grantConsent()`, `Settings.consentGivenAt` 타입은 **삭제하지 않고 보존**(향후 SidePanel 진입 배너 방식으로 재도입 가능).
- **캡처 시작 시점**: 추적이 켜지면 **현재 탭에서 즉시**(동적 주입). 페이지 로드 시 `trackingEnabled`면 즉시 주입, 로드 후 토글 ON 시 `storage.onChanged`로 즉시 주입.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/content/widget-host.ts` | 콘텐츠 스크립트 부트스트랩 — 위젯 마운트 + 캡처 주입 게이트 | 수정 |
| `src/content/widget-host.test.ts` | widget-host 단위 테스트 | 수정 |
| `src/background/index.ts` | 백그라운드 메시지 라우터 | 수정 |
| `src/background/index.test.ts` | 라우터 단위 테스트 | 수정 |
| `README.md` | 빌드/로드 안내 | 수정 |

---

## Task 1: 주입 스크립트 경로를 확장 origin으로 해석

캡처 스크립트의 `<script src>`를 `chrome.runtime.getURL()`로 확장 origin에 고정한다. `injectMainWorldCapture`를 테스트 가능하도록 export한다.

**Files:**
- Modify: `src/content/widget-host.ts:47-55` (`injectMainWorldCapture`)
- Modify: `src/content/widget-host.test.ts:3` (mock), 테스트 추가

- [ ] **Step 1: 실패 테스트 작성 — mock을 실제 빌드 출력(루트 절대경로) 형태로 교체하고 src 해석 검증**

`src/content/widget-host.test.ts` 상단 mock을 교체:

```ts
// crxjs ?script import returns a ROOT-ABSOLUTE path ("/assets/..."), mirroring
// the real build output. injectMainWorldCapture must resolve it via getURL.
vi.mock('./injected-capture.ts?script&module', () => ({ default: '/assets/injected-capture.js' }))
```

import 줄에 `injectMainWorldCapture` 추가:

```ts
import { isBlacklisted, mountWidgetHost, injectMainWorldCapture, WIDGET_HOST_ID } from './widget-host'
```

`describe` 블록 안에 테스트 추가:

```ts
it('injectMainWorldCapture resolves the capture src against the extension origin', () => {
  injectMainWorldCapture()
  const script = document.getElementById('__api-tracker-capture__')
  expect(script).not.toBeNull()
  expect(script!.getAttribute('src')).toBe('chrome-extension://test/assets/injected-capture.js')
})

it('injectMainWorldCapture is idempotent (no duplicate script tags)', () => {
  injectMainWorldCapture()
  injectMainWorldCapture()
  expect(document.querySelectorAll('#__api-tracker-capture__')).toHaveLength(1)
})
```

> `beforeEach`의 `document.body.innerHTML = ''`는 `document.head`의 스크립트를 지우지 못한다. 테스트 간 간섭을 막기 위해 `beforeEach`를 다음으로 교체한다:
> ```ts
> beforeEach(() => {
>   document.body.innerHTML = ''
>   document.getElementById('__api-tracker-capture__')?.remove()
>   document.getElementById(WIDGET_HOST_ID)?.remove()
> })
> ```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest src/content/widget-host.test.ts --no-cache` (프로젝트는 vitest 사용 → 실제로는 `npx vitest run src/content/widget-host.test.ts`)
Expected: FAIL — `injectMainWorldCapture`가 export되지 않음 / src가 `/assets/injected-capture.js`(미해석)로 나옴

- [ ] **Step 3: 구현 — getURL 적용 + export**

`src/content/widget-host.ts`의 `injectMainWorldCapture`를 교체:

```ts
export function injectMainWorldCapture(): void {
  if (document.getElementById('__api-tracker-capture__')) return
  const script = document.createElement('script')
  script.id = '__api-tracker-capture__'
  // crxjs ?script import yields a root-absolute path ("/assets/..."). A page
  // <script src> would resolve that against the PAGE origin (404). Pin it to the
  // extension origin. Strip the leading slash so getURL builds a clean path.
  script.src = chrome.runtime.getURL((captureScriptUrl as string).replace(/^\//, ''))
  script.type = 'module'
  ;(document.head ?? document.documentElement).appendChild(script)
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/content/widget-host.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/content/widget-host.ts src/content/widget-host.test.ts
git commit -m "fix: resolve injected capture script src to extension origin"
```

---

## Task 2: 동의 게이트 제거 (MVP) — 백그라운드

백그라운드 라우터가 `consentGivenAt` 없이도 `trackingEnabled`만으로 캡처를 수용하도록 한다.

**Files:**
- Modify: `src/background/index.ts:27-31` (`API_CAPTURED` 케이스)
- Modify: `src/background/index.test.ts:15-19, 37-45` (consent 전제 테스트 교체)

- [ ] **Step 1: 실패 테스트 작성 — 동의 없이도 캡처되고, 추적 OFF면 무시되는지 검증**

`src/background/index.test.ts`에서 기존 테스트 `ignores API_CAPTURED when consent not given`(37-45줄)을 아래 두 테스트로 교체:

```ts
it('captures API_CAPTURED without consentGivenAt (MVP gate removed)', async () => {
  // DEFAULT_STORAGE has no consentGivenAt and trackingEnabled = true.
  const next = await handleMessage(
    DEFAULT_STORAGE,
    { type: MSG.API_CAPTURED, payload: makeCall('1') },
    'https://example.com',
    ctx,
  )
  expect(next.state.currentSession?.calls ?? []).toHaveLength(1)
})

it('ignores API_CAPTURED when tracking disabled', async () => {
  const off: StorageSchema = {
    ...DEFAULT_STORAGE,
    settings: { ...DEFAULT_STORAGE.settings, trackingEnabled: false },
  }
  const next = await handleMessage(
    off,
    { type: MSG.API_CAPTURED, payload: makeCall('1') },
    'https://example.com',
    ctx,
  )
  expect(next.state.currentSession?.calls ?? []).toHaveLength(0)
})
```

> `CONSENTED` 상수(15-19줄)와 이를 쓰는 다른 테스트는 그대로 둔다 — `trackingEnabled`가 true라 계속 통과한다. 주석만 갱신:
> ```ts
> // trackingEnabled = true so capture tests are not blocked. (consent gate removed in MVP)
> const CONSENTED: StorageSchema = {
>   ...DEFAULT_STORAGE,
>   settings: { ...DEFAULT_STORAGE.settings, consentGivenAt: 1 },
> }
> ```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: FAIL — `captures API_CAPTURED without consentGivenAt`가 0개로 실패(현재 consent 게이트가 막음)

- [ ] **Step 3: 구현 — consent 체크 제거**

`src/background/index.ts`의 `API_CAPTURED` 케이스(27-31줄)를 교체:

```ts
    case MSG.API_CAPTURED: {
      // MVP: consent gate removed. Capture is gated by trackingEnabled only.
      // consentGivenAt is retained in the schema for future re-introduction.
      if (!state.settings.trackingEnabled) return { state }
      return { state: appendCall(state, msg.payload, ctx.now()) }
    }
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/background/index.ts src/background/index.test.ts
git commit -m "feat: capture API calls without consent gate (MVP)"
```

---

## Task 3: 동의 게이트 제거 (MVP) + 즉시 동적 주입 — 콘텐츠 스크립트

`init()`에서 consent 체크를 제거하고 `trackingEnabled`로만 주입을 결정한다. 추적이 OFF→ON으로 바뀌면 현재 탭에서 즉시 주입하도록 `storage.onChanged`를 구독한다.

**Files:**
- Modify: `src/content/widget-host.ts:1-4`(import), `:57-71`(`init`), 신규 `watchTrackingForInjection`
- Modify: `src/content/widget-host.test.ts` (동적 주입 테스트 추가)

- [ ] **Step 1: 실패 테스트 작성 — 추적 ON 전환 시 동적 주입 검증**

`src/content/widget-host.test.ts` import에 `watchTrackingForInjection` 추가:

```ts
import {
  isBlacklisted, mountWidgetHost, injectMainWorldCapture,
  watchTrackingForInjection, WIDGET_HOST_ID,
} from './widget-host'
```

테스트 추가:

```ts
it('watchTrackingForInjection injects capture when trackingEnabled flips to true', () => {
  watchTrackingForInjection()
  expect(document.getElementById('__api-tracker-capture__')).toBeNull()
  // Simulate chrome.storage.onChanged firing for the local area.
  ;(chrome.storage.onChanged as unknown as { _emit: (...a: unknown[]) => void })._emit(
    { settings: { newValue: { trackingEnabled: true } } },
    'local',
  )
  expect(document.getElementById('__api-tracker-capture__')).not.toBeNull()
})

it('watchTrackingForInjection ignores changes that do not enable tracking', () => {
  watchTrackingForInjection()
  ;(chrome.storage.onChanged as unknown as { _emit: (...a: unknown[]) => void })._emit(
    { settings: { newValue: { trackingEnabled: false } } },
    'local',
  )
  expect(document.getElementById('__api-tracker-capture__')).toBeNull()
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/content/widget-host.test.ts`
Expected: FAIL — `watchTrackingForInjection`가 export되지 않음

- [ ] **Step 3: 구현 — import 추가, `watchTrackingForInjection` 신설, `init` 교체**

`src/content/widget-host.ts:4`의 storage import에 `onStorageChanged` 추가:

```ts
import { getStorage, onStorageChanged } from '../shared/storage'
```

`teardownWidgetHost` 아래(또는 `injectMainWorldCapture` 근처)에 신규 함수 추가:

```ts
export function watchTrackingForInjection(): void {
  // When the user resumes tracking on an already-loaded tab, inject the capture
  // script immediately instead of waiting for a reload. injectMainWorldCapture
  // is idempotent, so an already-injected page is a no-op.
  onStorageChanged((changes) => {
    const next = changes.settings?.newValue as { trackingEnabled?: boolean } | undefined
    if (next?.trackingEnabled === true) injectMainWorldCapture()
  })
}
```

`init()`(57-71줄)을 교체:

```ts
async function init(): Promise<void> {
  const { settings } = await getStorage()
  if (isBlacklisted(location.hostname, settings.blacklistedDomains)) return
  // MVP: consent gate bypassed. Capture is gated by trackingEnabled only.
  // ConsentBanner/consentGivenAt are retained for future re-introduction.
  if (settings.trackingEnabled) injectMainWorldCapture()
  mountWidgetHost()
  observeReinjection()
  watchTrackingForInjection()
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/content/widget-host.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/content/widget-host.ts src/content/widget-host.test.ts
git commit -m "feat: inject capture on tracking enable without consent gate (MVP)"
```

---

## Task 4: README 경로 정정 + 전체 검증

README가 존재하지 않는 `extension/` 디렉터리를 가리키는 오류를 정정하고, 전체 테스트와 빌드를 검증한다.

**Files:**
- Modify: `README.md:7-13`

- [ ] **Step 1: README 빌드/로드 안내 교체**

`README.md`의 `## Build & Load` 블록(7-13줄)을 교체:

```markdown
```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer Mode → "Load unpacked" → select the `dist` folder at the repository root.
```

`README.md`의 Manual E2E Smoke Test에서 동의 단계가 없음을 반영(2번 항목 뒤에 메모 추가):

```markdown
> Note: MVP에서는 별도 동의 단계가 없습니다. `trackingEnabled`(기본 ON)면 페이지 로드 시 즉시 캡처가 시작됩니다.
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS — 전체 스위트 통과(기존 68개 + 신규 테스트)

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npm run build`
Expected: `tsc --noEmit` 통과 후 `vite build` 성공, `dist/` 갱신

- [ ] **Step 4: 빌드 산출물 경로 수정 확인**

Run: `grep -o 'getURL[^)]*' dist/assets/widget-host.ts-*.js | head`
Expected: 빌드된 모듈에서 `chrome.runtime.getURL(...)` 호출이 capture src에 적용된 흔적 확인 (절대경로 직접 대입 `t.src=I` 패턴이 사라짐)

- [ ] **Step 5: 커밋**

```bash
git add README.md
git commit -m "docs: fix extension load path and note MVP no-consent capture"
```

---

## 수동 검증 (구현 후)

1. `npm run build` → Chrome `chrome://extensions` → 확장 reload(또는 dist 재로드).
2. 일반 사이트(예: naver.com 등 fetch/XHR 발생 SPA) 방문 → 우하단 파란 위젯 표시.
3. 페이지에서 API 호출 유발(스크롤/탭 이동) → **위젯 배지 카운트 증가** 확인.
4. 위젯 → "패널 열기" → SidePanel에 캡처된 호출(method/status/duration) 목록 표시.
5. 위젯 → "일시정지" 후 "재개" → 새로고침 없이 다시 캡처되는지 확인(동적 주입).
6. SPA 내 pushState 네비게이션 → 새 세션 시작, 배지 리셋 확인.

## 향후 확장 (범위 외)

동의가 필요해지면: SidePanel 진입 시 `consentGivenAt`이 없으면 `ConsentBanner`를 최상단에 렌더링하고, 동의 후 `widget-host`의 `watchTrackingForInjection`과 동일한 `onStorageChanged` 구독으로 즉시 주입한다. `consentGivenAt` 게이트를 `init()`과 백그라운드 `API_CAPTURED`에 다시 추가한다.
