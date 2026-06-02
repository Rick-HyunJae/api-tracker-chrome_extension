# Superpowers

## Document Paths
- Design specs: `docs/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/plans/YYYY-MM-DD-<feature>.md`

## 실행 규약 (격리 강제)

- `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development` 진입 **이전에 반드시** `superpowers:using-git-worktrees`를 먼저 호출하여 격리 작업공간을 확보한다. 격리에 실패하면 작업을 중단하고 사용자에게 보고한다.
- long-running 통합 브랜치(예: `feature/2.0.0`, `master`, `main`)에 코드 커밋을 직접 쌓는 것을 금지한다. 코드 변경은 격리 워크트리/전용 브랜치에서 작업하고, `superpowers:finishing-a-development-branch`의 squash 흐름으로만 통합한다.
- spec(`docs/specs/`)·plan(`docs/plans/`)·기타 문서 커밋은 위 금지 규약의 예외로 둔다.

이 규약은 스킬 본문(`executing-plans` Integration 섹션)에 적힌 동일 요구를 모델이 누락하는 사례를 방지하기 위한 CLAUDE.md 레벨 강제 장치다.
