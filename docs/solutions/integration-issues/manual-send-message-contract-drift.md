---
title: 수동 전송이 항상 실패 — UI 메시지와 핸들러 기대가 어긋난 통합 구멍 (132개 유닛 테스트 전부 green)
date: 2026-07-28
category: integration-issues
module: src/ui/sidepanel (onSend), src/background (handleMessage SEND_SESSION)
problem_type: integration_issue
component: side_panel
symptoms:
  - "Send 뷰에서 'N건 전송' 클릭 시 항상 토스트 '전송 실패: session not found'"
  - "sender·핸들러 유닛 테스트는 전부 통과 — 실패 경로가 테스트에 잡히지 않음"
root_cause: logic_error
resolution_type: code_fix
severity: critical
tags: [message-contract, integration-gap, send-session, unit-test-blindspot]
---

# 수동 전송이 항상 실패 — UI 메시지와 핸들러 기대가 어긋난 통합 구멍

## Problem

사이드패널의 수동 전송이 단 한 번도 성공할 수 없는 상태였다. UI는 **현재 세션**(currentSession)의
id로 `SEND_SESSION`을 보내는데, 핸들러는 **아카이브 배열**(`state.sessions`)에서만 그 id를
검색했다. 현재 세션은 30분 idle rotate나 autoSend(50건) 전에는 `sessions[]`에 존재하지 않으므로
`findIndex`는 항상 -1이었다.

## Symptoms

- "N건 전송" 클릭 → `전송 실패: session not found` 토스트 (100% 재현)
- E2E에서 세션을 수동으로 rotate시킨 뒤 같은 메시지를 보내면 `{ok: true}` — 부품은 전부 정상

## What Didn't Work

- 유닛 테스트만으로는 감지 불가: 핸들러 테스트는 "아카이브에 있는 세션"으로만 픽스처를 만들었고,
  UI 테스트는 sendMessage 호출 여부만 확인했다. **양쪽 다 green인데 계약이 어긋나 있었다.**

## Solution

현재 세션 전송을 별도 연산으로 분리했다: 신규 메시지 `SEND_CURRENT_SESSION { name?, callIds }` →
`splitAndArchive`(선택분만 pending 아카이브, 미선택분은 새 세션 잔류) → 전송. 기존
`SEND_SESSION`은 아카이브 세션 전용으로 유지(향후 히스토리 재전송용).

```ts
// background/index.ts
case MSG.SEND_CURRENT_SESSION: {
  const split = splitAndArchive(state, msg.callIds, msg.name, ctx.now())
  if (split === state) return { state, response: { ok: false, error: 'no calls selected' } }
  return sendArchivedAt(split, split.sessions.length - 1, ctx)
}
```

## Why This Works

"현재 세션을 보낸다"와 "아카이브 세션을 보낸다"는 서로 다른 사전 조건을 가진 연산이다. 하나의
메시지로 두 의미를 겸하게 두는 대신 연산을 분리하면 계약이 타입으로 드러나고, 핸들러 분기 없이
각각을 독립적으로 테스트할 수 있다.

## Prevention

- **UI가 실제로 발송하는 페이로드를 그대로 어설션하는 통합 테스트를 최소 1개 유지한다.**
  이번에 추가한 테스트가 그 역할을 한다:

```tsx
// ui/sidepanel/index.test.tsx — BUG의 정확한 재발 방지 지점
fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
await waitFor(() =>
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: MSG.SEND_CURRENT_SESSION, name: '내 세션', callIds: ['c1'],
  }),
)
```

- 메시지 타입을 추가/변경할 때는 "보내는 쪽 테스트"와 "받는 쪽 테스트"가 **같은 픽스처 모양**을
  공유하는지 확인한다. 픽스처가 다르면 계약 드리프트가 테스트를 통과한다.

## 후속 변경 (2026-07-28, 수집 탭 통합)

위 Solution의 메시지는 이후 **`SEND_CURRENT_SESSION { callIds }`로 축소**되었다. 세션 이름이
전송 시점 입력에서 설정값(`Settings.sessionName`)으로 옮겨가면서, UI가 이름을 실어 보내는 대신
백그라운드가 `state.settings.sessionName.trim() || undefined`를 직접 읽는다. 값의 출처를 하나로
두어 "패널이 열린 채 설정을 바꾸면 어느 값이 나가는가"라는 모호함을 없앤 것이다.

이 문서의 Prevention 항목은 그대로 유효하며, 실제로 그 변경에서 사용되었다 — 보내는 쪽
(`index.test.tsx`)과 받는 쪽(`background/index.test.ts`) 테스트를 같은 커밋에서 함께 갱신했다.

한 가지 덧붙일 사실: **`chrome.runtime.sendMessage`는 타입으로 계약을 지켜주지 않는다.**
시그니처가 `sendMessage<M = any>(message: M)`이라 리터럴에서 `M`을 추론하므로 excess-property
검사가 발동하지 않는다. 메시지 타입에서 필드를 지워도 송신 측에서 그 필드를 다시 넣으면
컴파일은 통과한다(실측 확인). 수신 측만 `msg.name` 접근에서 TS2339로 막힌다. 따라서 송신 측
방어는 여전히 **테스트**의 몫이며, `toHaveBeenCalledWith`(부분 일치인 `objectContaining`이 아니라
정확 일치)로 어설션해야 한다.

## Related Issues

- [session-change-as-keepalive-not-boundary](../logic-errors/session-change-as-keepalive-not-boundary.md) — 같은 세션 경계 설계의 앞선 결정
- docs/specs/2026-07-28-plan-a-fixes-design.md
- docs/specs/2026-07-28-collect-tab-consolidation-design.md — 위 후속 변경의 설계
