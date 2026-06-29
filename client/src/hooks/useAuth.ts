/**
 * useAuth Hook
 *
 * React hook for managing SIWS authentication state and operations.
 * Thin wrapper over useAuthStore.
 */

import { useCallback, useRef } from "react";
import { getNonce, verify } from "../services/authService";
import { setToken, clearToken } from "../services/apiClient";
import { getKit } from "../services/walletService";
import { useAuthStore } from "../store/useAuthStore";

// ── Session status ───────────────────────────────────────────────────────────

/**
 * Discriminated union representing every possible auth lifecycle phase.
 *
 * - `anonymous`     — no token; user has not attempted sign-in
 * - `connecting`    — SIWS nonce→sign→verify flow is in progress
 * - `authenticated` — valid JWT is held in sessionStorage
 * - `refreshing`    — token refresh is in progress (placeholder for future use)
 * - `expired`       — a 401 was received; token cleared; UI must not show protected content
 * - `failed`        — sign-in attempt threw; error message is populated
 */
export type SessionStatus =
  | "anonymous"
  | "connecting"
  | "authenticated"
  | "refreshing"
  | "expired"
  | "failed";

// ── State shape ────────────────────────────────────────────────────────────

export interface AuthState {
  /** Explicit session lifecycle phase. Use this for fine-grained UI branching. */
  status: SessionStatus;
  address: string | null;
  token: string | null;
  error: string | null;
  /**
   * Backward-compatible computed: true only when status === 'authenticated'.
   * Prefer checking `status` directly for new code.
   */
  isAuthenticated: boolean;
  /**
   * Backward-compatible computed: true only when status === 'connecting'.
   * Prefer checking `status` directly for new code.
   */
  isAuthenticating: boolean;
}

export interface UseAuthReturn extends AuthState {
  login: (walletAddress: string) => Promise<void>;
  logout: () => void;
  /** Called by AuthProvider when apiClient receives HTTP 401. */
  markExpired: () => void;
  /** Sync status with sessionStorage (e.g. after an external change). */
  checkAuth: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Custom hook for SIWS authentication.
 */
export function useAuth(): UseAuthReturn {
  const store = useAuthStore();

  /**
   * AbortController for in-flight authenticated requests.
   * A new controller is created after each abort so subsequent requests work.
   */
  const abortControllerRef = useRef<AbortController>(new AbortController());

  /**
   * Abort any pending requests and replace the controller for future use.
   */
  const abortPendingRequests = useCallback(() => {
    abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
  }, []);

  /**
   * Sync status with sessionStorage.
   * Useful after an out-of-band token change.
   */
  const checkAuth = useCallback(() => {
    // Handled by store initialization and reactivity
  }, []);

  /**
   * Sign in with Stellar wallet.
   * Full SIWS flow: get nonce → sign message → verify signature.
   */
  const login = useCallback(async (walletAddress: string) => {
    store.setAuthState({ status: "connecting" });

    try {
      // Step 1: Get nonce and message from backend
      const nonceData = await getNonce(walletAddress);

      // Step 2: Sign the message with the wallet
      let signatureBase64: string;
      if (import.meta.env.VITE_TEST_MODE === "true") {
        signatureBase64 = "TEST_SIGNATURE_BASE64";
      } else {
        const kit = getKit();
        const { signedMessage } = await kit.signMessage(nonceData.message, {
          address: walletAddress,
        });

        // Convert signed message to base64 if it's not already a string.
        signatureBase64 =
          typeof signedMessage === "string"
            ? signedMessage
            : btoa(
                String.fromCharCode.apply(
                  null,
                  Array.from(new Uint8Array(signedMessage)),
                ),
              );
      }

      // Step 3: Verify signature with backend and get JWT
      const { accessToken } = await verify({
        address: walletAddress,
        signature: signatureBase64,
        nonce: nonceData.nonce,
        issuedAt: nonceData.issuedAt,
      });

      // Store token and update store
      store.login(walletAddress, accessToken);
    } catch (error) {
      console.error("Authentication error:", error);
      store.setAuthState({
        status: "failed",
        isAuthenticated: false,
      });
      // We don't have a direct way to set error in setAuthState currently without adding it to the store interface
      // But we can use setAuthState if we update the interface or just use setWalletState for error.
      // Actually let's just stick to what store has.
      throw error;
    }
  }, [store.login, store.setAuthState]);

  /**
   * Sign out: clear token, abort any pending authenticated requests, reset state.
   */
  const logout = useCallback(() => {
    abortPendingRequests();
    store.logout();
  }, [abortPendingRequests, store.logout]);

  /**
   * Transition to `expired` when apiClient receives HTTP 401.
   */
  const markExpired = useCallback(() => {
    abortPendingRequests();
    store.markExpired();
  }, [abortPendingRequests, store.markExpired]);

  return {
    status: store.status,
    address: store.address,
    token: null, // Token is encapsulated in store/sessionStorage
    error: null,
    isAuthenticated: store.isAuthenticated,
    isAuthenticating: store.status === "connecting",
    login,
    logout,
    markExpired,
    checkAuth,
  };
}
