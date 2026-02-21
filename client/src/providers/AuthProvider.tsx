/**
 * AuthProvider
 * 
 * React context provider for authentication state management
 * Provides SIWS authentication state and methods across the application
 */

import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuth, type UseAuthReturn } from '../hooks/useAuth';
import { useWalletContext } from './WalletProvider';

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

  // Auto-logout when wallet disconnects
  useEffect(() => {
    if (!isConnected && auth.isAuthenticated) {
      auth.logout();
    }
  }, [isConnected, auth.isAuthenticated]);

  // Update auth address when wallet address changes
  useEffect(() => {
    if (address && auth.isAuthenticated && auth.address !== address) {
      // Address mismatch - logout for security
      auth.logout();
    }
  }, [address, auth.isAuthenticated, auth.address]);

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 * Must be used within an AuthProvider
 */
export function useAuthContext(): UseAuthReturn {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
}
