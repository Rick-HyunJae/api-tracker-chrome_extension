---
title: 상대경로 fetch와 URL.host의 포트가 화이트리스트·dedupe·URL 표기를 연쇄로 깨뜨림
date: 2026-07-28
category: logic-errors
module: src/content/injected-capture, src/background/session-manager, src/ui/sidepanel
problem_type: logic_error
component: injected_capture
symptoms:
  - "화이트리스트 설정 시 같은 사이트의 fetch('/api/x') 호출이 전부 드롭됨"
  - "화이트리스트에 'localhost'를 넣어도 localhost:8787 페이지의 호출이 드롭됨"
  - "Detail 뷰 URL이 'https:///api/orders'처럼 깨져 표기됨 (스킴 하드코딩 + 빈 host)"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [url-parsing, relative-url, hostname-vs-host, whitelist, dedupe, capture-pipeline]
---

# 상대경로 fetch와 URL.host의 포트가 화이트리스트·dedupe·URL 표기를 연쇄로 깨뜨림

## Problem

SPA의 가장 흔한 패턴인 상대경로 호출(`fetch('/api/x')`)이 캡처 파이프라인의 세 곳을 동시에
깨뜨렸다. 원문 URL을 그대로 저장했기 때문에 하류의 모든 `new URL(call.url)` 파싱이 throw했고,
각 소비처가 저마다의 폴백으로 조용히 오동작했다.

## Symptoms

1. **화이트리스트**: `new URL(url)` throw → `host=''` → 매칭 실패 → 캡처 드롭
2. **dedupe**: `safePath` 폴백이 쿼리스트링 포함 원문을 키로 사용 → "쿼리 무시" 명세 위반
3. **Detail 표기**: `https://` 하드코딩 + 빈 host → `https:///api/orders`
4. 절대화 이후에도 남은 2차 버그: `new URL(url).host`는 **포트를 포함**(`localhost:8787`)하므로
   도메인 패턴 `localhost`와 불일치 — 블랙리스트는 `location.hostname`(포트 제외)을 쓰고 있어
   화이트/블랙 간 의미도 어긋나 있었다

## What Didn't Work

- 유닛 테스트는 전부 `https://api.allowed.io/x`처럼 **기본 포트의 절대 URL**만 사용해 두 버그
  모두 통과시켰다. E2E(localhost:8787 + 상대경로)에서야 드러났다.

## Solution

데이터가 태어나는 지점 한 곳에서 절대화하고, 도메인 매칭은 포트 없는 `hostname`으로 통일했다.

```ts
// content/injected-capture.ts — 캡처 시점 절대화 (fetch·XHR 공통)
function absolutize(url: string, win: Window): string {
  try {
    return new URL(url, win.location.href).href
  } catch {
    return url // malformed input: keep the raw string, capture stays best-effort
  }
}
```

```ts
// background/session-manager.ts — .host가 아니라 .hostname
host = new URL(call.url).hostname
```

```ts
// ui/sidepanel/view-utils.ts — 스킴 하드코딩 대신 실제 origin
export function originOf(url: string): string {
  try { return new URL(url).origin } catch { return '' }
}
```

## Why This Works

- **born-correct 원칙**: 저장 시점에 URL을 절대화하면 하류 소비처(화이트리스트·dedupe·표기·전송
  페이로드) 전부가 한 번에 정상화된다. 소비처마다 보정하면 소비처 수만큼 버그가 남는다.
- `URL.host`는 `hostname:port`, `URL.hostname`은 호스트만이다. 사용자가 입력하는 "도메인"
  패턴과 비교할 값은 언제나 `hostname`이다.

## Prevention

- URL을 저장하는 코드는 저장 직전에 절대화한다. 소비처에서 `new URL(x)`를 base 없이 호출하는
  코드가 새로 생기면 입력이 절대 URL임이 보장되는지 확인한다.
- 도메인 매칭 테스트에는 반드시 **비표준 포트 케이스**를 포함한다:

```ts
it('whitelist matches hosts with a non-default port (hostname, not host)', () => {
  const settings = { ...DEFAULT_SETTINGS, domainWhitelist: ['localhost'] }
  const next = appendCall(DEFAULT_STORAGE, call({ url: 'http://localhost:8787/api/users' }), 1, settings)
  expect(next.currentSession!.calls).toHaveLength(1)
})
```

- 상대경로 fetch/XHR 케이스를 캡처 테스트의 기본 레퍼토리에 포함한다.

## Related Issues

- [manual-send-message-contract-drift](../integration-issues/manual-send-message-contract-drift.md) — 같은 작업에서 함께 수정
