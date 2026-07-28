---
title: Vitest exclude가 .worktrees/만 막아 .claude/worktrees/를 놓침 — 메인 repo 테스트 54개 실패
date: 2026-07-28
category: testing
module: vite.config.ts (test.exclude), .gitignore
problem_type: test_failure
component: testing_framework
symptoms:
  - "메인 repo에서 npm run test:run 시 366개가 수집됨 (실제 183개)"
  - "컴포넌트 테스트 54개 실패, 순수 로직 테스트는 전부 통과"
  - "실패 경로가 전부 .claude/worktrees/<name>/src/... 로 시작"
  - "npx tsc --noEmit과 npm run build는 clean"
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - build_config
  - tooling
tags:
  - vitest
  - git-worktree
  - test-exclude
  - glob-pattern
  - duplicate-react
  - claude-code
---

# Vitest exclude가 `.worktrees/`만 막아 `.claude/worktrees/`를 놓침

## Problem

`vite.config.ts`는 이미 활성 워크트리를 테스트 수집에서 제외하고 있었다. 그런데 제외 패턴이
`'**/.worktrees/**'` **하나뿐**이었고, Claude Code의 `EnterWorktree` 도구는 워크트리를
**`.claude/worktrees/`** 아래에 만든다. `worktrees` 앞에 점이 없어 기존 glob에 걸리지 않았다.

방어가 존재했는데 **절반만 걸려 있었다**는 것이 이 사건의 핵심이다. 설정 파일만 보면
"워크트리는 이미 제외됨"으로 읽히기 때문에 원인 후보에서 가장 늦게 의심하게 된다.

## Symptoms

- 메인 repo에서 `npm run test:run` → **366 tests collected**(정상 183), **54 failed**
- 실패한 것은 전부 컴포넌트 테스트(React Testing Library). 순수 로직 테스트
  (`types`, `messages`, `storage`, `session-manager`, `sender`, `domain-match`)는 전부 통과
- 실패 경로가 모두 `.claude/worktrees/<name>/src/ui/...`
- `npx tsc --noEmit`, `npm run build`는 clean — 타입·번들 층에서는 아무 신호가 없다
- 워크트리 **안에서** 테스트를 돌리면 183개 전부 통과 (같은 코드가 위치에 따라 결과가 갈림)

## What Didn't Work

- **머지된 코드를 의심**: squash 병합 직후 실패가 나타나 병합 자체를 먼저 의심했다. 그러나
  실패 경로가 `.claude/worktrees/`로 시작한다는 점이 이를 곧바로 반증했다 — 병합 결과물이
  아니라 워크트리 사본이 실행되고 있었다.
- **`node_modules` 심링크 점검**: 증상이
  [worktree-symlinked-node-modules-duplicate-react](../integration-issues/worktree-symlinked-node-modules-duplicate-react.md)와
  판박이라 그 문서의 진단 체크리스트(`ls -la node_modules`)부터 확인했다. 하지만 워크트리는
  `npm install`로 **실제 디렉터리**를 갖고 있었다 — 심링크가 아니었다. 같은 증상, 다른 원인.
- **`.gitignore` 추가만으로 해결 시도**: `.claude/worktrees/`를 `.gitignore`에 넣어도 테스트는
  그대로 실패한다. **Vitest는 `.gitignore`를 읽지 않는다.** 기본 exclude(`node_modules`, `dist` 등)와
  설정의 `test.exclude`만 본다.

## Solution

같은 배열에 도구별 경로를 함께 넣는다.

```ts
// vite.config.ts
test: {
  // 활성 git worktree는 자체 src·node_modules를 가지므로, 메인 repo에서 테스트 시
  // 중복 스캔되어 React 이중 인스턴스로 컴포넌트 테스트가 전부 깨진다.
  // 두 경로를 모두 막는다: 수동 `git worktree add` 관례(.worktrees/)와
  // Claude Code EnterWorktree의 기본 위치(.claude/worktrees/).
  exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/worktrees/**'],
}
```

`.gitignore`에도 같은 짝이 필요하다(테스트와 무관하게, 워크트리 사본이 커밋되는 사고 방지):

```
.worktrees/
.claude/worktrees/
```

## Why This Works

Vitest는 파일 수집 시 exclude glob에 걸리지 않은 모든 경로를 걷는다. 제외되지 않은 워크트리는
자기 자신의 `src/`와 **별도로 설치된 `node_modules`**를 갖고 있으므로, 한 Vitest 프로세스가
서로 다른 두 물리 경로에서 React를 각각 로드하게 된다.

React 훅은 모듈 레벨 변수로 현재 파이버를 추적하기 때문에 인스턴스가 둘이면 한쪽의 훅 상태가
다른 쪽에 보이지 않는다 → 훅을 쓰는 모든 컴포넌트가 깨진다. **로직 테스트는 React를 import하지
않으므로 멀쩡하다** — 이 갈림이 진단의 결정적 단서다.

glob `**/.worktrees/**`는 리터럴 `.worktrees`만 매치한다. `.claude/worktrees`는 세그먼트가
`claude` + `worktrees`이므로 매치 대상이 아니다. 점 하나 차이로 방어가 무력화된다.

## Prevention

- **워크트리 생성 경로는 도구마다 다르다.** 수동 `git worktree add`는 관례상 `.worktrees/`,
  Claude Code `EnterWorktree`는 `.claude/worktrees/`를 쓴다. 워크트리를 제외하는 방어를 넣을 때는
  **현재 저장소에서 실제로 쓰이는 모든 생성 경로**를 커버하는지 확인한다. 하나만 넣으면 다른
  도구를 쓰는 순간 조용히 뚫린다.
- **`.gitignore`와 `test.exclude`는 별개 방어다.** 둘 다 갱신해야 한다. 전자는 커밋 사고를,
  후자는 테스트 오염을 막는다. Vitest는 `.gitignore`를 참조하지 않는다.
- **진단 순서** — "컴포넌트 테스트만 무더기 실패 + 로직 테스트 통과"를 만나면:
  1. 실패 경로의 접두사를 본다. 워크트리 경로로 시작하면 수집 범위 문제다.
  2. 수집된 총 테스트 수를 평소와 비교한다. 배수로 늘어났으면 확정이다.
  3. `node_modules`가 심링크인지 확인한다(`ls -la node_modules`). 심링크면
     [다른 문서](../integration-issues/worktree-symlinked-node-modules-duplicate-react.md)의 경우다.
- **통합 시점에 반드시 메인 repo에서 테스트를 돌린다.** 이 문제는 워크트리 안에서는 절대
  재현되지 않는다. 워크트리에서만 검증하고 머지했다면 다음 사람이 그대로 밟는다.

```bash
# 방어가 실제로 동작하는지 확인 — 워크트리가 있는 상태에서 실행
npm run test:run 2>&1 | grep "Test Files"   # 평소 파일 수와 같아야 한다
```

## Related Issues

- [worktree-symlinked-node-modules-duplicate-react](../integration-issues/worktree-symlinked-node-modules-duplicate-react.md)
  — **증상은 같고 원인은 다르다.** 그쪽은 워크트리 안에서 `node_modules`를 심링크해 발생하고,
  이쪽은 메인 repo에서 수집 범위가 워크트리까지 넘어가 발생한다. 혼동하지 말 것.
- [vitest-esbuild-skips-type-checking](vitest-esbuild-skips-type-checking.md) — 같은 계열:
  Vitest가 green이어도 다른 층(타입/수집 범위)에서 문제가 숨어 있을 수 있다.
- 수정 커밋: `34a6721` (`vite.config.ts`), `0ccd6a7` (`.gitignore`)
