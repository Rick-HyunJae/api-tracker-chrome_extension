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

이 프로젝트는 TipTap/ProseMirror 기반 리치 텍스트 에디터입니다.

- 핵심 모듈: `src/packages/core` (commands, extensions), `src/packages/customize` (프로젝트 전용 확장)
- **주의**: `common/` 디렉터리는 탐색만 가능, 수정 금지 — 그래프에서 해당 경로가 나와도 `src/` 내에서 별도 구현
- 계층 구조: TipTap Extension → ProseMirror Plugin → ProseMirror 상태 관리
- 컨텍스트 레이어: `src/context/` — EditorManager, MediaManager, WebView
