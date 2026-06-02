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

이 프로젝트는 TipTap/ProseMirror 기반 리치 텍스트 에디터입니다.

- 핵심 모듈: `src/packages/core` (commands, extensions), `src/packages/customize` (프로젝트 전용 확장)
- **주의**: `common/` 디렉터리는 탐색만 가능, 수정 금지 — 그래프에서 해당 경로가 나와도 `src/` 내에서 별도 구현
- 계층 구조: TipTap Extension → ProseMirror Plugin → ProseMirror 상태 관리
- 컨텍스트 레이어: `src/context/` — EditorManager, MediaManager, WebView
