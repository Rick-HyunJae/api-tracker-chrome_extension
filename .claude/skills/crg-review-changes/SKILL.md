---
name: crg-review-changes
description: Use when reviewing a PR, auditing recent commits, or assessing the risk and test coverage of changed code.
argument-hint: "[PR number, commit hash, or 'latest']"
---

# Review Changes

Perform a thorough, risk-aware code review using the knowledge graph.

## Steps

0. Run `get_minimal_context(task="<what changed or PR description>")` to load only the relevant graph context.
1. Run `detect_changes` to get risk-scored change analysis.
2. Run `get_affected_flows` to find impacted execution paths.
3. For each high-risk function, run `query_graph` with pattern="tests_for" to check test coverage.
4. Run `get_impact_radius` to understand the blast radius.
5. For any untested changes, suggest specific test cases.

## Output Format

Provide findings grouped by risk level (high/medium/low) with:
- What changed and why it matters
- Test coverage status
- Suggested improvements
- Overall merge recommendation

## When NOT to Use

- When the knowledge graph has not been built yet (run `build_or_update_graph_tool` first)
- For documentation-only changes with no code impact
- When the PR/commit scope is trivial (single-line fix, typo correction)

## Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.

## See Also

- `crg-explore-codebase` — 리뷰 전 아키텍처 맥락을 파악할 때
- `crg-refactor-safely` — 리뷰 결과 구조 개선이 필요할 때

## Project Context

이 프로젝트는 TipTap/ProseMirror 기반 리치 텍스트 에디터입니다.

- 핵심 모듈: `src/packages/core` (commands, extensions), `src/packages/customize` (프로젝트 전용 확장)
- **주의**: `common/` 디렉터리는 탐색만 가능, 수정 금지 — 그래프에서 해당 경로가 나와도 `src/` 내에서 별도 구현
- 계층 구조: TipTap Extension → ProseMirror Plugin → ProseMirror 상태 관리
- 컨텍스트 레이어: `src/context/` — EditorManager, MediaManager, WebView
