---
name: crg-refactor-safely
description: Use when renaming symbols, extracting code, removing dead code, or any structural change where understanding the blast radius is important.
argument-hint: "<symbol or file to refactor>"
---

# Refactor Safely

Use the knowledge graph to plan and execute refactoring with confidence.

## Steps

0. Run `get_minimal_context(task="<symbol or file to refactor>")` to load only the relevant graph context.
1. Use `refactor_tool` with mode="suggest" for community-driven refactoring suggestions.
2. Use `refactor_tool` with mode="dead_code" to find unreferenced code.
3. For renames, use `refactor_tool` with mode="rename" to preview all affected locations.
4. Use `apply_refactor_tool` with the refactor_id to apply renames.
5. After changes, run `detect_changes` to verify the refactoring impact.

## Safety Checks

- Always preview before applying (rename mode gives you an edit list).
- Check `get_impact_radius` before major refactors.
- Use `get_affected_flows` to ensure no critical paths are broken.
- Run `find_large_functions` to identify decomposition targets.

## When NOT to Use

- When the knowledge graph has not been built yet (run `build_or_update_graph_tool` first)
- For cosmetic changes (formatting, comments) with no structural impact
- When the refactor scope is already well-understood and isolated to a single file

## Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.

## See Also

- `crg-explore-codebase` — 리팩터 전 의존성과 아키텍처를 파악할 때
- `crg-review-changes` — 리팩터 적용 후 영향 범위를 검증할 때

## Project Context

이 프로젝트는 Chrome MV3 확장(API-to-MCP Tracker)입니다. 세 실행 컨텍스트로 나뉘며, 그래프를 읽을 때 이 경계를 기준으로 삼으면 빠릅니다.

- **서비스 워커** `src/background/` — `index`(handleMessage 라우터·write-lock 큐·idle alarm), `session-manager`(appendCall 캡처 필터, rotateSession·splitAndArchive 세션 경계), `sender`(전송·재시도·mcpList 병합)
- **콘텐츠 스크립트** `src/content/` — `injected-capture`(페이지 메인월드 fetch·XHR 패치), `content-bridge`(postMessage→runtime 중계), `widget-host`(shadow DOM 마운트)
- **UI** `src/ui/` — `sidepanel/`(Rail + List/Detail/Settings, SummaryBar), `widget/`(FloatingWidget·dock-position), `theme/`(tokens·components CSS)
- **공유** `src/shared/` — types·messages(MSG 계약)·storage(chrome.storage.local)·domain-match

데이터는 단방향으로 흐릅니다: 캡처 → background → `chrome.storage.local` → UI가 `onStorageChanged`로 구독. 컨텍스트 간 직접 호출은 없고 전부 런타임 메시지를 거치므로, 호출 그래프가 컨텍스트 경계에서 끊겨 보이는 것은 정상입니다.

- **주의**: 런타임 메시지(`src/shared/messages.ts`의 `MSG`) 계약을 바꿀 때는 보내는 쪽과 받는 쪽 테스트를 같은 커밋에서 함께 고쳐야 합니다. `chrome.runtime.sendMessage`는 제네릭 추론 탓에 송신 측 excess-property 검사가 발동하지 않아 타입이 계약을 지켜주지 못합니다 — 과거 이 지점에서 수동 전송이 100% 실패한 전례가 있습니다(`docs/solutions/integration-issues/manual-send-message-contract-drift.md`).
