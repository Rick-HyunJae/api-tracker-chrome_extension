# A안 수정 설계 — 수동 전송 버그·URL 절대화·전송 필터링·세션 이름

- 날짜: 2026-07-28
- 상태: 승인됨 (브레인스토밍 대화에서 사용자 확정)
- 배경: agent-browser E2E 테스트로 검증한 버그 4건 + 신규 기능 2건

## 목표

1. **BUG 1 (Critical)** — 수동 전송이 항상 `session not found`로 실패하는 버그 수정
2. **BUG 2 (High)** — 상대경로 URL이 화이트리스트·dedupe·Detail 표기를 깨뜨리는 버그 수정
3. **기능 ①** — 전송 전 API 호출 선택(체리픽) 필터링
4. **기능 ②** — 세션 이름(name)을 지정해 서버로 전송
5. **BUG 3·4 (Medium)** — 실패 토스트의 성공 아이콘, 가짜 진행률(50% 고정) 정리
6. **부가** — List에서 개별 호출 삭제

## 확정된 요구사항 (사용자 결정)

| 결정 | 선택 |
|---|---|
| 전송 의미론 | 전송 시 선택분을 아카이브(rotate)하고 새 세션 시작 — autoSend와 일관 |
| 필터링 | 체크박스(기본 전체 선택). **선택분만 아카이브+전송, 미선택분은 새 세션에 잔류**(체리픽) |
| 개별 삭제 | 함께 추가 (List 행 hover 삭제 버튼, undo 없음) |
| 세션 이름 | Send 뷰에서 전송 시 입력(선택사항), placeholder로 기본값 제안 |
| 서버 계약 | additive 확장 자유 (`name` 필드 추가, `calls`는 선택분만 포함) |

## 근거가 된 E2E 검증 결과

- 수동 전송: Send 뷰 → "N건 전송" → 토스트 `전송 실패: session not found` 재현.
  UI는 `currentSession.sessionId`로 `SEND_SESSION`을 보내지만(`ui/sidepanel/index.tsx`),
  핸들러는 `state.sessions`(아카이브)에서만 검색(`background/index.ts`). 현재 세션은
  30분 idle rotate 또는 autoSend(50건) 전에는 `sessions[]`에 없음 → 항상 실패.
  세션을 수동으로 rotate한 뒤 같은 메시지를 보내면 `{ok: true}` — sender·핸들러 자체는 정상.
- 상대경로: 화이트리스트 `localhost` + localhost 페이지에서 `fetch('/api/users')` → 드롭
  (카운트 불변). 화이트리스트 해제 → 캡처됨(대조군). `new URL(call.url)` throw → `host=''` → 불허.
  Detail 뷰는 `https:///api/orders`로 표기. dedupe `safePath`도 상대경로에서 쿼리 포함 원문 반환.

## 설계

### 1. 타입·계약 (`shared/types.ts`, `shared/messages.ts`)

- `StoredSession`에 `name?: string` 추가
- `MSG.SEND_CURRENT_SESSION` 신설: `{ type, name?: string, callIds: string[] }`
- `MSG.DELETE_CALL` 신설: `{ type, callId: string }`
- 전송 페이로드: `{ sessionId, name?, url, startedAt, endedAt, calls }` (additive)

기존 `SEND_SESSION`(아카이브 세션 대상)은 무변경 유지 — 향후 히스토리 뷰 재전송에서 사용.
개별 삭제를 background 경유로 처리하는 이유: 모든 상태 변경이 write-lock 큐를 타는
기존 불변식을 유지해 캡처와의 read-modify-write 경쟁을 차단.

### 2. 세션 분할 회전 (`background/session-manager.ts`)

신규 순수 함수 `splitAndArchive(state, callIds, name, now)`:

- `currentSession.calls`를 `callIds` 포함/미포함으로 분할
- 선택분 → `StoredSession`(`name` 포함, `transmitStatus: 'pending'`)으로 `sessions[]`에 추가
- 미선택분 → 새 세션(새 id, `startedAt = now`)의 `calls`로 잔류
- 선택분 0건이면 no-op — 같은 참조(`===`) 반환 (기존 `appendCall`의 참조 동등성 계약과 동일 관용구)

### 3. 메시지 라우터 (`background/index.ts`)

- `SEND_CURRENT_SESSION`: `splitAndArchive` → `sendSession` → 성공 시 `sent` + `mergeMcpList`,
  실패 시 `failed` (기존 `SEND_SESSION` 성공/실패 처리 패턴 재사용)
- `DELETE_CALL`: 해당 id를 제거한 새 `currentSession` 상태 반환
- 경쟁 도착 처리: UI가 보낸 `callIds` 이후 도착한 신규 호출은 자연스럽게 "미선택"으로
  분류되어 새 세션에 잔류 — 유실 없음

### 4. URL 절대화 (`content/injected-capture.ts`)

캡처 시점에 절대화 — 데이터가 태어날 때부터 올바르게:

- fetch 패치: `url = new URL(rawUrl, win.location.href).href` (try/catch, 실패 시 원문 유지)
- XHR 패치: `open`에서 동일 처리

결과: `session-manager`의 화이트리스트 `new URL(call.url).host`와 `safePath` dedupe가
상대경로에서도 정상 동작. Detail 뷰 표기 자동 해결. appendCall 쪽 보정은 두지 않는다(단일 지점).

### 5. UI (`ui/sidepanel/`)

- **ListView**: 행 좌측 체크박스(기본 checked), 헤더 전체 선택/해제,
  행 hover 시 개별 삭제 버튼(즉시 삭제, undo 없음)
- **SendView**: 상단 "세션 이름" 입력(선택, placeholder = `{host} · M/D 세션`),
  요약 카드(건수·페이로드·메서드 분포)가 선택분 기준으로 재계산,
  버튼 라벨 `선택 N건 전송`, 0건이면 disabled,
  진행률 바 → 불확정(indeterminate) 애니메이션 (가짜 50% 제거)
- **index.tsx**: `excludedIds: Set<string>` 로컬 상태(제외 집합 — 새 도착 호출은 자동 선택됨),
  `onSend`가 `SEND_CURRENT_SESSION { name, callIds }` 발송, 성공 시 `excludedIds`·이름 초기화,
  토스트 아이콘 성공 `Check` / 실패 `X` 분기

선택 상태는 영속하지 않는다(패널 로컬). 전송 직전의 일시적 선택이므로 패널을 닫으면
초기화되는 것이 의도된 동작이며, storage 쓰기 부담과 동기화 복잡도를 피한다.

### 6. 에러 처리·엣지 케이스

- 전송 실패: 선택분은 `failed`로 아카이브 — 데이터 보존. 재전송 UI는 향후 히스토리 뷰 몫(이번 범위 밖)
- 삭제/전송/캡처 동시성: 모든 변경이 background write-lock 큐로 직렬화
- `serverUrl` 미설정: 기존 sender의 명시적 에러를 토스트로 노출(무변경)
- 세션 이름 미입력: `name` 필드 생략(undefined) — placeholder는 표시용일 뿐 자동 전송하지 않음

### 7. 테스트 계획 (TDD, co-located)

- `session-manager.test.ts`: `splitAndArchive` 분할/이름 스탬프/0건 no-op(참조 동등)/전량 선택
- `background/index.test.ts`: `SEND_CURRENT_SESSION` 성공/실패/부분 선택/경쟁 도착, `DELETE_CALL`
- `ListView.test.tsx`: 체크박스 토글, 전체 선택/해제, 삭제 버튼
- `SendView.test.tsx`: 이름 입력, 선택 건수 반영, 0건 disabled
- `sidepanel/index.test.tsx`: `onSend` 메시지 페이로드 검증(BUG 1의 통합 구멍 직접 커버), 토스트 아이콘 분기
- `injected-capture.test.ts`: 상대경로 절대화(fetch/XHR)

### 8. Handoff 문서 (작업 완료 후 산출물)

구현·검증 완료 후, 이 확장의 사용 방법을 담은 handoff 문서를 작성한다:

- 경로: `docs/handoff/2026-07-28-extension-usage.md` (+ 스크린샷은 `docs/handoff/images/`)
- 내용: 핵심만 간략히 — 빌드·로드 방법, 캡처 시작/중지, 리스트·상세 확인,
  전송 필터링(체크박스)·세션 이름 지정·전송, 설정(서버 URL/API Key/화이트리스트)
- 이미지: 구현 완료 후 새 UI 기준의 실제 스크린샷(위젯, List 체크박스, Send 뷰 이름 입력 등)

## 범위 밖 (향후 작업으로 이관)

- 히스토리 뷰(failed/pending 재전송 UI), MCP 뷰 구현
- 스토리지 상한(sessions 무한 증가), 민감 헤더 마스킹, 동의 게이트 복구
- Settings 토글 접근성 이름, ESLint/CI 도입
