# API-to-MCP Tracker — E2E 테스트 문서

> 작성일: 2026-06-01  
> 대상 버전: v0.1.0  
> 빌드 상태: ✅ 성공 (`tsc --noEmit` + `vite build` 정상 완료)

---

## 1. 빌드 및 Chrome 로드

### 1-1. 빌드

```bash
cd ~/extension

# 의존성 설치 (최초 1회)
npm install

# 프로덕션 빌드
npm run build
```

**빌드 결과물 (`dist/` 디렉토리 구조):**

```
dist/
├── manifest.json                              # MV3 매니페스트
├── service-worker-loader.js                   # SW 진입점
├── options.html                               # 옵션 페이지
├── sidepanel.html                             # 사이드패널 페이지
├── public/
│   ├── options.html
│   └── sidepanel.html
└── assets/
    ├── injected-capture.ts-BalbEymb.js        # 페이지 main world 주입 스크립트
    ├── content-bridge.ts-CorWLLBm.js          # postMessage → runtime 브릿지
    ├── widget-host.ts-DkXqpp05.js             # 플로팅 위젯 호스트
    ├── index.ts-CQHTfTwE.js                   # Service Worker 번들
    ├── options.html-781wEiYo.js               # 옵션 UI
    ├── sidepanel.html-Dt-MlB4z.js             # 사이드패널 UI
    ├── storage--cGGDjMX.js                    # 스토리지 유틸
    ├── messages-Bfs9nNin.js                   # 메시지 타입 상수
    └── jsx-runtime-CYTrEAta.js               # React JSX 런타임
```

### 1-2. Chrome에 Extension 로드

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 토글 ON
3. **"압축해제된 확장 프로그램 로드"** 클릭
4. `~/extension/dist` 폴더 선택
5. "API-to-MCP Tracker" 카드가 목록에 표시되면 로드 완료

> **재빌드 후 적용**: `chrome://extensions`에서 해당 확장의 새로고침(↻) 아이콘 클릭

---

## 2. 단위 테스트 (자동화)

```bash
cd ~/extension

# 1회 실행
npm run test:run

# Watch 모드
npm test

# 커버리지 리포트 생성
npm run test:coverage
```

**현재 통과 상태: 16개 파일 / 68개 테스트 전부 통과**

| 테스트 파일 | 테스트 수 | 커버 영역 |
|---|---|---|
| `session-manager.test.ts` | 7 | 세션 생성·추가·로테이션 |
| `sender.test.ts` | 7 | HTTP 전송, 재시도, 지수 백오프 |
| `background/index.test.ts` | 8 | 메시지 라우터 전체 케이스 |
| `content-bridge.test.ts` | 5 | postMessage 브릿지 필터링 |
| `injected-capture.test.ts` | 4 | fetch/XHR 패치 동작 |
| `widget-host.test.ts` | 4 | 블랙리스트, Shadow DOM 마운트 |
| `FloatingWidget.test.tsx` | 4 | 위젯 렌더링·상태 표시 |
| `SessionHistory.test.tsx` | 4 | 세션 히스토리 목록·재전송 버튼 |
| `CaptureList.test.tsx` | 3 | 캡처 목록 렌더링·행 확장 |
| `SendButton.test.tsx` | 3 | 전송 버튼 상태·인터랙션 |
| `Settings.test.tsx` | 2 | 설정 폼 저장 |
| `ConsentBanner.test.tsx` | 4 | 동의 배너 표시·승인 흐름 |
| `McpTable.test.tsx` | 3 | MCP 서버 목록 렌더링 |
| `messages.test.ts` | 3 | 메시지 타입 상수 |
| `types.test.ts` | 3 | 타입 기본값 검증 |
| `storage.test.ts` | 4 | 스토리지 get/patch |

---

## 3. E2E 수동 테스트 시나리오

> 사전 조건: Chrome에 확장 로드 완료, MCP 서버가 로컬 또는 원격에서 실행 중

---

### 시나리오 1 — 초기 설정 저장

**목적**: Options 페이지에서 서버 URL과 API Key가 정상 저장되는지 확인

**단계:**
1. 확장 아이콘 우클릭 → **"옵션"** 열기 (또는 `chrome://extensions` → "세부정보" → "확장 프로그램 옵션")
2. **Settings** 탭 선택
3. `Server URL` 필드에 MCP 서버 주소 입력 (예: `http://localhost:3000`)
4. `API Key` 필드에 인증 키 입력
5. **저장** 버튼 클릭

**기대 결과:**
- 저장 성공 토스트/메시지 표시
- 페이지 새로고침 후에도 입력값 유지 (chrome.storage.local에 영속)

---

### 시나리오 2 — 플로팅 위젯 표시

**목적**: SPA 방문 시 플로팅 위젯이 정상 마운트되는지 확인

**단계:**
1. `fetch`/XHR API 호출이 있는 SPA 접속 (예: `https://www.github.com`, `https://www.notion.so`)
2. 페이지 로드 완료 후 화면 우측 하단 확인

**기대 결과:**
- 파란색 원형 플로팅 위젯 표시
- 위젯에 현재 캡처된 호출 수 배지(숫자) 표시

> **미표시 시 체크**: Options → Settings → "추적 활성화" 토글 ON 여부 확인

---

### 시나리오 3 — API 호출 캡처

**목적**: fetch/XHR 호출이 캡처되어 배지 카운트가 올라가는지 확인

**단계:**
1. 시나리오 2에서 위젯이 표시된 페이지에서 계속 진행
2. 페이지 내에서 데이터 로딩, 검색, 스크롤 등 API를 유발하는 동작 수행
3. 위젯 배지 숫자 관찰

**기대 결과:**
- API 호출이 발생할 때마다 배지 숫자 증가
- `fetch`와 XHR 양방향 모두 캡처됨

> **알려진 제한**: 페이지 초기 로드 시 Content Script 주입 전에 발생한 호출은 캡처되지 않음 (설계상 한계)

---

### 시나리오 4 — 사이드패널 호출 목록 확인

**목적**: 캡처된 API 호출이 사이드패널에 올바르게 표시되는지 확인

**단계:**
1. 플로팅 위젯 클릭
2. **"패널 열기"** 선택
3. 사이드패널이 열리면 캡처된 호출 목록 확인
4. 목록의 개별 행 클릭

**기대 결과:**
- 각 행에 메서드(GET/POST 등), 상태 코드, 소요 시간 표시
- 행 클릭 시 응답 바디 내용이 확장되어 표시

---

### 시나리오 5 — 세션 서버 전송

**목적**: "전송" 버튼이 현재 세션을 MCP 서버로 성공적으로 전송하는지 확인

**단계:**
1. 사이드패널에서 **"이 세션 전송 (N개 호출)"** 버튼 클릭
2. Options 페이지의 **"MCP 서버 목록"** 탭 확인

**기대 결과:**
- 버튼이 성공 상태로 전환 (스피너 → 완료 표시)
- Options "MCP 서버 목록" 탭이 **페이지 새로고침 없이** 자동 업데이트 (`storage.onChanged` 이벤트 기반)
- 서버에서 반환된 MCP 엔드포인트가 목록에 추가됨

---

### 시나리오 6 — SPA 내비게이션 시 세션 로테이션

**목적**: SPA 라우팅 이벤트 발생 시 새 세션이 시작되는지 확인

**단계:**
1. SPA 내에서 다른 페이지로 이동 (링크 클릭, 브라우저 뒤로/앞으로 이동)
2. 플로팅 위젯의 배지 숫자 관찰

**기대 결과:**
- 페이지 이동 직후 배지 숫자가 **0으로 리셋**
- 이전 세션은 `pending` 상태로 세션 히스토리에 저장됨
- `pushState`, `replaceState`, `popstate`, `beforeunload` 이벤트 모두 로테이션 트리거

---

### 시나리오 7 — 도메인 블랙리스트

**목적**: 블랙리스트에 추가된 도메인에서 위젯이 표시되지 않는지 확인

**단계:**
1. Options → Settings → **"블랙리스트 도메인"** 에 현재 방문 중인 도메인 추가 (예: `github.com`)
2. 해당 도메인 페이지 새로고침

**기대 결과:**
- 플로팅 위젯이 표시되지 않음
- API 호출이 캡처되지 않음
- 서브도메인도 차단됨 (예: `api.github.com` → `github.com` 블랙리스트로 차단)

---

### 시나리오 8 — 유휴 타임아웃으로 자동 세션 종료

**목적**: 30분간 API 호출이 없을 때 세션이 자동으로 아카이브되는지 확인

**방법 A — 실제 대기 (30분):**
1. API 호출이 없는 상태로 30분 이상 대기
2. Options → "세션 기록" 탭 확인

**방법 B — chrome.alarms 강제 발동 (빠른 테스트):**
1. `chrome://extensions` → "API-to-MCP Tracker" → **"서비스 워커 검사"** 클릭 (DevTools 열기)
2. Console에서 실행:
   ```js
   chrome.alarms.create('idle-timeout', { when: Date.now() + 100 })
   ```
3. 100ms 후 Options "세션 기록" 확인

**기대 결과:**
- 현재 세션이 `pending` 상태로 세션 히스토리에 이동
- 새 빈 세션이 자동 생성됨

---

### 시나리오 9 — 실패한 세션 재전송

**목적**: 전송에 실패한 세션을 수동으로 재시도할 수 있는지 확인

**단계:**
1. 잘못된 `serverUrl` 설정 후 세션 전송 → `failed` 상태 세션 생성
2. 올바른 `serverUrl`로 설정 복원
3. Options → **"세션 기록"** 탭에서 `failed` 상태 세션 확인
4. 해당 세션의 **재전송** 버튼 클릭

**기대 결과:**
- 세션 상태가 `failed` → `sent`로 변경
- 전송 성공 시 MCP 서버 목록에 엔트리 추가

---

### 시나리오 10 — Service Worker 재시작 후 세션 복구

**목적**: SW가 재시작되어도 `currentSession`이 스토리지에서 복구되는지 확인

**단계:**
1. 일부 API 호출 캡처 (배지 숫자 > 0 확인)
2. `chrome://extensions` → "API-to-MCP Tracker" → **새로고침(↻)** 아이콘 클릭 (SW 재시작)
3. 사이드패널 확인

**기대 결과:**
- SW 재시작 후에도 이전 캡처 데이터가 사이드패널에 유지됨
- `chrome.storage.local`에서 `currentSession` 복구 완료

---

### 시나리오 11 — 동의(Consent) 플로우

**목적**: 미동의 상태에서 캡처가 차단되고, 동의 후 정상 작동하는지 확인

**단계:**
1. `chrome.storage.local`에서 `settings.consentGivenAt` 값 삭제 (초기 상태 재현)
   ```js
   // SW DevTools Console에서 실행
   chrome.storage.local.remove('settings')
   ```
2. 페이지 새로고침

**기대 결과:**
- 동의 배너(ConsentBanner) 표시
- 동의 전: API 호출 캡처되지 않음, 위젯은 일시정지 상태 표시
- **동의 클릭** 후: 캡처 스크립트 주입, 정상 캡처 시작

---

## 4. 오류 케이스 테스트

| 케이스 | 재현 방법 | 기대 동작 |
|---|---|---|
| `serverUrl` 미설정 | Settings 비워두고 전송 | "serverUrl is not configured" 에러 메시지 |
| 401 Unauthorized | 잘못된 `apiKey` 사용 | "Check your API Key in Settings." 안내 표시 |
| 404 Not Found | 잘못된 `serverUrl` 경로 | "Check your Server URL in Settings." 안내 표시 |
| 서버 500 오류 | 서버 다운 상태에서 전송 | 최대 3회 재시도 후 `failed` 상태, "Server may be temporarily unavailable." |
| 네트워크 오프라인 | Wi-Fi 끊고 전송 | 3회 재시도 후 "서버에 연결할 수 없습니다." 메시지 |

---

## 5. 재시도 정책 (백오프)

`sender.ts`에 구현된 지수 백오프:

| 시도 횟수 | 대기 시간 |
|---|---|
| 1회 (즉시) | 0ms |
| 2회 | 500ms |
| 3회 | 1,000ms |
| 이후 | `failed` 상태 저장 |
