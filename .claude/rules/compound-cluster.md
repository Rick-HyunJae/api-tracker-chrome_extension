# Compound — Handoff Contract

Superpowers/메인 플로우에서 `compound-solutions` 에이전트로의 자동 디스패치 트리거.

| Phase | Trigger 조건 | Mode |
|---|---|---|
| **finishing-a-development-branch 완료 직후** | branch가 merge/PR 준비 완료, all tests pass | write |
| **PR 머지 완료 직후** | `git merge` 또는 `gh pr merge` 성공 후 | write |
| **사용자 발화** | "that worked", "it's fixed", "working now", "problem solved", "compound this", "이제 됐어", "고쳐졌어" | write |
| **새 작업 착수 직전** | `superpowers:brainstorming` 호출 전 (항상) | read |
| **명시 정비 요청** | "refresh learnings", "audit docs/solutions/", "stale 문서 청소" | maintain |

## Brainstorming 연동 규칙

`superpowers:brainstorming` 스킬 호출 **직전**에 항상 다음을 실행한다:

1. 요청 주제에서 도메인 키워드를 추출한다
2. `compound-solutions` read 모드를 실행하여 `docs/solutions/` 관련 문서를 조회한다
3. 조회 결과가 있으면 brainstorming context에 포함시켜 설계를 보강한다

`docs/solutions/` 가 비어 있거나 관련 문서가 없으면 바로 brainstorming을 시작한다 — 조회 결과 없음 보고는 불필요하다.
