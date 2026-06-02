# Interview: api-to-mcp-tracker

**Date:** 2026-05-31
**Source request:** 브라우저에서 페이지 이동 시 발생하는 REST API를 수집해 서버로 보내고, 서버가 만든 MCP 리스트를 UI로 표시하는 Chrome Extension의 F/E 설계

## 목표

사용자가 브라우저에서 페이지를 이동·조작하며 호출하는 REST API를 캡처하여 서버로 전송하고, 서버가 MCP 서버로 변환해 돌려준 리스트를 확장 UI에서 시각화한다. 본인 담당 범위는 F/E 전체 (Chrome Extension). 향후 방향성으로 AI 화면 조작이 있지만 본 인터뷰 범위에서는 다루지 않는다.

## 범위

- **포함**
  - Chrome Manifest V3 기반 Extension 개발
  - Content script로 `fetch` / `XMLHttpRequest` monkey-patch하여 임의 origin의 REST API 호출 + 응답 body 캡처
  - History API 변경(`pushState` / `replaceState` / `popstate`) + full navigation 감지로 페이지 경계 식별
  - 한 URL 세션 단위로 API 호출을 묶어 서버로 전송
  - 사용자 동의 흐름 및 트래킹 ON/OFF 제어
  - Floating widget (우측 호버형) + 팝업 + 슬라이드 사이드패널 UI 구성
  - 사이드패널에서 현재 페이지 캡처 정보 실시간 표시
  - 별도 대시보드(확장 옵션 페이지 또는 외부 웹)에서 서버가 돌려준 MCP 리스트 표시

- **제외**
  - 백엔드의 MCP 변환 로직
  - Agent 측 호출 시 인증·토큰 갱신 처리
  - AI 화면 조작 기능
  - iframe / Service Worker / Web Worker 내부 호출 캡처 (v2 이후)
  - 응답 body 내부 PII 자동 마스킹 (v2 이후)

## 제약

- **기술**
  - Chrome Manifest V3 환경에서 동작
  - Origin 무관하게 캡처되어야 함 → content script가 main world로 monkey-patch 주입
  - 응답 body 캡처 필수 → `chrome.webRequest` 단독으로는 불가, content script 가로채기 방식 채택
  - 디버깅 배너 노출 금지 → `chrome.debugger` API 사용하지 않음
  - 임의 사이트에 위젯 주입하므로 CSS 격리를 위해 Shadow DOM 사용 필수
  - z-index 최상위 고정 필요
  - SPA에서 DOM이 갈아엎히는 경우 대비, 위젯 root를 `MutationObserver`로 감시 후 재주입

- **사용 흐름**
  - 사용자 동의 직후부터 트래킹 시작
  - 마스킹·필터링 없이 헤더·쿠키·body를 그대로 서버 전송 (MVP 단순화 선택)

## 핵심 결정 사항

- **캡처 방식**: Content script에서 `window.fetch`, `XMLHttpRequest.prototype.open/send` monkey-patch
- **페이지 경계**: `pushState` / `replaceState`도 monkey-patch하여 URL 변경 감지. `popstate` 이벤트 리슨. Full navigation까지 포함하여 URL이 바뀔 때마다 한 세션의 끝/다음 세션의 시작으로 처리
- **데이터 단위**: 한 URL 세션 = 하나의 묶음. 그 URL이 활성인 동안 발생한 모든 API 호출(스크롤·필터·모달 등으로 발생하는 추가 호출 포함)을 그 세션에 포함시켜 전송
- **데이터 전송**: 마스킹 없이 헤더·쿠키·body 원본 그대로 서버로 전송
- **UI 패턴**: 페이지 우측 floating widget(호버 시 활성화) + 클릭 시 팝업 또는 슬라이드 사이드패널
- **사이드패널 정보 구조**: 캡처 중심. 현재 페이지에서 실시간으로 캡처되는 API 호출 리스트와 응답 미리보기, 트래킹 ON/OFF, 전송 컨트롤만 포함. MCP 리스트는 사이드패널에 두지 않고 별도 대시보드(확장 옵션 페이지 또는 외부 웹)에서 표시. 사이드패널에서 대시보드로 이동하는 진입점은 제공.
- **CSS 격리**: Shadow DOM
- **위젯 노출 제어**: 도메인 블랙리스트로 특정 사이트에서 위젯 숨기기 옵션
- **상태 시그널**: 트래킹 중 여부와 캡처된 호출 수를 floating button 뱃지로 표시

## 완료 기준

- 확장 설치 후 사용자가 동의하면, 임의의 사이트에서 페이지 이동 및 내부 API 호출이 일어났을 때 URL 단위로 묶인 요청·응답 페이로드가 서버로 정상 전송된다
- Floating widget이 임의 사이트에서 사이트 CSS 충돌 없이 정상 표시되고, 호버·클릭으로 팝업과 사이드패널이 동작한다
- 사이드패널에서 현재 페이지의 실시간 캡처 호출 리스트와 응답 미리보기를 확인할 수 있다
- 별도 대시보드에서 서버가 돌려준 MCP 리스트를 테이블 형태로 확인할 수 있다
- 사용자가 확장 UI에서 트래킹 ON/OFF와 도메인 블랙리스트를 제어할 수 있다
- SPA에서 client-side routing 후에도 widget이 사라지지 않고 살아 있다

## 열린 질문

- **사용자 고지·동의 문구 설계** — 인증 정보와 PII가 평문으로 외부 서버에 전송됨을 명확히 알리는 동의 흐름 필요. 법적 검토 권장.
- **초기 호출 누락 가능성** — SPA 페이지 진입 직후 monkey-patch 주입 전에 발사되는 호출은 놓칠 수 있음. `document_start` 단계에 가능한 한 빠르게 주입 필요, 그래도 한계 존재.
- **세션 종료 시점** — 다음 URL 변경 시점까지가 한 세션이지만, 사용자가 동일 URL에서 장시간 머무를 때 idle 컷오프 적용 여부.
- **서버 전송 schema** — 한 URL 세션 묶음의 정확한 payload 구조를 백엔드와 합의 필요.
- **중복 호출 처리** — 같은 endpoint 반복 호출을 F/E에서 dedupe할지, 다 보내고 서버가 처리할지.
- **MCP 대시보드 위치** — 확장의 옵션 페이지로 둘지, 외부 웹 서비스의 대시보드로 둘지 결정 필요. 후자라면 인증·라우팅 등 별도 설계.
- **사이드패널 ↔ 대시보드 이동 동선** — 대시보드 진입점을 사이드패널에 둘 때 새 탭으로 띄울지, 임베드할지.
