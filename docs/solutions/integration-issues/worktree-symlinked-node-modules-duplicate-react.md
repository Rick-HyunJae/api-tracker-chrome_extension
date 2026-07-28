---
title: Symlinking node_modules into a git worktree causes duplicate React and breaks all component tests
date: 2026-06-01
category: integration-issues
module: tooling
problem_type: integration_issue
component: development_workflow
symptoms:
  - "~22 component render tests fail (ConsentBanner, McpTable, SessionHistory, CaptureList, FloatingWidget…)"
  - "Pure-logic tests (types, messages, storage) all pass"
  - "Invalid hook call or hooks-related errors in the Vitest output"
  - "Tests pass on the main checkout but fail only in the worktree"
root_cause: duplicate_dependency
resolution_type: environment_setup
severity: high
related_components:
  - git_worktrees
  - vite
  - vitest
  - react
tags:
  - git-worktree
  - node-modules
  - symlink
  - duplicate-react
  - vitest
  - react-hooks
---

# Symlinking node_modules into a git worktree causes duplicate React and breaks all component tests

## Problem

To avoid the time cost of a fresh `npm install` when creating a per-phase git worktree, I created a symlink from the worktree's `node_modules` to the main checkout's directory:

```bash
# worktree at: /path/to/repo-worktrees/phase-3
ln -s ../../node_modules node_modules
```

After that, running `npx vitest run` inside the worktree produced ~22 test failures across all React component tests while every pure-logic test remained green.

## Symptoms

- All failing tests involve React component rendering (`render()`, `screen.getBy*`, `userEvent`).
- All passing tests are logic-only modules with no React imports.
- The errors are hooks-family failures: "invalid hook call", hooks mismatch, context not found.
- The exact same test suite passes on the main checkout and on a worktree that ran `npm install` normally.

## What Didn't Work

- **Continuing with the symlink**: root cause — see below.
- **Running `npx vitest run src`** (scoping to the src directory): the path argument is irrelevant to module resolution; React was still loaded twice.
- **Checking for mismatched React versions**: both copies were the same version. Version matching is not the issue; instance identity is.

## Solution

**Option A — real install (simplest, always correct):**
```bash
cd /path/to/worktree
npm install          # same lockfile → compatible, deterministic
```
Takes ~30 s with a warm npm cache; worth it every time.

**Option B — hardlink copy (fast, avoids symlink path):**
```bash
cp -al /path/to/main-checkout/node_modules /path/to/worktree/node_modules
```
`cp -al` creates a directory tree of hardlinks (not symlinks). The worktree sees a real local `node_modules` directory, so Vite/Vitest resolve from the worktree path — no duplication. Disk usage is negligible because hardlinks share inodes. Note: hardlinks do not reflect subsequent `npm install` changes in the main checkout; re-copy if deps change.

**Never do:**
```bash
ln -s ../../node_modules node_modules   # ← causes duplicate React
```

## Why This Works

Vite/Vitest use Node's `require.resolve` / `import.meta.resolve`, which follows symlinks to their real path before caching the module. A symlink pointing to `../../node_modules` resolves to the main checkout's absolute path. Meanwhile, the worktree's `src/` files are resolved from the worktree's own absolute path.

Result: React is loaded once from the main checkout path (`/main/node_modules/react`) and once again when the worktree's JSX transform requests it using the worktree path — but the symlink redirects to the same real directory, so the resolved path is `../../node_modules/react`, which Node's module cache treats as the same entry. In practice, Vite's own module graph can still create a second instance because it resolves the requester's directory differently across the two physical roots.

Either way, two React instances share a runtime. Hooks use a module-level variable (`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`) to track the current fiber. With two instances, one instance's hooks state is invisible to the other → invalid hook call.

The diagnostic tell is the split: **logic tests green, component tests red**. Logic modules never import React, so they never trigger the duplication. Component modules do — and any component that calls a hook is broken.

## Prevention

- **Rule**: in a JS/TS project, every git worktree must have its own `node_modules` — either via `npm install` or `cp -al`. Never symlink.
- **Diagnostic checklist** when component tests fail en masse in a new environment: (1) is `node_modules` a symlink? `ls -la node_modules`; (2) are logic-only tests passing? If yes, suspect duplicate React before suspecting test logic; (3) **is the failure happening in the main repo rather than the worktree?** Check the failing paths' prefix and the collected-test count — if the paths start with a worktree directory and the count is a multiple of normal, the worktree is not excluded from test collection. A glob that covers one worktree convention but not another (e.g. `.worktrees/` but not `.claude/worktrees/`) fails silently. See [vitest-exclude-misses-tool-specific-worktree-path](../testing/vitest-exclude-misses-tool-specific-worktree-path.md) — same symptom, different cause.
- **CI guard**: add a pre-test assertion (or a husky/lefthook hook) that `[ ! -L node_modules ]` in worktrees to catch accidental symlinks early.
- **Document the worktree setup step** in the project's onboarding notes: "After `git worktree add`, always run `npm install` inside the new worktree before running tests."

## Related Issues

- Phase: P3 worktree setup
- Merge commit: `2db602d` (master)
- Related learning: `docs/solutions/testing/jsdom-pointer-event-missing-coordinates.md` (other test-environment issue from the same feature work)
