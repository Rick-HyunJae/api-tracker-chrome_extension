# conventions

## 테스트

- **co-located**: `src/**/X.test.ts(x)`. 별도 `tests/` 트리 없음.
- 컴포넌트 테스트는 Testing Library + jsdom. `src/test-setup.ts`가 전역 chrome API를 mock.
- **런타임 메시지 계약을 바꾸면 보내는 쪽과 받는 쪽 테스트를 같은 커밋에서 갱신한다.** 양쪽이 같은 픽스처 모양을 쓰는지 확인할 것 — 픽스처가 어긋나면 두 테스트 모두 green인 채로 계약이 깨진다(실제 발생 이력: `docs/solutions/integration-issues/manual-send-message-contract-drift.md`).
- 발송 페이로드 어설션은 `toHaveBeenCalledWith`(정확 일치)를 쓴다. `objectContaining`은 여분 필드를 놓친다. 단, `toEqual` 계열은 `key: undefined`와 키 부재를 구분하지 못하므로 키 부재를 증명하려면 `'key' in obj`를 쓸 것.
- 순수 함수(`session-manager`)는 상태 객체를 직접 만들어 단위 테스트. background 라우터는 `handleMessage(state, msg, senderUrl, ctx)`에 `ctx.sendSession`을 주입해 테스트.

## 코드

- `session-manager`의 함수는 **순수 함수로 유지**한다. chrome API를 직접 부르지 않고 state를 받아 새 state를 반환. 필터·세션 경계 로직이 전부 여기 모여 있어야 테스트가 쉽다.
- no-op일 때 **입력과 같은 참조**를 반환하는 관용구를 지킬 것(`appendCall`, `splitAndArchive`). 호출자가 `next === state`로 판정한다.
- UI 로컬 상태(선택 집합 `excludedIds`, 요약 펼침 여부)는 **영속하지 않는다**. 전송 직전의 일시적 상태이므로 패널을 닫으면 초기화되는 것이 의도된 동작.
- 설정 변경은 `onChangeSettings`가 클로저의 이전 `settings`를 기준으로 patch를 만든다. 같은 tick에 두 설정을 바꾸면 앞의 변경이 유실된다(사람 조작 속도에서는 미발생, 프로그래매틱 연속 클릭에서 재현).

## 주석

- WHY 중심. 코드가 말하는 것을 반복하지 않고, 그렇게 하지 않았을 때 생기는 문제를 적는다. 상세 규약은 `.claude/skills/comment-patterns`.
- 과거 버그의 재발 방지 지점에는 원인을 명시한다(예: `setPointerCapture`를 쓰지 않는 이유, 상대 URL을 캡처 시점에 절대화하는 이유).

## 워크트리

- JS/TS 프로젝트에서 **모든 워크트리는 자기 `node_modules`를 가져야 한다** — `npm install` 또는 `cp -al`. 심링크 금지(React 이중 인스턴스).
- 통합 전 반드시 **메인 repo에서** 테스트를 돌린다. 수집 범위 문제는 워크트리 안에서 재현되지 않는다.
