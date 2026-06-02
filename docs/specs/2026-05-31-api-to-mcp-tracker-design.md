# Design Spec: API-to-MCP Tracker Chrome Extension

**Date:** 2026-05-31
**Source:** `docs/interviews/2026-05-31-api-to-mcp-tracker.md`

---

## 1. 개요

사용자가 임의의 웹사이트를 탐색할 때 발생하는 REST API 호출을 자동 캡처하여 서버로 전송하고, 서버가 생성한 MCP 서버 목록을 Extension UI에서 시각화하는 Chrome Extension.

**핵심 결정 사항 요약**

| 항목 | 결정 |
|---|---|
| 플랫폼 | Chrome Manifest V3 |
| 기술 스택 | React + TypeScript + Vite |
| 아키텍처 패턴 | 하이브리드 (Background SW 비즈니스 로직 + chrome.storage 상태 영속화) |
| 전송 방식 | 수동 (SidePanel 전송 버튼) |
| 대시보드 위치 | Extension 옵션 페이지 |
| 서버 인증 | 고정 엔드포인트 + API Key |

---

## 2. 범위

**포함**
- Chrome MV3 Extension 전체 F/E
- Content Script의 `fetch` / `XMLHttpRequest` monkey-patch (main world 주입)
- History API (`pushState` / `replaceState` / `popstate` / `beforeunload`) 감지로 URL 세션 경계 식별
- URL 세션 단위 API 호출 묶음 → 수동 서버 전송
- Floating widget (Shadow DOM 격리, MutationObserver 재주입)
- SidePanel: 실시간 캡처 리스트 + 수동 전송 버튼
- Options Page: MCP 리스트 테이블 / 세션 기록 / 설정 3탭
- 트래킹 ON/OFF, 도메인 블랙리스트

**제외 (v2 이후)**
- 백엔드 MCP 변환 로직
- iframe / Service Worker / Web Worker 내부 호출 캡처
- 응답 body PII 자동 마스킹
- AI 화면 조작 기능

---

## 3. 아키텍처

### 3.1 레이어 구성

```
┌──────────────────────────────────────────────────────┐
│ 웹페이지 컨텍스트 (임의 사이트)                        │
│  ┌─────────────────────┐  ┌───────────────────────┐  │
│  │ injected-capture.ts  │  │   widget-host.ts      │  │
│  │ (main world)         │  │   (isolated world)    │  │
│  │ • fetch monkey-patch │  │ • Shadow DOM 마운트   │  │
│  │ • XHR monkey-patch   │  │ • MutationObserver    │  │
│  │ • History API patch  │  │   재주입 감시         │  │
│  └──────────┬──────────┘  └───────────────────────┘  │
│             │ window.postMessage                       │
│  ┌──────────▼──────────┐                             │
│  │  content-bridge.ts  │ (isolated world)             │
│  └──────────┬──────────┘                             │
└─────────────┼────────────────────────────────────────┘
              │ chrome.runtime.sendMessage
┌─────────────▼────────────────────────────────────────┐
│ Background Service Worker                             │
│  ┌──────────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ session-manager  │  │ sender   │  │ msg-router │  │
│  │ • 세션 경계 관리  │  │ • POST   │  │ • 메시지   │  │
│  │ • 호출 누적      │  │ • 재시도 │  │   디스패치 │  │
│  │ • idle 타임아웃  │  └──────────┘  └────────────┘  │
│  └──────────────────┘                                 │
│              ↕ chrome.storage.local                   │
└──────────────────────────────────────────────────────┘
              ↕ chrome.storage.onChanged
┌─────────────────────────────────────────────────────┐
│ UI 레이어 (React + TypeScript)                       │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ FloatingWidget│  │  SidePanel   │  │ Options  │  │
│  │ (Shadow DOM)  │  │              │  │ Page     │  │
│  └───────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────┘
              ↓ HTTPS POST (JSON)
┌─────────────────────────────────────────────────────┐
│ 외부 서버: REST 수신 → MCP 변환 → 목록 반환          │
└─────────────────────────────────────────────────────┘
```

### 3.2 핵심 설계 원칙

- **Background SW = 비즈니스 로직 단일 소유자**: 세션 관리·전송·상태 전이는 모두 SW에서 처리. UI는 storage를 읽기만 함.
- **chrome.storage = 영속 진실 소스**: MV3 SW는 언제든 종료될 수 있으므로, 모든 상태는 storage에 내려받아 SW 재시작에 안전하게 유지.
- **main world 주입 분리**: `injected-capture.ts`는 main world에서 동작하여 페이지 fetch/XHR을 가로채고, `window.postMessage`로 isolated world의 `content-bridge.ts`에 전달. 보안 경계 유지.
- **Shadow DOM 격리**: 임의 사이트의 CSS와 충돌하지 않도록 FloatingWidget은 Shadow DOM 내부에 마운트. z-index 최상위 고정.

---

## 4. 데이터 흐름

### 4.1 API 캡처 흐름

```
fetch() / XHR 호출 발생
  → injected-capture.ts: 응답 body clone 후 캡처 객체 구성
  → window.postMessage({ type: 'API_CAPTURED', ...payload })
  → content-bridge.ts: postMessage 수신
  → chrome.runtime.sendMessage({ type: 'API_CAPTURED', ...payload })
  → Background SW session-manager: currentSession.calls에 누적
  → chrome.storage.local 업데이트
  → FloatingWidget 뱃지 카운터 증가
```

### 4.2 세션 경계 관리

URL 변경은 4가지 경로로 감지한다.

| 경로 | 처리 |
|---|---|
| `pushState` / `replaceState` monkey-patch | URL 변경 즉시 SESSION_CHANGE 발송 |
| `popstate` 이벤트 | 브라우저 뒤로/앞으로 이동 감지 |
| `beforeunload` 이벤트 | full navigation (탭 이동·새로고침) 감지 |

SESSION_CHANGE 발생 시:
1. 현재 `currentSession`을 `sessions[]`에 저장 (status: `pending`)
2. 새 `currentSession` 객체 생성
3. 뱃지 카운터 리셋

**Idle 타임아웃**: 동일 URL에서 30분간 API 호출 없을 시 세션 자동 종료 후 새 세션 시작.

### 4.3 수동 전송 흐름

```
SidePanel "전송" 버튼 클릭
  → chrome.runtime.sendMessage({ type: 'SEND_SESSION', sessionId })
  → Background SW sender.ts:
      1. storage에서 session 조회
      2. POST {serverUrl}/api/sessions
         Headers: Authorization: Bearer {apiKey}
         Body: { session 전체 payload }
      3. 성공: session.transmitStatus = 'sent'
         실패: 최대 3회 지수 백오프 재시도
               최종 실패: transmitStatus = 'failed', storage에 기록
  → 응답의 mcpServers → storage.mcpList에 머지
  → SidePanel / Options Page 자동 갱신 (storage.onChanged)
```

### 4.4 서버 전송 Payload 구조 (안)

```typescript
// POST {serverUrl}/api/sessions
{
  sessionId: string;
  url: string;
  startedAt: number;      // Unix ms
  endedAt: number;
  calls: Array<{
    id: string;
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody: string | null;
    responseStatus: number;
    responseHeaders: Record<string, string>;
    responseBody: string | null;
    durationMs: number;
    capturedAt: number;
  }>;
}

// 응답
{
  mcpServers: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    endpoint: string;
    createdAt: number;
    active: boolean;
  }>;
}
```

> ⚠️ 정확한 스키마는 백엔드 팀과 협의 필요.

---

## 5. 상태 스키마 (chrome.storage.local)

```typescript
interface StorageSchema {
  settings: {
    serverUrl: string;
    apiKey: string;
    trackingEnabled: boolean;
    blacklistedDomains: string[];
  };

  currentSession: {
    sessionId: string;
    url: string;
    startedAt: number;
    calls: ApiCall[];
    status: 'recording' | 'idle';
  } | null;

  sessions: Array<{
    sessionId: string;
    url: string;
    startedAt: number;
    endedAt: number;
    calls: ApiCall[];
    transmitStatus: 'pending' | 'sent' | 'failed';
    sentAt?: number;
  }>;

  mcpList: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    endpoint: string;
    createdAt: number;
    active: boolean;
  }>;
}

interface ApiCall {
  id: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  durationMs: number;
  capturedAt: number;
}
```

---

## 6. UI 컴포넌트

### 6.1 FloatingWidget (Shadow DOM)

- 우측 하단 고정 원형 버튼
- **뱃지**: 현재 세션 캡처 호출 수 표시
- **상태 표시**: 트래킹 중(파랑) / 일시정지(회색)
- **호버 미니팝업**: "패널 열기" / "일시정지" 버튼
- **SPA 대응**: `MutationObserver`로 위젯 root 감시, DOM에서 사라지면 재주입
- **도메인 블랙리스트**: 블랙리스트 도메인에서는 위젯 렌더링 자체 생략

### 6.2 SidePanel (chrome.sidePanel API)

- **헤더**: 로고, 트래킹 ON/OFF 토글, 설정 진입
- **현재 URL**: 활성 세션의 origin URL
- **캡처 리스트**: 메서드(GET/POST…) 칩, URL, 상태 코드, 응답 크기, 응답 시간
  - 실시간 갱신 (storage.onChanged 구독)
  - 클릭 시 요청/응답 body 미리보기 펼침
- **전송 버튼**: "이 세션 전송 (N개 호출)" — 전송 중 로딩, 성공/실패 인라인 표시
- **대시보드 링크**: Options Page로 이동

### 6.3 Options Page (3탭)

| 탭 | 내용 |
|---|---|
| **MCP 서버 목록** | 서버명, 출처 URL, 엔드포인트, 생성일, 활성/비활성 상태 테이블. 검색 필터. |
| **세션 기록** | 전송 완료/실패 세션 목록. transmitStatus별 필터. 재전송 버튼. |
| **설정** | 서버 URL, API Key 입력. 도메인 블랙리스트 관리. 트래킹 기본값. |

---

## 7. 파일 구조

```
extension/
├── manifest.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   ├── index.ts               # SW 진입점 + 메시지 라우터
│   │   ├── session-manager.ts     # 세션 경계·누적·idle 타임아웃
│   │   └── sender.ts              # 서버 전송·재시도
│   │
│   ├── content/
│   │   ├── injected-capture.ts    # main world 주입 (fetch/XHR/History patch)
│   │   ├── content-bridge.ts      # postMessage → sendMessage 브릿지
│   │   └── widget-host.ts         # Shadow DOM 마운트·MutationObserver
│   │
│   ├── ui/
│   │   ├── widget/
│   │   │   └── FloatingWidget.tsx
│   │   ├── sidepanel/
│   │   │   ├── index.tsx
│   │   │   ├── CaptureList.tsx
│   │   │   └── SendButton.tsx
│   │   └── options/
│   │       ├── index.tsx
│   │       ├── McpTable.tsx
│   │       ├── SessionHistory.tsx
│   │       └── Settings.tsx
│   │
│   └── shared/
│       ├── types.ts               # StorageSchema, ApiCall 공용 타입
│       ├── storage.ts             # chrome.storage 래퍼
│       └── messages.ts            # 메시지 타입 상수
│
└── public/
    ├── sidepanel.html
    └── options.html
```

---

## 8. 에러 처리

| 시나리오 | 처리 |
|---|---|
| 서버 전송 실패 | 최대 3회 지수 백오프 재시도. 최종 실패 시 `transmitStatus: 'failed'` 저장, SidePanel에 에러 배너 표시 |
| SW 종료 후 재시작 | storage에서 `currentSession` 복구. 진행 중이던 세션은 그대로 이어서 녹화 |
| 위젯 DOM 소멸 | MutationObserver가 감지 후 재주입 |
| monkey-patch 이전 호출 | `document_start`에서 최대한 빠르게 주입하나, 초기 호출 일부 누락 가능 — 구조적 한계로 문서화 |
| 블랙리스트 도메인 | content script 진입 시 도메인 확인 후 monkey-patch 및 위젯 주입 전체 skip |

---

## 9. 완료 기준

- 임의 사이트에서 페이지 이동 시 URL 단위로 묶인 API 호출 페이로드가 수동 전송된다
- FloatingWidget이 임의 사이트에서 CSS 충돌 없이 표시되고, SidePanel이 동작한다
- SidePanel에서 실시간 캡처 리스트와 응답 미리보기를 확인할 수 있다
- Options Page에서 서버가 반환한 MCP 리스트를 테이블로 확인할 수 있다
- 트래킹 ON/OFF와 도메인 블랙리스트를 설정에서 제어할 수 있다
- SPA에서 client-side routing 후에도 FloatingWidget이 살아 있다

---

## 10. 열린 질문 (구현 전 결정 필요)

- **서버 payload 스키마 확정** — 섹션 4.4는 초안. 백엔드 팀과 협의 필요.
- **중복 호출 dedupe** — 동일 endpoint 반복 호출을 F/E에서 처리할지 서버에 위임할지.
- **세션 기록 보관 한도** — storage 쿼터 대비 최대 세션 수 제한 정책.
- **사용자 동의 흐름** — 인증 정보·PII 평문 전송에 대한 명시적 동의 UI (법적 검토 권장).
