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

이 프로젝트는 TipTap/ProseMirror 기반 리치 텍스트 에디터입니다.

- 핵심 모듈: `src/packages/core` (commands, extensions), `src/packages/customize` (프로젝트 전용 확장)
- **주의**: `common/` 디렉터리는 탐색만 가능, 수정 금지 — 그래프에서 해당 경로가 나와도 `src/` 내에서 별도 구현
- 계층 구조: TipTap Extension → ProseMirror Plugin → ProseMirror 상태 관리
- 컨텍스트 레이어: `src/context/` — EditorManager, MediaManager, WebView
