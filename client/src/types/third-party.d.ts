declare module "virtual:pwa-register/react" {
  export function useRegisterSW(options?: Record<string, unknown>): {
    needRefresh: [boolean, () => void];
    offlineReady: [boolean, () => void];
    updateServiceWorker: () => Promise<void>;
  };
}

declare global {
  interface Window {
    global?: typeof globalThis;
    freighter?: {
      switchNetwork?: (network: string) => Promise<void>;
      openWallet?: () => Promise<void>;
      [key: string]: unknown;
    };
    lobstr?: Record<string, unknown>;
    xBull?: {
      switchNetwork?: (network: string) => Promise<void>;
      request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
      [key: string]: unknown;
    };
    xbull?: {
      switchNetwork?: (network: string) => Promise<void>;
      [key: string]: unknown;
    };
    rabet?: Record<string, unknown>;
  }

  var global: typeof globalThis;
}

export {};
