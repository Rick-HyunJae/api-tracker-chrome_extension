# Code Graph Tools — Serena × code-review-graph 운영 규칙

이 프로젝트의 코드 탐색·리뷰·리팩터링은 **Serena**(LSP 실시간)와 **code-review-graph (CRG)**(영속 그래프) 두 MCP 도구를 통해 이뤄진다. 둘은 본질이 다르므로, 다음 라우팅 규칙에 따라 분업한다.

## 1. 멘탈 모델

- **Serena = 정밀한 점**: TypeScript LSP 실시간 쿼리. 정확한 심볼·참조·편집.
- **CRG = 전체 지도**: Tree-sitter로 사전 구축된 영속 그래프. 영향 분석·리뷰·아키텍처.

| 차원 | Serena | CRG |
|---|---|---|
| 인덱스 | 없음 (LSP) | 영속 그래프 (~/.code-review-graph) |
| 파싱 | 의미 분석 (타입 인식) | 구문 분석 (Tree-sitter) |
| 최신성 | 항상 실시간 | 후크 기반 증분 — lag 가능 |
| 편집 | ✅ 보유 | ❌ 읽기 전용 |
| 메모리 | ✅ project memories | ❌ (스냅샷 wiki는 별개) |

**한 줄 원칙**: CRG로 시작해 Serena로 끝낸다. 같은 질문에 두 도구를 동시에 부르지 않는다.

## 2. 라우팅 표 — 질문 유형별 1순위 도구

| 질문 / 작업 | 1순위 도구 | 2순위 (필요 시) |
|---|---|---|
| 정확한 심볼 위치 (이름 알 때) | Serena `find_symbol` | — |
| 파일 단위 심볼 개요 | Serena `get_symbols_overview` | — |
| 심볼 본문 읽기 | Serena `find_symbol(include_body=true)` | — |
| 키워드/퍼지 탐색 | CRG `semantic_search_nodes` (FTS5) | — |
| 정확한 참조 찾기 (리팩터링 진실) | Serena `find_referencing_symbols` | — |
| 호출 그래프 대규모 트래버설 | CRG `query_graph` (callers_of/callees_of) | Serena로 정확도 검증 |
| 변경 영향 반경 | CRG `get_impact_radius` | Serena로 핫스팟 검증 |
| 실행 플로우 영향 | CRG `get_affected_flows` | — |
| 리스크 스코어 코드 리뷰 | CRG `detect_changes` | Serena로 고위험 본문 읽기 |
| 변경 리뷰 컨텍스트 | CRG `get_review_context` | — |
| 아키텍처/커뮤니티/허브 | CRG `get_architecture_overview`, `list_communities`, `get_hub_nodes`, `get_bridge_nodes` | — |
| 테스트 커버리지 매핑 | CRG `query_graph tests_for` | — |
| 심볼 이름 변경 (rename) | Serena `rename_symbol` | — |
| 심볼 본문 교체 | Serena `replace_symbol_body` | — |
| 심볼 삽입 | Serena `insert_before_symbol`/`insert_after_symbol` | — |
| 안전한 코드 삭제 | Serena `safe_delete_symbol` | — |
| 데드 코드 / 리팩터 후보 | CRG `find_large_functions_tool`, `refactor_tool` | Serena로 실제 편집 |

## 3. 워크플로 시퀀싱 — 4대 패턴

### A. 코드 리뷰 (PR/diff)
```
CRG detect_changes      # 리스크 스코어, 변경 함수 식별
  → CRG get_review_context   # 토큰 효율적 스니펫
  → Serena find_symbol(include_body)  # 고위험 항목 깊이 읽기
  → Serena find_referencing_symbols   # 호출자 검증
```

### B. 새 기능 탐색 (코드베이스 이해)
```
CRG get_architecture_overview   # 조감도
  → CRG list_communities             # 모듈 클러스터
  → Serena get_symbols_overview      # 관심 파일 정밀 확인
  → Serena find_symbol               # 구현 읽기
```

### C. 리팩터링 (rename/extract)
```
CRG get_impact_radius           # 블래스트 반경 추정
  → Serena find_referencing_symbols  # 타입 정확 참조 (단일 진실)
  → Serena rename_symbol / replace_symbol_body  # 실행
  → CRG detect_changes               # 사후 리스크 확인
```

### D. 버그 추적
```
Serena find_symbol              # 의심 함수 위치
  → CRG query_graph callers_of       # 호출 경로 역추적
  → CRG get_affected_flows           # 실행 플로우 매핑
  → Serena find_referencing_symbols  # 사용처 검증
```

## 4. 충돌·중복 방지 룰

1. **이름을 정확히 알면 Serena, 모호하면 CRG**. `find_symbol`과 `semantic_search_nodes`를 동일 질의에 동시 호출 금지.
2. **참조 정확도는 Serena가 단일 진실**. CRG REFERENCES 엣지는 구문 기반이라 동적 패턴/타입 인스턴스화 누락 가능. 리팩터링 시 Serena가 최종 권위.
3. **영향 분석 규모는 CRG**. LSP를 BFS로 반복 호출하지 말 것.
4. **편집은 Serena 단독**. CRG는 읽기 전용.
5. **두 도구가 같은 정보를 제공할 때는 1순위 표를 따른다**.

## 5. 상태 신뢰도 — 드리프트 점검

- **Serena LSP**: 항상 최신, 점검 불필요.
- **CRG 그래프**: 후크 의존. 의심 상황(대규모 리팩터링 직후, 후크 실패 의심)에서 `list_graph_stats_tool` 호출하여 `last_updated`를 확인. 현재 시각과 큰 차이가 나면 변경된 파일을 수동으로 인덱스(`build_or_update_graph_tool`).
- **임베딩 미사용 정책**: `sentence-transformers` 미설치. `semantic_search_nodes`는 FTS5 키워드 모드로만 동작 → 추상 개념 검색에는 약함. 필요 시 `uv tool install code-review-graph --with sentence-transformers`로 활성화 후 `embed_graph_tool` 호출.

## 6. Serena 메모리 관리

세션 시작 시 `mcp__serena__list_memories` → `mem:core`부터 읽어 진보적 탐색.

**자동 갱신 트리거** — 다음 파일/규약 수정 시 해당 메모리 갱신을 사용자에게 제안:

| 변경 대상 | 갱신 메모리 |
|---|---|
| `package.json` scripts | `mem:suggested_commands`, `mem:task_completion` |
| `package.json` deps (메이저 업그레이드/추가/제거) | `mem:tech_stack` |
| `src/` 최상위 구조, `common/`류 invariant | `mem:core` |
| `.eslintrc` / 컨벤션 / 주석 정책 | `mem:conventions` |
| CLAUDE.md 본문(워크플로·산출물 경로) 개정 | `mem:core`, `mem:task_completion` |
| 본 라우팅 룰 자체 변경 | `mem:core`에 `.claude/rules/code-graph.md` 참조 갱신 |

**작업 완료 시**: 메모리 변경이 있었다면 `serena memories check`로 참조 무결성 점검.

**저장소 정책**: `.serena/`는 `.gitignore` 처리되어 메모리는 팀 비공유. 새 환경에서는 `mcp__serena__onboarding`을 1회 실행해야 한다.

## 7. 운영 명령 요약

```bash
# CRG 그래프 상태 점검
# → mcp__code-review-graph__list_graph_stats_tool 호출

# CRG 수동 재인덱스 (후크 실패 의심)
# → mcp__code-review-graph__build_or_update_graph_tool 호출

# Serena 메모리 무결성 점검
serena memories check

# Serena 신규 환경 onboarding (1회성)
# → mcp__serena__onboarding 호출

# CRG 의미 임베딩 활성화 (선택)
uv tool install code-review-graph --with sentence-transformers
# → mcp__code-review-graph__embed_graph_tool(provider="local") 호출
```

## 8. 안티 패턴

- ❌ Grep/Read로 심볼 탐색 시작 — 두 MCP 도구가 모두 비용 낮고 정확.
- ❌ `find_symbol`로 호출자 전체를 반복 추적 — `query_graph callers_of` 한 번이면 끝.
- ❌ `detect_changes` 없이 변경 리뷰 — 리스크 스코어와 토큰 절감을 놓침.
- ❌ Serena `replace_content`로 큰 심볼 통째 교체 — `replace_symbol_body`가 더 정확.
- ❌ CRG REFERENCES만 믿고 rename — 타입 인스턴스화/인터페이스 구현 누락 위험. Serena로 검증.
