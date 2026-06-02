---
title: Vitest stays green after expanding a shared TS interface — tsc is the real gate
date: 2026-06-01
category: testing
module: src/shared
problem_type: test_failure
component: build_tooling
symptoms:
  - "Full vitest run passes (114 tests) after adding required fields to a shared interface"
  - "tsc --noEmit reports missing-property errors in files that construct the type"
  - "The affected files are test files and an options component — not the type definition itself"
  - "The discrepancy is only visible when tsc is run separately; no red in the IDE if tsserver is also stale"
root_cause: toolchain_gap
resolution_type: process_fix
severity: high
related_components:
  - vitest
  - esbuild
  - typescript
tags:
  - vitest
  - esbuild
  - tsc
  - type-safety
  - shared-types
  - interface
  - ci
---

# Vitest stays green after expanding a shared TS interface — tsc is the real gate

## Problem

Added five required fields to the shared `Settings` interface in `src/shared/types.ts` as part of a feature branch. After the change, `npx vitest run` reported all 114 tests passing. The green baseline looked like a safe signal — but `tsc --noEmit` then reported type errors in three files that construct `Settings` object literals: `src/sender.test.ts`, `src/options/Settings.test.tsx`, and `src/options/Settings.tsx`. Each file was missing the new required fields in at least one object literal.

## Symptoms

- `vitest run`: 114 passed, 0 failed.
- `tsc --noEmit`: 3 errors, all "Property X is missing in type … but required in type Settings."
- The errors are in files that **construct** `Settings`, not in the file that **defines** it.
- The component (`Settings.tsx`) was shipping broken TypeScript to production even though no test caught it.

## What Didn't Work

- **Relying on the green Vitest baseline as the complete type-safety gate**: this is the root cause of the miss — see below.
- **Scoped test runs** (`vitest run src/shared`): they confirm the type file itself is valid, but they do not check the construction sites.
- **IDE type errors as the only signal**: tsserver can be stale or the affected files may not be open. Not reliable as a gate.

## Solution

After any change to a shared type or interface, run `tsc --noEmit` across the full project before considering the task done:

```bash
npx tsc --noEmit
```

Fix broken object literals at the construction sites. The recommended pattern when a type gains new fields is to spread the canonical default object and only override the fields under test:

```ts
import { DEFAULT_SETTINGS } from '../shared/defaults'

// Before (breaks when Settings gains new required fields):
const s: Settings = { serverUrl: 'http://localhost', enabled: true }

// After (resilient to new required fields):
const s: Settings = { ...DEFAULT_SETTINGS, serverUrl: 'http://localhost', enabled: true }
```

This pattern keeps test fixtures short and automatically satisfies future required-field additions as long as `DEFAULT_SETTINGS` is kept current.

For production code (`Settings.tsx`), explicitly add each missing field with its correct default — do not spread in production object construction unless the component genuinely wants all defaults.

## Why This Works

Vitest transforms TypeScript with **esbuild**, which transpiles TS to JS by stripping type annotations without performing any type analysis. esbuild is intentionally designed this way for speed. As a result:

- A `Settings` object literal with missing required fields becomes a plain JS object — esbuild does not check whether the fields are present.
- At runtime, the missing fields are simply `undefined`. If the test does not assert on those fields (or if the code paths exercised by the test do not read them), the test passes.

`tsc --noEmit`, by contrast, performs full type-checking per the TypeScript language specification. It catches every missing-property error regardless of whether the test exercises that code path.

The implication: **a green Vitest run is evidence of correct runtime behaviour in the tested paths, not evidence of type correctness**. These are independent properties.

## Prevention

- **Make `tsc --noEmit` part of every task's "done" criteria** for any task that touches `src/shared/types.ts` or any other file that exports interfaces/types consumed across the codebase. Add it as the last step in the verification checklist.
- **CI must run `tsc --noEmit` independently of Vitest.** A pipeline that only runs `vitest run` will not catch this class of error. Suggested CI sequence:
  ```
  npm run lint
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```
- **Treat shared-type edits as a tsc-gated change**: any PR that modifies a type/interface exported from `src/shared/` must include the `tsc --noEmit` output in the PR description or have it verified by CI.
- **Use `DEFAULT_SETTINGS` (or equivalent canonical defaults) as the base for test fixtures**. This is both more concise and more resilient to interface evolution.
- **The diagnostic tell**: if you add required fields to an interface and Vitest stays completely green, do not interpret this as "no breaking changes." Run `tsc` before concluding.

## Related Issues

- Branch: P3 (merged, master commit `2db602d`)
- Affected files: `src/shared/types.ts`, `src/sender.test.ts`, `src/options/Settings.test.tsx`, `src/options/Settings.tsx`
- Related learning: `docs/solutions/integration-issues/worktree-symlinked-node-modules-duplicate-react.md` (other P3 environment issue)
