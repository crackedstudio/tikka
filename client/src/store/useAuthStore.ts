import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionStatus } from "../hooks/useAuth";
import { getWalletCapabilities, type WalletCapabilities } from "../services/walletService";

export interface AuthStoreState {
  status: SessionStatus;
  address: string | null;
  token: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  error: string | null;
  isWalletAvailable: boolean;
  network: string | null;
  isWrongNetwork: boolean;
  capabilities: WalletCapabilities;
  setAuthState: (state: Partial<AuthStoreState>) => void;
  setWalletState: (state: Partial<AuthStoreState>) => void;
  login: (address: string, token: string) => void;
  logout: () => void;
  markExpired: () => void;
}

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      status: "anonymous",
      address: null,
      token: null,
      isConnected: false,
      isAuthenticated: false,
      isConnecting: false,
      isDisconnecting: false,
      error: null,
      isWalletAvailable: false,
      network: null,
      isWrongNetwork: false,
      capabilities: getWalletCapabilities(),
      setAuthState: (partial) =>
        set((state) => {
          const next = { ...state, ...partial };
          if (partial.status !== undefined) {
            next.isAuthenticated = partial.status === "authenticated";
          }
          return next;
        }),
      setWalletState: (partial) =>
        set((state) => ({ ...state, ...partial })),
      login: (address, token) =>
        set({
          status: "authenticated",
          address,
          token,
          isConnected: true,
          isAuthenticated: true,
          isConnecting: false,
        }),
      logout: () =>
        set({
          status: "anonymous",
          address: null,
          token: null,
          isConnected: false,
          isAuthenticated: false,
          isConnecting: false,
          isDisconnecting: false,
        }),
      markExpired: () =>
        set({
          status: "expired",
          token: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "tikka-auth-store",
    }
  )
);
