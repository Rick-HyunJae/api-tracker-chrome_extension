# FloatingWidget 엣지 도킹 고도화 — Design Spec

- 날짜: 2026-06-01
- 대상: `src/ui/widget/FloatingWidget.tsx` (API-to-MCP Tracker Chrome Extension)
- 상태: 확정

## 1. 배경 / 목표

현재 `FloatingWidget`은 웹페이지 우측 하단에 56px 원형 버튼("API" 텍스트 + 캡처 카운트 배지)으로 떠 있고, 클릭하면 "패널 열기 / 일시정지" 텍스트 버튼이 사각 패널로 토글된다. 이를 다음과 같이 고도화한다.

1. 평상시 웹페이지 우측 라인에 **반쯤 숨겨진** 단일 플로팅 버튼.
2. **호버 시** 버튼이 좌측으로 슬라이드 인하며 액션 아이콘이 나타난다.
3. 텍스트/사각 패널 제거 → **아이콘 기반**으로 간소화.
4. 메인 버튼 = 사이드패널 열기/닫기. 추적 토글은 별도 아이콘 칩.

## 2. 범위

- **수정 파일: `src/ui/widget/FloatingWidget.tsx` 단독.**
- `src/content/widget-host.ts`(Shadow DOM 마운트), 스토리지/메시지 로직(`shared/`), 배경 스크립트는 **변경하지 않는다.**
- 메시지 상수(`MSG.OPEN_SIDEPANEL`, `MSG.TOGGLE_TRACKING`)는 기존 것을 그대로 사용한다.

## 3. 시각/레이아웃 사양

### 휴면 상태
- 컨테이너: `position:fixed; right:0; top:50%`(세로 중앙). 기존 `right:20; bottom:20`에서 변경.
- 메인 버튼만 노출, 가로의 약 50%가 화면 밖으로 나가 **반쯤 숨김**(`transform: translateX(50%)`).
- 메인 버튼: **32px** 원형. 추적 중=파랑(`#2563eb`), 정지=회색(`#9ca3af`) — 색은 추적 상태 표시(ambient indicator)용.
- 아이콘: 사이드패널 토글 SVG(사각형 + 우측 세로 분할선), 16px, `stroke=currentColor`.
- 배지: 좌상단 빨간 원(`#ef4444`), 캡처 수(`count`). 기존 동작(0도 표시)을 그대로 유지한다.

### 호버 상태
- 메인 버튼이 좌측으로 완전히 슬라이드 인(`translateX(-11px)` 수준, 화면 안에 완전히 들어옴).
- 추적 토글 **칩 1개**가 메인 버튼 **아래로 드롭**(분리된 하얀 둥근 칩, 공유 패널 배경 없음).
- 칩: **32px**(메인과 동일 크기) 원형, 흰 배경, 그림자. 아이콘 14px.
  - 추적 중 → 일시정지 아이콘(⏸, `#dc2626`).
  - 정지됨 → 재생 아이콘(▶, `#16a34a`).
- 전이: opacity + translateY, `transition .25~.28s`. 호버 해제 시 역재생.

### 드롭 방향 (아래 기본 / 위로 플립)
- 기본은 메인 버튼 **아래로** 칩 드롭.
- 메인 버튼 아래 공간이 부족하면 **위로 플립**.
- 판정: 호버 진입 시 메인 버튼 `getBoundingClientRect().bottom + 칩높이(약 44px 여유 포함)`가 `window.innerHeight`를 초과하면 위로. 결과를 `dropUp` 상태로 보관.
- 세로 중앙(`top:50%`) 기준이라 일반적으로 아래 드롭이 동작하며, 플립은 작은 뷰포트 대비 안전장치.

## 4. 인터랙션 / 상태

### 4.1 상태값 (기존 유지 + 정리)
- `count`: 캡처 수 (`currentSession.calls.length`).
- `tracking`: `settings.trackingEnabled`.
- **추가**: `dropUp`(boolean) — 칩 드롭 방향.
- **제거**: 기존 `open`/`setOpen` 및 사각 패널 `div` 전체. (호버로 대체)

### 4.2 메인 버튼
- 클릭 → `chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL })`.
- 사이드패널 열기/닫기를 트리거(기존 "패널 열기" 버튼 대체).

### 4.3 추적 토글 칩
- 클릭 → `chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !tracking })`. (기존 로직 동일)

### 4.4 스토리지 동기화
- 기존 `useEffect`의 `getStorage` + `onStorageChanged` 구독 로직 그대로 유지(count/tracking 갱신).

## 5. 구현 노트

- 호버 전이/슬라이드/드롭을 인라인 style로 표현하기 어려우므로, **CSS 클래스 + `<style>` 블록을 Shadow DOM 내부에 주입**한다. (`widget-host.ts`가 Shadow DOM에 마운트하므로 페이지 CSS와 충돌 없음)
- `:hover`는 컨테이너 기준으로 걸어 메인+칩 영역 전체를 호버 타깃으로 한다(칩으로 마우스 이동 중 닫히지 않도록).
- 아이콘은 인라인 SVG로 구현(이모지 미사용 — 렌더 일관성).
- 기존 `data-testid="widget-button"`, `data-testid="widget-badge"` 식별자는 유지하고, 칩에 `data-testid="widget-track-toggle"`를 추가한다.

## 6. 테스트 (`FloatingWidget.test.tsx` 갱신)

- 메인 버튼 클릭 → `MSG.OPEN_SIDEPANEL` 메시지 전송 검증.
- 칩 클릭 → `MSG.TOGGLE_TRACKING`(`enabled: !tracking`) 전송 검증.
- `tracking=true`일 때 칩이 일시정지 의미, `tracking=false`일 때 재생 의미로 렌더(아이콘/`data-state` 또는 aria-label로 구분) 검증.
- 배지 카운트가 `currentSession.calls.length`로 렌더되는지 검증.
- 스토리지 변경 시 count/tracking 갱신 검증(기존 케이스 유지).
- 호버 CSS 전이는 단위테스트 대상이 아니며, 요소 존재(`data-testid`)로만 확인.
- 제거된 `open` 패널 관련 기존 테스트 케이스 정리.

## 7. 비범위 (Out of scope)

- 위젯 세로 위치 드래그/이동 기능.
- 세션 추적과 별개의 "세션 관리" 액션(비우기/새 세션 등) — 현재 토글 1개로 충분.
- `widget-host.ts` 마운트 로직, 사이드패널/옵션 UI 변경.
