# tech_stack

- Chrome Extension **Manifest V3** — service worker + content script + side panel
- **Vite 5** + `@crxjs/vite-plugin` (manifest.json을 진입점으로 읽어 번들·해시 처리)
- React 18 + TypeScript 5
- **Vitest 2** + Testing Library + jsdom + `vitest-chrome`(전역 chrome API mock, `src/test-setup.ts`)
- 상태 영속: `chrome.storage.local` 단일 저장소. 전 컨텍스트가 `onStorageChanged`로 구독
- 패키지 매니저: npm (lockfile 기준)

## 비자명한 점

- **ESLint 설정 파일이 없다.** `npx tsc --noEmit`이 사실상의 lint 게이트. Vitest는 esbuild라 타입 검사를 건너뛰므로 테스트 green만으로는 타입 안전을 보장하지 못한다.
- `mode !== 'test'`일 때만 crx 플러그인을 붙인다(`vite.config.ts`). 테스트 실행 시 manifest 처리를 우회하기 위함.
- `test.exclude`에 `**/.worktrees/**`와 `**/.claude/worktrees/**` 둘 다 필요. 활성 워크트리가 자체 `node_modules`를 갖고 있어, 제외하지 않으면 한 프로세스에 React가 두 인스턴스 로드되어 컴포넌트 테스트가 전부 깨진다.
- `public/fonts/`에 `.gitkeep`만 있고 실제 woff2가 없다. 빌드 시 폰트 4종 미해결 경고가 나오며 UI는 시스템 폴백으로 렌더된다 — 정상 동작이다.
- crxjs의 `?script&module` import는 root-absolute 경로(`/assets/...`)를 돌려준다. 페이지에 주입할 때는 `chrome.runtime.getURL`로 확장 origin에 고정해야 한다(그냥 쓰면 페이지 origin으로 해석돼 404).
