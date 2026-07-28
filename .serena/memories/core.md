# core

API-to-MCP Tracker — 브라우저의 REST 호출을 캡처해 세션으로 모으고, 선택분을 백엔드로 보내 MCP 서버로 변환하는 Chrome MV3 확장.

## 소스 맵

```
src/
├─ background/   서비스 워커. index(handleMessage 라우터·write-lock 큐·idle alarm),
│                session-manager(appendCall 필터, rotateSession·splitAndArchive), sender(전송·재시도·mcpList 병합)
├─ content/      injected-capture(페이지 메인월드 fetch·XHR 패치), content-bridge(postMessage→runtime), widget-host(shadow DOM 마운트)
├─ shared/       types · messages(MSG 계약) · storage(chrome.storage.local) · domain-match
├─ ui/sidepanel/ Rail + ListView·SummaryBar·DetailView·SettingsView, view-utils, icons
├─ ui/widget/    FloatingWidget, dock-position
├─ ui/theme/     tokens.css · components.css · fonts.css
└─ ui/consent/   ConsentBanner — dormant. MVP에서 게이트 제거, 활성 코드 경로에서 참조되지 않음
```

루트: `manifest.json`(MV3), `vite.config.ts`.

## 불변식

- **상태 변경은 background 경유**: `settings`를 제외한 모든 `currentSession`/`sessions` 변경(캡처·전송·개별/전체 삭제)은 런타임 메시지(write-lock 큐)를 타야 한다. 패널에서 `patchStorage`로 직접 쓰면 진행 중 전송의 늦은 쓰기와 lost-update 레이스. `settings`만 패널이 직접 영속한다.
- **데이터는 단방향**: 캡처 → background → `chrome.storage.local` → UI가 `onStorageChanged`로 구독. 컨텍스트 간 직접 호출 없음 — 호출 그래프가 경계에서 끊겨 보이는 것은 정상.
- **참조 동등성 계약**: `appendCall`·`splitAndArchive`는 no-op일 때 입력과 **같은 state 참조**를 반환한다. 호출자가 `next === state`로 드롭을 판정하므로 새 객체를 만들면 안 된다.
- **세션 경계**: 30분 idle alarm, 추적 토글, 전송(`splitAndArchive`) 셋뿐. URL 이동(SPA·전체 페이지)은 세션을 끊지 않는다.
- **캡처 필터는 `appendCall` 한 곳**: 메서드·화이트리스트·saveBody·dedupe 전부. 화이트리스트는 포트 제외 hostname 기준. dedupe 키는 pathname만(메서드 무관).

## 함정

- `chrome.runtime.sendMessage<M = any>`는 리터럴에서 M을 추론해 **송신 측 excess-property 검사가 발동하지 않는다**. 메시지 타입에서 필드를 지워도 송신 측 재추가가 컴파일된다. 수신 측만 TS2339로 보호됨. 계약 변경 시 보내는 쪽·받는 쪽 테스트를 같은 커밋에서 갱신할 것.
- `blacklistedDomains`는 스키마와 `widget-host`에만 있고 **설정 UI에 없다**. 화이트리스트는 캡처만 막고(위젯은 뜸), 블랙리스트는 위젯 마운트·스크립트 주입 자체를 막는다.
- 전송 페이로드의 각 call에 `ApiCall`에 없는 `pageUrl`이 섞여 나간다(캡처 시점 페이지 URL).

## 참조

- 도구·명령: `mem:tech_stack`, `mem:suggested_commands`
- 코드 스타일·테스트 작성 규약: `mem:conventions`
- 작업 종료 시 실행할 검증 명령: `mem:task_completion`
- 과거에 해결한 문제의 원인·재발 방지책(같은 증상을 다시 만났을 때 먼저 조회): `docs/solutions/`, 인덱스는 `docs/solutions/README.md`
- 사용자 관점 동작 흐름과 서버 계약: `docs/handoff/2026-07-28-extension-usage.md`
- CRG×Serena 라우팅 규칙: `.claude/rules/code-graph.md`
