---
name: crg-debug-issue
description: Use when encountering bugs, unexpected behavior, or tracing the root cause of an issue in the codebase.
argument-hint: "<issue description or symptom>"
---

# Debug Issue

Use the knowledge graph to systematically trace and debug issues.

## Steps

0. Run `get_minimal_context(task="<issue description>")` to load only the relevant graph context.
1. Use `semantic_search_nodes` to find code related to the issue.
2. Use `query_graph` with `callers_of` and `callees_of` to trace call chains.
3. Use `get_flow` to see full execution paths through suspected areas.
4. Run `detect_changes` to check if recent changes caused the issue.
5. Use `get_impact_radius` on suspected files to see what else is affected.

## Tips

- Check both callers and callees to understand the full context.
- Look at affected flows to find the entry point that triggers the bug.
- Recent changes are the most common source of new issues.

## When NOT to Use

- When the knowledge graph has not been built yet (run `build_or_update_graph_tool` first)
- When the issue is clearly in configuration or environment, not code logic
- For quick one-off searches — use Grep or Read directly

## Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.

## See Also

- `crg-explore-codebase` — 버그를 추적하기 전 모듈 구조를 파악할 때
- `crg-review-changes` — 최근 커밋이 이슈를 유발했는지 확인할 때

## Project Context

이 프로젝트는 Chrome MV3 확장(API-to-MCP Tracker)입니다. 세 실행 컨텍스트로 나뉘며, 그래프를 읽을 때 이 경계를 기준으로 삼으면 빠릅니다.

- **서비스 워커** `src/background/` — `index`(handleMessage 라우터·write-lock 큐·idle alarm), `session-manager`(appendCall 캡처 필터, rotateSession·splitAndArchive 세션 경계), `sender`(전송·재시도·mcpList 병합)
- **콘텐츠 스크립트** `src/content/` — `injected-capture`(페이지 메인월드 fetch·XHR 패치), `content-bridge`(postMessage→runtime 중계), `widget-host`(shadow DOM 마운트)
- **UI** `src/ui/` — `sidepanel/`(Rail + List/Detail/Settings, SummaryBar), `widget/`(FloatingWidget·dock-position), `theme/`(tokens·components CSS)
- **공유** `src/shared/` — types·messages(MSG 계약)·storage(chrome.storage.local)·domain-match

데이터는 단방향으로 흐릅니다: 캡처 → background → `chrome.storage.local` → UI가 `onStorageChanged`로 구독. 컨텍스트 간 직접 호출은 없고 전부 런타임 메시지를 거치므로, 호출 그래프가 컨텍스트 경계에서 끊겨 보이는 것은 정상입니다.

- **주의**: `settings`를 제외한 모든 `currentSession`/`sessions` 변경은 background 메시지(write-lock 큐)를 경유해야 합니다. 패널에서 `patchStorage`로 직접 쓰면 진행 중 전송과 lost-update 레이스가 납니다.
