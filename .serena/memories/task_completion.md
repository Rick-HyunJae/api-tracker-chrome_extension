# task_completion

코딩 작업을 마쳤다고 판단하기 전에 순서대로 실행한다.

```bash
npm run test:run       # 전체 테스트
npx tsc --noEmit       # 타입체크 = 이 저장소의 lint 게이트 (ESLint 없음)
npm run build          # 산출물까지 확인해야 하는 변경이면
```

세 가지 모두 통과해야 완료다. Vitest는 esbuild라 타입 오류를 잡지 못하므로 테스트 green만으로 끝내지 않는다.

## 추가로 확인할 것

- **UI·캡처·전송 동작을 바꿨다면** 유닛 테스트로 부족하다. `dist/`를 다시 빌드해 실제 확장으로 확인한다(하네스 명령은 `mem:suggested_commands`).
- **워크트리에서 작업했다면 통합 후 메인 repo에서 테스트를 다시 돌린다.** 워크트리 안에서는 절대 재현되지 않는 수집 범위 문제가 있다.
- **문서 영향**: 사용자에게 보이는 동작이 바뀌면 `docs/handoff/2026-07-28-extension-usage.md`와 `README.md`가 낡는다. 서버로 나가는 페이로드나 런타임 메시지가 바뀌면 `CLAUDE.md`의 전송 파이프라인 서술도 함께 고친다 — 이 파일은 매 세션 자동 로드되므로 낡은 계약이 남으면 다음 작업자를 오도한다.
- **검증 절차 자체가 바뀌면** `docs/test/e2e_test.md`를 갱신한다.

## 마무리

작업이 해결되면 `compound-solutions` write 모드(또는 `/ce-compound`)로 교훈을 `docs/solutions/`에 적립할 것을 사용자에게 제안한다. 적립 기준과 frontmatter 계약은 `.claude/skills/ce-compound/references/schema.yaml`.
