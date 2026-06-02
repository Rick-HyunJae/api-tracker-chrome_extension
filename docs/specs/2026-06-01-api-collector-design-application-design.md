# API Collector 디자인 적용 — 설계 명세

- 날짜: 2026-06-01
- 상태: 설계 승인 대기
- 입력 디자인: claude-design 핸드오프 번들 `protocol-k-extension` (`API Collector.html` + `panel.jsx`/`app.jsx`/`data.jsx`/`icons.jsx`, 채팅 `chat1.md`)
- 대상 저장소: MV3 Chrome 확장 (Vite + Vitest), 현재 이름 `API-to-MCP Tracker`

## 1. 목표

claude-design으로 만든 다크 dev-tool 테마 "API Collector" 시안을 **현재 동작하는 확장 기능 위에** 입힌다. 충돌 시 원칙: **디자인 일관성을 우선하되, 캡처·전송·데이터 파이프라인 기능은 후퇴시키지 않는다**(시안에 없는 MCP UI는 데이터 계층 보존 하에 비활성 placeholder로만 강등 — §3.5). 시안이 정의했지만 미구현인 부분은 **데이터 모델·서비스워커까지 실제 동작으로 구현**한다.

### 사용자 결정 (인터뷰 확정)
1. 적용 범위: 사이드패널 + 위젯 + 옵션 페이지까지 (전 표면).
2. 설정 위치: 디자인대로 **전부 패널 Rail 안으로** 이동.
3. MCP·세션 히스토리: 패널 Rail 탭으로 흡수하되 **비활성("준비 중") 상태**.
4. 미구현 기능: **전부 실제 동작까지 구현**.
5. 스타일링: **전역 CSS 토큰 + 클래스**.
6. `options.html`: **완전 제거** (번들·manifest `options_page` 포함).

## 2. 디자인 ↔ 현 코드 매핑

### 2.1 디자인이 다루는 표면
- 사이드 패널: `Rail`(수집/전송/설정) + `ListView` / `DetailView` / `SendView`(app.jsx) / `SettingsView`.
- 플로팅 독: 메인 버튼(50% 숨김 + 카운트 배지, 패널 토글) + 수집 토글 버튼(broadcast, 펄스), 세로 드래그.

### 2.2 디자인 데모 스캐폴딩 → 구현 제외
가짜 브라우저 크롬(`.browser/.chrome/.omni/.page`), `TweaksPanel`(액센트·폰트 변경기), 캡처 시뮬레이션(`setInterval`/`window.AppData.nextCapture`), `SEED` 더미 데이터.

### 2.3 데이터 모델 매핑
디자인 `entry` → 현 `ApiCall`(`src/shared/types.ts`):

| 디자인 | 현 `ApiCall` | 비고 |
|---|---|---|
| method | method | 그대로 |
| status | responseStatus | |
| ms | durationMs | |
| host / path | url에서 파생 | `new URL(call.url)` |
| size | responseBody 길이로 파생 | 바이트 표기 |
| time | capturedAt | 포맷팅 |
| bodyStr | responseBody | |
| resHeaders `[k,v][]` | responseHeaders `Record` | `Object.entries` 변환 |
| reqHeaders `[k,v][]` | requestHeaders `Record` | `Object.entries` 변환 |

기존 모델로 Detail 뷰 전체를 채울 수 있다. **데이터 추가 불필요.**

## 3. 아키텍처

### 3.1 디자인 시스템 토대 (공유 레이어)
- 신규 `src/ui/theme/tokens.css`: 디자인 `:root` OKLCH 토큰 전량 이식
  (`--accent`, `--accent-dim`, `--accent-ink`, `--bg/--canvas/--surface/--surface-2/--surface-hi`, `--border/--border-soft`, `--text/--text-2/--text-3`, 메서드색 `--m-get/post/put/del/patch`, `--ok/warn/err/rec`, `--ui/--mono`, `--r/--r-sm`).
- 신규 `src/ui/theme/components.css`: 디자인 `<style>`의 컴포넌트 규칙(`.phead`, `.recbar`, `.searchrow`, `.entry`, `.badge.*`, `.tabs`, `.kv`, `.codeblock`, `.settings`, `.rail`, `.toast`, `.btn*` 등)을 클래스로 이식. 인라인 스타일 폐기.
- **폰트 로컬 번들**: Space Grotesk / IBM Plex Mono `woff2`를 `public/fonts/`에 포함하고 `@font-face`로 선언. CDN `<link>` 미사용 — 확장 CSP·오프라인·프라이버시(기능 우선 조정). 폰트 파일은 `web_accessible_resources`에 추가(위젯 shadow DOM에서 참조).
- **위젯(shadow DOM)**: 동일 토큰을 shadow root `<style>`에 주입. `@font-face`는 document에 1회.

### 3.2 사이드패널 (`src/ui/sidepanel/`)
루트(`index.tsx`)가 408px 영역에 `pmain`(현재 뷰) + `Rail`을 렌더. 가짜 브라우저 없음.

신규/교체 컴포넌트:
- `Rail.tsx` — 수집/전송 + (MCP/히스토리 비활성) + 설정. 카운트 배지(`ndot`).
- `ListView.tsx` — `recbar`(수집 토글·카운트·펄스 `blip`), `searchrow`, 엔트리 리스트(메서드 배지·상태색·host/ms/size/time, `fresh` pop 애니메이션), 빈 상태, 푸터(서버 전송/삭제).
- `DetailView.tsx` — `durl` 요약 + 탭(본문/응답헤더/요청헤더). 본문은 JSON 신택스 하이라이트(`highlight()`), 헤더는 `kv` 테이블. `CopyBtn` + cURL 복사. **레일엔 상세 탭 없음**(엔트리 클릭으로만 진입, 디자인대로).
- `SendView.tsx` — 건수/페이로드(KB)/메서드 분포 막대/대상 엔드포인트 + 프로그레스 바. 기존 `MSG.SEND_SESSION` 사용.
- `SettingsView.tsx` — 전송 서버(엔드포인트/토큰), 캡처 대상(도메인 화이트리스트/메서드 칩), 동작(saveBody/autoSend/dedupe 스위치). 설정은 `src/shared/storage.ts` 저장 헬퍼로 **직접 영속**(신규 런타임 메시지 불필요). SW는 캡처 시 storage의 `settings`를 읽어 필터를 적용하므로 별도 동기화 불필요.
- `CopyBtn.tsx` — 복사/복사됨 토글.
- 폐기: 기존 `CaptureList.tsx`, `SendButton.tsx`의 인라인 라이트 스타일(컴포넌트는 새 세트로 대체).
- 데이터 연결은 기존 그대로: `getStorage` / `onStorageChanged` / `connectSidePanelPort` / `MSG`.

상태(`index.tsx`): `view`('list'|'detail'|'send'|'settings'), `selectedId`, `query`, `sending/progress`, `toast`. 실제 `currentSession.calls`·`settings` 구독.

### 3.3 데이터 모델 + SW 실동작 (디자인 정의·미구현 → 구현)
`Settings`(`src/shared/types.ts`) 확장:

```ts
interface Settings {
  serverUrl: string            // = 디자인 endpoint
  apiKey: string               // = 디자인 token
  trackingEnabled: boolean
  blacklistedDomains: string[] // 기존 유지
  domainWhitelist: string[]    // 신규: 비어있지 않으면 매칭 호스트만 캡처
  captureMethods: string[]     // 신규: 기본 ['GET','POST','PUT','PATCH','DELETE']
  saveBody: boolean            // 신규: off면 responseBody 미저장
  autoSend: boolean            // 신규: 50건마다 자동 전송
  dedupe: boolean              // 신규: 동일 path는 마지막 응답만 유지
  consentGivenAt?: number
}
```

필터링은 SW `appendCall`(`src/background/session-manager.ts`) 한 곳에 집중 — 순수 함수로 유지해 테스트 용이:
- `appendCall(state, call, now, settings)`로 시그니처 확장.
- **메서드 필터**: `settings.captureMethods`에 없는 메서드 드롭.
- **도메인 화이트리스트**: `domainWhitelist` 비어있지 않으면 `new URL(call.url).host` 매칭만 통과(기존 blacklist와 AND).
- **saveBody**: false면 저장 직전 `responseBody=null`.
- **dedupe**: true면 동일 `path`(쿼리 제외) 기존 엔트리 교체.
- **autoSend**: 추가 후 `calls.length >= 50 && settings.autoSend`면 background 핸들러에서 `sender` 트리거(전송 후 세션 비움/회전).

`DEFAULT_SETTINGS`에 신규 기본값 추가. 마이그레이션: 기존 저장값에 신규 필드 없으면 기본값 머지(`getStorage` 로드 시).

### 3.4 플로팅 위젯 (`src/ui/widget/FloatingWidget.tsx`)
**기존 hover-bridge 해법 보존**(`docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md`)하면서 디자인 적용:
- 라이트(#2563eb/#9ca3af) → 다크 틸 토큰. 메인 50% 숨김·카운트 배지·호버 팝업 유지.
- **신규 세로 드래그**: pointer 드래그, 3px 임계로 클릭/드래그 구분, 위치 영속. **영속은 `chrome.storage`**(콘텐츠 스크립트 localStorage는 호스트 페이지 것 — 오염/격리 문제, 기능 우선 조정). 드래그 시 bridge `::before` 기하는 상대값이라 그대로 유효.
- 아이콘: 메인=패널 글리프(열림/닫힘 `scaleX` 플립), 토글=broadcast + 수집 중 펄스 링·레코드 점. 호버 툴팁.
- 동작: 메인=사이드패널 토글(`MSG.OPEN_SIDEPANEL` + 기존 sidepanel-toggle), 토글=`MSG.TOGGLE_TRACKING`.
- 크기: 디자인 34px 기준(현 32px에서 상향).

### 3.5 옵션 페이지 제거
- `public/options.html`, `src/ui/options/*` 삭제.
- `manifest.json`의 `options_page` 항목 제거.
- `Settings` 로직은 패널 `SettingsView`로 이관.
- `McpTable`/`SessionHistory` 기능은 **패널 비활성 탭("준비 중")으로 셸빙** — 데이터(`mcpList`, `sessions`)는 스토리지 스키마에 유지하되 UI는 후속.
- 사이드패널 내 옵션 링크(`MCP 대시보드 보기 →` 등) 제거.

> 결정에 따른 의도적 범위 축소: 동작하던 MCP 대시보드 UI를 비활성 placeholder로 내린다. 데이터 계층은 보존되어 추후 복원 가능.
>
> **비가역성 주의(one-way door):** `options_page` + `src/ui/options/*` 동시 제거는 manifest·번들 복원 없이는 되돌리기 어렵고, 사이드패널 진입이 불가한 컨텍스트에서는 설정 접근 경로가 사라진다. 사용자 결정(완전 제거)을 따르되, 실행 시 이 트레이드오프를 인지하고 첫 통합 전 패널 진입 경로가 안정적인지 확인한다.

## 4. 빌드/매니페스트 영향
- `manifest.json`: `options_page` 제거, `web_accessible_resources`에 `public/fonts/*` 추가.
- `public/sidepanel.html`: 타이틀/마크업은 유지(루트 마운트). 테마 CSS는 `index.tsx`에서 import.
- Vite: 폰트 에셋 처리 확인(정적 `public/` 경유).
- 참고: 저장소 실제 빌드는 **Vite/Vitest**다. `CLAUDE.md`의 webpack/`create:dll`/TipTap 서술은 본 저장소와 불일치(이 작업 범위 밖, 별도 보고).

## 5. 단계 분할 (단일 spec → 3 plan)
- **P1 — 디자인 토대 + 위젯**: `tokens.css`/`components.css`, 로컬 폰트, manifest 폰트 리소스, 위젯 리스타일 + 세로 드래그(+chrome.storage 영속). 기존 위젯 테스트 갱신.
- **P2 — 패널 UI**: `Rail`/`ListView`/`DetailView`/`SendView`/`SettingsView`/`CopyBtn`, 실데이터 연결, 신규 설정 필드는 **UI만**(저장 연결). 옵션 페이지 제거. 컴포넌트 테스트.
- **P3 — SW 실동작**: `appendCall` 필터(methods/whitelist/saveBody/dedupe) + autoSend, `Settings` 타입/기본값/마이그레이션. 순수 함수 테스트(`session-manager.test.ts` 확장).

**실행 순서(의존성):** P2의 `SettingsView`/`index`가 P3에서 확장하는 `Settings` 신규 필드·`DEFAULT_SETTINGS`를 참조한다. 따라서 권장 순서는 **P1 → P3 → P2**, 또는 P2 착수 전 최소 **P3 Task 1(Settings 타입 확장)** 선행. P1은 다른 단계와 독립.

각 단계: 격리 워크트리에서 작업 → squash 통합(프로젝트 규약, `superpowers.md`). spec/plan 커밋은 통합 브랜치 예외.

## 6. 테스트 전략
- **단위(우선)**: `appendCall` 필터/ dedupe/ autoSend 임계(P3) — 순수 함수, TDD.
- **컴포넌트(Vitest + RTL)**: `ListView`(빈/검색/엔트리), `DetailView`(탭 전환·복사·빈 본문), `SendView`(분포·프로그레스), `SettingsView`(토글·칩), `Rail`(비활성 탭 클릭 무효), `FloatingWidget`(드래그 vs 클릭 구분·badge·토글·hover bridge 회귀).
- **회귀**: 위젯 hover-bridge dead-zone, 사이드패널 토글, 메서드 필터로 캡처 드롭.

## 7. 위험 / 미해결
- 폰트 라이선스/번들: Space Grotesk·IBM Plex Mono 모두 OFL — 번들 가능. 파일 확보 필요.
- 드래그 영속을 `chrome.storage`로 옮기면 비동기 초기 위치 깜빡임 가능 → 첫 페인트 전 기본 위치, 로드 후 보정.
- `domainWhitelist` 도입 시 기존 `blacklistedDomains`와의 우선순위(AND 적용)를 SettingsView UI에서 명확히 표기.
- MCP/히스토리 셸빙으로 기존 `McpTable`/`SessionHistory` 테스트 제거 — 데이터 계층 테스트는 유지.

## 8. 완료 기준
- 사이드패널·위젯·(제거된)옵션 경로가 다크 틸 토큰으로 일관 렌더.
- 엔트리 클릭 → Detail 탭/복사/cURL 동작, 실 캡처 데이터 표시.
- SettingsView 변경이 SW 캡처 동작(메서드/화이트리스트/saveBody/dedupe/autoSend)에 실제 반영.
- 위젯 세로 드래그 후 위치 유지(재로드), hover-bridge 회귀 없음.
- `options.html`/`options_page` 부재, 빌드·전체 테스트 통과.
