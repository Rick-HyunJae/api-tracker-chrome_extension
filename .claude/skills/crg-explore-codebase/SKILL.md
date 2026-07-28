---
name: crg-explore-codebase
description: Use when exploring the architecture, finding where specific functionality lives, or understanding module relationships.
argument-hint: "[module name or feature to explore]"
---

# Explore Codebase

Use the code-review-graph MCP tools to explore and understand the codebase.

## Steps

0. Run `get_minimal_context(task="<what you want to explore>")` to load only the relevant graph context.
1. Run `list_graph_stats` to see overall codebase metrics.
2. Run `get_architecture_overview` for high-level community structure.
3. Use `list_communities` to find major modules, then `get_community` for details.
4. Use `semantic_search_nodes` to find specific functions or classes.
5. Use `query_graph` with patterns like `callers_of`, `callees_of`, `imports_of` to trace relationships.
6. Use `list_flows` and `get_flow` to understand execution paths.

## Tips

- Start broad (stats, architecture) then narrow down to specific areas.
- Use `children_of` on a file to see all its functions and classes.
- Use `find_large_functions` to identify complex code.

## When NOT to Use

- When the knowledge graph has not been built yet (run `build_or_update_graph_tool` first)
- When looking for a specific string or pattern — use Grep directly
- When the codebase is very small and a simple file listing suffices

## Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.

## See Also

- `crg-debug-issue` — 관련 코드를 파악한 뒤 버그 원인을 추적할 때
- `crg-refactor-safely` — 아키텍처를 이해한 뒤 구조를 개선할 때

## Project Context

이 프로젝트는 Chrome MV3 확장(API-to-MCP Tracker)입니다. 세 실행 컨텍스트로 나뉘며, 그래프를 읽을 때 이 경계를 기준으로 삼으면 빠릅니다.

- **서비스 워커** `src/background/` — `index`(handleMessage 라우터·write-lock 큐·idle alarm), `session-manager`(appendCall 캡처 필터, rotateSession·splitAndArchive 세션 경계), `sender`(전송·재시도·mcpList 병합)
- **콘텐츠 스크립트** `src/content/` — `injected-capture`(페이지 메인월드 fetch·XHR 패치), `content-bridge`(postMessage→runtime 중계), `widget-host`(shadow DOM 마운트)
- **UI** `src/ui/` — `sidepanel/`(Rail + List/Detail/Settings, SummaryBar), `widget/`(FloatingWidget·dock-position), `theme/`(tokens·components CSS)
- **공유** `src/shared/` — types·messages(MSG 계약)·storage(chrome.storage.local)·domain-match

데이터는 단방향으로 흐릅니다: 캡처 → background → `chrome.storage.local` → UI가 `onStorageChanged`로 구독. 컨텍스트 간 직접 호출은 없고 전부 런타임 메시지를 거치므로, 호출 그래프가 컨텍스트 경계에서 끊겨 보이는 것은 정상입니다.

- **주의**: `settings`를 제외한 모든 `currentSession`/`sessions` 변경은 background 메시지(write-lock 큐)를 경유해야 합니다. 패널에서 `patchStorage`로 직접 쓰면 진행 중 전송과 lost-update 레이스가 납니다.
