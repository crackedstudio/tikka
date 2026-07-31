/**
 * Mock for `virtual:pwa-register/react`
 *
 * vite-plugin-pwa provides this Virtual Module at build/dev time, but it
 * is not available during vitest runs.  This stub lets tests that import
 * `ServiceWorkerUpdate` (or any component re-exporting the hook) resolve
 * successfully without the VitePWA plugin.
 *
 * Tests should use `vi.mock("virtual:pwa-register/react", …)` to provide
 * their own controlled implementation.
 */

export function useRegisterSW(_options?: Record<string, unknown>) {
    const noop = () => {};
    return {
        needRefresh: [false, noop],
        offlineReady: [false, noop],
        updateServiceWorker: async () => {},
    };
}
