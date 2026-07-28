# suggested_commands

```bash
npm run dev            # Vite 개발 서버 (HMR)
npm run build          # tsc --noEmit && vite build → dist/
npm test               # Vitest watch
npm run test:run       # Vitest 1회
npm run test:coverage  # 커버리지 포함

npx vitest run src/path/to/file.test.ts   # 단일 파일
npx tsc --noEmit                          # 타입체크 (build에 포함)
```

**확장 로드**: 빌드 후 `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `dist/`. 재빌드 후에는 확장 카드의 새로고침(↻) 필요.

## E2E 하네스 (agent-browser)

```bash
agent-browser --session <name> --headed --extension "$PWD/dist" open <url>
```

- 이 호스트에서 **스크린샷이 무한 대기하면** `--args "--disable-gpu,--use-gl=swiftshader,--disable-gpu-compositing"`를 추가한다. 원인 감별은 `docs/solutions/testing/cdp-screenshot-hangs-when-display-asleep.md`.
- `chrome.sidePanel`은 자동화로 열 수 없다. 주입된 스크립트에서 확장 id를 읽어 일반 탭으로 연다:
  `document.getElementById('__api-tracker-capture__').src` → `chrome-extension://<ID>/public/sidepanel.html`
- 패널 입력은 React controlled — `fill`이 상태를 갱신하지 못한다. native setter + `input` 이벤트를 써야 한다.
- `eval` 컨텍스트가 호출 간 유지되므로 본문을 IIFE로 감쌀 것(`const` 재선언 오류).
- 토스트는 ~2.2초 후 사라진다. 확실한 검증은 `chrome.storage.local` 조회로.

## Darwin(macOS) 차이

- **BSD sed**: 인플레이스 편집은 `sed -i '' 's/…/…/' file` — 빈 문자열 인자가 필수.
- 화면 캡처가 막히면 `caffeinate -u -t 3`(디스플레이 절전) 또는 위 GPU 플래그(컴포지팅 경로) — 두 원인이 다르다.
