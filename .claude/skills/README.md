# Project Skills

이 프로젝트에서 사용 가능한 Claude Code 스킬 목록.

## Knowledge Compounding (`ce-`)

해결한 문제를 문서화하고, 과거 지식을 검색·정비하는 지식 축적 클러스터.
compound-engineering 플러그인에서 추출. **진입점: `ce-compound` 스킬.**

| Skill                 | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `ce-compound`         | 해결된 문제를 `docs/solutions/`에 YAML frontmatter로 구조화   |
| `ce-compound-refresh` | 기존 학습 문서를 코드베이스 대비 감사·갱신·통합·삭제           |
| `ce-sessions`         | Claude Code, Codex, Cursor 세션 히스토리 검색·합성            |

## Plan Review (`plan-`)

설계 문서(plan)를 직무별 시각으로 리뷰. gstack에서 추출.
**진입점: `plan-reviewer` 에이전트** (키워드 기반 자동 라우팅).

| Skill                | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `plan-ceo-review`    | CEO 시각 — 범위·전략·비전, Premise Challenge                     |
| `plan-eng-review`    | 시니어 엔지니어 시각 — 아키텍처·테스트·성능                      |
| `plan-design-review` | 디자이너 시각 — 정보 아키텍처·상태 커버리지·접근성 (0-10 스코어) |
| `plan-devex-review`  | DX 시각 — 8개 DX 차원 0-10 스코어링, TTHW 벤치마크              |

## Code Review (`code-`)

코드 산출물을 직무별 시각으로 리뷰. gstack에서 추출.
**진입점: `code-reviewer` 에이전트** (키워드 기반 자동 라우팅).

| Skill               | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `code-cso-review`   | 보안 책임자 시각 — OWASP Top 10, STRIDE, 공급망, CI/CD 감사       |
| `code-devex-review` | DX 시각 — 실제 코드/API를 테스트하여 TTHW·에러·문서 품질 측정     |

## Graph Navigation (`crg-`)

code-review-graph MCP 서버의 Knowledge Graph를 활용한 코드 탐색·분석 스킬.
오케스트레이터 없이 직접 호출. CLAUDE.md의 MCP Tools 섹션이 graph-first 지침 제공.

| Skill                  | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `crg-debug-issue`      | 그래프 기반 체계적 버그 추적 (callers/callees 추적, 변경 감지)     |
| `crg-explore-codebase` | 코드베이스 구조 탐색 (아키텍처 개요, 커뮤니티, 실행 흐름)          |
| `crg-refactor-safely`  | 의존성 분석 기반 안전한 리팩토링 (rename, dead code, blast radius) |
| `crg-review-changes`   | 변경 감지 + 영향 분석 기반 구조화된 코드 리뷰                      |

## 권장 작업 순서

| 단계 | 스킬 | 언제 |
|---|---|---|
| 1 | `deep-interview` | 요청이 모호하거나 요구사항이 불명확할 때 |
| 2 | `superpowers:brainstorming` | 설계 결정이 열려 있을 때 |
| 3 | `superpowers:writing-plans` | 무엇을·어떻게 할지 명확하고 계획만 필요할 때 |
| 4 | `plan-*` / `code-*` review | 계획 또는 코드를 검증할 때 |
| 5 | `ce-compound` | 문제를 해결한 직후 (컨텍스트가 신선할 때) |
| - | `crg-*` | 탐색·디버깅·리팩토링 전 언제든 |

## Shared References (`.claude/references/`)

여러 스킬이 공유하는 공통 reference 파일.

| File                               | 공유 대상                    |
| ---------------------------------- | ---------------------------- |
| `outside-voices-plan-challenge.md` | plan-ceo, plan-eng, plan-devex |
| `outside-voices-design.md`         | plan-design                  |
| `exit-plan-mode-gate.md`           | plan-* 4개                   |
