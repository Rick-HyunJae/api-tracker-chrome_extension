# FloatingWidget 사이드패널 토글 + hover 유지 — Design Spec

- 날짜: 2026-06-01
- 대상: `src/background/index.ts`, `src/ui/sidepanel/index.tsx`, `src/ui/widget/FloatingWidget.tsx`
- 상태: 확정
- 선행: `docs/specs/2026-06-01-floating-widget-edge-dock-design.md` (엣지 도킹 비주얼 리워크)

## 1. 배경 / 목표

엣지 도킹 리워크(`27342ba`) 이후 플로팅 위젯에 두 가지 기능 결함이 남았다.

1. **사이드패널 버튼이 동작하지 않음** — 메인 버튼 클릭 시 사이드패널이 열리지 않는다. 또한 이미 열려 있으면 닫혀야 한다(완전 토글).
2. **chip으로 hover 이동 시 위젯이 반쯤 숨김으로 복귀** — 추적 토글 chip으로 커서를 옮기는 도중 hover가 풀려 위젯이 닫힌다. chip에 도달할 때까지 hover가 유지돼야 한다.

직전 spec의 "`FloatingWidget.tsx` 단독 수정" 동결은 해제한다. 문제 1은 `background/index.ts` 수정이 불가피하고, 완전 토글을 위해 사이드패널 페이지의 협조가 필요하다.

## 2. 근본 원인 분석

### 2.1 문제 1 — 사이드패널 미동작
- `src/background/index.ts`의 `handleMessage`에서 `MSG.OPEN_SIDEPANEL` 케이스가 빈 처리(`return { state }`)다. 메시지는 도착하지만 `chrome.sidePanel.open()`을 호출하는 코드가 없다.
- `setPanelBehavior({ openPanelOnActionClick: true })`는 **툴바 액션 아이콘** 클릭용이라 content-script DOM 버튼에는 적용되지 않는다.
- 설령 `handleMessage`에 `open()`을 추가해도, `onMessage` 리스너가 `handleMessage` 호출 전에 `await getStorage()`(+ 직렬화 큐)를 거치므로 **user gesture가 소실**된다. `chrome.sidePanel.open()`은 사용자 제스처 컨텍스트에서만 동작하므로 `await` 이후 호출 시 실패한다.
- Chrome에는 공식 `sidePanel.close()`가 없다. "이미 열려 있으면 닫기"는 열림 상태를 추적한 뒤 우회 구현해야 한다.

### 2.2 문제 2 — hover 풀림
- hover 타깃 `.amt-root:hover`의 root 박스는 in-flow 자식인 32px 메인 버튼 크기만 차지한다.
- chip은 `position:absolute; top:40px`로 root 박스 **바깥**에 위치하며, 메인 버튼 하단(32px)과 chip 상단(40px) 사이에 **8px 데드존**이 있다.
- 커서가 chip으로 내려가는 즉시 root hover 영역을 벗어나 chip이 사라지고(`opacity:0; pointer-events:none`) 메인 버튼도 `translateX(50%)` 반쯤 숨김으로 복귀한다.

## 3. 범위

| 파일 | 변경 | 사유 |
|---|---|---|
| `src/background/index.ts` | 필수 | `OPEN_SIDEPANEL` 토글 구현 + 열림 상태 추적 |
| `src/ui/sidepanel/index.tsx` | 필수 | 패널 열림/닫힘을 포트로 SW에 보고 |
| `src/ui/widget/FloatingWidget.tsx` | 필수 | hover 연속 히트박스(브리지) |

**비범위**: 위젯 비주얼/레이아웃(엣지 도킹 spec 확정분 유지), 위젯 위치 드래그, 세션 관리 액션, 권한 변경(아래 6.1 검증 결과에 따라서만).

## 4. 설계

### 4.1 사이드패널 완전 토글

#### (a) 열림 상태 추적
- 사이드패널 페이지(`index.tsx`)가 마운트 시 자신의 `tabId`를 구해 SW에 보고한다.
  - tabId 획득: `chrome.tabs.query({ active: true, currentWindow: true })` → 첫 결과의 `id`.
  - `chrome.runtime.connect({ name: 'sidepanel' })`로 포트를 열고 `port.postMessage({ tabId })` 전송.
  - 포트는 패널 수명 동안 유지된다. 패널이 닫히면(네이티브 X 포함) 포트가 끊긴다.
- SW(`background/index.ts`)는 모듈 스코프에 `openPanelTabs = new Set<number>()`를 둔다.
  - `chrome.runtime.onConnect`에서 `port.name === 'sidepanel'`이면 첫 메시지의 `tabId`를 Set에 추가.
  - `port.onDisconnect`에서 해당 `tabId`를 Set에서 제거.

#### (b) 토글 처리 — `onMessage` 리스너에서 동기 분기
`OPEN_SIDEPANEL`은 기존 직렬화 스토리지 경로(`serialized` + `await getStorage`)로 **진입하기 전에** 동기적으로 처리한다(user gesture 보존이 핵심).

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.OPEN_SIDEPANEL) {
    const tabId = sender.tab?.id
    if (tabId !== undefined) {
      if (openPanelTabs.has(tabId)) {
        // 닫기: close API 부재로 비활성화 후 즉시 재활성화(해당 tab 한정)
        void chrome.sidePanel
          .setOptions({ tabId, enabled: false })
          .then(() => chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'public/sidepanel.html' }))
        openPanelTabs.delete(tabId)
      } else {
        // 열기: 동기 호출이라 user gesture 보존
        void chrome.sidePanel.open({ tabId })
      }
    }
    sendResponse({ ok: true })
    return // 직렬화 경로로 폴스루하지 않음
  }
  // ... 기존 serialized 처리 (return true)
})
```

- `handleMessage`의 기존 `MSG.OPEN_SIDEPANEL` no-op 케이스는 dead code가 되므로 제거한다.
- 닫기 우회: `setOptions(enabled:false)`는 해당 tab의 패널을 닫고, 즉시 `enabled:true` 재활성화로 다음 열기를 보장한다. 다른 탭에는 영향 없다.

### 4.2 hover 유지 (FloatingWidget)

hover 시에만 활성화되는 **투명 브리지** `.amt-root::before`로 메인 버튼 → 8px 간격 → chip 경로를 하나의 연속 hover 영역으로 연결한다.

- 평상시: `pointer-events: none` → 페이지 클릭을 가로채지 않는다(현행 동작 유지, 우측 반쯤 보이는 메인 버튼만 점유).
- `.amt-root:hover` 시: 브리지 `pointer-events: auto` → 커서가 chip으로 이동해도 root 서브트리 안에 머물러 hover가 유지된다.
- 브리지는 메인+간격+chip 풋프린트(슬라이드 인 폭 포함)를 덮도록 사이징. `data-drop="up"`이면 브리지도 위 방향으로 확장.
- 스택 순서: 메인 버튼/chip을 `z-index`로 브리지 위에 올려 chip 클릭을 보장한다(브리지는 간격만 메운다).

기존 CSS-driven 슬라이드/드롭/색상/배지 동작은 변경하지 않는다.

## 5. 테스트

### `src/background/index.test.ts`
- `OPEN_SIDEPANEL` 동기 분기: 닫힘 상태(`openPanelTabs` 미포함) → `chrome.sidePanel.open({tabId})` 호출.
- `OPEN_SIDEPANEL`: 열림 상태(Set 포함) → `chrome.sidePanel.setOptions({enabled:false})` 호출 후 Set에서 제거.
- 포트 connect(`name:'sidepanel'` + `tabId` 메시지) → Set에 추가, disconnect → Set에서 제거.
- `chrome.sidePanel`/`onConnect`는 mock으로 주입.

### `src/ui/sidepanel/`
- App 마운트 시 `chrome.runtime.connect({name:'sidepanel'})` 호출 및 tabId `postMessage` 전송 검증.

### `src/ui/widget/FloatingWidget.test.tsx`
- 기존 케이스 유지(메인 클릭→`OPEN_SIDEPANEL`, chip 클릭→`TOGGLE_TRACKING`, 배지/스토리지 동기화).
- 브리지는 CSS이므로 단위테스트 대상 아님(요소 존재로만 확인).

## 6. 리스크 / 검증 항목

### 6.1 tabId 획득 권한
- `chrome.tabs.query`로 tab `id`는 `activeTab`/`scripting` 권한에서 노출될 것으로 예상되나, 환경에 따라 `tabs` 권한이 필요할 수 있다.
- **검증 단계**: 구현 중 query 결과의 `id` 유무를 확인. 미노출 시 `manifest.json` `permissions`에 `tabs` 추가(이 경우에만 비범위 예외).

### 6.2 닫기 깜빡임
- `setOptions(enabled:false)` → `enabled:true` 우회로 미세 깜빡임 가능. 허용 범위로 판단하되, 체감 이슈 시 대안(별도 닫기 메시지) 재검토.

### 6.3 tabId 레이스
- 사이드패널 로드 시점의 active tab을 자신의 tab으로 간주한다. 사용자가 패널 로드 직후 탭을 빠르게 전환하는 극단 케이스는 무시(영향 경미).
