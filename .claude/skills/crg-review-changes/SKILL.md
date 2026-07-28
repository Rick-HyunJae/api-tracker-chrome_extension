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

이 프로젝트는 Chrome MV3 확장(API-to-MCP Tracker)입니다. 세 실행 컨텍스트로 나뉘며, 그래프를 읽을 때 이 경계를 기준으로 삼으면 빠릅니다.

- **서비스 워커** `src/background/` — `index`(handleMessage 라우터·write-lock 큐·idle alarm), `session-manager`(appendCall 캡처 필터, rotateSession·splitAndArchive 세션 경계), `sender`(전송·재시도·mcpList 병합)
- **콘텐츠 스크립트** `src/content/` — `injected-capture`(페이지 메인월드 fetch·XHR 패치), `content-bridge`(postMessage→runtime 중계), `widget-host`(shadow DOM 마운트)
- **UI** `src/ui/` — `sidepanel/`(Rail + List/Detail/Settings, SummaryBar), `widget/`(FloatingWidget·dock-position), `theme/`(tokens·components CSS)
- **공유** `src/shared/` — types·messages(MSG 계약)·storage(chrome.storage.local)·domain-match

데이터는 단방향으로 흐릅니다: 캡처 → background → `chrome.storage.local` → UI가 `onStorageChanged`로 구독. 컨텍스트 간 직접 호출은 없고 전부 런타임 메시지를 거치므로, 호출 그래프가 컨텍스트 경계에서 끊겨 보이는 것은 정상입니다.

**리뷰 시 우선 확인할 것**

- `settings`를 제외한 `currentSession`/`sessions` 변경이 background 메시지(write-lock 큐)를 경유하는가 — 패널의 직접 `patchStorage`는 lost-update 레이스를 만듭니다.
- 런타임 메시지 계약이 바뀌었다면 보내는 쪽·받는 쪽 테스트가 **같은 커밋에서** 함께 갱신됐는가. `chrome.runtime.sendMessage`는 타입으로 계약을 강제하지 못하므로 양쪽 유닛 테스트가 모두 green인 채로 계약이 어긋날 수 있습니다.
- 타입체크(`npx tsc --noEmit`)가 사실상의 lint 게이트입니다 — ESLint 설정이 없습니다.
