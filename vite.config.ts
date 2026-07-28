import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode !== 'test' ? crx({ manifest }) : null,
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    // 활성 git worktree는 자체 src·node_modules를 가지므로, 메인 repo에서 테스트 시
    // 중복 스캔되어 React 이중 인스턴스로 컴포넌트 테스트가 전부 깨진다
    // (docs/solutions/integration-issues/worktree-symlinked-node-modules-duplicate-react.md).
    // 두 경로를 모두 막는다: 수동 `git worktree add` 관례(.worktrees/)와
    // Claude Code EnterWorktree의 기본 위치(.claude/worktrees/).
    exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/worktrees/**'],
  },
}))
