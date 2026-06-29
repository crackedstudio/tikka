import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Navbar from './Navbar';

// Prevent CJS named-export error from @stellar/freighter-api
vi.mock('../services/walletService', () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getAccountAddress: vi.fn(),
  getNetwork: vi.fn(),
  isWalletConnected: vi.fn().mockResolvedValue(false),
  isWalletInstalled: vi.fn().mockResolvedValue(false),
  setNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock('../providers/WalletProvider', () => ({
  useWalletContext: () => ({
    isConnected: true,
    isWrongNetwork: false,
    switchNetwork: vi.fn(),
  }),
}));

vi.mock('./WalletButton', () => ({ default: () => <button data-testid="wallet-btn">Wallet</button> }));
vi.mock('./SignInButton', () => ({ default: () => <button data-testid="signin-btn">Sign In</button> }));

function renderNavbar(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>,
  );
}

describe('Navbar component', () => {
  test('highlights active navigation link', () => {
    renderNavbar();

    const links = screen.getAllByText('Discover Raffles');
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => link.classList.contains('font-semibold'))).toBe(true);
  });

  test('renders wallet and sign in button states', () => {
    renderNavbar();

    expect(screen.getByTestId('wallet-btn')).toBeInTheDocument();
    expect(screen.getByTestId('signin-btn')).toBeInTheDocument();
  });

  test('mobile hamburger expands and collapses menu', () => {
    renderNavbar();

    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    expect(hamburger).toBeInTheDocument();

    fireEvent.click(hamburger);

    const closeButton = screen.getByRole('button', { name: /close navigation menu/i });
    expect(closeButton).toBeInTheDocument();

    const mobilePanel = screen.getByTestId('mobile-nav-panel');
    expect(mobilePanel).toHaveClass('max-h-screen');

    fireEvent.click(closeButton);
    expect(mobilePanel).toHaveClass('max-h-0');
  });

  test('pressing Escape closes the open mobile menu', () => {
    renderNavbar();

    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(hamburger);

    const mobilePanel = screen.getByTestId('mobile-nav-panel');
    expect(mobilePanel).toHaveClass('max-h-screen');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mobilePanel).toHaveClass('max-h-0');
  });

  test('Escape returns focus to the hamburger trigger button', () => {
    renderNavbar();

    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(hamburger);

    fireEvent.keyDown(document, { key: 'Escape' });

    // After close the aria-label reverts to "Open navigation menu"
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /open navigation menu/i }),
    );
  });

  test('clicking the backdrop closes the mobile menu', () => {
    renderNavbar();

    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByTestId('mobile-nav-panel')).toHaveClass('max-h-screen');

    fireEvent.click(screen.getByTestId('mobile-nav-backdrop'));
    expect(screen.getByTestId('mobile-nav-panel')).toHaveClass('max-h-0');
  });

  test('hamburger has aria-expanded reflecting open state', () => {
    renderNavbar();

    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(hamburger);
    expect(screen.getByRole('button', { name: /close navigation menu/i }))
      .toHaveAttribute('aria-expanded', 'true');
  });
});
