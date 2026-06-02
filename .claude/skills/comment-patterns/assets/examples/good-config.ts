/**
 * @description Shared test QueryClient
 *
 * - retry false keeps test runs deterministic
 * - gcTime 0 prevents cache bleed between test cases
 */
export const testQueryClient = {
    retry: false,
    gcTime: 0,
};

