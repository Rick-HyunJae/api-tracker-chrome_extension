# YAML Frontmatter Schema

`schema.yaml` in this directory is the canonical contract for `docs/solutions/` frontmatter written by `ce-compound`.

Project: API-to-MCP Tracker — Chrome MV3 확장 (TypeScript/React/Vite/Vitest)

Use this file as the quick reference for:
- required fields
- enum values
- validation expectations
- category mapping
- track classification (bug vs knowledge)

## Tracks

The `problem_type` determines which **track** applies. Each track has different required and optional fields.

| Track | problem_types | Description |
|-------|--------------|-------------|
| **Bug** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` | Defects and failures that were diagnosed and fixed |
| **Knowledge** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` | Practices, patterns, conventions, decisions, workflow improvements, and documentation. Prefer the narrowest applicable value; `best_practice` is the fallback. |

## Required Fields (both tracks)

- **module**: Module or area affected (e.g. `src/background/session-manager`, `src/ui/sidepanel`, `vite.config.ts`)
- **date**: ISO date in `YYYY-MM-DD`
- **problem_type**: One of the values listed in the Tracks table above
- **component**: One of `service_worker`, `content_script`, `injected_capture`, `side_panel`, `floating_widget`, `theme`, `shared_module`, `manifest`, `build_config`, `testing_framework`, `development_workflow`, `documentation`, `tooling`
- **severity**: One of `critical`, `high`, `medium`, `low`

## Bug Track Fields

Required:
- **symptoms**: YAML array with 1-5 observable symptoms (errors, broken behavior)
- **root_cause**: One of `missing_import`, `missing_index`, `wrong_api`, `scope_issue`, `async_issue`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `type_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`, `duplicate_dependency`, `environment_gap`, `toolchain_gap`

  마지막 셋은 이 저장소에서 실제로 반복된 원인이라 추가한 값이다:
  `duplicate_dependency`(같은 패키지가 두 인스턴스로 로드 — React 이중 인스턴스 2회),
  `environment_gap`(테스트 런타임이 실제 브라우저와 다름 — jsdom 미구현 API),
  `toolchain_gap`(도구가 특정 검증을 하지 않음 — esbuild는 타입 검사 생략).
- **resolution_type**: One of `code_fix`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `type_fix`

## Knowledge Track Fields

No additional required fields beyond the shared ones. All fields below are optional:

- **applies_when**: Conditions or situations where this guidance applies
- **symptoms**: Observable gaps or friction that prompted this guidance
- **root_cause**: Underlying cause, if there is a specific one
- **resolution_type**: Type of change, if applicable

## Optional Fields (both tracks)

- **related_components**: Other components involved
- **tags**: Search keywords, lowercase and hyphen-separated

## Component Reference

MV3 확장의 실행 컨텍스트 경계를 그대로 따른다. 가장 좁게 맞는 값을 고르고, 여러 컨텍스트가
얽힌 문제는 **문제가 발생한 곳**을 `component`로 두고 나머지를 `related_components`에 적는다.

| Component | 위치 / 설명 |
|---|---|
| `service_worker` | `src/background/` — `handleMessage` 라우터, `session-manager`, `sender`, idle alarm |
| `content_script` | `src/content/` — `content-bridge`(postMessage→runtime), `widget-host`(마운트) |
| `injected_capture` | `src/content/injected-capture` — 페이지 메인월드의 fetch·XHR 패치 |
| `side_panel` | `src/ui/sidepanel/` — Rail, ListView, SummaryBar, DetailView, SettingsView |
| `floating_widget` | `src/ui/widget/` — FloatingWidget, dock-position (shadow DOM) |
| `theme` | `src/ui/theme/` — tokens.css, components.css, 폰트 |
| `shared_module` | `src/shared/` — types, messages, storage, domain-match |
| `manifest` | `manifest.json` — 권한, CSP, `web_accessible_resources`, 사이드패널 등록 |
| `build_config` | `vite.config.ts`, `tsconfig.json`, `@crxjs/vite-plugin` |
| `testing_framework` | Vitest, Testing Library, jsdom, E2E 하네스(agent-browser·CDP) |
| `development_workflow` | git worktree, 브랜치·통합 규약, 스킬 워크플로 |
| `documentation` | 문서화 |
| `tooling` | 위 어디에도 맞지 않는 도구 (fallback — 먼저 위 값들을 검토할 것) |

## Backward Compatibility

Docs created before the track system may have `symptoms`/`root_cause`/`resolution_type` on knowledge-type problem_types. These are valid legacy docs:

- Bug-track fields present on a knowledge-track doc are harmless. Do not strip them during refresh unless the doc is being rewritten for other reasons.
- When creating **new** docs, follow the track rules above.

## Category Mapping

- `build_error` -> `docs/solutions/build-errors/`
- `test_failure` -> `docs/solutions/testing/`
- `runtime_error` -> `docs/solutions/runtime-errors/`
- `performance_issue` -> `docs/solutions/performance-issues/`
- `security_issue` -> `docs/solutions/security-issues/`
- `ui_bug` -> `docs/solutions/ui-bugs/`
- `integration_issue` -> `docs/solutions/integration-issues/`
- `logic_error` -> `docs/solutions/logic-errors/`
- `developer_experience` -> `docs/solutions/developer-experience/` (테스트·E2E 환경 문제라면 `testing/`)
- `workflow_issue` -> `docs/solutions/workflow-issues/`
- `best_practice` -> `docs/solutions/best-practices/`
- `documentation_gap` -> `docs/solutions/documentation-gaps/`
- `architecture_pattern` -> `docs/solutions/architecture-patterns/`
- `design_pattern` -> `docs/solutions/design-patterns/`
- `tooling_decision` -> `docs/solutions/tooling-decisions/`
- `convention` -> `docs/solutions/conventions/`

> **`testing/` 관례** — 이 저장소는 `test-failures/`를 만들지 않고 테스트 관련 학습을
> `testing/`에 모은다. 테스트 프레임워크 동작, jsdom 환경 격차, E2E 하네스 문제처럼
> "코드가 아니라 테스트 환경이 원인"인 건은 `problem_type`이 `test_failure`든
> `developer_experience`든 모두 여기로 간다. 기존 문서 4건이 이 관례를 따르고 있다.

## Validation Rules

1. Determine the track from `problem_type` using the Tracks table.
2. All shared required fields must be present.
3. Bug-track required fields (`symptoms`, `root_cause`, `resolution_type`) must be present on bug-track docs.
4. Knowledge-track docs have no additional required fields beyond the shared ones.
5. Bug-track fields on existing knowledge-track docs are harmless (see Backward Compatibility).
6. Enum fields must match the allowed values exactly.
7. Array fields must respect min/max item counts.
8. `date` must match `YYYY-MM-DD`.

## YAML Safety Rules

Strict YAML 1.2 parsers (`yq`, `js-yaml` strict, PyYAML) reject array items
that start with a reserved indicator character as unquoted scalars. When
writing items for any array-of-strings field (`symptoms`, `applies_when`,
`tags`, `related_components`, or any future array field), wrap the value in
double quotes if it starts with any of:

`` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`

Also quote if the value contains the substring `": "` — that punctuation
confuses flow-style parsers.

Example — before (breaks strict YAML — the item starts with a backtick):

    symptoms:
      - `SEND_CURRENT_SESSION` 핸들러가 항상 session not found 를 반환

Example — after (parses cleanly — wrapped in double quotes):

    symptoms:
      - "`SEND_CURRENT_SESSION` 핸들러가 항상 session not found 를 반환"

This rule applies to all array-of-strings frontmatter fields.
