/**
 * AuthProvider
 *
 * React context provider for authentication state management.
 * Provides SIWS authentication state and methods across the application.
 *
 * Responsibilities:
 * - Auto-logout when the connected wallet disconnects.
 * - Auto-logout when the wallet address changes to a different non-null value.
 * - Registers the markExpired callback with apiClient so any HTTP 401 response
 *   immediately transitions the session to the `expired` state, preventing
 *   protected UI from flickering authenticated content after token expiry.
 */

import {
  createContext,
  useContext,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useAuth, type UseAuthReturn } from "../hooks/useAuth";
import { useWalletContext } from "./WalletProvider";
import {
  registerExpiredHandler,
  unregisterExpiredHandler,
} from "../services/apiClient";

const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component that wraps the app and provides auth context.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();
  const { address, isConnected } = useWalletContext();
  const [didInitialAuthCheck, setDidInitialAuthCheck] = useState(false);

  const isTestMode = import.meta.env.VITE_TEST_MODE === "true";
  const { isAuthenticated, address: authAddress, logout, markExpired } = auth;

  // Register markExpired with apiClient so any 401 response immediately
  // transitions the session status to 'expired', collapsing isAuthenticated
  // to false with no additional re-render delay.
  useEffect(() => {
    registerExpiredHandler(markExpired);
    return () => {
      unregisterExpiredHandler();
    };
  }, [markExpired]);

  // Auto-logout when wallet disconnects.
  // Skip the first render to allow wallet state to initialize.
  useEffect(() => {
    if (!didInitialAuthCheck) {
      setDidInitialAuthCheck(true);
      return;
    }

    if (!isTestMode && !isConnected && isAuthenticated) {
      logout();
    }
  }, [isConnected, isAuthenticated, didInitialAuthCheck, logout, isTestMode]);

  // Auto-logout when wallet address changes to a different non-null value.
  // Null address is handled by the disconnect watcher above.
  useEffect(() => {
    if (authAddress && address && isAuthenticated && authAddress !== address) {
      logout();
    }
  }, [address, isAuthenticated, authAddress, logout]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 */
export function useAuthContext(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return context;
}
