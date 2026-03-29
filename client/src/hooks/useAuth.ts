/**
 * useAuth Hook
 *
 * React hook for managing SIWS authentication state and operations
 * Orchestrates the full nonce → sign → verify flow
 */

import { useState, useCallback } from "react";
import { getNonce, verify } from "../services/authService";
import { getToken, setToken, clearToken } from "../services/apiClient";
import { getKit } from "../services/walletService";

export interface AuthState {
  isAuthenticated: boolean;
  address: string | null;
  token: string | null;
  isAuthenticating: boolean;
  error: string | null;
}

export interface UseAuthReturn extends AuthState {
  login: (walletAddress: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => void;
}

/**
 * Custom hook for SIWS authentication
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>(() => {
    // Initialize from stored token
    const token = getToken();
    return {
      isAuthenticated: !!token,
      address: null,
      token,
      isAuthenticating: false,
      error: null,
    };
  });

  /**
   * Check if user is authenticated
   */
  const checkAuth = useCallback(() => {
    const token = getToken();
    setState((prev) => ({
      ...prev,
      isAuthenticated: !!token,
      token,
    }));
  }, []);

  /**
   * Sign in with Stellar wallet
   * Full SIWS flow: get nonce → sign message → verify signature
   */
  const login = useCallback(async (walletAddress: string) => {
    setState((prev) => ({
      ...prev,
      isAuthenticating: true,
      error: null,
    }));

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

        // Convert signed message to base64 if it's not already a string
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

      setState({
        isAuthenticated: true,
        address: walletAddress,
        token: accessToken,
        isAuthenticating: false,
        error: null,
      });
    } catch (error) {
      console.error("Authentication error:", error);
      setState((prev) => ({
        ...prev,
        isAuthenticating: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      }));
      throw error;
    }
  }, []);

  /**
   * Sign out and clear token
   */
  const logout = useCallback(() => {
    clearToken();
    setState({
      isAuthenticated: false,
      address: null,
      token: null,
      isAuthenticating: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    login,
    logout,
    checkAuth,
  };
}
