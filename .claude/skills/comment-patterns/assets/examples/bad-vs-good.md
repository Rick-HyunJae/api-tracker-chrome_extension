# Commenting Examples

## Bad

```ts
// axios client
export const apiClient = axios.create(...);
```

## Good

```ts
/**
 * @description Shared axios client
 *
 * - baseURL comes from the validated env object so runtime code never touches
 *   import.meta.env directly
 */
export const apiClient = axios.create(...);
```

