# API-to-MCP Tracker

브라우저에서 일어나는 **REST API 호출을 자동으로 캡처**하고, 모아진 세션을 그대로 **MCP(Model Context Protocol) 서버로 변환**해주는 Chrome MV3 확장 프로그램입니다.

웹 서비스를 사용하다 보면 그 뒤에서 수많은 `fetch`/`XHR` 요청이 오갑니다. 이 확장은 페이지 위에서 그 요청들을 가로채(method·URL·헤더·바디·응답·소요시간) 한 세션으로 쌓아두고, 버튼 한 번으로 백엔드에 전송해 MCP 서버 엔드포인트로 만들어 줍니다. "내가 방금 쓴 API들을, 에이전트가 쓸 수 있는 도구로" 바꾸는 것이 목표입니다.

> 개인 프로젝트입니다. 스토어에 배포돼 있지 않으며, 아래의 **Load unpacked** 방식으로 직접 빌드해 로드합니다.

---

## Features

- **자동 캡처 (Auto-capture)** — 페이지의 `fetch`와 `XHR`를 메인 월드에서 패치해, 추적이 켜져 있으면 페이지 로드 즉시 모든 API 호출을 기록합니다.
- **Floating Widget** — 페이지 **우측 가장자리에 도킹**되는 위젯(Shadow DOM 격리). 절반만 노출된 상태로 붙어 있다가 마우스를 올리면 슬라이드아웃되어 **추적 중지/시작** 칩과 **패널 열기** 버튼이 나타납니다. 배지는 캡처된 호출 수이고, 세로로 드래그해 위치를 옮길 수 있습니다(위치는 영속).
- **SidePanel** — Chrome 사이드패널 기반 UI. 세 개의 뷰로 구성됩니다.
  - `List` — 캡처된 호출 목록 (method/status/duration, 검색·실시간 하이라이트).
    행별 **체크박스로 전송 대상을 선택**(기본 전체 선택)하고,
    행 hover/포커스 시 **개별 삭제** 버튼이 나타납니다. 전체 삭제도 지원.
    상단의 **접이식 요약 카드**가 전체 선택 토글을 흡수해 접힌 상태로 `N/M건 · X.XKB · host`를 보여주고,
    펼치면 메서드 분포·세션 이름·전송 대상을 확인할 수 있습니다. 하단의 **전송 버튼**이 선택된 호출을 곧바로 서버로 전송합니다.
  - `Detail` — 선택한 호출의 요청/응답 상세 (헤더·바디, 본문/URL/cURL 복사 버튼)
  - `Settings` — 서버 URL/API Key, **세션 이름**, 캡처 옵션 설정 (입력 즉시 자동 저장)
- **세션 모델 (Session)** — 캡처는 하나의 세션에 누적됩니다. URL이 바뀌어도(SPA 이동·전체 페이지 이동) 세션은 끊기지 않으며, **30분 idle 타임아웃**, 추적 토글, 그리고 **수동 전송**으로 세션 경계가 결정됩니다. idle이 지나면 세션은 히스토리로 회전(rotate)되어 `pending` 상태로 보관됩니다.
- **체리픽 전송 (Cherry-pick send)** — List에서 체크한 호출만 이름과 함께 전송·아카이브되고, **체크 해제한 호출은 새 세션에 그대로 남아** 이어서 수집·전송할 수 있습니다.
- **캡처 필터 (Capture filters)** — 설정으로 캡처 대상을 정밀 제어합니다.
  - `domainWhitelist` — 도메인 화이트리스트. 비우면 전체 캡처, 값이 있으면 매칭 호스트만 캡처(포트 제외한 hostname 기준)
  - `blacklistedDomains` — 도메인 블랙리스트. **설정 UI에는 노출되지 않습니다** — 스키마와 `widget-host`에만 살아 있어 현재는 storage를 직접 수정해야 동작합니다. 걸리면 위젯 자체가 마운트되지 않고 캡처 스크립트도 주입되지 않습니다(화이트리스트는 캡처만 막고 위젯은 그대로 뜹니다)
  - `captureMethods` — 기록할 HTTP 메서드 (기본 GET/POST/PUT/PATCH/DELETE)
  - `saveBody` — 응답 바디 저장 여부
  - `dedupe` — 중복 호출 제거
  - `autoSend` — 캡처 즉시 자동 전송
- **자동/수동 전송 (Send)** — 세션을 백엔드로 전송하면(`POST {serverUrl}/api/sessions`) 응답으로 받은 MCP 서버 목록이 `mcpList`에 병합됩니다. 전송 실패한 세션은 `failed`로 보관됩니다(재전송 UI는 히스토리 뷰와 함께 예정).
  - 페이로드는 `{ sessionId, name?, url, startedAt, endedAt, calls }`. `name`은 설정값이 가공 없이 실리고, 비어 있으면 필드가 생략됩니다.
  - `calls`의 각 항목에는 `ApiCall`에 없는 **`pageUrl`**(캡처 시점 페이지 URL)이 함께 실립니다 — 서버가 스키마를 엄격히 검증한다면 허용하거나 무시해야 합니다.
- **복원력 (Resilience)** — 모든 상태는 `chrome.storage.local`에 영속됩니다. 서비스 워커가 재시작돼도 `currentSession`이 복구되고, 동시 캡처로 인한 쓰기 경쟁은 write-lock으로 직렬화됩니다.

---

## How it works — 캡처 파이프라인

캡처는 세 실행 컨텍스트(콘텐츠 스크립트 / 서비스 워커 / UI)를 가로지르는 단방향 파이프라인으로 흐릅니다.

```
[page main world]                 [content script]            [service worker]                 [UI]
injected-capture  ──postMessage──▶ content-bridge ──runtime──▶ background/index               sidepanel · widget
 (fetch·XHR 패치)                   (메시지 중계)               handleMessage(API_CAPTURED)
                                                                   │
                                                                   ▼
                                                              session-manager
                                                              appendCall + 캡처 필터
                                                                   │
                                                                   ▼
                                                          chrome.storage.local  ──onStorageChanged──▶ 구독·렌더
```

1. **injected-capture** — 페이지 메인 월드에서 `fetch`/`XHR`를 패치해 요청/응답을 가로챕니다. 상대경로 URL은 **캡처 시점에 절대화**되어 하류의 화이트리스트 매칭·dedupe·표기가 일관되게 동작합니다.
2. **content-bridge** — `postMessage`로 받은 캡처 데이터를 `chrome.runtime` 메시지로 서비스 워커에 전달합니다.
3. **background/index (`handleMessage`)** — 메시지 라우터. `trackingEnabled`이면 `appendCall`로 세션에 누적하고, `autoSend` 조건이면 곧바로 전송까지 수행합니다.
4. **session-manager (`appendCall` / `rotateSession`)** — 캡처 필터(화이트/블랙리스트, 메서드, dedupe, saveBody)를 적용하고, idle 타임아웃에 따라 세션을 회전합니다.
5. **shared/storage** — `chrome.storage.local`에 전체 상태를 저장합니다.
6. **UI** — 사이드패널과 위젯이 `onStorageChanged`로 구독하므로, 새로고침 없이 캡처 결과가 즉시 반영됩니다.

---

## Folder Structure

MV3 확장은 세 실행 컨텍스트로 나뉩니다. `src/` 아래 구조는 그 경계를 그대로 따릅니다.

```
protocol-k/
├─ manifest.json          # MV3 매니페스트 (권한·SW·콘텐츠 스크립트·사이드패널)
├─ vite.config.ts         # Vite + @crxjs 빌드 설정
├─ public/                # sidepanel.html 등 정적 진입점
└─ src/
   ├─ background/         # 서비스 워커
   │  ├─ index.ts            # 메시지 라우터(handleMessage) · registerBackground · idle alarm
   │  ├─ session-manager.ts  # appendCall · rotateSession · 캡처 필터
   │  └─ sender.ts           # 세션 전송 · MCP 목록 병합
   ├─ content/            # 콘텐츠 스크립트
   │  ├─ injected-capture.ts # 메인 월드 fetch·XHR 패치
   │  ├─ content-bridge.ts   # postMessage → runtime 중계
   │  └─ widget-host.ts      # 플로팅 위젯 마운트 호스트(Shadow DOM)
   ├─ shared/             # 컨텍스트 공유 모듈
   │  ├─ types.ts            # ApiCall · Settings · Session · StorageSchema 등 타입
   │  ├─ messages.ts         # 런타임 메시지 정의(MSG)
   │  ├─ storage.ts          # chrome.storage.local 헬퍼 · onStorageChanged
   │  └─ domain-match.ts     # 도메인 화이트/블랙리스트 매칭
   ├─ ui/
   │  ├─ sidepanel/          # Rail + List/Detail/Settings 뷰
   │  ├─ widget/             # FloatingWidget · dock-position
   │  ├─ theme/              # tokens.css · fonts.css · components.css
   │  └─ consent/            # 동의 배너 (현재 dormant — MVP에서 게이트 제거)
   └─ test-setup.ts       # Vitest 전역 chrome API mock
```

---

## Getting Started — Build & Load

이 저장소는 **Vite + Vitest** 기반 **Chrome MV3 확장**입니다. 빌드 산출물(`dist/`)을 Chrome에 직접 로드합니다.

```bash
npm install
npm run build          # tsc --noEmit && vite build → dist/ 산출
```

빌드 후 Chrome에 로드합니다.

1. 주소창에 `chrome://extensions` 입력
2. 우상단 **개발자 모드(Developer Mode)** 활성화
3. **압축해제된 확장 프로그램 로드(Load unpacked)** 클릭
4. 저장소 루트의 `dist/` 폴더 선택

> 개발 중에는 `npm run dev`로 Vite 개발 서버를 띄울 수 있습니다(HMR).

스크린샷과 함께 보는 사용자용 가이드: [docs/handoff/2026-07-28-extension-usage.md](docs/handoff/2026-07-28-extension-usage.md)

---

## Development & Testing

타입체크가 사실상의 게이트입니다. **ESLint 설정이 없으므로** lint는 `tsc`로 갈음합니다.

```bash
npm run dev            # Vite 개발 서버 (HMR)
npm run build          # tsc --noEmit && vite build → dist/

npm test               # Vitest watch 모드
npm run test:run       # Vitest 1회 실행
npm run test:coverage  # 커버리지 포함 실행

npx vitest run src/path/to/file.test.ts   # 단일 파일 실행
npx tsc --noEmit                          # 타입체크 (build에 포함)
```

테스트는 각 모듈 옆에 `*.test.ts(x)`로 함께 두며(co-located), `src/test-setup.ts`가 전역 `chrome` API를 mock 합니다. 컴포넌트 테스트는 `@testing-library/react` + `jsdom` 환경에서 동작합니다.

---

## Manual Verification — 수동 검증 시나리오

자동화 테스트(Vitest)로 커버되지 않는 확장 동작은 아래 시나리오로 직접 확인합니다.

1. Settings 탭에서 `serverUrl`과 `apiKey`를 입력한다. **저장 버튼은 없다** — 입력 즉시 `chrome.storage.local`에 반영된다. 세션 이름을 쓸 거면 여기서 함께 지정한다.
2. `fetch`/`XHR`를 호출하는 사이트(예: SPA)를 연다. **우측 가장자리**에 플로팅 위젯이 도킹되는지, 마우스를 올리면 슬라이드아웃되어 추적 칩과 패널 열기 버튼이 나타나는지 확인한다.
   > MVP에는 별도 동의 단계가 없습니다. `trackingEnabled`(기본 ON)이면 페이지 로드 즉시 캡처가 시작됩니다.
3. API 호출을 발생시킨다. 위젯의 배지 카운트가 증가하는지 확인한다.
4. 위젯 → **패널 열기**를 누른다. 사이드패널 `List`에 method/status/duration이 표시되는지, 행을 누르면 `Detail`에서 응답 바디가 펼쳐지는지 확인한다.
5. `List`에서 일부 호출의 체크를 해제하고 하단의 **서버로 전송** 버튼을 누른다(세션 이름은 미리 `Settings`에서 지정해둔다). 성공 토스트가 뜨고, 체크했던 호출만 이름과 함께 서버로 전송되며, 체크 해제한 호출은 List에 그대로 남는지 확인한다.
6. SPA 내부에서 이동(pushState)한다. 세션이 끊기지 않고 같은 세션에 계속 누적되는지 확인한다.
7. Settings의 **도메인 화이트리스트**에 현재 도메인이 아닌 값(예: `example.com`)을 넣는다. 위젯과 배지는 그대로지만 새 호출이 더 이상 목록에 쌓이지 않는지 확인한다. 화이트리스트는 포트를 제외한 hostname으로 매칭하므로, `localhost`를 넣으면 `localhost:3000`도 통과한다.
   > 위젯 자체를 숨기는 블랙리스트는 설정 UI에 없다. 확인하려면 storage에 직접 써야 한다:
   > `chrome.storage.local.get('settings', v => chrome.storage.local.set({settings: {...v.settings, blacklistedDomains: ['example.com']}}))`
8. 30분 이상 API 호출을 멈춘다(또는 idle alarm 트리거). 세션이 히스토리로 회전해 `pending` 상태가 되는지 확인한다.
9. 전송 실패를 유도(서버 중지 후 전송)한다. 실패 토스트(X 아이콘)가 뜨고 세션이 `failed`로 보관되는지 확인한다. (재전송 UI는 히스토리 뷰와 함께 예정 — storage의 `sessions[].transmitStatus`로 확인)
10. 서비스 워커를 reload 한다(`chrome://extensions` → reload). `currentSession`이 storage에서 복구되는지 확인한다.

---

## Known Limitation

콘텐츠 스크립트가 `fetch`/`XHR`를 패치하기 **이전에** 발생한 호출(아주 이른 페이지 로드 시점의 요청)은 캡처되지 않습니다. 이는 콘텐츠 스크립트 주입 타이밍의 구조적 한계로, 의도된 동작입니다.

---

## Tech Stack

- **Chrome Extension** — Manifest V3 (service worker · content script · side panel)
- **Build** — Vite 5 + `@crxjs/vite-plugin`
- **UI** — React 18 + TypeScript 5
- **Test** — Vitest 2 + Testing Library + jsdom + `vitest-chrome`
- **Storage** — `chrome.storage.local` (전 컨텍스트 공유 · `onStorageChanged` 구독)
