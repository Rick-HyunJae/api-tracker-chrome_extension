/**
 * @description App shell provider wrapper
 *
 * - QueryClientProvider must wrap the router so data hooks share one cache
 * - The wrapper lives here to keep app/index.tsx focused on composition
 */
export function AppShell() {
    return <div />;
}

