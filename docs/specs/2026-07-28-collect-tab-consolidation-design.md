# 수집 탭 통합 설계 — 전송 탭 흡수와 세션 이름의 설정 이전

- 날짜: 2026-07-28
- 상태: 승인됨 (브레인스토밍 대화에서 사용자 확정)
- 배경: 수집 탭과 전송 탭의 역할 중복 지적에서 출발. E2E 검증(`agent-browser` + 목 서버)으로 확인한 실제 마찰을 근거로 함

## 목표

전송을 별도 탭으로 분리한 현재 구조를 **수집 탭 하나로 통합**한다. 요약 정보는 수집 탭 상단의 접이식 카드로 흡수하고, 세션 이름은 설정 탭으로 옮겨 일괄 관리한다.

## 문제 — 왜 중복인가

탭 분리는 기능적 결론이 아니라 **외부 디자인 시안 이식의 산물**이다. `docs/specs/2026-06-01-api-collector-design-application-design.md` §2.1의 Rail(수집/전송/설정) 구조는 `claude-design` 핸드오프 시안(`app.jsx`)을 그대로 옮긴 것이고, 당시 SendView의 정의는 "건수/페이로드/메서드 분포/대상 엔드포인트 + 프로그레스 바" — 곧 **업로드 확인 화면**이었다. 세션 이름 입력은 두 달 뒤 `2026-07-28-plan-a-fixes-design.md`에서 나중에 얹혔다.

E2E로 확인한 마찰:

1. **라벨과 동작 불일치** — 수집 탭 푸터의 `서버로 전송 N` 버튼은 전송하지 않고 전송 탭으로 이동만 한다(`ListView.tsx` `onGoSend`). 전송은 다음 화면에서 한 번 더 눌러야 한다.
2. **선택과 실행의 분리** — 체크박스는 수집 탭에만, 이름·실행은 전송 탭에만 있다. Rail로 전송 탭에 직접 진입하면 무엇이 선택됐는지 숫자만 보이고, 바꾸려면 되돌아가야 한다.
3. **정보 중복** — 수집 탭의 `N/M건 전송 대상`과 전송 탭의 `선택 건수`는 같은 값이다.
4. **죽은 탭 슬롯** — Rail 5칸 중 MCP·히스토리 2칸이 `disabled`로 자리만 차지한다.

## 확정된 요구사항 (사용자 결정)

| 결정 | 선택 |
|---|---|
| 구조 | 수집 탭이 전송 탭의 요약 기능을 흡수. 전송 탭 제거 |
| 요약 배치 | 상단 고정 **접이식** 카드 — 기본 1줄, 펼치면 상세 |
| 세션 이름 | 설정 탭에서 일괄 관리. **prefix/suffix 등 가공 없이** 그대로 전송 (서버 측 군집이 목적) |
| Rail | 전송 탭만 제거, MCP·히스토리는 `disabled`로 유지 |
| 전송 실행 | 푸터 버튼 1클릭 즉시 전송 (별도 확인 단계 없음) |

## 설계

### 1. 화면 구조

선택 바(`selbar`)와 요약은 같은 정보를 담으므로 **하나로 합친다**. 합치지 않으면 새 중복이 생긴다.

**접힌 상태 (기본)**

```
┌──────────────────────────────────┐
│ ⬒  API 수집기                 [×]│  헤더
├──────────────────────────────────┤
│ ▶  수집 중 · 4건 수집됨        🗑 │  수집 상태바
├──────────────────────────────────┤
│ 🔍 경로 · 메서드 검색            │  검색
├──────────────────────────────────┤
│ ☑  3/4건 · 0.2KB · localhost  ⌄ │  선택바 + 요약 통합 (1줄)
├──────────────────────────────────┤
│ ☑ GET  /api/items    200  37ms   │
│ ☑ POST /api/items    201  26ms   │  목록
│ ☐ PUT  /api/items/1  200  18ms   │
│ ☑ GET  /api/xhr      200   9ms   │
├──────────────────────────────────┤
│ [  ⬆ 서버로 전송   3  ]       🗑 │  푸터 — 실제 전송
└──────────────────────────────────┘
```

**펼친 상태** — `⌄`를 누르면 그 자리에서 아래로 확장

```
│ ☑  3/4건 · 0.2KB · localhost  ⌃ │
│    GET   ████████░░░░   2        │
│    POST  ████░░░░░░░░   1        │
│    이름   주문 API               │  설정값 표시 (읽기 전용)
│    대상   POST localhost:4599    │
```

- 왼쪽 체크박스는 기존 **전체 선택** 토글을 그대로 유지한다(`aria-label="전체 선택"`).
- 푸터 버튼이 실제로 전송한다. 탭 이동이 없어 라벨과 동작이 일치한다.
- 펼침 영역에 **세션 이름을 읽기 전용으로 노출**한다. 이름이 설정으로 옮겨가면 "지금 어떤 이름으로 나가는지" 알 수 없게 되는데, 이 표시가 그 공백을 메운다. 설정이 비어 있으면 `이름 없음`으로 표시한다.
- `serverUrl` 미설정 시 대상은 `(미설정)`으로 표시한다(기존 SendView 동작 계승).

전송에 별도 확인 단계를 두지 않는 근거: 요약이 상시 노출되어 확인이 이미 이루어졌고, 실패해도 데이터는 `failed`로 보존되며, 되돌릴 수 없는 파괴적 삭제가 아니다.

### 2. 설정 이전과 전송 계약

**`Settings` 확장** (`src/shared/types.ts`)

```ts
interface Settings {
  serverUrl: string
  apiKey: string
  sessionName: string   // 신규 — 가공 없이 payload.name으로 전달, 빈 문자열이면 생략
  // ...나머지 동일
}
```

`DEFAULT_SETTINGS.sessionName = ''`. 기존 저장값에 필드가 없으면 `getStorage` 로드 시 기본값이 머지되므로 별도 마이그레이션은 필요 없다(기존 신규 필드 추가와 동일 경로).

설정 UI에서는 **전송 서버** 그룹의 세 번째 필드로 넣는다 — 엔드포인트·토큰과 함께 "무엇을 어디로 보내는가"가 한 묶음이 된다. placeholder는 `주문 API` 같은 예시로 두되, 자동 제안값을 채우지 않는다. 군집이 목적이므로 사용자가 적은 값이 그대로 나가야 한다.

**메시지 계약 축소**

`SEND_CURRENT_SESSION`에서 `name`을 제거하고, background가 `settings.sessionName`을 직접 읽는다.

```ts
// background/index.ts — SEND_CURRENT_SESSION
const name = state.settings.sessionName.trim() || undefined
const split = splitAndArchive(state, msg.callIds, name, ctx.now())
```

근거: background는 전송 시 이미 `getStorage()`로 `settings`를 읽는다(`index.ts` `serialized` 블록). UI가 같은 값을 전달하면 경로가 둘로 갈리고, 패널이 열린 채 설정을 바꾸면 어느 값이 나가는지 모호해진다. background가 전송 시점의 설정을 읽으면 단일 진실이 된다.

메시지는 `SEND_CURRENT_SESSION { callIds }`로 줄어든다. `splitAndArchive`의 시그니처와 `sender`의 페이로드 조립은 **변경하지 않는다** — `name`이 `undefined`면 `JSON.stringify`가 필드를 생략하는 기존 동작이 유지되어 서버 계약은 그대로다.

**이름이 나가는 경로**

| 설정값 | 전송 payload |
|---|---|
| `주문 API` | `"name": "주문 API"` (가공 없음) |
| 빈 문자열 | `name` 필드 생략 |

**계약 드리프트 예방** — 이 프로젝트에는 `docs/solutions/integration-issues/manual-send-message-contract-drift.md`라는 선례가 있다. UI와 핸들러의 메시지 기대가 어긋났는데 양쪽 유닛 테스트가 모두 green이라 잡히지 않았던 건이다. 그 문서의 예방책을 그대로 적용한다: **보내는 쪽(`index.test.tsx`)과 받는 쪽(`background/index.test.ts`)의 테스트를 같은 커밋에서 함께 갱신하고, 두 테스트가 동일한 메시지 모양을 쓰는지 확인한다.**

### 3. 컴포넌트와 파일 변경

**신규 `SummaryBar.tsx`**

`ListView`는 이미 155줄에 props 15개다. 요약을 인라인으로 넣으면 한 파일이 목록·선택·요약·전송을 모두 떠안으므로 독립 컴포넌트로 분리한다. 기존 SendView의 계산 로직(`byMethod` 리듀스, `totalBytes`)을 이관한다.

```
SummaryBar
  props: calls(선택분) / totalCount / settings / onToggleAll / disabled
  내부 state: expanded
```

전체 선택 체크박스의 판정은 기존 `selbar`와 동일하게 유지한다: `totalCount > 0 && calls.length === totalCount`일 때 checked. `disabled`는 `totalCount === 0 || sending`.

접힘 상태는 내부 state로 두고 **영속하지 않는다** — `excludedIds`와 같은 방침이다(전송 직전의 일시적 UI 상태, storage 쓰기 부담 회피).

**변경 파일**

| 파일 | 변경 |
|---|---|
| `ui/sidepanel/SummaryBar.tsx` | 신규 — 접힘 1줄 + 펼침 상세(분포·이름·대상) |
| `ui/sidepanel/SendView.tsx` | **삭제** — 계산 로직은 SummaryBar로 이관 |
| `ui/sidepanel/ListView.tsx` | `selbar` 블록 → `<SummaryBar>` 교체. props: `selectedCount: number` → `selectedCalls: ApiCall[]`, `settings` 추가, `onGoSend` → `onSend` |
| `ui/sidepanel/Rail.tsx` | `RailView`에서 `'send'` 제거, 전송 버튼 삭제 |
| `ui/sidepanel/index.tsx` | `View`를 `'list' \| 'detail' \| 'settings'`로 축소. `sessionName` state·`namePlaceholder` 계산·SendView 분기 제거. `onSend`가 `{ type, callIds }` 발송 |
| `ui/sidepanel/SettingsView.tsx` | 전송 서버 그룹에 `세션 이름` 입력 추가 |
| `shared/types.ts` | `Settings.sessionName`, `DEFAULT_SETTINGS`에 `''` |
| `shared/messages.ts` | `SEND_CURRENT_SESSION`에서 `name` 제거 |
| `background/index.ts` | `settings.sessionName.trim() \|\| undefined`를 `splitAndArchive`에 전달 |

`splitAndArchive`와 `sender.ts`는 변경하지 않는다 — 이름을 어디서 얻는지만 바뀌고 처리 방식은 동일하므로, 순수 함수 계층을 건드리지 않는 편이 회귀 위험이 낮다.

### 4. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 선택 0건 | 푸터 버튼 `disabled`(기존 유지). background의 `no calls selected` 방어도 그대로 |
| 전송 중 새 호출 도착 | 기존 동작 유지 — 미선택으로 분류되어 새 세션에 잔류 |
| `serverUrl` 미설정 | 요약 펼침의 대상에 `(미설정)`, 전송 시 sender의 명시적 에러를 토스트로 노출 |
| 설정 이름 변경 직후 전송 | `patchStorage` → `onStorageChanged`로 요약 표시가 갱신되고, background는 전송 시점 `settings`를 읽으므로 표시값과 전송값이 일치 |

**검색 중 요약의 기준 불일치 (동작 무변경, 알려진 제약)**

`onToggleAll`과 선택 카운트는 지금도 검색 필터를 무시하고 전체 호출 기준이다. 검색으로 3건만 보이는데 요약에 `12/12건`이 뜰 수 있다. 요약이 상단에 상시 노출되면 이 불일치가 더 눈에 띈다. 이번에는 동작을 바꾸지 않는다 — 선택을 필터 기준으로 바꾸면 "안 보이는 항목이 선택 해제되는" 더 위험한 혼란이 생긴다.

**전송 실패 시 데이터가 UI에서 사라지는 문제**

실패하면 선택분이 `failed` 세션으로 아카이브되면서 현재 목록에서 빠지는데, 히스토리 탭이 `disabled`라 다시 꺼낼 수 없다(E2E에서 재현). 이번 변경이 만든 문제는 아니지만 전송이 1클릭이 되면서 도달하기 쉬워진다. 재전송 UI 구현은 범위 밖으로 두되, **실패 토스트 문구에 데이터가 보관되었음을 명시**하는 것만 이번에 포함한다.

현재 문구는 `전송 실패: {error}`다. 이를 `전송 실패 — {N}건은 히스토리에 보관됨: {error}`로 바꾼다. 성공 문구(`{N}건을 서버로 전송했습니다`)는 변경하지 않는다.

### 5. 테스트 계획

| 파일 | 처리 |
|---|---|
| `SendView.test.tsx` (5) | 삭제 → `SummaryBar.test.tsx`로 재작성: 접힘/펼침 토글, 선택분 기준 분포·페이로드, 이름 표시(설정값/`이름 없음`), 대상 URL, `(미설정)` |
| `ListView.test.tsx` (12) | 선택 바 셀렉터가 SummaryBar로 이동 — 해당 케이스를 SummaryBar 렌더 기준으로 수정. 푸터 버튼이 전송을 호출하는지로 어설션 변경 |
| `index.test.tsx` (10) | 발송 페이로드를 `{ type: SEND_CURRENT_SESSION, callIds: [...] }`로 갱신(`name` 없음). 전송 탭 전환 케이스 제거 |
| `Rail.test.tsx` (3) | 전송 탭 케이스 제거, 남은 탭 구성 검증으로 대체 |
| `SettingsView.test.tsx` (3) | 세션 이름 입력 → `patchStorage` 호출 케이스 추가 |
| `background/index.test.ts` (28) | `SEND_CURRENT_SESSION`이 `settings.sessionName`을 반영하는지, 빈 문자열이면 생략하는지 케이스 추가 |
| `types.test.ts` (8) | `DEFAULT_SETTINGS.sessionName` 기본값 |

## 검증 방법

1. `npx tsc --noEmit` + `npm run test:run` — 갱신된 테스트 전량 통과
2. E2E 재검증 — `agent-browser --extension dist/` + 로컬 목 서버(`POST /api/sessions` 수신) 하네스로 확인:
   - 푸터 버튼 1클릭으로 실제 전송되는지 (탭 이동 없음)
   - 설정의 세션 이름이 `payload.name`에 가공 없이 실리는지
   - 이름을 비우면 `name` 필드가 생략되는지
   - 요약 접힘/펼침과 선택 변경이 실시간 반영되는지

## 문서 영향

`docs/handoff/2026-07-28-extension-usage.md`의 §3·§4·§5가 낡는다. 세션 이름이 전송 경로에서 설정으로 옮겨가고 전송 탭 자체가 사라지므로 본문 갱신과 스크린샷 2장(`images/02-list-checkbox.png`, `images/03-send-name.png`) 교체가 필요하다.

## 완료 기준

- Rail이 수집 / MCP(준비 중) / 히스토리(준비 중) / 설정으로 구성되고, 전송 탭이 없다
- 수집 탭 상단 요약이 접힘 1줄 / 펼침 상세로 동작하고, 선택 변경이 실시간 반영된다
- 푸터 버튼 1클릭으로 전송이 실행된다(탭 이동 없음)
- 설정의 세션 이름이 가공 없이 `payload.name`으로 나가고, 비우면 필드가 생략된다
- `tsc --noEmit`·전체 테스트 통과, E2E 4개 항목 확인
- handoff 문서 §3·§4·§5 갱신 및 스크린샷 2장 교체

## 범위 밖

- 히스토리·MCP 탭 구현 (`disabled` 유지)
- 전송 페이로드의 미문서화 `pageUrl` 필드 정리 — 서버 계약 결정이 선행되어야 함
- 설정 동시 변경 시 stale closure(`onChangeSettings`의 클로저 캡처) — 사람 조작 속도에서는 재현되지 않음
- 검색 필터와 선택 기준 일치
