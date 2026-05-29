/**
 * Tests for SignInButton component
 * Covers all 5 render states and the truncateAddress helper.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import * as fc from 'fast-check';
import SignInButton from './SignInButton';

// ── Mock providers ────────────────────────────────────────────────────────────

const mockLogin = vi.fn();
const mockLogout = vi.fn();

let walletCtx = { isConnected: true, address: 'GABCDEFGHIJKLMNOP' as string | null };
let authCtx = {
  isAuthenticated: false,
  isAuthenticating: false,
  error: null as string | null,
  login: mockLogin,
  logout: mockLogout,
};

vi.mock('../providers/WalletProvider', () => ({
  useWalletContext: () => walletCtx,
}));

vi.mock('../providers/AuthProvider', () => ({
  useAuthContext: () => authCtx,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetCtx() {
  walletCtx = { isConnected: true, address: 'GABCDEFGHIJKLMNOP' };
  authCtx = {
    isAuthenticated: false,
    isAuthenticating: false,
    error: null,
    login: mockLogin,
    logout: mockLogout,
  };
  mockLogin.mockReset();
  mockLogout.mockReset();
}

// ── 5.1 Returns null when wallet not connected or address is null ──────────────

describe('5.1 - returns null when wallet not connected or address is null', () => {
  afterEach(resetCtx);

  test('returns null when isConnected is false', () => {
    walletCtx = { isConnected: false, address: 'GABCDEFGHIJKLMNOP' };
    const { container } = render(<SignInButton />);
    expect(container.firstChild).toBeNull();
  });

  test('returns null when address is null', () => {
    walletCtx = { isConnected: true, address: null };
    const { container } = render(<SignInButton />);
    expect(container.firstChild).toBeNull();
  });

  test('returns null when both isConnected is false and address is null', () => {
    walletCtx = { isConnected: false, address: null };
    const { container } = render(<SignInButton />);
    expect(container.firstChild).toBeNull();
  });
});

// ── 5.2 Renders "Sign In" button in default connected-unauthenticated state ───

describe('5.2 - renders Sign In button in default connected-unauthenticated state', () => {
  afterEach(resetCtx);

  test('renders a button labelled Sign In', () => {
    render(<SignInButton />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('Sign In button is not disabled', () => {
    render(<SignInButton />);
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });
});

// ── 5.3 Renders disabled "Signing in..." button when isAuthenticating=true ───

describe('5.3 - renders disabled Signing in button when isAuthenticating=true', () => {
  afterEach(resetCtx);

  test('renders a disabled button labelled Signing in...', () => {
    authCtx = { ...authCtx, isAuthenticating: true };
    render(<SignInButton />);
    const btn = screen.getByRole('button', { name: /signing in/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });
});

// ── 5.4 Renders "Signed in as G...XXXX" with truncated address ───────────────

describe('5.4 - renders Signed in as truncated when authenticated', () => {
  afterEach(resetCtx);

  test('shows truncated address in button text', () => {
    const addr = 'GABCDEFGHIJKLMNOP';
    walletCtx = { isConnected: true, address: addr };
    authCtx = { ...authCtx, isAuthenticated: true };
    render(<SignInButton />);
    // truncated: GABC...MNOP
    expect(screen.getByRole('button', { name: /GABC\.\.\.MNOP/i })).toBeInTheDocument();
  });
});

// ── 5.5 Clicking authenticated button calls logout() ─────────────────────────

describe('5.5 - clicking authenticated button calls logout', () => {
  afterEach(resetCtx);

  test('calls logout when authenticated button is clicked', () => {
    walletCtx = { isConnected: true, address: 'GABCDEFGHIJKLMNOP' };
    authCtx = { ...authCtx, isAuthenticated: true };
    render(<SignInButton />);
    fireEvent.click(screen.getByRole('button', { name: /signed in as/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

// ── 5.6 Renders error indicator when error is non-null and not authenticating ─

describe('5.6 - renders error indicator when error is non-null and not authenticating', () => {
  afterEach(resetCtx);

  test('renders error indicator for non-null error', () => {
    authCtx = { ...authCtx, error: 'Something went wrong', isAuthenticating: false };
    render(<SignInButton />);
    expect(screen.getByText(/auth error/i)).toBeInTheDocument();
  });

  test('does NOT render error indicator when isAuthenticating is true', () => {
    authCtx = { ...authCtx, error: 'Something went wrong', isAuthenticating: true };
    render(<SignInButton />);
    expect(screen.queryByText(/auth error/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
  });
});

// ── 5.7 truncateAddress returns addr.slice(0,4) + "..." + addr.slice(-4) ─────

describe('5.7 - truncateAddress helper', () => {
  afterEach(resetCtx);

  const cases: [string, string][] = [
    ['GABCDEFGHIJKLMNOP', 'GABC...MNOP'],
    ['GABCDEFGHI',        'GABC...FGHI'],
    ['123456789',         '1234...6789'],
  ];

  test.each(cases)('truncates %s to %s', (addr: string, expected: string) => {
    walletCtx = { isConnected: true, address: addr };
    authCtx = { ...authCtx, isAuthenticated: true };
    render(<SignInButton />);
    const button = screen.getByRole('button', { name: /signed in as/i });
    expect(button.textContent).toContain(expected);
  });

  test('does not truncate addresses of 8 chars or fewer', () => {
    const addr = '12345678';
    walletCtx = { isConnected: true, address: addr };
    authCtx = { ...authCtx, isAuthenticated: true };
    render(<SignInButton />);
    const button = screen.getByRole('button', { name: /signed in as/i });
    expect(button.textContent).toContain('12345678');
    expect(button.textContent).not.toContain('...');
  });
});

// ── P13: Address truncation (property-based) ──────────────────────────────────

describe('P13: Address truncation property', () => {
  // Feature: siws-auth, Property 13: For any Stellar address string longer than 8 characters,
  // truncateAddress(address) must return address.slice(0, 4) + "..." + address.slice(-4).
  afterEach(resetCtx);

  it('truncates any address longer than 8 chars to first4...last4', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 9 }), (address) => {
        walletCtx = { isConnected: true, address };
        authCtx = { ...authCtx, isAuthenticated: true };
        const { container, unmount } = render(<SignInButton />);

        const first4 = address.slice(0, 4);
        const last4 = address.slice(-4);
        const expected = first4 + '...' + last4;

        // Use textContent to avoid accessible-name whitespace collapsing
        const button = container.querySelector('button');
        expect(button).not.toBeNull();
        expect(button!.textContent).toContain(expected);

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
