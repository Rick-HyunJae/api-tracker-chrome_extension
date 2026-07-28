---
title: SPA navigation reset captured list because SESSION_CHANGE rotated the session instead of acting as keep-alive
date: 2026-06-01
category: logic-errors
module: src/background (handleMessage, session-manager)
problem_type: logic_error
component: service_worker
symptoms:
  - "사이드패널/위젯 캡처 리스트가 SPA 라우팅(pushState/replaceState/popstate) 또는 전체 페이지 이동 직후 빈 상태로 바뀐다"
  - "추적(trackingEnabled)을 켠 채로 URL만 변경했는데 직전까지 쌓인 API 호출들이 화면에서 사라진다"
  - "fetch/XHR 캡처 자체는 정상 동작하지만 누적이 끊긴 것처럼 보인다 — 새 호출은 새 빈 세션에 들어간다"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - content/injected-capture
  - content/content-bridge
  - background/session-manager
  - ui/sidepanel
  - ui/widget
tags:
  - mv3
  - service-worker
  - session-management
  - spa-navigation
  - message-routing
  - chrome-extension
---

# SPA navigation reset captured list because SESSION_CHANGE rotated the session instead of acting as keep-alive

## Problem

수집을 시작한 후 사용자가 URL을 바꾸며 이동하면 사이드패널/위젯의 캡처 리스트가 매번 "초기화"된 것처럼 보였다. 목표는 "수집 시작 후에는 URL이 변경되어도 가능한 한 하나의 세션에 계속 누적"하는 것이었다.

## Symptoms

- SPA 라우팅(pushState/replaceState/popstate) 후 캡처 리스트가 비어 보임
- 전체 페이지 이동(beforeunload) 후 캡처 리스트가 비어 보임
- 추적 토글은 켜져 있고 캡처 파이프라인(fetch/XHR 패치) 자체는 정상 작동
- 새 URL에서 발생한 호출은 새 빈 세션에 쌓이고, 직전 세션의 호출은 사라진 듯 보임

## What Didn't Work

- **캡처 파이프라인 의심 (오답)**: `injected-capture.ts`의 fetch/XHR 패치가 새 컨텍스트에서 풀리는지 의심했으나, 페이지 메인월드에 한 번 주입된 패치는 SPA 전환과 무관하게 유지됨. 끊긴 것은 "캡처"가 아니라 "세션 경계"였다.
- **사이드패널 렌더링 의심 (오답)**: UI가 archived `sessions[]`를 화면에 노출하지 않는 것은 표시 정책상 의도된 동작. UI에서 archived까지 묶어 보여주는 방향은 "현재 세션"이라는 사용자 멘탈 모델을 깨므로 채택하지 않음.
- **새 토글 추가 검토 (불채택)**: "navigation 시 세션을 유지할지" 설정 토글을 추가하는 안. 사용자가 의사결정 비용을 떠안고, 동작이 분기되어 코드도 복잡해짐. 단일 정책으로 정리하는 쪽을 택함.

## Solution

`src/background/index.ts`의 `handleMessage` SESSION_CHANGE 케이스에서 `rotateSession()` 호출을 제거하고 현재 상태를 그대로 반환한다. SESSION_CHANGE 메시지의 의미를 "세션을 끊는 신호"에서 "활동 신호(keep-alive)"로 재정의한다.

```ts
// Before — navigation rotates the session, archiving currentSession into sessions[]
case "SESSION_CHANGE": {
  const state = await rotateSession(/* ... */);
  return { state };
}

// After — navigation no longer ends the session; treat as activity signal only
case "SESSION_CHANGE": {
  const state = await getState();
  return { state };
}
```

`registerBackground`의 IDLE_ALARM 리셋 로직(`API_CAPTURED || SESSION_CHANGE` 수신 시 알람 재설정)은 **그대로 둔다**. 결과적으로 페이지 이동이 유휴 타이머를 리셋하므로 세션이 오히려 더 오래 유지된다.

`rotateSession` 함수 자체는 수정하지 않는다 — idle 타임아웃 경로(IDLE_ALARM, 30분 무활동)와 auto-send 경로에서 여전히 정당하게 사용된다.

`injected-capture.ts` / `content-bridge.ts` / `shared/messages.ts`는 미수정. 메시지 인프라는 유지하되 의미만 재정의했다.

**총 변경**: 2파일 10줄
- `src/background/index.ts` — SESSION_CHANGE 케이스 6줄
- `src/background/index.test.ts` — 테스트를 "세션 유지 검증"으로 교체

## Why This Works

세션 경계의 정당한 트리거는 **사용자 의도**(추적 토글 OFF/ON)와 **명백한 비활성**(idle 타임아웃)뿐이다. URL 변경은 두 조건 어디에도 해당하지 않는다 — 사용자는 같은 작업 흐름 안에서 SPA를 탐색하거나 다음 페이지로 이동하는 중이고, 캡처를 끊고 싶다는 신호가 아니다.

이전 구현은 메시지 이름(`SESSION_CHANGE`)을 액션처럼 해석해 무조건 rotate했지만, 실제로는 "페이지 컨텍스트가 바뀌었다"는 **이벤트 알림**이었다. 이벤트 알림과 세션 경계 결정을 분리하니, 같은 메시지를 활동 신호로 재해석하는 것만으로 의도된 누적 동작이 자연스럽게 나왔다.

핵심 통찰: **캡처(fetch/XHR 패치)는 URL과 무관하게 항상 동작한다.** 끊긴 것은 캡처가 아니라 세션 경계의 정의였다.

## Prevention

- **메시지 이름이 액션을 강제하지 않게 한다**: `*_CHANGE`, `*_EVENT` 류 메시지는 "이벤트 알림"으로 보고, 핸들러에서 상태 전이가 정당한지 별도로 판단한다. 메시지 명칭을 보고 핸들러 동작을 결정하지 말 것.
- **세션 경계의 정당한 트리거를 한 곳에 명문화한다**: idle 타임아웃 + 사용자 토글 OFF/ON만 세션을 끊는다. 새로운 종료 경로를 추가할 때는 이 목록을 의식적으로 확장한다.
- **테스트로 "세션 유지" 자체를 잠근다**: SESSION_CHANGE 수신 시 `state.currentSession.calls`가 보존되고 `state.sessions` 길이가 증가하지 않는다는 invariant를 백그라운드 테스트에서 검증한다.

```ts
// vitest invariant for keep-alive semantics
it("SESSION_CHANGE keeps the current session intact", async () => {
  await handleMessage({ type: "API_CAPTURED", payload: call });
  const before = await getState();
  await handleMessage({ type: "SESSION_CHANGE", payload: { url: "next" } });
  const after = await getState();
  expect(after.currentSession.calls).toEqual(before.currentSession.calls);
  expect(after.sessions.length).toBe(before.sessions.length);
});
```

## Related Notes

### Vitest worktree 함정 (별개 발견)

이번 작업 중 부수적으로 발견된 함정:

- `.worktrees/`가 `.gitignore`엔 있지만 `vite.config.ts`의 `test.exclude`에는 없다.
- 결과: git worktree가 활성일 때 메인 repo에서 `npm run test:run`을 돌리면 워크트리 하위 테스트까지 중복 스캔돼 환경 불일치로 23개 실패가 잡힌다.
- 우회: 워크트리 제거 후 정상화.
- 근본 해결: `vite.config.ts`의 `test.exclude`에 `**/.worktrees/**` 추가.
- 인접 사례: `docs/solutions/integration-issues/worktree-symlinked-node-modules-duplicate-react.md` — 같은 워크트리 환경에서 다른 메커니즘(symlinked node_modules → 중복 React)으로 비슷한 테스트 실패가 발생했던 기록.

## Related Issues

- 커밋: `77cfce5` (master squash merge)
- 인접 문서: `docs/solutions/integration-issues/worktree-symlinked-node-modules-duplicate-react.md`
