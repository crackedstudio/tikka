/**
 * AuthProvider
 *
 * React context provider for authentication state management
 * Provides SIWS authentication state and methods across the application
 */

import { createContext, useContext, type ReactNode, useEffect, useState } from "react";
import { useAuth, type UseAuthReturn } from "../hooks/useAuth";
import { useWalletContext } from "./WalletProvider";

const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component that wraps the app and provides auth context
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();
  const { address, isConnected } = useWalletContext();
  const [didInitialAuthCheck, setDidInitialAuthCheck] = useState(false);

  // Auto-logout when wallet disconnects.
  // Skip the first render to allow wallet state to initialize.
  const isTestMode = import.meta.env.VITE_TEST_MODE === "true";
  const { isAuthenticated, address: authAddress, logout } = auth;

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
 * Hook to access auth context
 * Must be used within an AuthProvider
 */
export function useAuthContext(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return context;
}
