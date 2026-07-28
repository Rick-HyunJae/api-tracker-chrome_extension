---
title: macOS 디스플레이 절전 중에는 CDP Page.captureScreenshot이 무한 대기 — caffeinate -u로 해소
date: 2026-07-28
category: testing
module: E2E 도구 (agent-browser, CDP)
problem_type: developer_experience
component: testing_framework
severity: medium
applies_when:
  - "macOS에서 헤디드 Chromium을 CDP/agent-browser로 구동해 스크린샷을 찍는 E2E 세션"
  - "야간·무인 자동화처럼 디스플레이가 절전에 들어간 상태에서 실행되는 브라우저 자동화"
tags: [cdp, screenshot, agent-browser, display-sleep, caffeinate, e2e, macos]
---

# macOS 디스플레이 절전 중에는 CDP Page.captureScreenshot이 무한 대기

## Context

agent-browser로 확장 E2E를 돌리던 중, 세션 초반에는 잘 되던 `screenshot` 명령이 어느 순간부터
전부 hang(클라이언트는 `os error 35 — Resource temporarily unavailable`)했다. 데몬 재시작,
경로 변경, 샌드박스 해제, 헤드리스 전환 플래그까지 전부 소용없었다. CDP로 직접 붙어
`Page.captureScreenshot`을 호출해 보니 **CDP 호출 자체가 응답 없이 매달렸다** — 도구 문제가
아니라 Chrome이 프레임을 만들지 못하는 상태였다.

## Guidance

원인은 **macOS 디스플레이 절전**이다. 화면이 꺼지면 window server가 헤디드 창의 컴포지팅을
중단하고, Chrome은 새 프레임을 생산하지 않으므로 `Page.captureScreenshot`(fromSurface
true/false 모두)이 프레임을 기다리며 무한 대기한다. 스냅샷·클릭·eval 같은 비화면 CDP 명령은
정상 동작하기 때문에 "도구가 반쯤 고장난" 것처럼 보인다.

해결은 캡처 전에 디스플레이를 깨우거나 켜 두는 것:

```bash
caffeinate -u -t 3          # 사용자 활동을 시뮬레이트해 디스플레이를 즉시 깨움 (1회성)
caffeinate -d -u -t 600 &   # 스크린샷 세션 동안 디스플레이 절전 방지 (백그라운드 유지)
```

## Why This Matters

- 증상(소켓 EAGAIN, 데몬 무응답)이 원인(디스플레이 절전)과 전혀 다른 층에서 나타나 디버깅이
  크게 우회한다. 이 문서가 있으면 "스크린샷만 hang + 다른 CDP 명령은 정상" 조합에서 바로
  디스플레이 상태를 의심할 수 있다.
- 세션 초반(사용자 활동 직후)에는 성공하다가 시간이 지나며 실패하는 **시간 의존적 플레이크**로
  나타난다.

## When to Apply

- 스크린샷/스크린캐스트 명령만 hang하고 스냅샷·클릭·eval은 정상일 때
- 낮에는 되던 E2E가 야간 실행에서만 깨질 때
- `agent-browser screenshot`이 `os error 35`를 반복할 때 (데몬 재시작 전에 먼저 의심)

## Examples

```bash
# E2E 스크린샷 세션의 안전한 시작 패턴
caffeinate -d -u -t 600 &
CAF_PID=$!
agent-browser --extension dist --headed open http://localhost:8787/
agent-browser screenshot out.png   # 이제 즉시 성공
# ... 캡처 작업 ...
kill $CAF_PID
```

진단용 — 도구를 거치지 않고 CDP에서 직접 확인(Bun):

```ts
// Page.enable은 ok인데 Page.captureScreenshot만 무응답이면 컴포지터가 프레임을 안 만드는 상태
const shot = await Promise.race([
  send('Page.captureScreenshot', { format: 'png' }),
  new Promise((_, rej) => setTimeout(() => rej(new Error('capture timeout')), 10000)),
])
```

## 두 번째 원인 — GPU 컴포지팅 경로 (2026-07-28 추가)

같은 증상(스크린샷만 무한 대기, 다른 CDP 명령은 정상)이 **디스플레이가 깨어 있는데도** 재현된
사례가 있다. `caffeinate`로 해소되지 않았고, 네이티브 `screencapture -x`조차
`could not create image from display`로 실패했다 — 즉 Chrome이 아니라 호스트의 화면 캡처
경로 자체가 막힌 상태였다(macOS 화면 기록 권한 미부여로 추정).

해소는 GPU 컴포지팅을 우회해 브라우저를 띄우는 것:

```bash
agent-browser --session <name> --headed --extension "$PWD/dist" \
  --args "--disable-gpu,--use-gl=swiftshader,--disable-gpu-compositing" \
  open http://localhost:4599/
```

**감별 방법**: `caffeinate -u -t 3` 후에도 hang이 계속되면 디스플레이 절전이 원인이 아니다.
`screencapture -x /tmp/probe.png`를 직접 실행해 보고 그것마저 실패하면 호스트 캡처 경로 문제이므로
위 `--args`로 소프트웨어 렌더링을 강제한다. 성공하면 Chrome/컴포지터 쪽 문제다.

## Related

- [jsdom-pointer-event-missing-coordinates](jsdom-pointer-event-missing-coordinates.md) — 같은 계열(테스트 환경이 런타임과 다르게 동작)
