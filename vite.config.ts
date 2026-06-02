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
    // 활성 git worktree(.worktrees/*)는 자체 src·node_modules를 가지므로,
    // 메인 repo에서 테스트 시 중복 스캔되어 환경 불일치로 실패한다. 제외한다.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
}))
