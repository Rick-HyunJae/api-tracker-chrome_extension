# Commenting Policy

This reference expands the compact skill instructions into a practical checklist.

## Decision checklist

Add a comment only when at least one of these is true:

- the code depends on an external constraint the reader cannot infer
- the behavior is intentionally surprising
- the implementation choice is much narrower than the code shape suggests
- the surrounding code would otherwise look incorrect

If none of those are true, do not add a comment.

## Sentence style

- Use plain language.
- Avoid restating identifiers.
- Keep the comment short enough that the reader can read it in one pass.

## File-level patterns

- Exported functions, hooks, and configs should usually carry JSDoc.
- Internal helper functions should only be documented when the WHY is not
  obvious from the surrounding context.
- Barrels should stay comment-free.

## Good examples

```ts
/**
 * @description App-wide query client
 *
 * - staleTime 60s keeps cached data available during navigation
 * - retry 1 avoids prolonged UI blocking on transient network failures
 */
export const queryClient = new QueryClient(...);
```

```ts
function SaveButton() {
    // Keep the button disabled until the server confirms the latest state.
    const isDisabled = ...
}
```

## Bad examples

```ts
// creates the client
export const apiClient = axios.create(...);
```

```ts
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
        },
    },
});
```

