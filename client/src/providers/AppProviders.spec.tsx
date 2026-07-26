/**
 * AppProviders Tests
 *
 * Lightweight render checks for provider boot composition.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock the hooks and Toaster
const mockWalletContext = {
    address: 'GTEST1234567890' as string | null,
    isConnected: true,
    isConnecting: false,
    isDisconnecting: false,
    error: null,
    isWalletAvailable: true,
    network: 'testnet',
    isWrongNetwork: false,
    capabilities: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
    refresh: vi.fn(),
    signTx: vi.fn(),
    switchNetwork: vi.fn(),
    networkMismatch: false,
    requiredNetwork: 'testnet',
    isCorrectNetwork: true,
};

const mockAuthContext = {
    isAuthenticated: false,
    address: null,
    token: null,
    status: 'anonymous' as const,
    isAuthenticating: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    markExpired: vi.fn(),
};

vi.mock('../hooks/useWallet', () => ({ useWallet: () => mockWalletContext }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => mockAuthContext }));
vi.mock('sonner', () => ({ Toaster: () => null }));

import { AppProviders } from './AppProviders';

// ── Helper Component ───────────────────────────────────────────────────────

function TestConsumer({ testId }: { testId: string }) {
    return (
        <div data-testid={testId}>
            <span data-testid="test-content">Test Content</span>
        </div>
    );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('AppProviders', () => {
    it('renders children within provider context', () => {
        const { getByTestId } = render(
            <AppProviders>
                <TestConsumer testId="consumer" />
            </AppProviders>
        );

        expect(getByTestId('consumer')).toBeInTheDocument();
        expect(getByTestId('test-content')).toHaveTextContent('Test Content');
    });
});