# API-to-MCP Tracker — E2E 테스트 문서

> 작성일: 2026-07-28 (수집 탭 통합 리팩터 반영 재작성)
> 대상 버전: v0.1.0 (worktree: `collect-tab-consolidation`)
> 빌드 상태: ✅ 성공 (`tsc --noEmit` + `vite build` 정상 완료)

이 문서는 `docs/test/e2e_test.md`(2026-06-01 작성본)를 현재 코드 기준으로 다시 쓴 것이다.
Options 페이지 삭제, 전송 탭 통합, 세션 경계 정책 변경 등 구조적인 변경이 있었으므로
이전 시나리오를 부분 수정하는 대신 전체를 다시 검증했다.

---

## 1. 빌드 및 Chrome 로드

### 1-1. 빌드

```bash
cd <저장소 루트>
npm install        # 최초 1회
npm run build       # tsc --noEmit && vite build → dist/
```

**빌드 결과물 (`dist/` 디렉토리 구조, 해시는 빌드마다 바뀜):**

```
dist/
├── manifest.json                       # MV3 매니페스트
├── service-worker-loader.js            # SW 진입점
├── sidepanel.html                      # (crxjs 산출 — 미사용 루트 사본)
├── public/
│   └── sidepanel.html                  # 실제 side_panel.default_path
└── assets/
    ├── content-bridge.ts-*.js
    ├── content-bridge.ts-loader-*.js
    ├── widget-host.ts-*.js             # 위젯 마운트 + 화이트/블랙리스트 게이트
    ├── widget-host.ts-loader-*.js
    ├── injected-capture.ts-*.js        # 페이지 main world 주입 스크립트
    ├── index.ts-*.js                   # Service Worker 번들
    ├── sidepanel.html-*.js             # 사이드패널 UI 번들
    ├── storage-*.js
    ├── messages-*.js
    ├── sidepanel-*.css
    └── jsx-runtime-*.js
```

**옵션 페이지는 존재하지 않는다.** `options.html`은 v0.1.0 초기 구현에만 있었고 이후 삭제됐다 —
서버 URL/API Key/세션 이름/캡처 필터 등 모든 설정은 사이드패널 **설정** 탭 하나로 통합되어 있다.
`manifest.json`에도 `options_page`/`options_ui` 키가 없다.

### 1-2. Chrome에 Extension 로드

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 토글 ON
3. **"압축해제된 확장 프로그램 로드"** 클릭 → 저장소 루트의 `dist/` 폴더 선택
4. "API-to-MCP Tracker" 카드가 목록에 표시되면 로드 완료

> **재빌드 후 적용**: `chrome://extensions`에서 해당 확장의 새로고침(↻) 아이콘 클릭

---

## 2. 자동화 테스트 (Vitest)

```bash
cd <저장소 루트>
npm run test:run        # 1회 실행
npm test                # watch 모드
npm run test:coverage   # 커버리지 리포트
```

**현재 통과 상태: 22개 파일 / 183개 테스트 전부 통과** (`npm run test:run`으로 실측, 2026-07-28)

이전 문서의 "16개 파일 / 68개 테스트"는 v0.1.0 초기 기준이며 더 이상 정확하지 않다.
`ConsentBanner.test.tsx`(동의 배너, 4개)는 여전히 존재하지만 배너 자체가 활성 코드 경로에서
쓰이지 않는다 — 아래 3절 참고. `SessionHistory.test.tsx`, `McpTable.test.tsx`는 해당 컴포넌트가
아직 구현되지 않아 존재하지 않는다.

| 테스트 파일 | 테스트 수 | 커버 영역 |
|---|---|---|
| `background/index.test.ts` | 30 | 메시지 라우터(`handleMessage`) 전체 케이스, write-lock 직렬화 |
| `background/session-manager.test.ts` | 21 | `appendCall`/`rotateSession`/`splitAndArchive`, 캡처 필터, 화이트리스트 |
| `background/sender.test.ts` | 9 | HTTP 전송, 재시도·지수 백오프, 에러 메시지 포맷 |
| `ui/sidepanel/ListView.test.tsx` | 13 | 목록 렌더링, 체크박스, 검색 필터 |
| `ui/widget/FloatingWidget.test.tsx` | 11 | 위젯 렌더링·상태·드래그 |
| `ui/sidepanel/view-utils.test.ts` | 11 | URL 파싱 유틸(`hostOf`/`pathOf`/`originOf` 등) |
| `ui/sidepanel/index.test.tsx` | 10 | Panel 조립, 전송 흐름, 토스트 |
| `ui/sidepanel/SummaryBar.test.tsx` | 10 | 요약 카드 접기/펼치기, 전체 선택 체크박스 |
| `content/widget-host.test.ts` | 9 | 블랙리스트 게이트, Shadow DOM 마운트, 재주입 관찰 |
| `shared/types.test.ts` | 9 | 스토리지 스키마 기본값 검증 |
| `content/injected-capture.test.ts` | 6 | fetch/XHR 패치, URL 절대화 |
| `shared/domain-match.test.ts` | 6 | 화이트리스트 도메인 패턴 매칭 |
| `content/content-bridge.test.ts` | 5 | postMessage → runtime 브릿지, origin 검증 |
| `shared/messages.test.ts` | 5 | 메시지 타입 상수 |
| `ui/sidepanel/DetailView.test.tsx` | 5 | 상세 뷰 렌더링, 복사 버튼 |
| `shared/storage.test.ts` | 4 | 스토리지 get/patch |
| `ui/sidepanel/SettingsView.test.tsx` | 4 | 설정 폼 즉시 반영 |
| `ui/widget/dock-position.test.ts` | 4 | 위젯 도킹 위치 영속 |
| `ui/consent/ConsentBanner.test.tsx` | 4 | 배너 컴포넌트 단독 렌더링 (미사용 경로) |
| `ui/sidepanel/Rail.test.tsx` | 4 | 탭 전환, disabled 탭 |
| `ui/sidepanel/port.test.ts` | 2 | 사이드패널 포트 연결 |
| `ui/sidepanel/CopyBtn.test.tsx` | 1 | 복사 버튼 |

---

## 3. E2E 수동 테스트 시나리오

> 사전 조건: Chrome에 확장 로드 완료, MCP 서버가 로컬 또는 원격에서 실행 중.
> 4절의 "E2E 자동화 실행 방법"을 쓰면 아래 시나리오 대부분을 헤드리스 없이 스크립트로 재현할 수 있다.

---

### 시나리오 1 — 설정 저장 (사이드패널 설정 탭)

**목적**: 서버 URL·API Key·세션 이름이 저장 버튼 없이 즉시 영속되는지 확인

**단계:**
1. 위젯 클릭(또는 확장 아이콘 클릭)으로 사이드패널 열기
2. Rail의 **설정** 탭 클릭
3. `업로드 엔드포인트`, `인증 토큰 (선택)`, `세션 이름 (선택)` 필드에 값 입력

**기대 결과:**
- 저장 버튼이 없다 — 각 필드는 `onChange`마다 `patchStorage`로 즉시 반영된다
- 사이드패널을 닫았다 열어도 입력값 유지 (`chrome.storage.local`에 영속)
- 세션 이름을 비워두면 전송 페이로드에서 `name` 필드 자체가 생략된다(값이 `undefined`일 때
  `JSON.stringify`가 필드를 생략하는 것을 이용 — `sender.ts`)

> 이전 문서는 "Options → Settings 탭"을 지칭했으나 Options 페이지는 삭제되어 존재하지 않는다.

---

### 시나리오 2 — 플로팅 위젯 표시 및 추적 토글

**목적**: 위젯이 정상 마운트되고 추적 on/off가 캡처를 게이팅하는지 확인

**단계:**
1. `fetch`/XHR 호출이 있는 페이지 접속
2. 화면 우측 가장자리 확인 (세로 위치는 드래그로 조정 가능, `dock-position`에 영속)
3. 위젯에 마우스를 올려 슬라이드아웃되는 칩(추적 중지/시작) 확인
4. 칩 클릭으로 추적을 끄고, 페이지에서 API 호출 유발 후 배지 숫자 관찰
5. 다시 칩을 클릭해 추적 재개

**기대 결과:**
- 원형 위젯 + 좌상단 배지(숫자 = 현재 세션 캡처 건수) 표시
- 추적 OFF 상태에서는 배지가 증가하지 않음 (`TOGGLE_TRACKING` → `settings.trackingEnabled`가
  `API_CAPTURED` 처리의 유일한 게이트)
- 위젯 본체 클릭은 **메뉴 없이 바로** 사이드패널을 연다(`OPEN_SIDEPANEL` 메시지, `widget-button`)

> **주의**: 위젯 표시 자체는 `blacklistedDomains`로만 억제된다. 하지만 이 설정을 채울 UI가
> 없다 — 3-5절 참고.

---

### 시나리오 3 — API 호출 캡처 및 주입 타이밍 한계

**목적**: fetch/XHR 캡처 파이프라인 동작과 알려진 주입 타이밍 한계를 확인

**단계:**
1. 시나리오 2의 페이지에서 데이터 로딩·검색 등 API를 유발하는 동작 수행
2. 사이드패널 **수집** 탭에서 목록 증가 관찰
3. (한계 재현) `<head>`의 인라인 `<script>`에서 동기적으로 실행되는 `fetch` 호출을 만들고,
   해당 호출이 캡처되는지 확인

**기대 결과:**
- fetch와 XHR 양방향 모두 캡처됨, 배지·목록 숫자 동시 증가
- 상대경로 호출(`fetch('/api/x')`)도 캡처 시점에 절대 URL로 정규화되어 저장됨
  (`injected-capture.ts`의 `absolutize`)
- **확인된 한계**: `<head>`에서 페이지 로드 중 동기 실행되는 `fetch`는 정상 완료되지만 캡처되지
  않는다. `widget-host.ts`의 `init()`이 `chrome.storage.local` 조회(비동기) 이후에야 캡처
  스크립트를 `<script>` 태그로 주입하므로, `document_start`에 실행되는 content script보다도
  더 이른 시점(head 파싱 중 동기 스크립트)의 호출은 주입 완료 전에 이미 끝나 있다.

---

### 시나리오 4 — 사이드패널 목록·상세 뷰

**목적**: 캡처된 호출이 목록/상세 뷰에 올바르게 표시되는지 확인

**단계:**
1. 사이드패널 **수집** 탭에서 캡처된 호출 목록 확인
2. 검색창에 경로 일부 또는 메서드(`get`, `post` 등) 입력해 필터링 확인
3. 목록의 행 클릭

**기대 결과:**
- 각 행에 메서드 배지, 경로, 상태 코드, 호스트, 소요시간(ms), 응답 크기(B), 캡처 시각 표시
- 검색은 경로(`pathOf`)와 메서드 소문자 부분일치로 필터링
- 행 클릭 시 상세 뷰로 전환: 본문(JSON 하이라이트)/응답 헤더/요청 헤더 탭, 본문·URL·cURL 복사
  버튼 제공. origin 표기는 실제 스킴을 그대로 반영(`originOf`) — 하드코딩된 `https://` 아님
- 행 hover/포커스 시 개별 삭제 버튼(휴지통 아이콘) 노출, 클릭 시 `DELETE_CALL` 전송

---

### 시나리오 5 — 도메인 화이트리스트 필터링 (포트 제외 hostname)

**목적**: 화이트리스트가 포트를 무시한 hostname으로 매칭되는지 확인

**단계:**
1. 설정 탭 `도메인 화이트리스트`에 `localhost` 입력 (콤마 구분, 비우면 전체 캡처)
2. `http://localhost:4599`에서 서비스를 띄우고 API 호출 유발 → 캡처 여부 확인
3. 같은 서비스를 `http://127.0.0.1:4599`로 접속해 API 호출 유발 → 캡처 여부 확인

**기대 결과:**
- `localhost:4599` 호출은 **캡처됨** — `session-manager.ts`가 `new URL(call.url).hostname`
  (포트 제외)으로 매칭하므로 `localhost` 패턴과 일치
- `127.0.0.1:4599` 호출은 **드롭됨** — hostname이 `127.0.0.1`이라 `localhost` 패턴과 불일치
- 화이트리스트는 `*.example.com` 같은 리딩 와일드카드 패턴도 지원(`matchDomain`)

> 블랙리스트(서브도메인 차단 등)를 다루는 이전 문서의 "시나리오 7"은 드롭했다 — 아래
> "드롭된 시나리오" 절 참고.

---

### 시나리오 6 — 중복 제거(dedupe, 경로 기준)

**목적**: `dedupe` 설정이 URL 경로(쿼리 제외, 메서드 무관)를 키로 마지막 응답만 남기는지 확인

**단계:**
1. 설정 탭에서 `동작 → 중복 URL 제외` 토글 ON
2. 같은 경로에 대해 `GET /api/items`, `POST /api/items`를 순서대로 호출
3. 목록 확인

**기대 결과:**
- 두 호출이 하나로 collapse되어 목록에는 **마지막에 도착한 것 하나만** 남음
- dedupe 키는 pathname만 사용하므로(`safePath` = `new URL(url).pathname`) 메서드가 달라도
  같은 키로 취급된다 — "메서드까지 구분해서 유지될 것"이라는 직관과 다르므로 주의
- 쿼리스트링이 다른 같은 경로 호출(`/api/items?page=1` vs `?page=2`)도 동일하게 collapse됨

---

### 시나리오 7 — 요약 카드(SummaryBar) 접기/펼치기

**목적**: 수집 탭 상단 요약 카드가 접힌/펼친 상태에서 올바른 정보를 보여주는지 확인

**단계:**
1. 여러 건 캡처 후 접힌 요약 카드 확인
2. `⌄` 버튼 클릭으로 펼치기
3. 사이드패널을 실제 폭(408px)에 가깝게 두고, 대상 서버 호스트를 짧은 것/긴 것으로 각각 설정해
   비교

**기대 결과:**
- 접힌 상태: `N/M건 · X.XKB · host` 한 줄 (`N`=선택된 호출 수, `M`=전체 수, KB=선택된 호출의
  응답 바디 합계, host=`settings.serverUrl`의 host)
- 펼친 상태: 메서드별 분포 바(GET/POST/… 비율), `이름`(세션 이름, 비어있으면 "이름 없음"),
  `대상`(`POST {serverUrl}`, 미설정 시 "(미설정)")
- 왼쪽 체크박스는 전체 선택 토글이며 `N === M`일 때만 체크된 것으로 표시
- **실측**: 408px 패널 폭에서 요약 행의 텍스트 가용 폭은 약 263px. 33자 host는 잘리지 않고
  전체가 렌더링되고, 50자 host는 끝부분이 잘린다 (`.sumbar-stat`의
  `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`)

---

### 시나리오 8 — 체리픽 전송

**목적**: 체크박스로 선택한 호출만 전송되고, 미선택분은 새 세션에 남는지 확인

**단계:**
1. 5건 이상 캡처된 상태에서 목록의 일부 행 체크 해제(전송 대상에서 제외)
2. 요약 카드에서 `선택 건수/전체 건수` 확인
3. 하단 **서버로 전송** 버튼 클릭 (버튼 라벨의 pill 숫자 = 선택된 건수)

**기대 결과:**
- 전송 성공 시: 체크된 호출들만 `pending`으로 아카이브된 뒤 서버 응답에 따라 `sent`로 갱신,
  세션 이름은 설정 탭의 `sessionName`을 전송 시점에 그대로 읽어 붙는다(UI가 이름을 실어 보내지
  않음 — 메시지는 `SEND_CURRENT_SESSION { callIds }`뿐)
- 체크 해제했던(미선택) 호출은 **삭제되지 않고** 새로 생성된 현재 세션에 그대로 남아 계속
  누적·전송 가능
- 전송 후 토스트: 성공 시 "N건을 서버로 전송했습니다", 실패 시 "전송 실패 — N건은 히스토리에
  보관됨: {에러 메시지}" (단, 아무것도 선택하지 않아 `no calls selected`가 반환된 경우는
  "보관됨" 문구 없이 "전송 실패: no calls selected"만 표시 — 실제로 아카이브된 게 없기 때문)
- 응답의 `mcpServers`는 기존 `mcpList`와 id 기준으로 병합됨(`mergeMcpList`)

> **전송 탭은 더 이상 없다.** 이전 별도의 전송(Send) 뷰가 삭제되고, 그 요약이 수집 탭 상단의
> 접이식 카드로 흡수되었으며 전송 버튼은 수집 탭 하단으로 이동했다(`ListView.tsx` `pfoot`).

---

### 시나리오 9 — 세션 경계: idle 타임아웃

**목적**: 30분간 활동이 없을 때 현재 세션이 자동으로 `pending`으로 아카이브되는지 확인

**방법 A — 실제 대기 (30분):** API 호출 없이 30분 이상 대기

**방법 B — 알람 강제 발동 (사이드패널 탭에서, DevTools 불필요):**
```js
chrome.alarms.create('idle-timeout', { when: Date.now() + 100 })
```
사이드패널이 열려 있으면 확장 컨텍스트의 `chrome` 네임스페이스에 접근 가능하므로, 서비스
워커 DevTools를 열지 않고도 패널의 콘솔에서 이 호출을 실행해 알람을 앞당길 수 있다.

**기대 결과:**
- 알람 발동 시 `rotateSession`이 호출되어 현재 세션 전체가 `sessions[]`에 `pending`으로
  이동, 새 빈 세션이 즉시 생성됨
- idle 타이머는 `API_CAPTURED`와 `SESSION_CHANGE`(SPA 내비게이션) 양쪽 모두로 리셋된다 —
  즉 페이지 이동이 있으면 idle 타이머가 오히려 늘어난다(시나리오 11 참고)

---

### 시나리오 10 — 세션 경계: 자동 전송 임계치(50건)

**목적**: `autoSend` 활성 시 50번째 호출에서 자동 전송이 발동하는지 확인

**단계:**
1. 설정 탭에서 `동작 → 자동 전송` 토글 ON
2. 동일 대상에 51건 이상의 API 호출을 연속 유발

**기대 결과:**
- 정확히 50번째 호출이 추가되는 시점(`AUTO_SEND_THRESHOLD = 50`)에 자동 전송이 발동 —
  49건까지는 발동하지 않음
- 그 세션(50건 전체)이 `rotateSession`으로 즉시 아카이브되고 전송되어 성공 시 `sent`로 표시
- 전송과 동시에 새 빈 세션이 생성되고, 51번째 이후의 호출은 그 새 세션에 다시 쌓이기 시작함

---

### 시나리오 11 — 세션 경계: SPA 내비게이션은 세션을 끊지 않음 (회귀 방지)

**목적**: URL 변경이 세션을 로테이션하지 않는지 확인 — 이전 문서(시나리오 6)와 정반대의 현재 동작

**단계:**
1. SPA에서 API 호출을 캡처한 뒤 다른 라우트로 이동(`pushState`) 또는 브라우저 뒤로가기
   (`popstate`)
2. 사이드패널/위젯의 캡처 건수 관찰

**기대 결과:**
- **건수가 리셋되지 않는다.** 이전 세션의 호출이 그대로 유지된 채 새 호출이 계속 누적됨
- `pushState`/`replaceState`/`popstate`/`beforeunload`는 모두 `SESSION_CHANGE` 메시지를
  보내지만, 백그라운드는 이를 세션 회전 신호가 아니라 **idle 타이머 리셋(활동 신호)** 으로만
  처리한다(`background/index.ts`의 `SESSION_CHANGE` 케이스는 상태를 그대로 반환)
- 세션 경계는 idle 타임아웃, 추적 토글, 수동 전송(체리픽) 세 가지로만 결정된다

> 이전 문서는 "배지가 0으로 리셋되고 이전 세션이 pending으로 저장된다"고 기술했으나 이는
> `docs/solutions/logic-errors/session-change-as-keepalive-not-boundary.md`에 기록된 의도적
> 정책 변경으로 더 이상 사실이 아니다.

---

### 시나리오 12 — Service Worker 재시작 후 세션 복구

**목적**: SW가 재시작되어도 `currentSession`이 스토리지에서 복구되는지 확인

**단계:**
1. 일부 API 호출 캡처(건수 > 0 확인)
2. `chrome://extensions` → "API-to-MCP Tracker" → 새로고침(↻) 아이콘 클릭 (SW 재시작)
3. 사이드패널 확인

**기대 결과:**
- SW 재시작 후에도 이전 캡처 데이터가 사이드패널에 유지됨(`chrome.storage.local`에서 복구)
- 사이드패널이 열려 있던 탭 추적(`openTabs`)은 인메모리라 SW 재시작으로 초기화되지만, 패널이
  재연결하며 포트를 다시 등록해 복구됨(`registerPort`)

---

## 4. 오류 케이스 테스트 (실측 메시지)

아래 문구는 실제 E2E 실행에서 그대로 캡처한 값이다(2026-07-28).

| 케이스 | 재현 방법 | 실제 반환 메시지 |
|---|---|---|
| `serverUrl` 미설정 | 설정 비워두고 전송 | `serverUrl is not configured` |
| 401 Unauthorized | 잘못된 `apiKey`로 전송 | `Server error 401: … Check your API Key in Settings.` |
| 404 Not Found | 잘못된 `serverUrl` 경로로 전송 | `Server error 404: … Check your Server URL in Settings.` |
| 네트워크 오프라인/연결 불가 | 서버가 응답하지 않는 상태에서 전송 | `서버에 연결할 수 없습니다. Server URL과 네트워크 연결을 확인하세요. (Failed to fetch)` |
| 선택 없이 전송 | 목록의 모든 체크를 해제한 채 전송 버튼 클릭 | `no calls selected` (전송 버튼은 `selectedCalls.length === 0`이면 disabled이므로 UI에서는
사실상 도달 불가 — 메시지를 직접 보낼 때만 재현됨) |

5xx 응답은 위 401/404와 같은 포맷에 `Server may be temporarily unavailable.` 문구가 덧붙는다
(`sender.ts`).

---

## 5. 재시도 정책 (백오프) — 실측치 포함

`sender.ts`의 `backoffDelayMs(attempt) = 500 * 2 ** attempt`. 최대 3회 시도 후 `failed`.

| 시도 | 시도 전 대기(스펙) | 실측 대기 | 비고 |
|---|---|---|---|
| 1회 | 0ms (즉시) | 0ms | |
| 2회 | 500ms | 502ms | `backoffDelayMs(0)` |
| 3회 | 1,000ms | 1,007ms | `backoffDelayMs(1)` |
| 이후 | — | — | `failed` 상태로 저장, 호출 데이터는 유실되지 않음(세션은 히스토리에 남음) |

실측값(502ms/1007ms)은 스펙값(500ms/1000ms)과 수 ms 오차 범위 내로 일치 — `setTimeout`
스케줄링 오버헤드 수준이며 회귀는 아니다.

---

## 6. E2E 자동화 실행 방법

이 확장은 `chrome.sidePanel`을 자동화 도구가 직접 열 수 없어 몇 가지 우회가 필요하다. 아래는
실제로 검증된 절차다.

### 6-1. 실행

```bash
agent-browser --session <name> --headed --extension "$PWD/dist" open <url>
```

- 이 호스트에서는 **헤드리스 스크린샷이 멈춘다** — 반드시 다음 플래그로 실행:
  `--args "--disable-gpu,--use-gl=swiftshader,--disable-gpu-compositing"`
  (`docs/solutions/testing/cdp-screenshot-hangs-when-display-asleep.md` 참고)

### 6-2. 사이드패널 열기 우회

`chrome.sidePanel`은 자동화가 직접 열 수 없으므로, 주입된 캡처 스크립트의 `src`에서 확장
ID를 읽어 `sidepanel.html`을 일반 탭으로 연다:

```js
document.getElementById('__api-tracker-capture__').src
// → chrome-extension://<ID>/assets/injected-capture.ts-*.js 형태에서 <ID> 추출
```

추출한 ID로 `chrome-extension://<ID>/public/sidepanel.html`을 새 탭에서 열면 사이드패널과
동일한 React 앱이 렌더링된다(진짜 사이드패널 슬롯은 아니지만 로직·스토리지 구독은 동일).

### 6-3. React 컨트롤드 인풋 값 설정

패널의 입력 필드는 React 컨트롤드 컴포넌트다. 자동화 도구의 단순 `fill`(값만 대입)은 React의
내부 `value` 트래킹을 갱신하지 못해 `onChange`가 발생하지 않는다. 네이티브 value setter를
직접 호출하고 `input` 이벤트를 디스패치해야 한다:

```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
setter.call(inputEl, '새 값')
inputEl.dispatchEvent(new Event('input', { bubbles: true }))
```

### 6-4. eval 컨텍스트 재사용 주의

자동화 도구의 `eval`은 컨텍스트가 호출 간에 유지된다 — 매 호출을 IIFE로 감싸지 않으면 이전
호출에서 선언한 변수/함수와 충돌한다. 모든 eval 스니펫을 `(() => { ... })()`로 감쌀 것.

### 6-5. 토스트는 증거로 쓰지 않는다

전송 성공/실패 토스트는 약 2.2초 후 사라진다(`setTimeout(() => setToast(null), 2200)`,
`ui/sidepanel/index.tsx`). 스크린샷 타이밍이 어긋나면 놓치므로, 확실한 검증이 필요할 때는
토스트 텍스트 대신 `chrome.storage.local.get(['sessions', 'currentSession'])`으로 실제 상태
전이를 직접 읽는다.

---

## 7. 드롭된 시나리오 (더 이상 유효하지 않음)

다음은 이전 문서에 있었지만 현재 코드베이스에서 재현할 대상이 없어 제외했다:

- **Options 페이지 전반** (초기 설정, MCP 서버 목록, 세션 기록 탭) — Options 페이지 자체가
  삭제됨. 서버 설정은 사이드패널 설정 탭, MCP 목록/세션 기록은 Rail에 `disabled` 탭으로만
  존재(아래 항목 참고)
- **도메인 블랙리스트 UI 시나리오** — `blacklistedDomains`는 스키마와 `widget-host.ts`
  (`isBlacklisted`)에 로직이 남아 있지만 이를 채우는 입력 필드가 없다. 설정 탭에는 화이트리스트
  필드만 존재한다. UI가 추가되면 이 시나리오를 복원할 것
- **동의(Consent) 플로우** — MVP에서 동의 게이트가 제거됐다. `ConsentBanner` 컴포넌트와 테스트,
  `settings.consentGivenAt` 필드는 남아 있지만 어떤 활성 코드 경로에서도 참조되지 않는다.
  캡처는 `trackingEnabled` 하나로만 게이팅된다
- **실패 세션 재전송 버튼** — 히스토리 뷰(Rail의 "히스토리" 탭)는 `disabled`다. `failed`
  세션은 여전히 `sessions[]`에 보관되지만 UI에서 재조회·재전송할 방법이 없다.
  `SEND_SESSION { sessionId }` 메시지 자체는 핸들러에 남아 있어(향후 히스토리 뷰가 재전송에
  쓸 예정) 콘솔에서 직접 보내면 동작은 확인 가능하다

---

## 8. 알려진 제약 (요약)

- 콘텐츠 스크립트/캡처 스크립트 주입 이전(페이지 최초 로드의 아주 이른 시점)의 호출은 캡처되지
  않는다 (3절 시나리오 3)
- MCP 목록·히스토리 뷰는 Rail에 탭만 있고 `disabled` 상태다("준비 중")
- 도메인 블랙리스트, 동의 플로우는 스키마/로직은 남아 있으나 UI에서 도달 불가능하다
- 세션 경계는 idle 타임아웃(30분) · 추적 토글 · 수동 전송(체리픽)으로만 결정된다 — URL 이동은
  더 이상 트리거가 아니다
