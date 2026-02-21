/**
 * SignInButton Component
 * 
 * Handles the SIWS authentication flow
 * Shows "Sign In" when wallet is connected but not authenticated
 * Shows "Signed in as G..." with logout when authenticated
 */

import { useWalletContext } from '../providers/WalletProvider';
import { useAuthContext } from '../providers/AuthProvider';

/**
 * Truncate a Stellar address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const SignInButton = () => {
  const { address, isConnected } = useWalletContext();
  const { isAuthenticated, isAuthenticating, error, login, logout } = useAuthContext();

  // Don't show if wallet not connected
  if (!isConnected || !address) {
    return null;
  }

  const handleSignIn = async () => {
    try {
      await login(address);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleSignOut = () => {
    logout();
  };

  // Show error state
  if (error && !isAuthenticating) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-red-500/50 bg-[#15102A] px-4 py-2 text-sm text-red-400">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        Auth Error
      </div>
    );
  }

  // Show authenticated state
  if (isAuthenticated) {
    return (
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white transition-colors hover:border-[#3A356A] hover:bg-[#1A153A]"
        title={`Signed in as ${address}`}
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
        Signed in as {truncateAddress(address)}
      </button>
    );
  }

  // Show authenticating state
  if (isAuthenticating) {
    return (
      <button
        disabled
        className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white opacity-50 cursor-not-allowed"
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        Signing in...
      </button>
    );
  }

  // Show sign in button
  return (
    <button
      onClick={handleSignIn}
      className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white transition-colors hover:border-[#3A356A] hover:bg-[#1A153A]"
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
      Sign In
    </button>
  );
};

export default SignInButton;
