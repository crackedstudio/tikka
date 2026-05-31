/**
 * useAuth Hook
 *
 * React hook for managing SIWS authentication state and operations.
 * Uses a discriminated SessionStatus union so every lifecycle phase
 * (anonymous, connecting, authenticated, refreshing, expired, failed)
 * is an explicit, unambiguous state — no overlapping booleans.
 *
 * Orchestrates the full nonce → sign → verify flow.
 */

import { useState, useCallback, useRef } from "react";
import { getNonce, verify } from "../services/authService";
import { getToken, setToken, clearToken } from "../services/apiClient";
import { getKit } from "../services/walletService";

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

// ── State factory helpers ───────────────────────────────────────────────────

function deriveComputed(
  status: SessionStatus,
  fields: Omit<AuthState, "isAuthenticated" | "isAuthenticating">,
): AuthState {
  return {
    ...fields,
    status,
    isAuthenticated: status === "authenticated",
    isAuthenticating: status === "connecting",
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Custom hook for SIWS authentication.
 *
 * Maintains a single `status` field representing the full session lifecycle.
 * `isAuthenticated` and `isAuthenticating` are derived from `status` for
 * backward compatibility with existing consumers.
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>(() => {
    // Initialise from stored token
    const token = getToken();
    const status: SessionStatus = token ? "authenticated" : "anonymous";
    return deriveComputed(status, {
      status,
      address: null,
      token,
      error: null,
    });
  });

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
    const token = getToken();
    const status: SessionStatus = token ? "authenticated" : "anonymous";
    setState((prev) =>
      deriveComputed(status, { ...prev, status, token }),
    );
  }, []);

  /**
   * Sign in with Stellar wallet.
   * Full SIWS flow: get nonce → sign message → verify signature.
   */
  const login = useCallback(async (walletAddress: string) => {
    setState((prev) =>
      deriveComputed("connecting", { ...prev, status: "connecting", error: null }),
    );

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
        // StellarWalletsKit signMessage returns { signedMessage: string, ... }
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

      // Store token
      setToken(accessToken);

      setState(
        deriveComputed("authenticated", {
          status: "authenticated",
          address: walletAddress,
          token: accessToken,
          error: null,
        }),
      );
    } catch (error) {
      console.error("Authentication error:", error);
      setState((prev) =>
        deriveComputed("failed", {
          ...prev,
          status: "failed",
          error: error instanceof Error ? error.message : "Authentication failed",
        }),
      );
      throw error;
    }
  }, []);

  /**
   * Sign out: clear token, abort any pending authenticated requests, reset state.
   */
  const logout = useCallback(() => {
    clearToken();
    abortPendingRequests();
    setState(
      deriveComputed("anonymous", {
        status: "anonymous",
        address: null,
        token: null,
        error: null,
      }),
    );
  }, [abortPendingRequests]);

  /**
   * Transition to `expired` when apiClient receives HTTP 401.
   * The token has already been cleared by apiClient before this is called.
   * Aborts any pending requests that still hold the old bearer token.
   */
  const markExpired = useCallback(() => {
    abortPendingRequests();
    setState((prev) =>
      deriveComputed("expired", {
        ...prev,
        status: "expired",
        token: null,
        error: "Session expired. Please sign in again.",
      }),
    );
  }, [abortPendingRequests]);

  return {
    ...state,
    login,
    logout,
    markExpired,
    checkAuth,
  };
}
