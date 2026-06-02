# Solutions Knowledge Base

이 디렉토리는 DOUZONE Data Visualization Editor (TypeScript/React/ProseMirror/TipTap) 프로젝트에서 해결한 문제와 확립된 패턴을 문서화합니다.

문서는 `ce-compound` 스킬이 자동으로 작성하며, `compound-solutions` 에이전트를 통해 관리됩니다.

## 디렉토리 구조

각 서브디렉토리는 `schema.yaml`의 `problem_type`에 대응합니다:

| 디렉토리 | problem_type | 트랙 |
|---|---|---|
| `build-errors/` | build_error | Bug |
| `test-failures/` | test_failure | Bug |
| `runtime-errors/` | runtime_error | Bug |
| `performance-issues/` | performance_issue | Bug |
| `security-issues/` | security_issue | Bug |
| `ui-bugs/` | ui_bug | Bug |
| `integration-issues/` | integration_issue | Bug |
| `logic-errors/` | logic_error | Bug |
| `testing/` | test_failure / environment_gap | Bug / Knowledge |
| `best-practices/` | best_practice | Knowledge |
| `architecture-patterns/` | architecture_pattern | Knowledge |
| `design-patterns/` | design_pattern | Knowledge |
| `conventions/` | convention | Knowledge |
| `developer-experience/` | developer_experience | Knowledge |
| `workflow-issues/` | workflow_issue | Knowledge |
| `tooling-decisions/` | tooling_decision | Knowledge |
| `documentation-gaps/` | documentation_gap | Knowledge |

## 문서 인덱스

### ui-bugs/

| 파일 | 요약 |
|---|---|
| `shadow-dom-hover-deadzone-bridge.md` | Shadow DOM hover dead-zone을 투명 CSS `::before` 브릿지로 해결 (FloatingWidget) |

### integration-issues/

| 파일 | 요약 |
|---|---|
| `mv3-sidepanel-toggle-from-page.md` | MV3 content script에서 side panel을 열기 위한 메시지 릴레이 패턴 |
| `worktree-symlinked-node-modules-duplicate-react.md` | git worktree에 node_modules 심링크 시 React 이중 인스턴스로 모든 컴포넌트 테스트 실패 |

### testing/

| 파일 | 요약 |
|---|---|
| `jsdom-pointer-event-missing-coordinates.md` | jsdom이 PointerEvent를 미구현 — polyfill 없이 pointer drag 테스트는 좌표를 받지 못함 |
| `vitest-esbuild-skips-type-checking.md` | Vitest(esbuild)는 타입 검사 없이 통과 — 공유 인터페이스 변경 후 반드시 tsc --noEmit 실행 |

## 사용법

- 문제 해결 후 → `compound-solutions` 에이전트 (write 모드) 또는 `/ce-compound`
- 새 작업 착수 전 → `compound-solutions` 에이전트 (read 모드)
- 정기 정비 → `/ce-compound-refresh`

## Schema

frontmatter 계약은 `.claude/skills/ce-compound/references/schema.yaml` 참조.
